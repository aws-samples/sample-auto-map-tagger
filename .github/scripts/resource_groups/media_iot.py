"""
media_iot.py — Creates media and IoT resources for E2E tests.

Creates:
  - MediaConvert queue
  - IoT Core topic rule
  - IoT SiteWise asset model
  - IoT SiteWise asset (from model)
  - IoT SiteWise portal (no wait)

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
    **_kwargs,
) -> dict:
    account = get_account_id()
    arns: list[dict] = []
    prefix = lambda svc: resource_name(pr_number, timestamp, svc)
    tags = [{"Key": TAG_KEY, "Value": tag_value}]
    tags_dict = {TAG_KEY: tag_value}

    mediaconvert = boto3.client("mediaconvert", region_name=region)
    iot = boto3.client("iot", region_name=region)
    iotsitewise = boto3.client("iotsitewise", region_name=region)
    iam = boto3.client("iam")

    def rec(arn, service, resource_id, taggable=True):
        arns.append(make_record(
            arn=arn, service=service, region=region, account=account,
            resource_id=resource_id, tag_key=TAG_KEY, tag_value=tag_value,
            taggable=taggable,
        ))

    # ── MediaConvert queue ────────────────────────────────────────────────────
    mc_queue_name = prefix("mc-queue")
    try:
        # MediaConvert requires regional endpoint
        mc_endpoints = mediaconvert.describe_endpoints()
        mc_endpoint = mc_endpoints["Endpoints"][0]["Url"]
        mc = boto3.client("mediaconvert", region_name=region, endpoint_url=mc_endpoint)
        resp = mc.create_queue(Name=mc_queue_name, Tags=tags_dict)
        mc_arn = resp["Queue"]["Arn"]
        rec(mc_arn, "mediaconvert", mc_queue_name)
        log.info("MediaConvert queue: %s", mc_arn)
    except Exception as exc:
        log.error("MediaConvert queue creation failed: %s", exc)

    # ── IoT Core topic rule ───────────────────────────────────────────────────
    iot_rule_name = prefix("iot-rule").replace("-", "_")
    iot_role_arn = _ensure_iot_role(iam, account, prefix("iot-role"))
    try:
        iot.create_topic_rule(
            ruleName=iot_rule_name,
            topicRulePayload={
                "sql": "SELECT * FROM 'e2e/test'",
                "description": "E2E test IoT rule",
                "actions": [{
                    "cloudwatchLogs": {
                        "logGroupName": f"/e2e/{prefix('iot-logs')}",
                        "roleArn": iot_role_arn,
                    }
                }],
                "ruleDisabled": False,
            },
            tags=tag_value,  # IoT uses a single tag string for create_topic_rule
        )
        iot_rule_arn = f"arn:aws:iot:{region}:{account}:rule/{iot_rule_name}"
        rec(iot_rule_arn, "iot", iot_rule_name)
        log.info("IoT rule: %s", iot_rule_arn)
    except Exception as exc:
        log.error("IoT topic rule creation failed: %s", exc)

    # ── IoT SiteWise asset model ──────────────────────────────────────────────
    sitewise_model_id = None
    sitewise_model_name = prefix("sw-model")
    try:
        resp = iotsitewise.create_asset_model(
            assetModelName=sitewise_model_name,
            assetModelDescription="E2E test SiteWise asset model",
            assetModelProperties=[{
                "name": "Temperature",
                "dataType": "DOUBLE",
                "type": {"measurement": {}},
            }],
            tags=tags_dict,
        )
        sitewise_model_id = resp["assetModelId"]
        sitewise_model_arn = resp["assetModelArn"]
        rec(sitewise_model_arn, "iotsitewise", sitewise_model_name)
        log.info("SiteWise model: %s", sitewise_model_arn)
    except Exception as exc:
        log.error("SiteWise asset model creation failed: %s", exc)

    # ── IoT SiteWise asset ────────────────────────────────────────────────────
    if sitewise_model_id:
        # Wait briefly for the model to become ACTIVE
        _wait_sitewise_model(iotsitewise, sitewise_model_id, max_secs=90)
        try:
            sitewise_asset_name = prefix("sw-asset")
            resp = iotsitewise.create_asset(
                assetName=sitewise_asset_name,
                assetModelId=sitewise_model_id,
                tags=tags_dict,
            )
            asset_id = resp["assetId"]
            asset_arn = resp["assetArn"]
            rec(asset_arn, "iotsitewise", sitewise_asset_name)
            log.info("SiteWise asset: %s", asset_arn)
        except Exception as exc:
            log.error("SiteWise asset creation failed: %s", exc)

    # ── IoT SiteWise portal ───────────────────────────────────────────────────
    try:
        portal_role_arn = _ensure_sitewise_portal_role(iam, account, prefix("sw-portal-role"))
        portal_name = prefix("sw-portal")
        resp = iotsitewise.create_portal(
            portalName=portal_name,
            portalContactEmail="e2e-test@example.com",
            roleArn=portal_role_arn,
            authMode="IAM",
            tags=tags_dict,
        )
        portal_arn = resp["portalArn"]
        rec(portal_arn, "iotsitewise", portal_name)
        log.info("SiteWise portal: %s (not waiting)", portal_arn)
    except Exception as exc:
        log.error("SiteWise portal creation failed: %s", exc)


    return {"arns": arns, "outputs": {}}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _ensure_iot_role(iam_client, account: str, role_name: str) -> str:
    trust = json.dumps({
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Principal": {"Service": "iot.amazonaws.com"},
            "Action": "sts:AssumeRole",
        }],
    })
    try:
        resp = iam_client.create_role(RoleName=role_name, AssumeRolePolicyDocument=trust)
        iam_client.attach_role_policy(
            RoleName=role_name,
            PolicyArn="arn:aws:iam::aws:policy/CloudWatchLogsFullAccess",
        )
        time.sleep(10)
        return resp["Role"]["Arn"]
    except iam_client.exceptions.EntityAlreadyExistsException:
        return f"arn:aws:iam::{account}:role/{role_name}"
    except Exception as exc:
        log.warning("IoT role: %s", exc)
        return f"arn:aws:iam::{account}:role/{role_name}"


def _ensure_sitewise_portal_role(iam_client, account: str, role_name: str) -> str:
    trust = json.dumps({
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Principal": {"Service": "monitor.iotsitewise.amazonaws.com"},
            "Action": "sts:AssumeRole",
        }],
    })
    try:
        resp = iam_client.create_role(RoleName=role_name, AssumeRolePolicyDocument=trust)
        iam_client.attach_role_policy(
            RoleName=role_name,
            PolicyArn="arn:aws:iam::aws:policy/AWSIoTSiteWiseMonitorPortalAccess",
        )
        time.sleep(10)
        return resp["Role"]["Arn"]
    except iam_client.exceptions.EntityAlreadyExistsException:
        return f"arn:aws:iam::{account}:role/{role_name}"
    except Exception as exc:
        log.warning("SiteWise portal role: %s", exc)
        return f"arn:aws:iam::{account}:role/{role_name}"


def _ensure_twinmaker_role(iam_client, account: str, role_name: str, bucket: str) -> str:
    trust = json.dumps({
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Principal": {"Service": "iottwinmaker.amazonaws.com"},
            "Action": "sts:AssumeRole",
        }],
    })
    try:
        resp = iam_client.create_role(RoleName=role_name, AssumeRolePolicyDocument=trust)
        policy = json.dumps({
            "Version": "2012-10-17",
            "Statement": [{
                "Effect": "Allow",
                "Action": ["s3:*"],
                "Resource": [f"arn:aws:s3:::{bucket}", f"arn:aws:s3:::{bucket}/*"],
            }],
        })
        iam_client.put_role_policy(
            RoleName=role_name, PolicyName="twinmaker-s3", PolicyDocument=policy
        )
        time.sleep(10)
        return resp["Role"]["Arn"]
    except iam_client.exceptions.EntityAlreadyExistsException:
        return f"arn:aws:iam::{account}:role/{role_name}"
    except Exception as exc:
        log.warning("TwinMaker role: %s", exc)
        return f"arn:aws:iam::{account}:role/{role_name}"


def _wait_sitewise_model(client, model_id: str, max_secs: int = 90) -> None:
    """Poll until the SiteWise asset model is ACTIVE or timeout."""
    deadline = time.time() + max_secs
    while time.time() < deadline:
        try:
            resp = client.describe_asset_model(assetModelId=model_id)
            state = resp.get("assetModelStatus", {}).get("state", "")
            if state == "ACTIVE":
                log.info("SiteWise model %s is ACTIVE", model_id)
                return
            if state in ("FAILED", "DELETING"):
                log.warning("SiteWise model %s entered state %s", model_id, state)
                return
        except Exception as exc:
            log.warning("SiteWise model poll: %s", exc)
        time.sleep(10)
    log.warning("SiteWise model %s not ACTIVE after %ds — continuing", model_id, max_secs)
