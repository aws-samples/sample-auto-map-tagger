"""
misc.py — Creates miscellaneous service resources for E2E tests.

Creates:
  - Transfer Family server + user + connector (SFTP)
  - DataSync S3 locations (source + dest) + task
  - Direct Connect LAG (pending state — expected)
  - Deadline Cloud farm + queue + fleet
  - Amazon Location Service (map, tracker, place index, route calculator)
  - AppStream fleet (no wait)
  - AWS Supply Chain instance (no wait)
"""

from __future__ import annotations

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
    account = get_account_id()
    arns: list[dict] = []
    prefix = lambda svc: resource_name(pr_number, timestamp, svc)
    tags = [{"Key": TAG_KEY, "Value": tag_value}]
    tags_dict = {TAG_KEY: tag_value}
    subnets = subnet_ids or []

    transfer = boto3.client("transfer", region_name=region)
    datasync = boto3.client("datasync", region_name=region)
    directconnect = boto3.client("directconnect", region_name=region)
    appstream = boto3.client("appstream", region_name=region)
    s3 = boto3.client("s3", region_name=region)
    iam = boto3.client("iam")

    def rec(arn, service, resource_id, taggable=True):
        arns.append(make_record(
            arn=arn, service=service, region=region, account=account,
            resource_id=resource_id, tag_key=TAG_KEY, tag_value=tag_value,
            taggable=taggable,
        ))

    # ── S3 bucket (prerequisite for DataSync and Transfer) ────────────────────
    misc_bucket = f"e2e-pr{pr_number}-{timestamp}-misc-{account}"[:63].lower()
    try:
        if region == "us-east-1":
            s3.create_bucket(Bucket=misc_bucket)
        else:
            s3.create_bucket(
                Bucket=misc_bucket,
                CreateBucketConfiguration={"LocationConstraint": region},
            )
        s3.put_bucket_tagging(Bucket=misc_bucket, Tagging={"TagSet": tags})
        log.info("Misc S3 bucket: %s", misc_bucket)
    except Exception as exc:
        log.warning("Misc S3 bucket: %s", exc)

    # ── Transfer Family server ────────────────────────────────────────────────
    transfer_server_id = None
    try:
        resp = transfer.create_server(
            Protocols=["SFTP"],
            Tags=tags,
        )
        transfer_server_id = resp["ServerId"]
        server_arn = f"arn:aws:transfer:{region}:{account}:server/{transfer_server_id}"
        rec(server_arn, "transfer", transfer_server_id)
        log.info("Transfer server: %s", transfer_server_id)
    except Exception as exc:
        log.error("Transfer server creation failed: %s", exc)

    # ── Transfer Family user ──────────────────────────────────────────────────
    if transfer_server_id:
        transfer_role_arn = _ensure_transfer_role(iam, account, prefix("transfer-role"), misc_bucket)
        try:
            user_name = "e2euser"
            resp = transfer.create_user(
                ServerId=transfer_server_id,
                UserName=user_name,
                Role=transfer_role_arn,
                HomeDirectory=f"/{misc_bucket}/home",
                Tags=tags,
            )
            user_arn = resp["UserArn"]
            rec(user_arn, "transfer", f"{transfer_server_id}/{user_name}")
            log.info("Transfer user: %s", user_arn)
        except Exception as exc:
            log.error("Transfer user creation failed: %s", exc)

    # ── Transfer Family connector ─────────────────────────────────────────────
    try:
        connector_role_arn = _ensure_transfer_role(iam, account, prefix("connector-role"), misc_bucket)
        resp = transfer.create_connector(
            Url="sftp://1.2.3.4",
            As2Config=None,
            SftpConfig={
                "TrustedHostKeys": [],
                "UserSecretId": "",
            } if False else None,  # SFTP connector with minimal config
            AccessRole=connector_role_arn,
            Tags=tags,
        )
        connector_arn = resp["ConnectorArn"]
        rec(connector_arn, "transfer", connector_arn.split("/")[-1])
        log.info("Transfer connector: %s", connector_arn)
    except Exception as exc:
        # SFTP connector may not work without valid host key — log and continue
        log.warning("Transfer connector creation failed: %s", exc)

    # ── DataSync S3 locations and task ────────────────────────────────────────
    datasync_role_arn = _ensure_datasync_role(iam, account, prefix("datasync-role"), misc_bucket)

    ds_src_arn = None
    try:
        resp = datasync.create_location_s3(
            S3BucketArn=f"arn:aws:s3:::{misc_bucket}",
            S3StorageClass="STANDARD",
            S3Config={"BucketAccessRoleArn": datasync_role_arn},
            Subdirectory="/source/",
            Tags=tags,
        )
        ds_src_arn = resp["LocationArn"]
        rec(ds_src_arn, "datasync", "datasync-src")
        log.info("DataSync src: %s", ds_src_arn)
    except Exception as exc:
        log.error("DataSync source location failed: %s", exc)

    ds_dest_arn = None
    try:
        resp = datasync.create_location_s3(
            S3BucketArn=f"arn:aws:s3:::{misc_bucket}",
            S3StorageClass="STANDARD",
            S3Config={"BucketAccessRoleArn": datasync_role_arn},
            Subdirectory="/destination/",
            Tags=tags,
        )
        ds_dest_arn = resp["LocationArn"]
        rec(ds_dest_arn, "datasync", "datasync-dest")
        log.info("DataSync dest: %s", ds_dest_arn)
    except Exception as exc:
        log.error("DataSync destination location failed: %s", exc)

    if ds_src_arn and ds_dest_arn:
        try:
            resp = datasync.create_task(
                SourceLocationArn=ds_src_arn,
                DestinationLocationArn=ds_dest_arn,
                Name=prefix("datasync-task"),
                Tags=tags,
            )
            task_arn = resp["TaskArn"]
            rec(task_arn, "datasync", prefix("datasync-task"))
            log.info("DataSync task: %s", task_arn)
        except Exception as exc:
            log.error("DataSync task creation failed: %s", exc)

    # ── Direct Connect LAG ────────────────────────────────────────────────────
    # Will be created in 'pending' state — requires a real port order but resource exists
    try:
        resp = directconnect.create_lag(
            numberOfConnections=1,
            location="APNE2-AP1",  # Seoul Direct Connect location
            connectionsBandwidth="1Gbps",
            lagName=prefix("dx-lag"),
            tags=tags,
        )
        lag_id = resp["lagId"]
        lag_arn = f"arn:aws:directconnect:{region}:{account}:dxlag/{lag_id}"
        rec(lag_arn, "directconnect", lag_id)
        log.info("Direct Connect LAG: %s (pending — expected)", lag_id)
    except Exception as exc:
        log.warning("Direct Connect LAG creation failed: %s", exc)

    # ── Deadline Cloud farm ───────────────────────────────────────────────────
    deadline_farm_id = None
    try:
        deadline = boto3.client("deadline", region_name=region)
        resp = deadline.create_farm(
            displayName=prefix("deadline-farm"),
            tags=tags_dict,
        )
        deadline_farm_id = resp["farmId"]
        farm_arn = f"arn:aws:deadline:{region}:{account}:farm/{deadline_farm_id}"
        rec(farm_arn, "deadline", deadline_farm_id)
        log.info("Deadline farm: %s", deadline_farm_id)
    except Exception as exc:
        log.warning("Deadline Cloud farm creation failed (may not be available): %s", exc)

    # ── Deadline Cloud queue ──────────────────────────────────────────────────
    deadline_queue_id = None
    if deadline_farm_id:
        try:
            deadline = boto3.client("deadline", region_name=region)
            resp = deadline.create_queue(
                farmId=deadline_farm_id,
                displayName=prefix("deadline-queue"),
                tags=tags_dict,
            )
            deadline_queue_id = resp["queueId"]
            queue_arn = (
                f"arn:aws:deadline:{region}:{account}:farm/"
                f"{deadline_farm_id}/queue/{deadline_queue_id}"
            )
            rec(queue_arn, "deadline", deadline_queue_id)
            log.info("Deadline queue: %s", deadline_queue_id)
        except Exception as exc:
            log.warning("Deadline queue creation failed: %s", exc)

    # ── Deadline Cloud fleet ──────────────────────────────────────────────────
    if deadline_farm_id:
        try:
            deadline = boto3.client("deadline", region_name=region)
            fleet_role_arn = _ensure_deadline_role(iam, account, prefix("deadline-role"))
            resp = deadline.create_fleet(
                farmId=deadline_farm_id,
                displayName=prefix("deadline-fleet"),
                roleArn=fleet_role_arn,
                configuration={
                    "customerManaged": {
                        "mode": "NO_SCALING",
                        "workerCapabilities": {
                            "vCpuCount": {"min": 1},
                            "memoryMiB": {"min": 1024},
                            "osFamily": "LINUX",
                            "cpuArchitectureType": "x86_64",
                        },
                    }
                },
                maxWorkerCount=1,
                tags=tags_dict,
            )
            fleet_id = resp["fleetId"]
            fleet_arn = (
                f"arn:aws:deadline:{region}:{account}:farm/"
                f"{deadline_farm_id}/fleet/{fleet_id}"
            )
            rec(fleet_arn, "deadline", fleet_id)
            log.info("Deadline fleet: %s", fleet_id)
        except Exception as exc:
            log.warning("Deadline fleet creation failed: %s", exc)

    # ── Amazon Location Service ───────────────────────────────────────────────

    # Map
    map_name = prefix("location-map")
    try:
        resp = location.create_map(
            MapName=map_name,
            Configuration={"Style": "VectorEsriStreets"},
            Tags=tags_dict,
        )
        map_arn = resp["MapArn"]
        rec(map_arn, "geo", map_name)
        log.info("Location map: %s", map_arn)
    except Exception as exc:
        log.error("Location map creation failed: %s", exc)

    # Tracker
    tracker_name = prefix("location-tracker")
    try:
        resp = location.create_tracker(
            TrackerName=tracker_name,
            PositionFiltering="TimeBased",
            Tags=tags_dict,
        )
        tracker_arn = resp["TrackerArn"]
        rec(tracker_arn, "geo", tracker_name)
        log.info("Location tracker: %s", tracker_arn)
    except Exception as exc:
        log.error("Location tracker creation failed: %s", exc)

    # Place index
    place_index_name = prefix("location-place")
    try:
        resp = location.create_place_index(
            IndexName=place_index_name,
            DataSource="Esri",
            Tags=tags_dict,
        )
        place_arn = resp["IndexArn"]
        rec(place_arn, "geo", place_index_name)
        log.info("Location place index: %s", place_arn)
    except Exception as exc:
        log.error("Location place index creation failed: %s", exc)

    # Route calculator
    calc_name = prefix("location-route")
    try:
        resp = location.create_route_calculator(
            CalculatorName=calc_name,
            DataSource="Esri",
            Tags=tags_dict,
        )
        calc_arn = resp["CalculatorArn"]
        rec(calc_arn, "geo", calc_name)
        log.info("Location route calculator: %s", calc_arn)
    except Exception as exc:
        log.error("Location route calculator creation failed: %s", exc)

    # ── AppStream fleet ───────────────────────────────────────────────────────
    try:
        resp = appstream.create_fleet(
            Name=prefix("appstream"),
            ImageName="AppStream-WinServer2019-01-19-2024",
            InstanceType="stream.standard.medium",
            FleetType="ON_DEMAND",
            ComputeCapacity={"DesiredInstances": 1},
            Tags=tags_dict,
        )
        fleet_arn = resp["Fleet"]["Arn"]
        rec(fleet_arn, "appstream", prefix("appstream"))
        log.info("AppStream fleet: %s (not waiting)", fleet_arn)
    except Exception as exc:
        log.warning("AppStream fleet creation failed: %s", exc)

    # ── AWS Supply Chain instance ─────────────────────────────────────────────
    try:
        supplychain = boto3.client("supplychain", region_name=region)
        resp = supplychain.create_instance(
            instanceName=prefix("supplychain"),
            tags=tags_dict,
        )
        sc_id = resp["instance"]["instanceId"]
        sc_arn = resp["instance"]["instanceArn"]
        rec(sc_arn, "scn", sc_id)
        log.info("Supply Chain instance: %s (not waiting)", sc_arn)
    except Exception as exc:
        log.warning("Supply Chain instance creation failed (may not be available): %s", exc)

    return {"arns": arns, "outputs": {}}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _ensure_transfer_role(iam_client, account: str, role_name: str, bucket: str) -> str:
    trust = json.dumps({
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Principal": {"Service": "transfer.amazonaws.com"},
            "Action": "sts:AssumeRole",
        }],
    })
    policy = json.dumps({
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Action": ["s3:*"],
            "Resource": [f"arn:aws:s3:::{bucket}", f"arn:aws:s3:::{bucket}/*"],
        }],
    })
    try:
        resp = iam_client.create_role(RoleName=role_name, AssumeRolePolicyDocument=trust)
        iam_client.put_role_policy(RoleName=role_name, PolicyName="transfer-s3", PolicyDocument=policy)
        time.sleep(10)
        return resp["Role"]["Arn"]
    except iam_client.exceptions.EntityAlreadyExistsException:
        return f"arn:aws:iam::{account}:role/{role_name}"
    except Exception as exc:
        log.warning("Transfer role: %s", exc)
        return f"arn:aws:iam::{account}:role/{role_name}"


