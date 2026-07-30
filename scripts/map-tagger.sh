#!/usr/bin/env bash
# map-tagger.sh — set the MAP auto-tagger account scope (full replacement),
# wrapping the update-stack-set one-liner in docs/INSTRUCTIONS.md so you don't
# hand-write the escaped ScopedAccountIds JSON and the UsePreviousValue list.
#
# Like the documented command, this is a FULL REPLACEMENT: list every account
# that should be in scope. Run in AWS CloudShell from the management account.
#
# Usage:
#   ./scripts/map-tagger.sh <MpeId> <region> <accountId> [accountId ...]
#   ./scripts/map-tagger.sh <MpeId> <region> ALL          # tag all org accounts
#
# Example:
#   ./scripts/map-tagger.sh mig1234567890 us-east-1 111111111111 222222222222

set -euo pipefail

if [[ $# -lt 3 ]]; then
    echo "usage: $0 <MpeId> <region> <accountId> [accountId ...]" >&2
    echo "       $0 <MpeId> <region> ALL" >&2
    exit 2
fi

MPE="$1"; REGION="$2"; shift 2
STACK="map-auto-tagger-$MPE"

[[ "$MPE" =~ ^mig[a-zA-Z0-9]+$ ]] || { echo "error: MpeId '$MPE' must match ^mig[a-zA-Z0-9]+\$" >&2; exit 1; }

# Build the escaped JSON array: ["111...","222..."] with the inner quotes
# backslash-escaped, exactly like the documented one-liner expects.
parts=()
for a in "$@"; do
    if [[ "$a" != "ALL" && ! "$a" =~ ^[0-9]{12}$ ]]; then
        echo "error: account id '$a' must be exactly 12 digits (or ALL)" >&2
        exit 1
    fi
    parts+=("\\\"$a\\\"")
done
IFS=,; joined="${parts[*]}"; unset IFS
SCOPE="[$joined]"

# Read the current StackSet parameters up front. Two reasons:
#   1. surfaces a clear error if the MpeId/region/creds are wrong, and
#   2. lets us decide what to do with CentralAlertAccountId (below).
CURRENT_KEYS="$(aws cloudformation describe-stack-set --stack-set-name "$STACK" --region "$REGION" \
    --query 'StackSet.Parameters[].ParameterKey' --output text)" \
    || { echo "error: could not read StackSet $STACK in $REGION (check MpeId, region, and credentials)" >&2; exit 1; }

# CentralAlertAccountId handling — do NOT silently reset it:
#   * if it's set on the StackSet, preserve it with UsePreviousValue=true
#     (omitting it would reset it to '' and disable central alarm delivery);
#   * if it's not set, ask before adding it.
EXTRA_PARAMS=()
if grep -qw CentralAlertAccountId <<<"$CURRENT_KEYS"; then
    EXTRA_PARAMS+=(ParameterKey=CentralAlertAccountId,UsePreviousValue=true)
    echo "Preserving existing CentralAlertAccountId (UsePreviousValue=true)." >&2
else
    ans="n"
    if [[ -r /dev/tty ]]; then
        printf 'CentralAlertAccountId is not set on this StackSet. Add it now? [y/N] ' >&2
        read -r ans </dev/tty || ans="n"
    else
        echo "Note: CentralAlertAccountId is not set and no terminal is available to ask — leaving it unset." >&2
    fi
    if [[ "$ans" =~ ^[Yy]$ ]]; then
        printf 'Enter the central alert account id (12 digits), or leave blank for none: ' >&2
        cid=""
        read -r cid </dev/tty || cid=""
        if [[ -n "$cid" && ! "$cid" =~ ^[0-9]{12}$ ]]; then
            echo "error: '$cid' must be exactly 12 digits (or blank)" >&2
            exit 1
        fi
        EXTRA_PARAMS+=("ParameterKey=CentralAlertAccountId,ParameterValue=$cid")
    fi
fi

echo "Setting scope for $STACK in $REGION to: [$*]" >&2

aws cloudformation update-stack-set \
    --stack-set-name "$STACK" \
    --use-previous-template \
    --parameters \
        "ParameterKey=ScopedAccountIds,ParameterValue=\"$SCOPE\"" \
        ParameterKey=MpeId,UsePreviousValue=true \
        ParameterKey=AgreementStartDate,UsePreviousValue=true \
        ParameterKey=AgreementEndDate,UsePreviousValue=true \
        ParameterKey=ScopeMode,UsePreviousValue=true \
        ParameterKey=ScopedVpcIds,UsePreviousValue=true \
        ParameterKey=TagNonVpcServices,UsePreviousValue=true \
        ParameterKey=AlertEmail,UsePreviousValue=true \
        ${EXTRA_PARAMS[@]+"${EXTRA_PARAMS[@]}"} \
    --capabilities CAPABILITY_NAMED_IAM \
    --region "$REGION"
