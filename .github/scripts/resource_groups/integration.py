"""
integration.py — Creates messaging and API integration resources for E2E tests.

Creates:
  - SNS topic
  - SQS queue (standard)
  - SQS FIFO queue
  - Step Functions state machine
  - Step Functions activity
  - EventBridge rule
  - EventBridge event bus
  - EventBridge schedule group
  - API Gateway REST API
  - API Gateway HTTP API
  - API Gateway WebSocket API
  - AppSync GraphQL API
  - CloudWatch Log Group
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

    sns = boto3.client("sns", region_name=region)
    sqs = boto3.client("sqs", region_name=region)
    sfn = boto3.client("stepfunctions", region_name=region)
    events = boto3.client("events", region_name=region)
    scheduler = boto3.client("scheduler", region_name=region)
    apigw_v1 = boto3.client("apigateway", region_name=region)
    apigw_v2 = boto3.client("apigatewayv2", region_name=region)
    appsync = boto3.client("appsync", region_name=region)
    logs_client = boto3.client("logs", region_name=region)
    iam = boto3.client("iam")

    def rec(arn, service, resource_id, taggable=True):
        arns.append(make_record(
            arn=arn, service=service, region=region, account=account,
            resource_id=resource_id, tag_key=TAG_KEY, tag_value=tag_value,
            taggable=taggable,
        ))

    # ── CloudWatch Log Group ──────────────────────────────────────────────────
    log_group_name = f"/e2e/{prefix('integ-logs')}"
    try:
        logs_client.create_log_group(logGroupName=log_group_name)
        logs_client.tag_log_group(logGroupName=log_group_name, tags=tags_dict)
        rec(
            f"arn:aws:logs:{region}:{account}:log-group:{log_group_name}",
            "logs", log_group_name,
        )
        log.info("Log Group: %s", log_group_name)
    except Exception as exc:
        log.error("Log Group creation failed: %s", exc)

    # ── SNS topic ─────────────────────────────────────────────────────────────
    sns_name = prefix("sns")
    try:
        resp = sns.create_topic(Name=sns_name, Tags=tags)
        sns_arn = resp["TopicArn"]
        rec(sns_arn, "sns", sns_name)
        log.info("SNS: %s", sns_arn)
    except Exception as exc:
        log.error("SNS topic creation failed: %s", exc)

    # ── SQS standard queue ────────────────────────────────────────────────────
    sqs_name = prefix("sqs")
    try:
        resp = sqs.create_queue(
            QueueName=sqs_name,
            tags=tags_dict,
        )
        sqs_url = resp["QueueUrl"]
        attrs = sqs.get_queue_attributes(
            QueueUrl=sqs_url, AttributeNames=["QueueArn"]
        )
        sqs_arn = attrs["Attributes"]["QueueArn"]
        rec(sqs_arn, "sqs", sqs_name)
        log.info("SQS: %s", sqs_arn)
    except Exception as exc:
        log.error("SQS queue creation failed: %s", exc)

    # ── SQS FIFO queue ────────────────────────────────────────────────────────
    sqs_fifo_name = prefix("sqs") + ".fifo"
    try:
        resp = sqs.create_queue(
            QueueName=sqs_fifo_name,
            Attributes={"FifoQueue": "true"},
            tags=tags_dict,
        )
        fifo_url = resp["QueueUrl"]
        attrs = sqs.get_queue_attributes(
            QueueUrl=fifo_url, AttributeNames=["QueueArn"]
        )
        fifo_arn = attrs["Attributes"]["QueueArn"]
        rec(fifo_arn, "sqs", sqs_fifo_name)
        log.info("SQS FIFO: %s", fifo_arn)
    except Exception as exc:
        log.error("SQS FIFO queue creation failed: %s", exc)

    # ── Step Functions role ───────────────────────────────────────────────────
    sfn_role_arn = _ensure_sfn_role(iam, account, prefix("sfn-role"))

    # ── Step Functions state machine ──────────────────────────────────────────
    sfn_name = prefix("sfn")
    try:
        definition = json.dumps({
            "Comment": "E2E test — simple pass state",
            "StartAt": "Pass",
            "States": {"Pass": {"Type": "Pass", "End": True}},
        })
        resp = sfn.create_state_machine(
            name=sfn_name,
            definition=definition,
            roleArn=sfn_role_arn,
            type="EXPRESS",
            tags=tags,
        )
        sfn_arn = resp["stateMachineArn"]
        rec(sfn_arn, "states", sfn_name)
        log.info("Step Functions: %s", sfn_arn)
    except Exception as exc:
        log.error("Step Functions creation failed: %s", exc)

    # ── Step Functions activity ───────────────────────────────────────────────
    sfn_activity_name = prefix("sfn-act")
    try:
        resp = sfn.create_activity(name=sfn_activity_name, tags=tags)
        activity_arn = resp["activityArn"]
        rec(activity_arn, "states", sfn_activity_name)
        log.info("SFN Activity: %s", activity_arn)
    except Exception as exc:
        log.error("SFN Activity creation failed: %s", exc)

    # ── EventBridge event bus ─────────────────────────────────────────────────
    bus_name = prefix("evtbus")
    bus_arn = None
    try:
        resp = events.create_event_bus(Name=bus_name, Tags=tags)
        bus_arn = resp["EventBusArn"]
        rec(bus_arn, "events", bus_name)
        log.info("EventBridge bus: %s", bus_arn)
    except Exception as exc:
        log.error("EventBridge bus creation failed: %s", exc)

    # ── EventBridge rule ──────────────────────────────────────────────────────
    rule_name = prefix("evtrule")
    try:
        rule_kwargs: dict = {
            "Name": rule_name,
            "EventPattern": json.dumps({
                "source": ["aws.ec2"],
                "detail-type": ["EC2 Instance State-change Notification"],
            }),
            "State": "ENABLED",
            "Tags": tags,
        }
        if bus_arn:
            rule_kwargs["EventBusName"] = bus_name

        resp = events.put_rule(**rule_kwargs)
        rule_arn = resp["RuleArn"]
        rec(rule_arn, "events", rule_name)
        log.info("EventBridge rule: %s", rule_arn)
    except Exception as exc:
        log.error("EventBridge rule creation failed: %s", exc)

    # ── EventBridge schedule group ────────────────────────────────────────────
    sg_name = prefix("evtsched")
    try:
        resp = scheduler.create_schedule_group(Name=sg_name, Tags=tags)
        sg_arn = resp["ScheduleGroupArn"]
        rec(sg_arn, "scheduler", sg_name)
        log.info("EventBridge schedule group: %s", sg_arn)
    except Exception as exc:
        log.error("EventBridge schedule group creation failed: %s", exc)

    # ── API Gateway REST API ──────────────────────────────────────────────────
    rest_api_name = prefix("apigw-rest")
    try:
        resp = apigw_v1.create_rest_api(
            name=rest_api_name,
            description="E2E test REST API",
            endpointConfiguration={"types": ["REGIONAL"]},
            tags=tags_dict,
        )
        rest_api_id = resp["id"]
        rest_api_arn = f"arn:aws:apigateway:{region}::/restapis/{rest_api_id}"
        rec(rest_api_arn, "apigateway", rest_api_id)
        log.info("API GW REST: %s", rest_api_id)
    except Exception as exc:
        log.error("API GW REST creation failed: %s", exc)

    # ── API Gateway HTTP API ──────────────────────────────────────────────────
    try:
        resp = apigw_v2.create_api(
            Name=prefix("apigw-http"),
            ProtocolType="HTTP",
            Tags=tags_dict,
        )
        http_api_id = resp["ApiId"]
        http_api_arn = f"arn:aws:apigateway:{region}::/apis/{http_api_id}"
        rec(http_api_arn, "apigateway", http_api_id)
        log.info("API GW HTTP: %s", http_api_id)
    except Exception as exc:
        log.error("API GW HTTP creation failed: %s", exc)

    # ── API Gateway WebSocket API ─────────────────────────────────────────────
    try:
        resp = apigw_v2.create_api(
            Name=prefix("apigw-ws"),
            ProtocolType="WEBSOCKET",
            RouteSelectionExpression="$request.body.action",
            Tags=tags_dict,
        )
        ws_api_id = resp["ApiId"]
        ws_api_arn = f"arn:aws:apigateway:{region}::/apis/{ws_api_id}"
        rec(ws_api_arn, "apigateway", ws_api_id)
        log.info("API GW WebSocket: %s", ws_api_id)
    except Exception as exc:
        log.error("API GW WebSocket creation failed: %s", exc)

    # ── AppSync GraphQL API ───────────────────────────────────────────────────
    appsync_name = prefix("appsync")
    try:
        resp = appsync.create_graphql_api(
            name=appsync_name,
            authenticationType="API_KEY",
            tags=tags_dict,
        )
        appsync_arn = resp["graphqlApi"]["arn"]
        appsync_id = resp["graphqlApi"]["apiId"]
        rec(appsync_arn, "appsync", appsync_id)
        log.info("AppSync: %s", appsync_arn)
    except Exception as exc:
        log.error("AppSync creation failed: %s", exc)

    return {"arns": arns, "outputs": {}}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _ensure_sfn_role(iam_client, account: str, role_name: str) -> str:
    trust = json.dumps({
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Principal": {"Service": "states.amazonaws.com"},
            "Action": "sts:AssumeRole",
        }],
    })
    try:
        resp = iam_client.create_role(RoleName=role_name, AssumeRolePolicyDocument=trust)
        time.sleep(10)
        return resp["Role"]["Arn"]
    except iam_client.exceptions.EntityAlreadyExistsException:
        return f"arn:aws:iam::{account}:role/{role_name}"
    except Exception as exc:
        log.warning("SFN role: %s", exc)
        return f"arn:aws:iam::{account}:role/{role_name}"
