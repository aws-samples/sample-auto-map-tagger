"""
databases.py — Creates database and messaging resources for E2E tests.

Requires: --vpc-id, --subnet-ids, --sg-id

Creates:
  - RDS subnet group
  - ElastiCache subnet group
  - DynamoDB table
  - RDS MySQL instance (no wait)
  - Aurora MySQL cluster + instance (no wait)
  - ElastiCache Redis replication group (no wait)
  - ElastiCache Serverless cache
  - Redshift cluster (no wait)
  - OpenSearch domain (no wait)
  - DAX cluster (no wait)
  - DocumentDB cluster + instance (no wait)
  - MemoryDB cluster (no wait)
  - MSK cluster v1 (no wait)
  - MSK cluster v2 serverless (no wait)
  - Amazon MQ broker (no wait)
  - DMS replication instance (no wait)
  - DMS replication config serverless
"""

from __future__ import annotations

import json
import logging
import time

import boto3

from ._common import get_account_id, make_record, resource_name, safe_call

log = logging.getLogger(__name__)
# Tag key used to mark E2E-created resources for teardown bookkeeping.
# NOT `map-migrated` — that is the tag the auto-tagger Lambda is supposed
# to apply; pre-tagging with it would make verify_tags a tautology and
# mask any Lambda failure (see auto-map-tagger-e2e-audit.md).
PRE_TAG_KEY = "e2e-run-id"

# Tag key the Lambda is expected to apply — what verify_tags polls for.
EXPECTED_TAG_KEY = "map-migrated"


