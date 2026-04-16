"""
core.py — Creates core compute and serverless resources for E2E tests.

Creates:
  - EC2 instance (t3.micro, Amazon Linux 2)
  - EBS volume (1GB gp3)
  - EBS snapshot (from volume)
  - AMI (from instance, NoReboot=True)
  - Key Pair
  - Auto Scaling Group (with inline launch template)
  - Lambda function (python3.12 hello-world)
  - ECS cluster
  - EKS cluster (minimal, no node groups)
  - ECR repository
  - CloudWatch Log Group
  - SNS topic
"""

from __future__ import annotations

import base64
import json
import logging
import time

import boto3

from ._common import get_account_id, make_record, resource_name, safe_call

log = logging.getLogger(__name__)
TAG_KEY = "map-migrated"


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
    ec2 = boto3.client("ec2", region_name=region)
    ec2_res = boto3.resource("ec2", region_name=region)
    lambda_client = boto3.client("lambda", region_name=region)
    ecs = boto3.client("ecs", region_name=region)
    eks = boto3.client("eks", region_name=region)
    ecr = boto3.client("ecr", region_name=region)
    logs_client = boto3.client("logs", region_name=region)
    sns = boto3.client("sns", region_name=region)
    autoscaling = boto3.client("autoscaling", region_name=region)
    iam = boto3.client("iam")

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
            tag_key=TAG_KEY,
            tag_value=tag_value,
            taggable=taggable,
        ))

    # ── AMI lookup ────────────────────────────────────────────────────────────
    ami_id = _get_ami(ec2, region)

    # ── CloudWatch Log Group (prerequisite for other services) ────────────────
    log_group_name = f"/e2e/{prefix('logs')}"
    try:
        logs_client.create_log_group(logGroupName=log_group_name)
        logs_client.tag_log_group(
            logGroupName=log_group_name,
            tags={TAG_KEY: tag_value},
        )
        rec(
            f"arn:aws:logs:{region}:{account}:log-group:{log_group_name}",
            "logs", log_group_name,
        )
        log.info("Log Group: %s", log_group_name)
    except Exception as exc:
        log.error("Log Group creation failed: %s", exc)

    # ── SNS topic (used as shared alert topic) ────────────────────────────────
    sns_topic_arn = None
    try:
        resp = sns.create_topic(
            Name=prefix("sns"),
            Tags=[{"Key": TAG_KEY, "Value": tag_value}],
        )
        sns_topic_arn = resp["TopicArn"]
        rec(sns_topic_arn, "sns", prefix("sns"))
        log.info("SNS topic: %s", sns_topic_arn)
    except Exception as exc:
        log.error("SNS topic creation failed: %s", exc)

    # ── Key Pair ──────────────────────────────────────────────────────────────
    kp_name = prefix("kp")
    try:
        resp = ec2.create_key_pair(
            KeyName=kp_name,
            TagSpecifications=[{
                "ResourceType": "key-pair",
                "Tags": [{"Key": TAG_KEY, "Value": tag_value}],
            }],
        )
        kp_id = resp["KeyPairId"]
        rec(f"arn:aws:ec2:{region}:{account}:key-pair/{kp_id}", "ec2", kp_id)
        log.info("Key Pair: %s (%s)", kp_name, kp_id)
    except Exception as exc:
        log.error("Key Pair creation failed: %s", exc)

    # ── EC2 instance ──────────────────────────────────────────────────────────
    instance_id = None
    try:
        run_kwargs: dict = {
            "ImageId": ami_id,
            "InstanceType": "t3.micro",
            "MinCount": 1,
            "MaxCount": 1,
            "TagSpecifications": [{
                "ResourceType": "instance",
                "Tags": [{"Key": TAG_KEY, "Value": tag_value}],
            }],
        }
        if subnet_ids:
            run_kwargs["SubnetId"] = subnet_ids[0]
        if sg_id:
            run_kwargs["SecurityGroupIds"] = [sg_id]

        resp = ec2.run_instances(**run_kwargs)
        instance_id = resp["Instances"][0]["InstanceId"]
        rec(f"arn:aws:ec2:{region}:{account}:instance/{instance_id}", "ec2", instance_id)
        log.info("EC2 instance: %s", instance_id)
    except Exception as exc:
        log.error("EC2 instance creation failed: %s", exc)

    # ── EBS volume ────────────────────────────────────────────────────────────
    volume_id = None
    try:
        resp = ec2.create_volume(
            AvailabilityZone=f"{region}a",
            Size=1,
            VolumeType="gp3",
            TagSpecifications=[{
                "ResourceType": "volume",
                "Tags": [{"Key": TAG_KEY, "Value": tag_value}],
            }],
        )
        volume_id = resp["VolumeId"]
        rec(f"arn:aws:ec2:{region}:{account}:volume/{volume_id}", "ec2", volume_id)
        log.info("EBS volume: %s", volume_id)
    except Exception as exc:
        log.error("EBS volume creation failed: %s", exc)

    # ── EBS snapshot ──────────────────────────────────────────────────────────
    if volume_id:
        try:
            # Wait briefly for volume to be available
            _wait_volume_available(ec2, volume_id, max_secs=60)
            resp = ec2.create_snapshot(
                VolumeId=volume_id,
                Description=f"E2E test snapshot {prefix('snap')}",
                TagSpecifications=[{
                    "ResourceType": "snapshot",
                    "Tags": [{"Key": TAG_KEY, "Value": tag_value}],
                }],
            )
            snap_id = resp["SnapshotId"]
            rec(f"arn:aws:ec2:{region}:{account}:snapshot/{snap_id}", "ec2", snap_id)
            log.info("EBS snapshot: %s", snap_id)
        except Exception as exc:
            log.error("EBS snapshot creation failed: %s", exc)

    # ── AMI (from instance) ───────────────────────────────────────────────────
    if instance_id:
        try:
            resp = ec2.create_image(
                InstanceId=instance_id,
                Name=prefix("ami"),
                NoReboot=True,
                Description="E2E test AMI",
            )
            ami_new_id = resp["ImageId"]
            # Tag the new AMI
            ec2.create_tags(
                Resources=[ami_new_id],
                Tags=[{"Key": TAG_KEY, "Value": tag_value}],
            )
            rec(f"arn:aws:ec2:{region}:{account}:image/{ami_new_id}", "ec2", ami_new_id)
            log.info("AMI: %s", ami_new_id)
        except Exception as exc:
            log.error("AMI creation failed: %s", exc)

    # ── Lambda execution role ─────────────────────────────────────────────────
    lambda_role_arn = _ensure_lambda_role(iam, account, prefix("lambda-role"))

    # ── Lambda function ───────────────────────────────────────────────────────
    lambda_name = prefix("lambda")
    try:
        hello_code = (
            "def handler(event, context):\n"
            "    return {'statusCode': 200, 'body': 'hello from e2e'}\n"
        )
        # Package inline code as zip
        import io, zipfile
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("index.py", hello_code)
        zip_bytes = buf.getvalue()

        resp = lambda_client.create_function(
            FunctionName=lambda_name,
            Runtime="python3.12",
            Role=lambda_role_arn,
            Handler="index.handler",
            Code={"ZipFile": zip_bytes},
            Tags={TAG_KEY: tag_value},
        )
        lambda_arn = resp["FunctionArn"]
        rec(lambda_arn, "lambda", lambda_name)
        log.info("Lambda: %s", lambda_arn)
    except Exception as exc:
        log.error("Lambda creation failed: %s", exc)

    # ── ECS cluster ───────────────────────────────────────────────────────────
    try:
        resp = ecs.create_cluster(
            clusterName=prefix("ecs"),
            tags=[{"key": TAG_KEY, "value": tag_value}],
        )
        cluster_arn = resp["cluster"]["clusterArn"]
        rec(cluster_arn, "ecs", prefix("ecs"))
        log.info("ECS cluster: %s", cluster_arn)
    except Exception as exc:
        log.error("ECS cluster creation failed: %s", exc)

    # ── EKS cluster ───────────────────────────────────────────────────────────
    eks_name = prefix("eks")
    try:
        eks_role_arn = _ensure_eks_role(iam, account, prefix("eks-role"))
        eks_kwargs: dict = {
            "name": eks_name,
            "roleArn": eks_role_arn,
            "resourcesVpcConfig": {
                "endpointPublicAccess": True,
                "endpointPrivateAccess": False,
            },
            "tags": {TAG_KEY: tag_value},
        }
        if subnet_ids and len(subnet_ids) >= 2:
            eks_kwargs["resourcesVpcConfig"]["subnetIds"] = subnet_ids[:2]
        resp = eks.create_cluster(**eks_kwargs)
        eks_arn = resp["cluster"]["arn"]
        rec(eks_arn, "eks", eks_name)
        log.info("EKS cluster: %s (creation takes ~12 min, not waiting)", eks_name)
    except Exception as exc:
        log.error("EKS cluster creation failed: %s", exc)

    # ── ECR repository ────────────────────────────────────────────────────────
    try:
        resp = ecr.create_repository(
            repositoryName=prefix("ecr"),
            tags=[{"Key": TAG_KEY, "Value": tag_value}],
        )
        ecr_arn = resp["repository"]["repositoryArn"]
        rec(ecr_arn, "ecr", prefix("ecr"))
        log.info("ECR: %s", ecr_arn)
    except Exception as exc:
        log.error("ECR repository creation failed: %s", exc)

    # ── Auto Scaling Group ────────────────────────────────────────────────────
    try:
        lt_resp = ec2.create_launch_template(
            LaunchTemplateName=prefix("asg-lt"),
            LaunchTemplateData={
                "ImageId": ami_id,
                "InstanceType": "t3.micro",
            },
        )
        asg_lt_id = lt_resp["LaunchTemplate"]["LaunchTemplateId"]

        asg_kwargs: dict = {
            "AutoScalingGroupName": prefix("asg"),
            "MinSize": 0,
            "MaxSize": 1,
            "DesiredCapacity": 0,
            "LaunchTemplate": {"LaunchTemplateId": asg_lt_id, "Version": "$Default"},
            "Tags": [{
                "Key": TAG_KEY,
                "Value": tag_value,
                "ResourceId": prefix("asg"),
                "ResourceType": "auto-scaling-group",
                "PropagateAtLaunch": True,
            }],
        }
        if subnet_ids:
            asg_kwargs["VPCZoneIdentifier"] = ",".join(subnet_ids)
        else:
            # Use default AZ
            asg_kwargs["AvailabilityZones"] = [f"{region}a"]

        autoscaling.create_auto_scaling_group(**asg_kwargs)
        asg_arn = (
            f"arn:aws:autoscaling:{region}:{account}:autoScalingGroup"
            f"::{prefix('asg')}"
        )
        rec(asg_arn, "autoscaling", prefix("asg"))
        log.info("ASG: %s", prefix("asg"))
    except Exception as exc:
        log.error("Auto Scaling Group creation failed: %s", exc)

    return {"arns": arns, "outputs": {}}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_ami(ec2_client, region: str) -> str:
    try:
        ssm = boto3.client("ssm", region_name=region)
        resp = ssm.get_parameter(
            Name="/aws/service/ami-amazon-linux-latest/amzn2-ami-hvm-x86_64-gp2"
        )
        return resp["Parameter"]["Value"]
    except Exception as exc:
        log.warning("AMI SSM lookup failed (%s), trying describe_images", exc)
    try:
        resp = ec2_client.describe_images(
            Owners=["amazon"],
            Filters=[
                {"Name": "name", "Values": ["amzn2-ami-hvm-*-x86_64-gp2"]},
                {"Name": "state", "Values": ["available"]},
            ],
        )
        images = sorted(resp["Images"], key=lambda x: x["CreationDate"], reverse=True)
        return images[0]["ImageId"]
    except Exception as exc:
        log.error("AMI lookup completely failed: %s", exc)
        return "ami-0000000000000000"


