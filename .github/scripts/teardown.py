#!/usr/bin/env python3
"""
teardown.py — Deletes all E2E test resources created for a PR.

Usage:
    python3 teardown.py --arns-dir artifacts/ --pr 42

Strategy:
  1. Read ARN records from all *.json files in --arns-dir
  2. Delete in reverse dependency order (databases before VPCs, etc.)
  3. Use continue_on_error=True for every deletion — never raises
  4. Tag-based sweep to catch any orphaned resources
  5. Handle multi-account via role assumption
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import re
import sys
import time
from pathlib import Path
from typing import Any

import boto3
from botocore.exceptions import ClientError

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    stream=sys.stdout,
)
log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Boto3 client cache
# ---------------------------------------------------------------------------
_clients: dict[tuple, Any] = {}


def _client(service: str, region: str, account: str | None = None) -> Any:
    key = (service, region, account or "")
    if key in _clients:
        return _clients[key]
    current = _get_current_account()
    if account and account != current:
        session = _assume_role(account, region)
        c = session.client(service, region_name=region)
    else:
        c = boto3.client(service, region_name=region)
    _clients[key] = c
    return c


_current_account_cache: str | None = None


def _get_current_account() -> str:
    global _current_account_cache
    if _current_account_cache is None:
        _current_account_cache = boto3.client("sts").get_caller_identity()["Account"]
    return _current_account_cache


_assumed: dict[str, boto3.Session] = {}


def _assume_role(account: str, region: str) -> boto3.Session:
    if account in _assumed:
        return _assumed[account]
    sts = boto3.client("sts")
    role_arn = f"arn:aws:iam::{account}:role/GitHubActionsE2ERole"
    try:
        creds = sts.assume_role(
            RoleArn=role_arn, RoleSessionName="e2e-teardown"
        )["Credentials"]
        session = boto3.Session(
            aws_access_key_id=creds["AccessKeyId"],
            aws_secret_access_key=creds["SecretAccessKey"],
            aws_session_token=creds["SessionToken"],
            region_name=region,
        )
        _assumed[account] = session
        return session
    except Exception as exc:
        log.warning("Could not assume role in %s: %s", account, exc)
        return boto3.Session(region_name=region)


# ---------------------------------------------------------------------------
# Safe delete wrapper
# ---------------------------------------------------------------------------

def safe_delete(fn, *args, resource_desc: str = "", **kwargs) -> None:
    """Call fn(*args, **kwargs) and log any exception without raising."""
    try:
        fn(*args, **kwargs)
        log.info("  Deleted: %s", resource_desc or fn.__name__)
    except ClientError as exc:
        code = exc.response["Error"]["Code"]
        # Treat "already deleted" codes as success
        if code in (
            "NoSuchEntity", "ResourceNotFoundException", "DBInstanceNotFound",
            "DBClusterNotFoundFault", "ClusterNotFound", "NotFoundException",
            "InvalidStateException", "ResourceNotFound", "NoSuchBucket",
            "NoSuchKey", "QueueDoesNotExist", "InvalidKeyPairID.NotFound",
            "InvalidGroupID.NotFound", "InvalidVpcID.NotFound",
            "InvalidSubnetID.NotFound", "InvalidInternetGatewayID.NotFound",
            "InvalidRouteTableID.NotFound", "InvalidNetworkAclID.NotFound",
            "InvalidDhcpOptionsID.NotFound", "InvalidAllocationID.NotFound",
            "InvalidNatGatewayID.NotFound", "InvalidVpcPeeringConnectionID.NotFound",
            "InvalidTransitGatewayID.NotFound", "NatGatewayNotFound",
            "VpcEndpointNotFound", "FlowLogNotFound", "InvalidCustomerGatewayID.NotFound",
            "InvalidVpnGatewayID.NotFound", "InvalidNetworkInterfaceID.NotFound",
            "InvalidPlacementGroup.NotFound", "InvalidLaunchTemplateId.NotFound",
        ):
            log.debug("  Already gone (%s): %s", code, resource_desc)
        else:
            log.warning("  Delete error for %s: %s — %s", resource_desc, code,
                        exc.response["Error"]["Message"])
    except Exception as exc:
        log.warning("  Delete error for %s: %s", resource_desc, exc)


# ---------------------------------------------------------------------------
# Per-service deletion dispatchers
# ---------------------------------------------------------------------------

def delete_record(record: dict) -> None:
    """Dispatch deletion for a single ARN record."""
    arn: str = record["arn"]
    region: str = record.get("region", "ap-northeast-2")
    account: str = record.get("account", "")
    resource_id: str = record.get("resource_id", "")
    service: str = record.get("service", "")

    log.debug("Deleting %s (%s)", arn, service)

    # ── S3 ─────────────────────────────────────────────────────────────────
    if service == "s3" or _is_s3(arn):
        bucket = arn.split(":::")[-1]
        _delete_s3_bucket(bucket, region, account)

    # ── EC2 resources ───────────────────────────────────────────────────────
    elif _is_ec2_resource(arn, "instance"):
        safe_delete(_client("ec2", region, account).terminate_instances,
                    InstanceIds=[resource_id], resource_desc=arn)

    elif _is_ec2_resource(arn, "volume"):
        safe_delete(_client("ec2", region, account).delete_volume,
                    VolumeId=resource_id, resource_desc=arn)

    elif _is_ec2_resource(arn, "snapshot"):
        safe_delete(_client("ec2", region, account).delete_snapshot,
                    SnapshotId=resource_id, resource_desc=arn)

    elif _is_ec2_resource(arn, "image"):
        safe_delete(_client("ec2", region, account).deregister_image,
                    ImageId=resource_id, resource_desc=arn)

    elif _is_ec2_resource(arn, "key-pair"):
        safe_delete(_client("ec2", region, account).delete_key_pair,
                    KeyPairId=resource_id, resource_desc=arn)

    elif _is_ec2_resource(arn, "natgateway"):
        safe_delete(_client("ec2", region, account).delete_nat_gateway,
                    NatGatewayId=resource_id, resource_desc=arn)

    elif _is_ec2_resource(arn, "internet-gateway"):
        ec2 = _client("ec2", region, account)
        # Detach first
        try:
            attached = ec2.describe_internet_gateways(
                InternetGatewayIds=[resource_id]
            )["InternetGateways"]
            for igw in attached:
                for att in igw.get("Attachments", []):
                    safe_call_silent(ec2.detach_internet_gateway,
                                     InternetGatewayId=resource_id, VpcId=att["VpcId"])
        except Exception:
            pass
        safe_delete(ec2.delete_internet_gateway,
                    InternetGatewayId=resource_id, resource_desc=arn)

    elif _is_ec2_resource(arn, "vpc-peering-connection"):
        safe_delete(_client("ec2", region, account).delete_vpc_peering_connection,
                    VpcPeeringConnectionId=resource_id, resource_desc=arn)

    elif _is_ec2_resource(arn, "transit-gateway"):
        safe_delete(_client("ec2", region, account).delete_transit_gateway,
                    TransitGatewayId=resource_id, resource_desc=arn)

    elif _is_ec2_resource(arn, "vpc-endpoint"):
        safe_delete(_client("ec2", region, account).delete_vpc_endpoints,
                    VpcEndpointIds=[resource_id], resource_desc=arn)

    elif _is_ec2_resource(arn, "vpc-flow-log"):
        safe_delete(_client("ec2", region, account).delete_flow_logs,
                    FlowLogIds=[resource_id], resource_desc=arn)

    elif _is_ec2_resource(arn, "customer-gateway"):
        safe_delete(_client("ec2", region, account).delete_customer_gateway,
                    CustomerGatewayId=resource_id, resource_desc=arn)

    elif _is_ec2_resource(arn, "vpn-gateway"):
        ec2 = _client("ec2", region, account)
        try:
            vgws = ec2.describe_vpn_gateways(VpnGatewayIds=[resource_id])["VpnGateways"]
            for vgw in vgws:
                for att in vgw.get("VpcAttachments", []):
                    if att.get("State") == "attached":
                        safe_call_silent(ec2.detach_vpn_gateway,
                                         VpnGatewayId=resource_id, VpcId=att["VpcId"])
        except Exception:
            pass
        safe_delete(ec2.delete_vpn_gateway,
                    VpnGatewayId=resource_id, resource_desc=arn)

    elif _is_ec2_resource(arn, "egress-only-internet-gateway"):
        safe_delete(_client("ec2", region, account).delete_egress_only_internet_gateway,
                    EgressOnlyInternetGatewayId=resource_id, resource_desc=arn)

    elif _is_ec2_resource(arn, "network-interface"):
        safe_delete(_client("ec2", region, account).delete_network_interface,
                    NetworkInterfaceId=resource_id, resource_desc=arn)

    elif _is_ec2_resource(arn, "placement-group"):
        safe_delete(_client("ec2", region, account).delete_placement_group,
                    GroupName=resource_id, resource_desc=arn)

    elif _is_ec2_resource(arn, "launch-template"):
        safe_delete(_client("ec2", region, account).delete_launch_template,
                    LaunchTemplateId=resource_id, resource_desc=arn)

    elif _is_ec2_resource(arn, "security-group"):
        safe_delete(_client("ec2", region, account).delete_security_group,
                    GroupId=resource_id, resource_desc=arn)

    elif _is_ec2_resource(arn, "subnet"):
        safe_delete(_client("ec2", region, account).delete_subnet,
                    SubnetId=resource_id, resource_desc=arn)

    elif _is_ec2_resource(arn, "route-table"):
        safe_delete(_client("ec2", region, account).delete_route_table,
                    RouteTableId=resource_id, resource_desc=arn)

    elif _is_ec2_resource(arn, "network-acl"):
        safe_delete(_client("ec2", region, account).delete_network_acl,
                    NetworkAclId=resource_id, resource_desc=arn)

    elif _is_ec2_resource(arn, "dhcp-options"):
        safe_delete(_client("ec2", region, account).delete_dhcp_options,
                    DhcpOptionsId=resource_id, resource_desc=arn)

    elif _is_ec2_resource(arn, "elastic-ip"):
        safe_delete(_client("ec2", region, account).release_address,
                    AllocationId=resource_id, resource_desc=arn)

    elif _is_ec2_resource(arn, "vpc"):
        safe_delete(_client("ec2", region, account).delete_vpc,
                    VpcId=resource_id, resource_desc=arn)

    # ── Lambda ──────────────────────────────────────────────────────────────
    elif service == "lambda":
        safe_delete(_client("lambda", region, account).delete_function,
                    FunctionName=resource_id, resource_desc=arn)

    # ── DynamoDB ─────────────────────────────────────────────────────────────
    elif service == "dynamodb":
        safe_delete(_client("dynamodb", region, account).delete_table,
                    TableName=resource_id, resource_desc=arn)

    # ── RDS / Aurora / DocumentDB ─────────────────────────────────────────────
    elif service == "rds":
        rds = _client("rds", region, account)
        if ":cluster:" in arn:
            safe_delete(rds.delete_db_cluster,
                        DBClusterIdentifier=resource_id,
                        SkipFinalSnapshot=True, resource_desc=arn)
        elif ":db:" in arn:
            safe_delete(rds.delete_db_instance,
                        DBInstanceIdentifier=resource_id,
                        SkipFinalSnapshot=True, resource_desc=arn)
        elif ":subgrp:" in arn:
            safe_delete(rds.delete_db_subnet_group,
                        DBSubnetGroupName=resource_id, resource_desc=arn)

    # ── DocumentDB ────────────────────────────────────────────────────────────
    elif service == "docdb":
        docdb = _client("docdb", region, account)
        if ":cluster:" in arn:
            safe_delete(docdb.delete_db_cluster,
                        DBClusterIdentifier=resource_id,
                        SkipFinalSnapshot=True, resource_desc=arn)
        else:
            safe_delete(docdb.delete_db_instance,
                        DBInstanceIdentifier=resource_id,
                        SkipFinalSnapshot=True, resource_desc=arn)

    # ── ElastiCache ───────────────────────────────────────────────────────────
    elif service == "elasticache":
        ec_client = _client("elasticache", region, account)
        if ":replicationgroup:" in arn or ":cluster" not in arn:
            safe_delete(ec_client.delete_replication_group,
                        ReplicationGroupId=resource_id,
                        RetainPrimaryCluster=False, resource_desc=arn)
        elif ":serverlesscache:" in arn:
            safe_delete(ec_client.delete_serverless_cache,
                        ServerlessCacheName=resource_id, resource_desc=arn)
        elif ":subnetgroup:" in arn:
            safe_delete(ec_client.delete_cache_subnet_group,
                        CacheSubnetGroupName=resource_id, resource_desc=arn)

    # ── Redshift ──────────────────────────────────────────────────────────────
    elif service == "redshift":
        safe_delete(_client("redshift", region, account).delete_cluster,
                    ClusterIdentifier=resource_id,
                    SkipFinalClusterSnapshot=True, resource_desc=arn)

    # ── OpenSearch ────────────────────────────────────────────────────────────
    elif service == "es":
        safe_delete(_client("opensearch", region, account).delete_domain,
                    DomainName=resource_id, resource_desc=arn)

    # ── DAX ───────────────────────────────────────────────────────────────────
    elif service == "dax":
        safe_delete(_client("dax", region, account).delete_cluster,
                    ClusterName=resource_id, resource_desc=arn)

    # ── MemoryDB ──────────────────────────────────────────────────────────────
    elif service == "memorydb":
        safe_delete(_client("memorydb", region, account).delete_cluster,
                    ClusterName=resource_id, resource_desc=arn)

    # ── MSK ───────────────────────────────────────────────────────────────────
    elif service == "kafka":
        safe_delete(_client("kafka", region, account).delete_cluster,
                    ClusterArn=arn, resource_desc=arn)

    # ── MQ ────────────────────────────────────────────────────────────────────
    elif service == "mq":
        broker_id = arn.split(":")[-1]
        safe_delete(_client("mq", region, account).delete_broker,
                    BrokerId=broker_id, resource_desc=arn)

    # ── DMS ───────────────────────────────────────────────────────────────────
    elif service == "dms":
        dms = _client("dms", region, account)
        if ":rep:" in arn:
            safe_delete(dms.delete_replication_instance,
                        ReplicationInstanceArn=arn, resource_desc=arn)
        elif ":es:" in arn:
            safe_delete(dms.delete_endpoint,
                        EndpointArn=arn, resource_desc=arn)
        elif ":replication-config:" in arn:
            safe_delete(dms.delete_replication_config,
                        ReplicationConfigArn=arn, resource_desc=arn)

    # ── Kinesis ───────────────────────────────────────────────────────────────
    elif service == "kinesis":
        safe_delete(_client("kinesis", region, account).delete_stream,
                    StreamName=resource_id,
                    EnforceConsumerDeletion=True, resource_desc=arn)

    elif service == "firehose":
        safe_delete(_client("firehose", region, account).delete_delivery_stream,
                    DeliveryStreamName=resource_id, resource_desc=arn)

    elif service == "kinesisvideo":
        kvs = _client("kinesisvideo", region, account)
        try:
            stream_info = kvs.describe_stream(StreamName=resource_id)
            version = stream_info["StreamInfo"]["Version"]
            safe_delete(kvs.delete_stream,
                        StreamARN=arn, CurrentVersion=version, resource_desc=arn)
        except Exception as exc:
            log.warning("KVS delete: %s — %s", arn, exc)

    # ── Glue ──────────────────────────────────────────────────────────────────
    elif service == "glue":
        glue = _client("glue", region, account)
        if ":database/" in arn:
            safe_delete(glue.delete_database, Name=resource_id, resource_desc=arn)
        elif ":crawler/" in arn:
            safe_delete(glue.delete_crawler, Name=resource_id, resource_desc=arn)
        elif ":job/" in arn:
            safe_delete(glue.delete_job, JobName=resource_id, resource_desc=arn)

    # ── Athena ────────────────────────────────────────────────────────────────
    elif service == "athena":
        safe_delete(_client("athena", region, account).delete_work_group,
                    WorkGroup=resource_id,
                    RecursiveDeleteOption=True, resource_desc=arn)

    # ── EMR ───────────────────────────────────────────────────────────────────
    elif service == "elasticmapreduce":
        safe_delete(_client("emr", region, account).terminate_job_flows,
                    JobFlowIds=[resource_id], resource_desc=arn)

    # ── SNS ───────────────────────────────────────────────────────────────────
    elif service == "sns":
        safe_delete(_client("sns", region, account).delete_topic,
                    TopicArn=arn, resource_desc=arn)

    # ── SQS ───────────────────────────────────────────────────────────────────
    elif service == "sqs":
        parts = arn.split(":")
        queue_url = f"https://sqs.{region}.amazonaws.com/{account}/{parts[-1]}"
        safe_delete(_client("sqs", region, account).delete_queue,
                    QueueUrl=queue_url, resource_desc=arn)

    # ── Step Functions ────────────────────────────────────────────────────────
    elif service == "states":
        sfn = _client("stepfunctions", region, account)
        if ":stateMachine:" in arn:
            safe_delete(sfn.delete_state_machine,
                        stateMachineArn=arn, resource_desc=arn)
        elif ":activity:" in arn:
            safe_delete(sfn.delete_activity, activityArn=arn, resource_desc=arn)

    # ── API Gateway ───────────────────────────────────────────────────────────
    elif service == "apigateway":
        api_id = resource_id
        apigw_v1 = _client("apigateway", region, account)
        apigw_v2 = _client("apigatewayv2", region, account)
        # Try v2 first, fall back to v1
        try:
            apigw_v2.get_api(ApiId=api_id)
            safe_delete(apigw_v2.delete_api, ApiId=api_id, resource_desc=arn)
        except ClientError:
            safe_delete(apigw_v1.delete_rest_api, restApiId=api_id, resource_desc=arn)

    # ── AppSync ────────────────────────────────────────────────────────────────
    elif service == "appsync":
        safe_delete(_client("appsync", region, account).delete_graphql_api,
                    apiId=resource_id, resource_desc=arn)

    # ── CloudWatch Logs ───────────────────────────────────────────────────────
    elif service == "logs":
        log_group = arn.split("log-group:", 1)[-1]
        safe_delete(_client("logs", region, account).delete_log_group,
                    logGroupName=log_group, resource_desc=arn)

    # ── KMS ───────────────────────────────────────────────────────────────────
    elif service == "kms":
        safe_delete(_client("kms", region, account).schedule_key_deletion,
                    KeyId=resource_id,
                    PendingWindowInDays=7, resource_desc=arn)

    # ── ACM ───────────────────────────────────────────────────────────────────
    elif service == "acm":
        safe_delete(_client("acm", region, account).delete_certificate,
                    CertificateArn=arn, resource_desc=arn)

    # ── Cognito User Pool ─────────────────────────────────────────────────────
    elif service == "cognito-idp":
        safe_delete(_client("cognito-idp", region, account).delete_user_pool,
                    UserPoolId=resource_id, resource_desc=arn)

    # ── Cognito Identity Pool ─────────────────────────────────────────────────
    elif service == "cognito-identity":
        safe_delete(_client("cognito-identity", region, account).delete_identity_pool,
                    IdentityPoolId=resource_id, resource_desc=arn)

    # ── Secrets Manager ───────────────────────────────────────────────────────
    elif service == "secretsmanager":
        safe_delete(_client("secretsmanager", region, account).delete_secret,
                    SecretId=arn,
                    ForceDeleteWithoutRecovery=True, resource_desc=arn)

    # ── CloudWatch alarm ──────────────────────────────────────────────────────
    elif service == "cloudwatch":
        safe_delete(_client("cloudwatch", region, account).delete_alarms,
                    AlarmNames=[resource_id], resource_desc=arn)

    # ── SSM ───────────────────────────────────────────────────────────────────
    elif service == "ssm":
        param_name = arn.split(":parameter", 1)[-1]
        safe_delete(_client("ssm", region, account).delete_parameter,
                    Name=param_name, resource_desc=arn)

    # ── Backup ────────────────────────────────────────────────────────────────
    elif service == "backup":
        backup = _client("backup", region, account)
        if ":plan:" in arn:
            plan_id = arn.split(":")[-1]
            safe_delete(backup.delete_backup_plan, BackupPlanId=plan_id, resource_desc=arn)
        elif ":backup-vault:" in arn:
            safe_delete(backup.delete_backup_vault,
                        BackupVaultName=resource_id, resource_desc=arn)

    # ── RAM ───────────────────────────────────────────────────────────────────
    elif service == "ram":
        safe_delete(_client("ram", region, account).delete_resource_share,
                    resourceShareArn=arn, resource_desc=arn)

    # ── CodeBuild ─────────────────────────────────────────────────────────────
    elif service == "codebuild":
        safe_delete(_client("codebuild", region, account).delete_project,
                    name=resource_id, resource_desc=arn)

    # ── CodePipeline ──────────────────────────────────────────────────────────
    elif service == "codepipeline":
        safe_delete(_client("codepipeline", region, account).delete_pipeline,
                    name=resource_id, resource_desc=arn)

    # ── CloudFormation ────────────────────────────────────────────────────────
    elif service == "cloudformation":
        safe_delete(_client("cloudformation", region, account).delete_stack,
                    StackName=resource_id, resource_desc=arn)

    # ── Service Catalog ───────────────────────────────────────────────────────
    elif service == "catalog":
        portfolio_id = arn.split("/")[-1]
        safe_delete(_client("servicecatalog", region, account).delete_portfolio,
                    Id=portfolio_id, resource_desc=arn)

    # ── SageMaker ─────────────────────────────────────────────────────────────
    elif service == "sagemaker":
        _delete_sagemaker(arn, resource_id, region, account)

    # ── ECS ───────────────────────────────────────────────────────────────────
    elif service == "ecs":
        ecs = _client("ecs", region, account)
        safe_delete(ecs.delete_cluster, cluster=arn, resource_desc=arn)

    # ── ECR ───────────────────────────────────────────────────────────────────
    elif service == "ecr":
        safe_delete(_client("ecr", region, account).delete_repository,
                    repositoryName=resource_id, force=True, resource_desc=arn)

    # ── Auto Scaling ──────────────────────────────────────────────────────────
    elif service == "autoscaling":
        asg_name = resource_id
        safe_delete(_client("autoscaling", region, account).delete_auto_scaling_group,
                    AutoScalingGroupName=asg_name,
                    ForceDelete=True, resource_desc=arn)

    # ── IAM ───────────────────────────────────────────────────────────────────
    elif service == "iam":
        _delete_iam_role(resource_id)

    # ── MediaConvert ──────────────────────────────────────────────────────────
    elif service == "mediaconvert":
        _delete_mediaconvert_queue(arn, resource_id, region, account)

    # ── IoT ───────────────────────────────────────────────────────────────────
    elif service == "iot":
        rule_name = arn.split(":")[-1]
        safe_delete(_client("iot", region, account).delete_topic_rule,
                    ruleName=rule_name, resource_desc=arn)

    # ── IoT SiteWise ──────────────────────────────────────────────────────────
    elif service == "iotsitewise":
        _delete_iotsitewise(arn, resource_id, region, account)

    # ── Transfer Family ───────────────────────────────────────────────────────
    elif service == "transfer":
        _delete_transfer(arn, resource_id, region, account)

    # ── DataSync ──────────────────────────────────────────────────────────────
    elif service == "datasync":
        ds = _client("datasync", region, account)
        if ":task/" in arn:
            safe_delete(ds.delete_task, TaskArn=arn, resource_desc=arn)
        else:
            safe_delete(ds.delete_location, LocationArn=arn, resource_desc=arn)

    # ── Direct Connect ────────────────────────────────────────────────────────
    elif service == "directconnect":
        lag_id = arn.split("/")[-1]
        safe_delete(_client("directconnect", region, account).delete_lag,
                    lagId=lag_id, resource_desc=arn)

    # ── AppStream ─────────────────────────────────────────────────────────────
    elif service == "appstream":
        safe_delete(_client("appstream", region, account).delete_fleet,
                    Name=resource_id, resource_desc=arn)

    # ── CloudFront ────────────────────────────────────────────────────────────
    elif service == "cloudfront" or ":cloudfront::" in arn:
        _delete_cloudfront(arn, resource_id, account)

    # ── Route53 ───────────────────────────────────────────────────────────────
    elif service == "route53" or ":route53:::" in arn:
        _delete_route53(arn, resource_id, account)

    # ── Global Accelerator ────────────────────────────────────────────────────
    elif service == "globalaccelerator":
        _delete_global_accelerator(arn, account)

    # ── Bedrock ───────────────────────────────────────────────────────────────
    elif service == "bedrock":
        _delete_bedrock(arn, resource_id, region, account)

    # ── Deadline ──────────────────────────────────────────────────────────────
    elif service == "deadline":
        _delete_deadline(arn, resource_id, region, account)

    # ── Comprehend ────────────────────────────────────────────────────────────
    elif service == "comprehend":
        safe_delete(_client("comprehend", region, account).delete_document_classifier,
                    DocumentClassifierArn=arn, resource_desc=arn)

    # ── HealthLake ────────────────────────────────────────────────────────────
    elif service == "healthlake":
        datastore_id = arn.split("/")[-1]
        safe_delete(_client("healthlake", region, account).delete_fhir_datastore,
                    DatastoreId=datastore_id, resource_desc=arn)

    else:
        log.debug("No specific deletion handler for service=%s arn=%s", service, arn)


# ---------------------------------------------------------------------------
# Service-specific deletion helpers
# ---------------------------------------------------------------------------

def safe_call_silent(fn, *args, **kwargs) -> None:
    try:
        fn(*args, **kwargs)
    except Exception:
        pass


def _delete_s3_bucket(bucket: str, region: str, account: str) -> None:
    """Empty then delete an S3 bucket."""
    s3 = _client("s3", region, account)
    # Delete all object versions
    try:
        paginator = s3.get_paginator("list_object_versions")
        for page in paginator.paginate(Bucket=bucket):
            objects = []
            for version in page.get("Versions", []):
                objects.append({"Key": version["Key"], "VersionId": version["VersionId"]})
            for marker in page.get("DeleteMarkers", []):
                objects.append({"Key": marker["Key"], "VersionId": marker["VersionId"]})
            if objects:
                s3.delete_objects(Bucket=bucket, Delete={"Objects": objects})
    except Exception as exc:
        log.debug("S3 version cleanup %s: %s", bucket, exc)
    safe_delete(s3.delete_bucket, Bucket=bucket, resource_desc=f"s3://{bucket}")


def _is_s3(arn: str) -> bool:
    parts = arn.split(":")
    return len(parts) >= 6 and parts[2] == "s3" and parts[4] == ""


def _is_ec2_resource(arn: str, resource_type: str) -> bool:
    return f":{resource_type}/" in arn and ":ec2:" in arn


def _delete_sagemaker(arn: str, name: str, region: str, account: str) -> None:
    sm = _client("sagemaker", region, account)
    if ":notebook-instance/" in arn:
        # Stop first if running
        safe_call_silent(sm.stop_notebook_instance, NotebookInstanceName=name)
        time.sleep(5)
        safe_delete(sm.delete_notebook_instance, NotebookInstanceName=name, resource_desc=arn)
    elif ":endpoint/" in arn and ":endpoint-config" not in arn:
        safe_delete(sm.delete_endpoint, EndpointName=name, resource_desc=arn)
    elif ":endpoint-config/" in arn:
        safe_delete(sm.delete_endpoint_config, EndpointConfigName=name, resource_desc=arn)
    elif ":model/" in arn:
        safe_delete(sm.delete_model, ModelName=name, resource_desc=arn)
    elif ":pipeline/" in arn:
        safe_delete(sm.delete_pipeline, PipelineName=name, resource_desc=arn)
    elif ":feature-group/" in arn:
        safe_delete(sm.delete_feature_group, FeatureGroupName=name, resource_desc=arn)
    elif ":domain/" in arn:
        domain_id = arn.split("/")[-1]
        safe_delete(sm.delete_domain, DomainId=domain_id,
                    RetentionPolicy={"HomeEfsFileSystem": "Delete"}, resource_desc=arn)


def _delete_mediaconvert_queue(arn: str, name: str, region: str, account: str) -> None:
    try:
        mc_base = _client("mediaconvert", region, account)
        endpoints = mc_base.describe_endpoints()
        endpoint_url = endpoints["Endpoints"][0]["Url"]
        mc = boto3.client("mediaconvert", region_name=region, endpoint_url=endpoint_url)
        safe_delete(mc.delete_queue, Name=name, resource_desc=arn)
    except Exception as exc:
        log.warning("MediaConvert delete %s: %s", arn, exc)


def _delete_iotsitewise(arn: str, name: str, region: str, account: str) -> None:
    sw = _client("iotsitewise", region, account)
    if ":asset/" in arn:
        safe_delete(sw.delete_asset, assetId=name, resource_desc=arn)
    elif ":asset-model/" in arn:
        safe_delete(sw.delete_asset_model, assetModelId=name, resource_desc=arn)
    elif ":portal/" in arn:
        portal_id = arn.split("/")[-1]
        safe_delete(sw.delete_portal, portalId=portal_id, resource_desc=arn)


def _delete_transfer(arn: str, resource_id: str, region: str, account: str) -> None:
    transfer = _client("transfer", region, account)
    if "/" in resource_id:
        server_id, user_name = resource_id.split("/", 1)
        safe_delete(transfer.delete_user,
                    ServerId=server_id, UserName=user_name, resource_desc=arn)
    elif ":connector/" in arn:
        connector_id = arn.split("/")[-1]
        safe_delete(transfer.delete_connector,
                    ConnectorId=connector_id, resource_desc=arn)
    else:
        safe_delete(transfer.delete_server,
                    ServerId=resource_id, resource_desc=arn)


def _delete_location(arn: str, name: str, region: str, account: str) -> None:
    loc = _client("location", region, account)
    if ":map/" in arn:
        safe_delete(loc.delete_map, MapName=name, resource_desc=arn)
    elif ":tracker/" in arn:
        safe_delete(loc.delete_tracker, TrackerName=name, resource_desc=arn)
    elif ":place-index/" in arn:
        safe_delete(loc.delete_place_index, IndexName=name, resource_desc=arn)
    elif ":route-calculator/" in arn:
        safe_delete(loc.delete_route_calculator, CalculatorName=name, resource_desc=arn)


def _delete_cloudfront(arn: str, dist_id: str, account: str) -> None:
    """Disable then delete a CloudFront distribution.

    CloudFront requires: disable → wait for Deployed status → delete.
    Skipping the wait leaves a dangling distribution pointing at a
    deleted S3 bucket — a Palisade security finding (EpoxyMitigationsRisk).
    """
    cf = _client("cloudfront", "us-east-1", account)
    try:
        resp = cf.get_distribution(Id=dist_id)
        etag = resp["ETag"]
        config = resp["Distribution"]["DistributionConfig"]
        status = resp["Distribution"].get("Status", "")

        if config.get("Enabled"):
            config["Enabled"] = False
            update_resp = cf.update_distribution(
                DistributionConfig=config, Id=dist_id, IfMatch=etag
            )
            etag = update_resp["ETag"]
            log.info("Disabled CloudFront %s — waiting for Deployed status...", dist_id)
            status = "InProgress"

        # Wait up to 10 minutes for the distribution to reach Deployed state
        deadline = time.time() + 600
        while status != "Deployed" and time.time() < deadline:
            time.sleep(30)
            resp = cf.get_distribution(Id=dist_id)
            status = resp["Distribution"].get("Status", "")
            etag = resp["ETag"]
            log.info("  CloudFront %s status: %s", dist_id, status)

        if status == "Deployed":
            safe_delete(cf.delete_distribution, Id=dist_id, IfMatch=etag, resource_desc=arn)
            log.info("Deleted CloudFront %s", dist_id)
        else:
            log.warning("CloudFront %s did not reach Deployed within timeout — leaving disabled", dist_id)
    except Exception as exc:
        log.warning("CloudFront delete %s: %s", arn, exc)


def _delete_route53(arn: str, resource_id: str, account: str) -> None:
    route53 = _client("route53", "us-east-1", account)
    if ":hostedzone/" in arn:
        hz_id = arn.split("/")[-1]
        # Delete all non-NS/SOA records first
        try:
            resp = route53.list_resource_record_sets(HostedZoneId=hz_id)
            changes = []
            for rs in resp.get("ResourceRecordSets", []):
                if rs["Type"] not in ("NS", "SOA"):
                    changes.append({"Action": "DELETE", "ResourceRecordSet": rs})
            if changes:
                route53.change_resource_record_sets(
                    HostedZoneId=hz_id,
                    ChangeBatch={"Changes": changes},
                )
        except Exception:
            pass
        safe_delete(route53.delete_hosted_zone, Id=hz_id, resource_desc=arn)
    elif ":healthcheck/" in arn:
        hc_id = arn.split("/")[-1]
        safe_delete(route53.delete_health_check, HealthCheckId=hc_id, resource_desc=arn)


def _delete_global_accelerator(arn: str, account: str) -> None:
    ga = _client("globalaccelerator", "us-west-2", account)
    try:
        resp = ga.describe_accelerator(AcceleratorArn=arn)
        if resp["Accelerator"]["Status"] == "DEPLOYED":
            # Disable first
            ga.update_accelerator(AcceleratorArn=arn, Enabled=False)
            log.info("Disabled Global Accelerator %s", arn)
            # Wait for disabled state
            for _ in range(30):
                time.sleep(10)
                r2 = ga.describe_accelerator(AcceleratorArn=arn)
                if r2["Accelerator"]["Status"] == "DEPLOYED":
                    break
    except Exception:
        pass
    safe_delete(ga.delete_accelerator, AcceleratorArn=arn, resource_desc=arn)


def _delete_bedrock(arn: str, name: str, region: str, account: str) -> None:
    try:
        bedrock = _client("bedrock", region, account)
        if ":inference-profile/" in arn:
            safe_delete(bedrock.delete_inference_profile,
                        inferenceProfileIdentifier=arn, resource_desc=arn)
        elif ":guardrail/" in arn:
            grd_id = arn.split("/")[-1]
            safe_delete(bedrock.delete_guardrail,
                        guardrailIdentifier=grd_id, resource_desc=arn)
    except Exception as exc:
        log.warning("Bedrock delete %s: %s", arn, exc)

    try:
        bedrock_agent = _client("bedrock-agent", region, account)
        if ":agent/" in arn:
            agent_id = arn.split("/")[-1]
            safe_delete(bedrock_agent.delete_agent,
                        agentId=agent_id, skipResourceInUseCheck=True, resource_desc=arn)
    except Exception as exc:
        log.warning("Bedrock agent delete %s: %s", arn, exc)


def _delete_deadline(arn: str, resource_id: str, region: str, account: str) -> None:
    try:
        deadline = _client("deadline", region, account)
        if "/fleet/" in arn:
            farm_id = arn.split("/farm/")[1].split("/")[0]
            fleet_id = arn.split("/fleet/")[-1]
            safe_delete(deadline.delete_fleet,
                        farmId=farm_id, fleetId=fleet_id, resource_desc=arn)
        elif "/queue/" in arn:
            farm_id = arn.split("/farm/")[1].split("/")[0]
            queue_id = arn.split("/queue/")[-1]
            safe_delete(deadline.delete_queue,
                        farmId=farm_id, queueId=queue_id, resource_desc=arn)
        elif "/farm/" in arn and "/queue/" not in arn and "/fleet/" not in arn:
            safe_delete(deadline.delete_farm,
                        farmId=resource_id, resource_desc=arn)
    except Exception as exc:
        log.warning("Deadline delete %s: %s", arn, exc)


def _delete_iam_role(role_name: str) -> None:
    """Detach all policies, then delete the IAM role."""
    iam = boto3.client("iam")
    try:
        paginator = iam.get_paginator("list_attached_role_policies")
        for page in paginator.paginate(RoleName=role_name):
            for policy in page.get("AttachedPolicies", []):
                safe_call_silent(iam.detach_role_policy,
                                 RoleName=role_name, PolicyArn=policy["PolicyArn"])
    except Exception:
        pass
    try:
        paginator = iam.get_paginator("list_role_policies")
        for page in paginator.paginate(RoleName=role_name):
            for policy_name in page.get("PolicyNames", []):
                safe_call_silent(iam.delete_role_policy,
                                 RoleName=role_name, PolicyName=policy_name)
    except Exception:
        pass
    safe_delete(iam.delete_role, RoleName=role_name, resource_desc=f"IAM role {role_name}")


# ---------------------------------------------------------------------------
# Deletion ordering
# ---------------------------------------------------------------------------

# Lower priority number = deleted first
# VPC networking resources must be deleted after everything that uses VPCs
DELETION_PRIORITY: dict[str, int] = {
    # First: ML, Analytics, long-running jobs
    "sagemaker": 1,
    "comprehend": 1,
    "healthlake": 1,
    "elasticmapreduce": 1,

    # Second: Databases and clusters (may depend on subnet groups)
    "rds": 2,
    "docdb": 2,
    "dax": 2,
    "memorydb": 2,
    "kafka": 2,
    "mq": 2,
    "elasticache": 2,
    "redshift": 2,
    "es": 2,

    # Third: App-level services
    "lambda": 3,
    "ecs": 3,
    "ecr": 3,
    "autoscaling": 3,
    "states": 3,
    "apigateway": 3,
    "appsync": 3,
    "sns": 3,
    "sqs": 3,
    "kinesis": 3,
    "firehose": 3,
    "kinesisvideo": 3,
    "glue": 3,
    "athena": 3,
    "dynamodb": 3,
    "codebuild": 3,
    "codepipeline": 3,
    "cloudformation": 3,
    "catalog": 3,

    # Fourth: Security / shared services
    "secretsmanager": 4,
    "kms": 4,
    "acm": 4,
    "cognito-idp": 4,
    "cognito-identity": 4,
    "backup": 4,
    "ram": 4,
    "cloudwatch": 4,
    "ssm": 4,
    "logs": 4,

    # Fifth: IoT / Media / Misc
    "mediaconvert": 5,
    "iot": 5,
    "iotsitewise": 5,
    "transfer": 5,
    "datasync": 5,
    "appstream": 5,
    "bedrock": 5,
    "deadline": 5,
    "dms": 5,

    # Sixth: Global services
    "cloudfront": 6,
    "route53": 6,
    "globalaccelerator": 6,
    "directconnect": 6,

    # Seventh: EC2 compute (before networking)
    "ec2-compute": 7,  # instances, ASG — handled by service=ec2 + resource type check

    # Last: VPC networking (order within EC2 matters too)
    "ec2-networking": 10,  # VPC, subnets, SGs, IGW, etc.
    "s3": 10,
    "iam": 10,
}

EC2_COMPUTE_TYPES = {
    ":instance/", ":volume/", ":snapshot/", ":image/", ":key-pair/",
    ":natgateway/", ":elastic-ip/",
}
EC2_NETWORKING_TYPES = {
    ":vpc/", ":subnet/", ":security-group/", ":internet-gateway/",
    ":route-table/", ":network-acl/", ":dhcp-options/",
    ":vpc-peering-connection/", ":transit-gateway/", ":vpc-endpoint/",
    ":vpc-flow-log/", ":customer-gateway/", ":vpn-gateway/",
    ":egress-only-internet-gateway/", ":network-interface/",
    ":placement-group/", ":launch-template/",
}


def _deletion_priority(record: dict) -> int:
    service = record.get("service", "")
    arn = record.get("arn", "")
    if service == "ec2":
        if any(t in arn for t in EC2_COMPUTE_TYPES):
            return DELETION_PRIORITY.get("ec2-compute", 7)
        return DELETION_PRIORITY.get("ec2-networking", 10)
    return DELETION_PRIORITY.get(service, 5)


# ---------------------------------------------------------------------------
# Tag-based orphan sweep
# ---------------------------------------------------------------------------

def orphan_sweep(tag_value: str, regions: list[str], accounts: list[str]) -> None:
    """Find any remaining resources tagged with tag_value and delete them."""
    log.info("Running orphan sweep for tag-value=%s across %d region(s)", tag_value, len(regions))
    for region in regions:
        for account in (accounts or [_get_current_account()]):
            try:
                tagging = _client("resourcegroupstaggingapi", region, account)
                paginator = tagging.get_paginator("get_resources")
                for page in paginator.paginate(
                    TagFilters=[{"Key": "map-migrated", "Values": [tag_value]}]
                ):
                    for rm in page.get("ResourceTagMappingList", []):
                        arn = rm["ResourceARN"]
                        log.info("  Orphan sweep: %s", arn)
                        # Build a minimal record
                        rec = {
                            "arn": arn,
                            "service": _service_from_arn(arn),
                            "region": region,
                            "account": account,
                            "resource_id": arn.split("/")[-1],
                        }
                        safe_delete(lambda: delete_record(rec), resource_desc=arn)
            except Exception as exc:
                log.warning("Orphan sweep %s/%s: %s", region, account, exc)


def _service_from_arn(arn: str) -> str:
    try:
        return arn.split(":")[2]
    except IndexError:
        return ""


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def tag_sweep_all(tag_value: str, regions: list[str]) -> None:
    """--all mode: sweep all resources tagged with tag_value using resourcegroupstaggingapi.

    Skips ARN file loading entirely — useful for nightly cleanup where there are
    no ARN artifact files, only orphaned resources identified by the test MPE tag.
    If tag_value is '*', matches any value for the map-migrated key.
    """
    match_any = tag_value == "*"
    log.info(
        "Running --all tag sweep for map-migrated=%s across regions: %s",
        "* (any value)" if match_any else tag_value,
        ", ".join(regions),
    )
    tag_filter = [{"Key": "map-migrated"}] if match_any else [{"Key": "map-migrated", "Values": [tag_value]}]
    current_account = _get_current_account()
    for region in regions:
        try:
            tagging = _client("resourcegroupstaggingapi", region, current_account)
            paginator = tagging.get_paginator("get_resources")
            found = 0
            for page in paginator.paginate(
                TagFilters=tag_filter
            ):
                for rm in page.get("ResourceTagMappingList", []):
                    arn = rm["ResourceARN"]
                    log.info("  Tag sweep (%s): %s", region, arn)
                    rec = {
                        "arn": arn,
                        "service": _service_from_arn(arn),
                        "region": region,
                        "account": current_account,
                        "resource_id": arn.split("/")[-1],
                    }
                    try:
                        delete_record(rec)
                    except Exception as exc:
                        log.warning("  Error deleting %s: %s", arn, exc)
                    found += 1
            log.info("  Region %s: swept %d resource(s)", region, found)
        except Exception as exc:
            log.warning("Tag sweep failed for region %s: %s", region, exc)


def main() -> None:
    parser = argparse.ArgumentParser(description="Tear down E2E test resources")
    parser.add_argument("--arns-dir", default=None, help="Directory with ARN JSON files")
    parser.add_argument("--pr", default=None, help="PR number (used for sweep)")
    parser.add_argument("--tag-value", default=None,
                        help="Tag value for orphan sweep (defaults to migTEST from records)")
    parser.add_argument("--no-sweep", action="store_true",
                        help="Skip the tag-based orphan sweep")
    parser.add_argument(
        "--all",
        action="store_true",
        dest="sweep_all",
        help=(
            "Skip ARN file loading; instead sweep all resources tagged with "
            "--tag-value using resourcegroupstaggingapi. Requires --tag-value."
        ),
    )
    parser.add_argument(
        "--regions",
        default="ap-northeast-2,us-east-1,us-west-2",
        help="Comma-separated regions for --all sweep (default: ap-northeast-2,us-east-1,us-west-2)",
    )
    args = parser.parse_args()

    # ── --all mode: pure tag-based sweep, no ARN file needed ─────────────────
    if args.sweep_all:
        if not args.tag_value:
            log.error("--all requires --tag-value")
            sys.exit(1)
        regions = [r.strip() for r in args.regions.split(",") if r.strip()]
        tag_sweep_all(args.tag_value, regions)
        log.info("Teardown complete (--all mode).")
        return

    # ── Normal mode: ARN-file-based deletion + optional orphan sweep ──────────
    if not args.arns_dir:
        log.error("--arns-dir is required when not using --all")
        sys.exit(1)

    # Load all records
    p = Path(args.arns_dir)
    all_records: list[dict] = []
    for json_file in sorted(p.glob("*.json")):
        try:
            data = json.loads(json_file.read_text())
            if isinstance(data, list):
                all_records.extend(data)
            elif isinstance(data, dict):
                all_records.append(data)
        except Exception as exc:
            log.warning("Could not read %s: %s", json_file, exc)

    log.info("Loaded %d resource records to delete", len(all_records))

    if not all_records:
        log.warning("No records found — skipping record-based deletion")
    else:
        # Sort by deletion priority
        ordered = sorted(all_records, key=_deletion_priority)

        for record in ordered:
            try:
                delete_record(record)
            except Exception as exc:
                log.warning("Unexpected error deleting %s: %s", record.get("arn"), exc)

    # Tag-based orphan sweep
    if not args.no_sweep:
        tag_value = args.tag_value
        if not tag_value and all_records:
            tag_value = all_records[0].get("expected_tag_value", "")

        if tag_value:
            # Collect unique regions and accounts from records
            regions = list({r.get("region", "ap-northeast-2") for r in all_records}) or ["ap-northeast-2"]
            accounts = list({r.get("account", "") for r in all_records if r.get("account")})
            orphan_sweep(tag_value, regions, accounts)
        else:
            log.warning("Could not determine tag value for orphan sweep — skipping")

    log.info("Teardown complete.")


if __name__ == "__main__":
    main()