def create(
    region: str,
    pr_number: str,
    timestamp: str,
    tag_value: str,
    vpc_id: str = "",
    subnet_ids: list[str] | None = None,
    sg_id: str = "",
    **_kwargs,
) -> dict:
    account = get_account_id()
    arns: list[dict] = []
    prefix = lambda svc: resource_name(pr_number, timestamp, svc)

    def rec(arn, service, resource_id, taggable=True):
        arns.append(make_record(
            arn=arn,
            service=service,
            region=region,
            account=account,
            resource_id=resource_id,
            tag_key=EXPECTED_TAG_KEY,
            tag_value=tag_value,
            taggable=taggable,
        ))

    subnets = subnet_ids or []
    sgs = [sg_id] if sg_id else []
    tags = [{"Key": PRE_TAG_KEY, "Value": tag_value}]

    rds = boto3.client("rds", region_name=region)
    elasticache = boto3.client("elasticache", region_name=region)
    dynamodb = boto3.client("dynamodb", region_name=region)
    redshift = boto3.client("redshift", region_name=region)
    opensearch = boto3.client("opensearch", region_name=region)
    dax = boto3.client("dax", region_name=region)
    docdb = boto3.client("docdb", region_name=region)
    memorydb = boto3.client("memorydb", region_name=region)
    msk = boto3.client("kafka", region_name=region)
    mq = boto3.client("mq", region_name=region)
    dms = boto3.client("dms", region_name=region)
    iam = boto3.client("iam")

    # ── RDS subnet group ──────────────────────────────────────────────────────
    rds_sg_name = prefix("rds-subnetgrp")
    rds_subnetgrp_ok = False
    if subnets:
        try:
            rds.create_db_subnet_group(
                DBSubnetGroupName=rds_sg_name,
                DBSubnetGroupDescription="E2E test RDS subnet group",
                SubnetIds=subnets,
                Tags=tags,
            )
            rds_subnetgrp_ok = True
            # Subnet group itself isn't the resource-under-test
            rec(
                f"arn:aws:rds:{region}:{account}:subgrp:{rds_sg_name}",
                "rds", rds_sg_name, taggable=False,
            )
            log.info("RDS subnet group: %s", rds_sg_name)
        except Exception as exc:
            log.error("RDS subnet group failed: %s", exc)

    # ── ElastiCache subnet group ──────────────────────────────────────────────
    ec_sg_name = prefix("ec-subnetgrp")
    ec_subnetgrp_ok = False
    if subnets:
        try:
            elasticache.create_cache_subnet_group(
                CacheSubnetGroupName=ec_sg_name,
                CacheSubnetGroupDescription="E2E test ElastiCache subnet group",
                SubnetIds=subnets,
                Tags=tags,
            )
            ec_subnetgrp_ok = True
            rec(
                f"arn:aws:elasticache:{region}:{account}:subnetgroup:{ec_sg_name}",
                "elasticache", ec_sg_name, taggable=False,
            )
            log.info("ElastiCache subnet group: %s", ec_sg_name)
        except Exception as exc:
            log.error("ElastiCache subnet group failed: %s", exc)

    # ── DynamoDB table ────────────────────────────────────────────────────────
    ddb_name = prefix("dynamodb")
    try:
        resp = dynamodb.create_table(
            TableName=ddb_name,
            AttributeDefinitions=[{"AttributeName": "pk", "AttributeType": "S"}],
            KeySchema=[{"AttributeName": "pk", "KeyType": "HASH"}],
            BillingMode="PAY_PER_REQUEST",
            Tags=tags,
        )
        ddb_arn = resp["TableDescription"]["TableArn"]
        rec(ddb_arn, "dynamodb", ddb_name)
        log.info("DynamoDB: %s", ddb_arn)
    except Exception as exc:
        log.error("DynamoDB creation failed: %s", exc)

    # ── RDS MySQL instance ────────────────────────────────────────────────────
    rds_id = prefix("rds")
    try:
        rds_kwargs: dict = {
            "DBInstanceIdentifier": rds_id,
            "DBInstanceClass": "db.t3.micro",
            "Engine": "mysql",
            "MasterUsername": "admin",
            "MasterUserPassword": "TestPass1234!",
            "AllocatedStorage": 20,
            "Tags": tags,
            "StorageType": "gp2",
            "MultiAZ": False,
            "PubliclyAccessible": False,
        }
        if rds_subnetgrp_ok:
            rds_kwargs["DBSubnetGroupName"] = rds_sg_name
        if sgs:
            rds_kwargs["VpcSecurityGroupIds"] = sgs

        resp = rds.create_db_instance(**rds_kwargs)
        rds_arn = resp["DBInstance"]["DBInstanceArn"]
        rec(rds_arn, "rds", rds_id)
        log.info("RDS MySQL: %s (not waiting)", rds_arn)
    except Exception as exc:
        log.error("RDS MySQL creation failed: %s", exc)

    # ── Aurora MySQL cluster + instance ───────────────────────────────────────
    aurora_cluster_id = prefix("aurora")
    try:
        aurora_kwargs: dict = {
            "DBClusterIdentifier": aurora_cluster_id,
            "Engine": "aurora-mysql",
            "EngineVersion": "8.0.mysql_aurora.3.04.0",
            "MasterUsername": "admin",
            "MasterUserPassword": "TestPass1234!",
            "Tags": tags,
            "StorageEncrypted": False,
        }
        if rds_subnetgrp_ok:
            aurora_kwargs["DBSubnetGroupName"] = rds_sg_name
        if sgs:
            aurora_kwargs["VpcSecurityGroupIds"] = sgs

        resp = rds.create_db_cluster(**aurora_kwargs)
        aurora_arn = resp["DBCluster"]["DBClusterArn"]
        rec(aurora_arn, "rds", aurora_cluster_id)
        log.info("Aurora cluster: %s (not waiting)", aurora_arn)

        # Aurora instance
        aurora_inst_id = prefix("aurora-inst")
        rds.create_db_instance(
            DBInstanceIdentifier=aurora_inst_id,
            DBClusterIdentifier=aurora_cluster_id,
            DBInstanceClass="db.t3.medium",
            Engine="aurora-mysql",
            Tags=tags,
        )
        aurora_inst_arn = f"arn:aws:rds:{region}:{account}:db:{aurora_inst_id}"
        rec(aurora_inst_arn, "rds", aurora_inst_id)
        log.info("Aurora instance: %s (not waiting)", aurora_inst_id)
    except Exception as exc:
        log.error("Aurora creation failed: %s", exc)

    # ── ElastiCache Redis replication group ───────────────────────────────────
    redis_id = prefix("redis")
    if ec_subnetgrp_ok:
        try:
            ec_kwargs: dict = {
                "ReplicationGroupId": redis_id[:20],  # max 20 chars
                "ReplicationGroupDescription": "E2E test Redis",
                "CacheNodeType": "cache.t3.micro",
                "Engine": "redis",
                "NumCacheClusters": 1,
                "Tags": tags,
                "CacheSubnetGroupName": ec_sg_name,
            }
            if sgs:
                ec_kwargs["SecurityGroupIds"] = sgs

            resp = elasticache.create_replication_group(**ec_kwargs)
            redis_arn = resp["ReplicationGroup"]["ARN"]
            rec(redis_arn, "elasticache", redis_id[:20])
            log.info("ElastiCache Redis: %s (not waiting)", redis_arn)
        except Exception as exc:
            log.error("ElastiCache Redis creation failed: %s", exc)

    # ── ElastiCache standalone cache cluster (memcached) ──────────────────────
    # CloudTrail event: CreateCacheCluster (distinct from the CreateReplicationGroup
    # path above — AWS fires different events). Memcached keeps it single-node
    # and avoids Redis TLS/auth ceremony.
    standalone_cache_id = prefix("memcached")[:20]  # max 20 chars, ^[a-z][a-z0-9-]*
    if ec_subnetgrp_ok:
        try:
            cc_kwargs: dict = {
                "CacheClusterId": standalone_cache_id,
                "Engine": "memcached",
                "CacheNodeType": "cache.t3.micro",
                "NumCacheNodes": 1,
                "Tags": tags,
                "CacheSubnetGroupName": ec_sg_name,
            }
            if sgs:
                cc_kwargs["SecurityGroupIds"] = sgs
            resp = elasticache.create_cache_cluster(**cc_kwargs)
            cache_arn = resp["CacheCluster"]["ARN"]
            rec(cache_arn, "elasticache", standalone_cache_id)
            log.info("ElastiCache standalone: %s (not waiting)", cache_arn)
        except Exception as exc:
            log.error("ElastiCache standalone creation failed: %s", exc)

    # ── ElastiCache Serverless cache ──────────────────────────────────────────
    # Pre-cleanup: ElastiCache Serverless occasionally leaks caches in
    # create-failed state that teardown's prior branch-order bug left
    # orphaned. These accumulate and eventually hit the 40-per-region quota
    # or destabilize the ElastiCache control plane, making new creates fail.
    # Brute-force delete any stale e2e-* caches before creating a new one.
    _cleanup_stale_serverless_caches(elasticache)

    ecs_name = prefix("ecache-srv")[:36]  # max 40 chars
    try:
        ecs_kwargs: dict = {
            "ServerlessCacheName": ecs_name,
            "Engine": "redis",
            "Tags": tags,
        }
        if subnets:
            ecs_kwargs["SubnetIds"] = subnets
        if sgs:
            ecs_kwargs["SecurityGroupIds"] = sgs

        resp = elasticache.create_serverless_cache(**ecs_kwargs)
        serverless_arn = resp["ServerlessCache"]["ARN"]
        rec(serverless_arn, "elasticache", ecs_name)
        log.info("ElastiCache Serverless: %s", serverless_arn)
    except Exception as exc:
        log.error("ElastiCache Serverless creation failed: %s", exc)

    # ── Redshift cluster ──────────────────────────────────────────────────────
    rs_id = prefix("redshift")[:63]
    try:
        rs_kwargs: dict = {
            "ClusterIdentifier": rs_id,
            "ClusterType": "single-node",
            "NodeType": "dc2.large",
            "MasterUsername": "awsuser",
            "MasterUserPassword": "TestPass1234!",
            "Tags": tags,
            "PubliclyAccessible": False,
        }
        if subnets and vpc_id:
            # Create Redshift subnet group
            rs_sg_name = prefix("rs-subnetgrp")
            try:
                redshift.create_cluster_subnet_group(
                    ClusterSubnetGroupName=rs_sg_name,
                    Description="E2E test Redshift subnet group",
                    SubnetIds=subnets,
                    Tags=tags,
                )
                rs_kwargs["ClusterSubnetGroupName"] = rs_sg_name
            except Exception as exc:
                log.warning("Redshift subnet group: %s", exc)
        if sgs:
            rs_kwargs["VpcSecurityGroupIds"] = sgs

        resp = redshift.create_cluster(**rs_kwargs)
        rs_arn = (
            f"arn:aws:redshift:{region}:{account}:cluster:{rs_id}"
        )
        rec(rs_arn, "redshift", rs_id)
        log.info("Redshift: %s (not waiting)", rs_id)
    except Exception as exc:
        log.error("Redshift creation failed: %s", exc)

    # ── OpenSearch domain ─────────────────────────────────────────────────────
    os_name = prefix("opensearch")[:28]
    try:
        os_kwargs: dict = {
            "DomainName": os_name,
            "EngineVersion": "OpenSearch_2.11",
            "ClusterConfig": {
                "InstanceType": "t3.small.search",
                "InstanceCount": 1,
            },
            "EBSOptions": {"EBSEnabled": True, "VolumeType": "gp3", "VolumeSize": 10},
            "TagList": tags,
            "EncryptionAtRestOptions": {"Enabled": True},
            "NodeToNodeEncryptionOptions": {"Enabled": True},
        }
        resp = opensearch.create_domain(**os_kwargs)
        os_arn = resp["DomainStatus"]["ARN"]
        rec(os_arn, "es", os_name)
        log.info("OpenSearch: %s (not waiting)", os_arn)
    except Exception as exc:
        log.error("OpenSearch creation failed: %s", exc)

    # ── DAX cluster ───────────────────────────────────────────────────────────
    dax_name = prefix("dax")
    try:
        dax_role_arn = _ensure_dax_role(iam, account, prefix("dax-role"))
        dax_kwargs: dict = {
            "ClusterName": dax_name,
            "NodeType": "dax.t3.small",
            "ReplicationFactor": 1,
            "IamRoleArn": dax_role_arn,
            "Tags": tags,
        }
        if subnets:
            dax_sg_name = prefix("dax-subnetgrp")
            try:
                dax.create_subnet_group(
                    SubnetGroupName=dax_sg_name,
                    Description="E2E DAX subnet group",
                    SubnetIds=subnets,
                )
                dax_kwargs["SubnetGroupName"] = dax_sg_name
            except Exception as exc:
                log.warning("DAX subnet group: %s", exc)
        if sgs:
            dax_kwargs["SecurityGroupIds"] = sgs

        resp = dax.create_cluster(**dax_kwargs)
        dax_arn = resp["Cluster"]["ClusterArn"]
        rec(dax_arn, "dax", dax_name)
        log.info("DAX: %s (not waiting)", dax_arn)
    except Exception as exc:
        log.error("DAX creation failed: %s", exc)

    # ── DocumentDB cluster + instance ─────────────────────────────────────────
    docdb_cluster_id = prefix("docdb")
    try:
        docdb_kwargs: dict = {
            "DBClusterIdentifier": docdb_cluster_id,
            "Engine": "docdb",
            "MasterUsername": "docdbadmin",
            "MasterUserPassword": "TestPass1234!",
            "Tags": tags,
        }
        if rds_subnetgrp_ok:
            docdb_kwargs["DBSubnetGroupName"] = rds_sg_name
        if sgs:
            docdb_kwargs["VpcSecurityGroupIds"] = sgs

        resp = docdb.create_db_cluster(**docdb_kwargs)
        docdb_arn = resp["DBCluster"]["DBClusterArn"]
        rec(docdb_arn, "docdb", docdb_cluster_id)
        log.info("DocumentDB cluster: %s (not waiting)", docdb_arn)

        # DocumentDB instance
        docdb_inst_id = prefix("docdb-inst")
        docdb.create_db_instance(
            DBInstanceIdentifier=docdb_inst_id,
            DBClusterIdentifier=docdb_cluster_id,
            DBInstanceClass="db.t3.medium",
            Engine="docdb",
            Tags=tags,
        )
        docdb_inst_arn = (
            f"arn:aws:rds:{region}:{account}:db:{docdb_inst_id}"
        )
        rec(docdb_inst_arn, "docdb", docdb_inst_id)
        log.info("DocumentDB instance: %s (not waiting)", docdb_inst_id)
    except Exception as exc:
        log.error("DocumentDB creation failed: %s", exc)

    # ── MemoryDB cluster ──────────────────────────────────────────────────────
    mdb_name = prefix("memorydb")[:40]
    try:
        mdb_kwargs: dict = {
            "ClusterName": mdb_name,
            "NodeType": "db.t4g.small",
            "ACLName": "open-access",
            "Tags": tags,
        }
        if subnets:
            mdb_sg_name = prefix("mdb-subnetgrp")[:40]
            try:
                memorydb.create_subnet_group(
                    SubnetGroupName=mdb_sg_name,
                    SubnetIds=subnets,
                    Tags=tags,
                )
                mdb_kwargs["SubnetGroupName"] = mdb_sg_name
            except Exception as exc:
                log.warning("MemoryDB subnet group: %s", exc)
        if sgs:
            mdb_kwargs["SecurityGroupIds"] = sgs

        resp = memorydb.create_cluster(**mdb_kwargs)
        mdb_arn = resp["Cluster"]["ARN"]
        rec(mdb_arn, "memorydb", mdb_name)
        log.info("MemoryDB: %s (not waiting)", mdb_arn)
    except Exception as exc:
        log.error("MemoryDB creation failed: %s", exc)

    # ── MSK cluster v1 ────────────────────────────────────────────────────────
    msk_name = prefix("msk")
    if subnets:
        try:
            resp = msk.create_cluster(
                ClusterName=msk_name,
                NumberOfBrokerNodes=2,
                BrokerNodeGroupInfo={
                    "InstanceType": "kafka.t3.small",
                    "ClientSubnets": subnets[:2] if len(subnets) >= 2 else subnets * 2,
                    "StorageInfo": {"EbsStorageInfo": {"VolumeSize": 1}},
                },
                KafkaVersion="2.8.1",
                Tags={PRE_TAG_KEY: tag_value},
            )
            msk_arn = resp["ClusterArn"]
            rec(msk_arn, "kafka", msk_name)
            log.info("MSK v1: %s (not waiting)", msk_arn)
        except Exception as exc:
            log.error("MSK v1 creation failed: %s", exc)

    # ── MSK cluster v2 serverless ─────────────────────────────────────────────
    msk2_name = prefix("msk-svless")
    if subnets and vpc_id:
        try:
            resp = msk.create_cluster_v2(
                ClusterName=msk2_name,
                Serverless={
                    "VpcConfigs": [{"SubnetIds": subnets, "SecurityGroupIds": sgs}],
                    "ClientAuthentication": {"Sasl": {"Iam": {"Enabled": True}}},
                },
                Tags={PRE_TAG_KEY: tag_value},
            )
            msk2_arn = resp["ClusterArn"]
            rec(msk2_arn, "kafka", msk2_name)
            log.info("MSK v2 serverless: %s (not waiting)", msk2_arn)
        except Exception as exc:
            log.error("MSK v2 serverless creation failed: %s", exc)

    # ── Amazon MQ broker ──────────────────────────────────────────────────────
    mq_name = prefix("mq")
    try:
        mq_kwargs: dict = {
            "BrokerName": mq_name,
            "DeploymentMode": "SINGLE_INSTANCE",
            "EngineType": "RABBITMQ",
            "EngineVersion": "3.11.20",
            "HostInstanceType": "mq.t3.micro",
            "AutoMinorVersionUpgrade": False,
            "PubliclyAccessible": False,
            "User": [{"Username": "mqadmin", "Password": "TestPass1234!"}],
            "Tags": {PRE_TAG_KEY: tag_value},
        }
        if subnets:
            mq_kwargs["SubnetIds"] = [subnets[0]]
        if sgs:
            mq_kwargs["SecurityGroups"] = sgs

        resp = mq.create_broker(**mq_kwargs)
        mq_arn = resp["BrokerArn"]
        rec(mq_arn, "mq", mq_name)
        log.info("MQ: %s (not waiting)", mq_arn)
    except Exception as exc:
        log.error("MQ creation failed: %s", exc)

    # ── DMS replication instance ──────────────────────────────────────────────
    dms_ri_id = prefix("dms-ri")
    try:
        dms_kwargs: dict = {
            "ReplicationInstanceIdentifier": dms_ri_id,
            "ReplicationInstanceClass": "dms.t3.micro",
            "PubliclyAccessible": False,
            "Tags": tags,
        }
        if subnets:
            dms_sg_name = prefix("dms-subnetgrp")
            try:
                dms.create_replication_subnet_group(
                    ReplicationSubnetGroupIdentifier=dms_sg_name,
                    ReplicationSubnetGroupDescription="E2E DMS subnet group",
                    SubnetIds=subnets,
                    Tags=tags,
                )
                dms_kwargs["ReplicationSubnetGroupIdentifier"] = dms_sg_name
            except Exception as exc:
                log.warning("DMS subnet group: %s", exc)
        if sgs:
            dms_kwargs["VpcSecurityGroupIds"] = sgs

        resp = dms.create_replication_instance(**dms_kwargs)
        dms_ri_arn = resp["ReplicationInstance"]["ReplicationInstanceArn"]
        rec(dms_ri_arn, "dms", dms_ri_id)
        log.info("DMS replication instance: %s (not waiting)", dms_ri_arn)
    except Exception as exc:
        log.error("DMS replication instance creation failed: %s", exc)

    # ── DMS replication config (serverless) ───────────────────────────────────
    dms_rc_id = prefix("dms-rc")
    try:
        # Need source + target endpoints; use placeholder S3 endpoints
        s3_source_arn = _create_dms_s3_endpoint(dms, prefix("dms-src"), account, region, tags, is_source=True)
        s3_target_arn = _create_dms_s3_endpoint(dms, prefix("dms-tgt"), account, region, tags, is_source=False)

        if s3_source_arn and s3_target_arn:
            resp = dms.create_replication_config(
                ReplicationConfigIdentifier=dms_rc_id,
                SourceEndpointArn=s3_source_arn,
                TargetEndpointArn=s3_target_arn,
                ReplicationType="full-load",
                ComputeConfig={"MinCapacityUnits": 1, "MaxCapacityUnits": 4},
                TableMappings=json.dumps({
                    "rules": [{"rule-type": "selection", "rule-id": "1",
                                "rule-name": "include-all",
                                "object-locator": {"schema-name": "%", "table-name": "%"},
                                "rule-action": "include"}]
                }),
                Tags=tags,
            )
            rc_arn = resp["ReplicationConfig"]["ReplicationConfigArn"]
            rec(rc_arn, "dms", dms_rc_id)
            log.info("DMS replication config: %s", rc_arn)
    except Exception as exc:
        log.error("DMS replication config creation failed: %s", exc)

    return {"arns": arns, "outputs": {}}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _ensure_dax_role(iam_client, account: str, role_name: str) -> str:
    trust = json.dumps({
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Principal": {"Service": "dax.amazonaws.com"},
            "Action": "sts:AssumeRole",
        }],
    })
    try:
        resp = iam_client.create_role(
            RoleName=role_name,
            AssumeRolePolicyDocument=trust,
        )
        iam_client.attach_role_policy(
            RoleName=role_name,
            PolicyArn="arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess",
        )
        time.sleep(10)
        return resp["Role"]["Arn"]
    except iam_client.exceptions.EntityAlreadyExistsException:
        return f"arn:aws:iam::{account}:role/{role_name}"
    except Exception as exc:
        log.warning("DAX role: %s", exc)
        return f"arn:aws:iam::{account}:role/{role_name}"


