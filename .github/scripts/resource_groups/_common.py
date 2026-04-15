"""
Shared helpers for all resource-group modules.

Every module calls `make_record(...)` to produce a standardised ARN record
that is later consumed by verify_tags.py and teardown.py.
"""

from __future__ import annotations

import datetime
import logging
import re
from typing import Any

log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# ARN record builder
# ---------------------------------------------------------------------------

def make_record(
    arn: str,
    service: str,
    region: str,
    account: str,
    resource_id: str,
    tag_key: str,
    tag_value: str,
    taggable: bool = True,
    extra: dict | None = None,
) -> dict[str, Any]:
    """Return a standardised ARN record dict."""
    record: dict[str, Any] = {
        "arn": arn,
        "service": service,
        "region": region,
        "account": account,
        "resource_id": resource_id,
        "created_at": datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "expected_tag_key": tag_key,
        "expected_tag_value": tag_value,
        "taggable": taggable,
    }
    if extra:
        record.update(extra)
    return record


# ---------------------------------------------------------------------------
# Resource-name prefix helper
# ---------------------------------------------------------------------------

def resource_name(pr_number: str, timestamp: str, service_short: str) -> str:
    """Build the standard resource name prefix.

    Format: e2e-pr{PR_NUMBER}-{UNIX_TIMESTAMP}-{service-short}
    Example: e2e-pr42-1713178496-dynamodb
    """
    return f"e2e-pr{pr_number}-{timestamp}-{service_short}"


# ---------------------------------------------------------------------------
# Safe-call wrapper
# ---------------------------------------------------------------------------

def safe_call(fn, *args, **kwargs):
    """Call *fn* and return its result; log and return None on any exception."""
    try:
        return fn(*args, **kwargs)
    except Exception as exc:
        log.warning("safe_call failed: %s — %s", fn, exc)
        return None


# ---------------------------------------------------------------------------
# AMI lookup helper (shared across modules)
# ---------------------------------------------------------------------------

def get_amazon_linux2_ami(ec2_client) -> str | None:
    """Return the latest Amazon Linux 2 AMI ID for the client's region."""
    try:
        ssm_client = _ssm_for_region(ec2_client)
        resp = ssm_client.get_parameter(
            Name="/aws/service/ami-amazon-linux-latest/amzn2-ami-hvm-x86_64-gp2"
        )
        return resp["Parameter"]["Value"]
    except Exception as exc:
        log.warning("AMI lookup via SSM failed (%s), falling back to describe_images", exc)

    try:
        resp = ec2_client.describe_images(
            Owners=["amazon"],
            Filters=[
                {"Name": "name", "Values": ["amzn2-ami-hvm-*-x86_64-gp2"]},
                {"Name": "state", "Values": ["available"]},
            ],
        )
        images = sorted(resp["Images"], key=lambda x: x["CreationDate"], reverse=True)
        return images[0]["ImageId"] if images else None
    except Exception as exc:
        log.warning("AMI fallback describe_images failed: %s", exc)
        return None


def _ssm_for_region(ec2_client) -> Any:
    """Create an SSM client in the same region as the given EC2 client."""
    import boto3
    region = ec2_client.meta.region_name
    return boto3.client("ssm", region_name=region)


# ---------------------------------------------------------------------------
# Account ID helper
# ---------------------------------------------------------------------------

def get_account_id(session_or_client=None) -> str:
    """Return the current AWS account ID."""
    import boto3
    try:
        if session_or_client is None:
            sts = boto3.client("sts")
        elif hasattr(session_or_client, "client"):
            sts = session_or_client.client("sts")
        else:
            # It's a boto3 client — use its session
            import botocore
            sts = boto3.client("sts")
        return sts.get_caller_identity()["Account"]
    except Exception as exc:
        log.warning("Could not determine account ID: %s", exc)
        return "000000000000"