def _ensure_datasync_role(iam_client, account: str, role_name: str, bucket: str) -> str:
    trust = json.dumps({
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Principal": {"Service": "datasync.amazonaws.com"},
            "Action": "sts:AssumeRole",
        }],
    })
    policy = json.dumps({
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Action": ["s3:*"],
            "Resource": [f"arn:aws:s3:::{bucket}", f"arn:aws:s3:::{bucket}/*"],
        }],
    })
    try:
        resp = iam_client.create_role(RoleName=role_name, AssumeRolePolicyDocument=trust)
        iam_client.put_role_policy(RoleName=role_name, PolicyName="datasync-s3", PolicyDocument=policy)
        time.sleep(10)
        return resp["Role"]["Arn"]
    except iam_client.exceptions.EntityAlreadyExistsException:
        return f"arn:aws:iam::{account}:role/{role_name}"
    except Exception as exc:
        log.warning("DataSync role: %s", exc)
        return f"arn:aws:iam::{account}:role/{role_name}"


def _ensure_deadline_role(iam_client, account: str, role_name: str) -> str:
    trust = json.dumps({
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Principal": {"Service": "deadline.amazonaws.com"},
            "Action": "sts:AssumeRole",
        }],
    })
    try:
        resp = iam_client.create_role(RoleName=role_name, AssumeRolePolicyDocument=trust)
        iam_client.attach_role_policy(
            RoleName=role_name,
            PolicyArn="arn:aws:iam::aws:policy/AWSDeadlineCloud-WorkerHost",
        )
        time.sleep(10)
        return resp["Role"]["Arn"]
    except iam_client.exceptions.EntityAlreadyExistsException:
        return f"arn:aws:iam::{account}:role/{role_name}"
    except Exception as exc:
        log.warning("Deadline role: %s", exc)
        return f"arn:aws:iam::{account}:role/{role_name}"