def _create_dms_s3_endpoint(
    dms_client,
    endpoint_id: str,
    account: str,
    region: str,
    tags: list,
    is_source: bool,
) -> str | None:
    """Create a minimal DMS S3 endpoint and return its ARN."""
    import boto3, json as _json
    iam = boto3.client("iam")
    role_name = f"{endpoint_id}-dms-s3-role"
    trust = _json.dumps({
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Principal": {"Service": "dms.amazonaws.com"},
            "Action": "sts:AssumeRole",
        }],
    })
    try:
        try:
            r = iam.create_role(RoleName=role_name, AssumeRolePolicyDocument=trust)
            s3_role_arn = r["Role"]["Arn"]
            iam.attach_role_policy(
                RoleName=role_name,
                PolicyArn="arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess",
            )
            time.sleep(10)
        except iam.exceptions.EntityAlreadyExistsException:
            s3_role_arn = f"arn:aws:iam::{account}:role/{role_name}"

        # Use a public bucket as placeholder
        bucket_name = f"aws-dms-tasks-{region}"
        resp = dms_client.create_endpoint(
            EndpointIdentifier=endpoint_id,
            EndpointType="source" if is_source else "target",
            EngineName="s3",
            S3Settings={
                "BucketName": bucket_name,
                "ServiceAccessRoleArn": s3_role_arn,
            },
            Tags=tags,
        )
        return resp["Endpoint"]["EndpointArn"]
    except Exception as exc:
        log.warning("DMS S3 endpoint %s: %s", endpoint_id, exc)
        return None