def _wait_volume_available(ec2_client, volume_id: str, max_secs: int = 60) -> None:
    """Poll until the volume state is 'available' or timeout."""
    deadline = time.time() + max_secs
    while time.time() < deadline:
        try:
            resp = ec2_client.describe_volumes(VolumeIds=[volume_id])
            state = resp["Volumes"][0]["State"]
            if state == "available":
                return
        except Exception:
            pass
        time.sleep(5)
    log.warning("Volume %s not available after %ds — continuing anyway", volume_id, max_secs)


def _ensure_eks_role(iam_client, account: str, role_name: str) -> str:
    """Return ARN of an EKS cluster role, creating it if needed."""
    trust = json.dumps({
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Principal": {"Service": "eks.amazonaws.com"},
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
            PolicyArn="arn:aws:iam::aws:policy/AmazonEKSClusterPolicy",
        )
        time.sleep(10)
        return resp["Role"]["Arn"]
    except iam_client.exceptions.EntityAlreadyExistsException:
        return f"arn:aws:iam::{account}:role/{role_name}"
    except Exception as exc:
        log.warning("EKS role creation failed (%s), using placeholder", exc)
        return f"arn:aws:iam::{account}:role/{role_name}"


def _ensure_lambda_role(iam_client, account: str, role_name: str) -> str:
    """Return ARN of a Lambda basic execution role, creating it if needed."""
    trust = json.dumps({
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Principal": {"Service": "lambda.amazonaws.com"},
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
            PolicyArn="arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
        )
        # Brief pause to let IAM propagate
        time.sleep(10)
        return resp["Role"]["Arn"]
    except iam_client.exceptions.EntityAlreadyExistsException:
        return f"arn:aws:iam::{account}:role/{role_name}"
    except Exception as exc:
        log.warning("Lambda role creation failed (%s), using placeholder", exc)
        return f"arn:aws:iam::{account}:role/{role_name}"
