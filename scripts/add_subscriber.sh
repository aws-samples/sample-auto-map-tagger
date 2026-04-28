#!/usr/bin/env bash
# add_subscriber.sh — subscribe an email address to the MAP auto-tagger alert
# SNS topic. Closes the existing-customer half of §1.117: deployed stacks
# had an `AlertTopic` but no subscribers, so every DLQ / Lambda-error alert
# published to a void. One-time manual step documented in
# docs/INSTRUCTIONS.md "Monitoring"; this script runs it for you.
#
# Usage:
#   ./scripts/add_subscriber.sh <MpeId> <email>
#
# Example:
#   ./scripts/add_subscriber.sh mig1234567890 ops@example.com
#
# You'll get a confirmation email from AWS. Click the link in that email
# to activate the subscription — unconfirmed subscriptions silently drop
# messages, same failure mode we're trying to close.

set -euo pipefail

if [[ $# -ne 2 ]]; then
    echo "usage: $0 <MpeId> <email>" >&2
    echo "example: $0 mig1234567890 ops@example.com" >&2
    exit 2
fi

MPE="$1"
EMAIL="$2"

if [[ ! "$MPE" =~ ^mig[a-zA-Z0-9]+$ ]]; then
    echo "error: MpeId '$MPE' does not match ^mig[a-zA-Z0-9]+$" >&2
    exit 2
fi

# Minimal email shape check — AWS itself will validate on subscribe.
if [[ ! "$EMAIL" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]]; then
    echo "error: '$EMAIL' does not look like an email address" >&2
    exit 2
fi

ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-$(aws configure get region 2>/dev/null || true)}}"
if [[ -z "$REGION" ]]; then
    echo "error: no AWS region resolved (set AWS_REGION or AWS_DEFAULT_REGION, or 'aws configure')" >&2
    exit 1
fi

TOPIC_ARN="arn:aws:sns:${REGION}:${ACCOUNT}:auto-map-tagger-alerts-${MPE}"

echo "Subscribing ${EMAIL} to ${TOPIC_ARN}"
aws sns subscribe \
    --topic-arn "${TOPIC_ARN}" \
    --protocol email \
    --notification-endpoint "${EMAIL}" \
    --output text >/dev/null

cat <<NOTE

✓ Subscription requested.

AWS just sent a confirmation email to ${EMAIL}. Open it and click the
"Confirm subscription" link within 3 days. Until confirmed, the
subscription is PendingConfirmation and SNS drops every message — the
same failure mode this script is closing.

Verify:

  aws sns list-subscriptions-by-topic --topic-arn ${TOPIC_ARN} \\
    --query 'Subscriptions[?Endpoint==\`${EMAIL}\`].[SubscriptionArn,Endpoint]' \\
    --output table

A SubscriptionArn that is not "PendingConfirmation" means you're done.
NOTE