def _cleanup_stale_serverless_caches(elasticache_client) -> None:
    """Delete any stale e2e-* ElastiCache Serverless caches.

    Why: teardown had a branch-order bug that routed serverlesscache ARNs to
    delete_replication_group, leaving failed caches orphaned. Accumulated
    create-failed caches destabilize the ElastiCache control plane and cause
    subsequent CreateServerlessCache calls to also fail. Defense-in-depth:
    brute-force delete any e2e-prefixed caches at the start of each run.
    Non-blocking — best-effort only.
    """
    try:
        paginator = elasticache_client.get_paginator("describe_serverless_caches")
        stale = []
        for page in paginator.paginate():
            for c in page.get("ServerlessCaches", []):
                name = c.get("ServerlessCacheName", "")
                status = c.get("Status", "")
                if name.startswith("e2e-") and status not in ("deleting", "deleted"):
                    stale.append(name)
        if not stale:
            return
        log.info("Cleaning up %d stale serverless cache(s): %s", len(stale), stale[:5])
        for name in stale:
            try:
                elasticache_client.delete_serverless_cache(ServerlessCacheName=name)
            except Exception as exc:
                log.warning("  could not delete stale cache %s: %s", name, exc)
    except Exception as exc:
        log.warning("Stale cache cleanup failed: %s", exc)
