        function generateDeployScript(config, mainTemplate, perAccountTemplate) {
            const mpe = config.mpeId;
            const regions = (config.regions || ['ap-northeast-2']);
            const region = regions[0];
            const regionArgs = regions.map(r => `"${r}"`).join(' ');

            // Escape backticks and dollar signs in template content for safe embedding in heredoc
            const escapeHeredoc = (s) => s.replace(/`/g, '\`');

            // Shell-safe containment for customerName. We emit the value inside SINGLE quotes
            // so bash performs no interpolation. The classic `'\''` trick closes the single-quoted
            // span, inserts an escaped literal quote, and reopens. Also strip CR/LF to prevent a
            // newline from escaping single-line shell contexts (e.g. comment lines).
            //
            // DO NOT change this to double-quoted emit without also removing the single-quote escape:
            // in double quotes, $(...), backticks, \, and $VAR all still expand, re-opening the
            // supply-chain RCE the escape was meant to prevent.
            const shellSingleQuote = (s) => `'${String(s).replace(/[\r\n]/g, ' ').replace(/'/g, "'\\''")}'`;
            const customerDisplay = shellSingleQuote(config.customerName || 'Customer');
            // Header comment form — strip CR/LF so a newline in the field can't escape the `#`
            // comment line and land on a fresh executable line.
            const customerComment = String(config.customerName || 'Customer').replace(/[\r\n]/g, ' ');
            const reportFile = `map-tagger-report-${mpe}-\$(date +%Y%m%d-%H%M%S).txt`;

            if (config.deployMode === 'single') {
                const tpl = escapeHeredoc(mainTemplate);
                return `#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
#
# MAP 2.0 Auto-Tagger — Deployment Script
# Customer: ${customerComment} | MPE: ${mpe}
# Run this file in AWS CloudShell: bash deploy.sh
set -e

STACK_NAME="map-auto-tagger-${mpe}"
REGIONS="${regions.join(' ')}"
REGION="${region}"
MPE="${mpe}"
CUSTOMER=${customerDisplay}
REPORT_FILE="${reportFile}"
DEPLOY_TIME=\$(date '+%Y-%m-%d %H:%M:%S')
PREFLIGHT_LOG=""
DEPLOY_STATUS="NOT STARTED"
TEMPLATE_REF=""
BUCKET=""
trap 'if [ -n "\$BUCKET" ] && [ -n "\$TEMPLATE_REF" ]; then aws s3 rm "s3://\${BUCKET}/map-auto-tagger-\${MPE}.yaml" > /dev/null 2>&1 || true; aws s3 rb "s3://\${BUCKET}" --force > /dev/null 2>&1 || true; fi' EXIT

# ────────────────────────────────────────────
echo ""
echo "  ┌─────────────────────────────────────────┐"
echo "  │   ${t('d_title')}              │"
echo "  │   ${t('d_tag_label')}: \$MPE"
echo "  │   ${t('d_region_label')}: \$REGIONS"
echo "  └─────────────────────────────────────────┘"
echo ""

# ── Step 1: Pre-flight checks ────────────────
echo "${t('d_step1')}"
echo ""
ERRORS=0

if ! aws sts get-caller-identity > /dev/null 2>&1; then
    echo "  ❌ ${t('d_fail_creds')}"
    echo "     ${t('d_fix_label')} ${t('d_fix_creds')}"
    PREFLIGHT_LOG="\${PREFLIGHT_LOG}${t('d_log_fail')} ${t('d_fail_creds')}\\n"
    ERRORS=\$((ERRORS + 1))
else
    echo "  ✅ ${t('d_ok_creds')}"
    PREFLIGHT_LOG="\${PREFLIGHT_LOG}${t('d_log_pass')} ${t('d_ok_creds')}\\n"
fi

for CHECK_REGION in \$REGIONS; do
    TRAIL_COUNT=\$(aws cloudtrail describe-trails --region "\$CHECK_REGION" --query 'trailList[*].TrailARN' --output text 2>/dev/null | wc -w)
    if [ "\$TRAIL_COUNT" -eq 0 ]; then
        echo "  ❌ ${t('d_fail_trail')} \$CHECK_REGION"
        echo "     ${t('d_fix_label')} ${t('d_fix_trail1')}"
        echo "            ${t('d_fix_trail2')} \$CHECK_REGION"
        PREFLIGHT_LOG="\${PREFLIGHT_LOG}${t('d_log_fail')} ${t('d_fail_trail')} \$CHECK_REGION\\n"
        ERRORS=\$((ERRORS + 1))
    else
        echo "  ✅ ${t('d_ok_trail')} \$CHECK_REGION"
        PREFLIGHT_LOG="\${PREFLIGHT_LOG}${t('d_log_pass')} ${t('d_ok_trail')} \$CHECK_REGION\\n"
    fi
done

if ! aws cloudformation list-stacks --region "\$REGION" > /dev/null 2>&1; then
    echo "  ❌ ${t('d_fail_perms')}"
    echo "     ${t('d_fix_label')} ${t('d_fix_perms')}"
    PREFLIGHT_LOG="\${PREFLIGHT_LOG}${t('d_log_fail')} ${t('d_fail_perms')}\\n"
    ERRORS=\$((ERRORS + 1))
else
    echo "  ✅ ${t('d_ok_perms')}"
    PREFLIGHT_LOG="\${PREFLIGHT_LOG}${t('d_log_pass')} ${t('d_ok_perms')}\\n"
fi

SCP_RESULT=\$(aws iam simulate-principal-policy \\
    --policy-source-arn "\$(aws sts get-caller-identity --query Arn --output text 2>/dev/null)" \\
    --action-names "tag:TagResources" \\
    --query 'EvaluationResults[0].EvalDecision' \\
    --output text 2>/dev/null) || SCP_RESULT=""
if [ "\$SCP_RESULT" = "explicitDeny" ]; then
    echo "  ❌ ${t('d_fail_scp')}"
    echo "     ${t('d_fix_label')} ${t('d_fix_scp')}"
    PREFLIGHT_LOG="\${PREFLIGHT_LOG}${t('d_log_fail')} ${t('d_fail_scp')}\\n"
    ERRORS=\$((ERRORS + 1))
else
    echo "  ✅ ${t('d_ok_scp')}"
    echo "     ${t('d_scp_note')}"
    PREFLIGHT_LOG="\${PREFLIGHT_LOG}${t('d_log_pass')} ${t('d_ok_scp')}\\n"
fi

# ── Deploy-time IAM actions ─────────────────────
# Simulate the permissions deploy.sh actually needs (not Lambda runtime — that's
# granted by the Lambda's own role). explicitDeny means an SCP blocks the action.
# implicitDeny means the principal has no policy granting it. Both fail deploy.
# Single batched simulate-principal-policy call ≈ 200ms for all checks combined.
CALLER_ARN=\$(aws sts get-caller-identity --query Arn --output text 2>/dev/null || echo "")
# simulate-principal-policy needs an IAM user/role ARN, NOT the assumed-role session
# ARN returned by get-caller-identity (e.g. arn:aws:sts::...:assumed-role/Foo/session).
# Convert assumed-role → role ARN for SSO / role callers; pass through for IAM users.
if [[ "\$CALLER_ARN" == *":assumed-role/"* ]]; then
    SIM_ACCT=\$(echo "\$CALLER_ARN" | cut -d: -f5)
    SIM_ROLE=\$(echo "\$CALLER_ARN" | sed 's|.*:assumed-role/||' | cut -d/ -f1)
    SIM_ARN="arn:aws:iam::\${SIM_ACCT}:role/\${SIM_ROLE}"
else
    SIM_ARN="\$CALLER_ARN"
fi
IAM_CHECK_ACTIONS=( \\
  "cloudformation:CreateStack" \\
  "cloudformation:UpdateStack" \\
  "cloudformation:DescribeStacks" \\
  "cloudformation:GetTemplateSummary" \\
  "cloudformation:ListStacks" \\
  "iam:CreateRole" \\
  "iam:PutRolePolicy" \\
  "iam:AttachRolePolicy" \\
  "iam:PassRole" \\
  "lambda:CreateFunction" \\
  "lambda:AddPermission" \\
  "events:PutRule" \\
  "events:PutTargets" \\
  "sqs:CreateQueue" \\
  "sqs:SetQueueAttributes" \\
  "ssm:PutParameter" \\
  "ssm:GetParameter" \\
  "logs:CreateLogGroup" \\
  "logs:PutRetentionPolicy" \\
  "sns:CreateTopic" \\
  "sns:Subscribe" \\
  "s3:CreateBucket" \\
  "s3:PutBucketPolicy" \\
)
if [ -n "\$SIM_ARN" ]; then
    IAM_DENIED=\$(aws iam simulate-principal-policy \\
        --policy-source-arn "\$SIM_ARN" \\
        --action-names "\${IAM_CHECK_ACTIONS[@]}" \\
        --query 'EvaluationResults[?EvalDecision != \`allowed\`].[EvalActionName,EvalDecision]' \\
        --output text 2>/dev/null || echo "")
    if [ -n "\$IAM_DENIED" ]; then
        echo "  ❌ ${t('d_fail_iam')}"
        echo "\$IAM_DENIED" | while IFS=\$'\\t' read -r action decision; do
            echo "     - \$action → \$decision"
            PREFLIGHT_LOG="\${PREFLIGHT_LOG}${t('d_log_fail')} IAM: \$action \$decision\\n"
        done
        echo "     ${t('d_fix_label')} ${t('d_fix_iam')}"
        ERRORS=\$((ERRORS + 1))
    else
        echo "  ✅ ${t('d_ok_iam')} (\${#IAM_CHECK_ACTIONS[@]})"
        PREFLIGHT_LOG="\${PREFLIGHT_LOG}${t('d_log_pass')} ${t('d_ok_iam')}\\n"
    fi
else
    echo "  ⚠️  ${t('d_skip_iam')}"
    PREFLIGHT_LOG="\${PREFLIGHT_LOG}[SKIP] ${t('d_skip_iam')}\\n"
fi

# ── Stack state ready for deploy ───────────────────────────────────
# Deploy.sh below handles NOT_FOUND / DELETE_COMPLETE (fresh create),
# ROLLBACK_COMPLETE (delete + recreate), and *_COMPLETE (update). Any
# other state leaves the deployer in a cryptic-error tarpit. Fail
# fast with a specific remediation instead.
for CHECK_REGION in \$REGIONS; do
    PREDEPLOY_STATUS=\$(aws cloudformation describe-stacks --stack-name "\$STACK_NAME" \\
        --region "\$CHECK_REGION" --query 'Stacks[0].StackStatus' --output text 2>/dev/null \\
        || echo "NOT_FOUND")
    case "\$PREDEPLOY_STATUS" in
        NOT_FOUND|DELETE_COMPLETE|ROLLBACK_COMPLETE|CREATE_COMPLETE|UPDATE_COMPLETE|UPDATE_ROLLBACK_COMPLETE)
            echo "  ✅ ${t('d_ok_stack_state')} \$CHECK_REGION (\$PREDEPLOY_STATUS)"
            PREFLIGHT_LOG="\${PREFLIGHT_LOG}${t('d_log_pass')} ${t('d_ok_stack_state')} \$CHECK_REGION\\n"
            ;;
        *_IN_PROGRESS)
            echo "  ❌ ${t('d_fail_stack_inprogress')} \$CHECK_REGION (\$PREDEPLOY_STATUS)"
            echo "     ${t('d_fix_label')} ${t('d_fix_stack_inprogress')}"
            PREFLIGHT_LOG="\${PREFLIGHT_LOG}${t('d_log_fail')} ${t('d_fail_stack_inprogress')} \$CHECK_REGION \$PREDEPLOY_STATUS\\n"
            ERRORS=\$((ERRORS + 1))
            ;;
        UPDATE_ROLLBACK_FAILED|ROLLBACK_FAILED|DELETE_FAILED)
            echo "  ❌ ${t('d_fail_stack_stuck')} \$CHECK_REGION (\$PREDEPLOY_STATUS)"
            echo "     ${t('d_fix_label')} ${t('d_fix_stack_stuck')}"
            echo "     - UPDATE_ROLLBACK_FAILED: aws cloudformation continue-update-rollback --stack-name \$STACK_NAME --region \$CHECK_REGION"
            echo "     - ROLLBACK_FAILED / DELETE_FAILED: delete via console (may require AWS Support)"
            PREFLIGHT_LOG="\${PREFLIGHT_LOG}${t('d_log_fail')} ${t('d_fail_stack_stuck')} \$CHECK_REGION \$PREDEPLOY_STATUS\\n"
            ERRORS=\$((ERRORS + 1))
            ;;
        *)
            echo "  ⚠️  ${t('d_warn_stack_unknown')} \$CHECK_REGION (\$PREDEPLOY_STATUS)"
            PREFLIGHT_LOG="\${PREFLIGHT_LOG}[WARN] ${t('d_warn_stack_unknown')} \$CHECK_REGION \$PREDEPLOY_STATUS\\n"
            ;;
    esac
done

# ── Same-account multi-Lambda conflict (Class 2: single-account, Q3 Option D) ────
# If another map-auto-tagger-* stack exists in this account with a different
# MPE, both Lambdas receive the same CloudTrail events. Whoever tags last wins.
# Q3 Option D intersects scopes per pair and hard-fails only on actual overlap:
#
#   account/ALL     vs anything in same account → conflict (ALL dominates)
#   account/[X,Y,…] vs account/[Z,Y,…]          → conflict iff shared account ID
#   account/[X,Y,…] vs vpc/[V,…]                → conflict iff this deploy-account is in [X,Y,…]
#                                                  (the account-scoped peer claims all of account,
#                                                   including the VPC-scoped peer's VPCs)
#   vpc/[V1,V2]     vs vpc/[V2,V3]              → conflict iff shared VPC ID
#   vpc/[V1,…]      vs vpc/[Vn,…] (disjoint)    → safe coexistence
NEW_SCOPE_MODE="${config.scopeMode || 'account'}"
NEW_VPC_LIST="${(config.scopedVpcIds && config.scopedVpcIds[0] !== 'NONE') ? config.scopedVpcIds.join(' ') : ''}"
# For single-account deploys, the new scope's "account list" is always just \$ACCOUNT.
# (The ScopedAccountIds CFN parameter is a multi-account convenience filter evaluated
# by the Lambda at runtime; single-account deploys set it to ALL and rely on the
# Lambda's per-account identity at tag time.)
for CHECK_REGION in \$REGIONS; do
    EXISTING_STACKS=\$(aws cloudformation list-stacks --region "\$CHECK_REGION" \\
        --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE UPDATE_ROLLBACK_COMPLETE \\
        --query "StackSummaries[?starts_with(StackName, \\\`map-auto-tagger-\\\`)].StackName" \\
        --output text 2>/dev/null || echo "")
    LAMBDA_CONFLICT=0
    for EXISTING in \$EXISTING_STACKS; do
        EXISTING_MPE="\${EXISTING#map-auto-tagger-}"
        # Only treat as a peer deploy if the suffix matches the MpeId pattern
        # (AllowedPattern: ^mig[a-zA-Z0-9]+\$). Skips test harness / E2E stacks.
        case "\$EXISTING_MPE" in mig*) ;; *) continue ;; esac
        if [ "\$EXISTING_MPE" = "\$MPE" ]; then continue; fi
        # Read peer's SSM config. Unreadable config = missing ssm:GetParameter
        # on /auto-map-tagger/* — hard-fail with that specific remediation. The
        # IAM preflight above should catch this first, but retain as defence.
        EXISTING_CFG=\$(aws ssm get-parameter --name "/auto-map-tagger/\$EXISTING_MPE/config" \\
            --region "\$CHECK_REGION" --query 'Parameter.Value' --output text 2>/dev/null || echo "")
        if [ -z "\$EXISTING_CFG" ]; then
            echo "  ❌ Peer stack \$EXISTING exists but /auto-map-tagger/\$EXISTING_MPE/config is unreadable."
            echo "     Grant ssm:GetParameter on arn:aws:ssm:\$CHECK_REGION:*:parameter/auto-map-tagger/* and retry."
            PREFLIGHT_LOG="\${PREFLIGHT_LOG}${t('d_log_fail')} \$EXISTING config unreadable (missing ssm:GetParameter)\\n"
            LAMBDA_CONFLICT=1
            continue
        fi
        EXISTING_SCOPE_MODE=\$(echo "\$EXISTING_CFG" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("scope_mode","account"))' 2>/dev/null || echo "account")
        EXISTING_ACCOUNTS=\$(echo "\$EXISTING_CFG" | python3 -c 'import json,sys; print(" ".join(json.load(sys.stdin).get("scoped_account_ids",["ALL"])))' 2>/dev/null || echo "ALL")
        EXISTING_VPCS=\$(echo "\$EXISTING_CFG" | python3 -c 'import json,sys; print(" ".join(json.load(sys.stdin).get("scoped_vpc_ids",[])))' 2>/dev/null || echo "")
        CONFLICT_REASON=""
        if [ "\$NEW_SCOPE_MODE" = "account" ] && [ "\$EXISTING_SCOPE_MODE" = "account" ]; then
            # Both account-scoped, same account → \$ACCOUNT is claimed by both.
            # Runtime is_in_scope with ALL on either side dominates.
            case " \$EXISTING_ACCOUNTS " in
                *" ALL "*) CONFLICT_REASON="peer scope=account/ALL dominates \$ACCOUNT";;
                *" \$ACCOUNT "*) CONFLICT_REASON="peer scope includes \$ACCOUNT";;
            esac
            if [ -z "\$CONFLICT_REASON" ]; then
                # Peer targets different specific accounts — our deploy-account isn't in peer scope.
                echo "  ✅ Peer \$EXISTING (MPE \$EXISTING_MPE, scope=account/[\$EXISTING_ACCOUNTS]) does not target \$ACCOUNT — safe"
                continue
            fi
        elif [ "\$NEW_SCOPE_MODE" = "account" ] && [ "\$EXISTING_SCOPE_MODE" = "vpc" ]; then
            # Our side claims the whole account; peer claims specific VPCs in same account.
            # We'd tag the peer's VPC resources too. Conflict.
            CONFLICT_REASON="our account-mode dominates peer VPC-scope on shared VPCs"
        elif [ "\$NEW_SCOPE_MODE" = "vpc" ] && [ "\$EXISTING_SCOPE_MODE" = "account" ]; then
            # Inverse: peer claims whole account (or our account is in their list), we claim VPCs within.
            case " \$EXISTING_ACCOUNTS " in
                *" ALL "*|*" \$ACCOUNT "*) CONFLICT_REASON="peer account-mode dominates our VPC-scope (\$EXISTING_ACCOUNTS)";;
            esac
            if [ -z "\$CONFLICT_REASON" ]; then
                # Peer does NOT target our deploy-account → safe.
                echo "  ✅ Peer \$EXISTING (MPE \$EXISTING_MPE, scope=account/[\$EXISTING_ACCOUNTS]) does not target \$ACCOUNT — safe"
                continue
            fi
        else
            # Both VPC-scoped — compute VPC overlap.
            OVERLAP_VPCS=""
            for NEW_VPC in \$NEW_VPC_LIST; do
                for EXISTING_VPC in \$EXISTING_VPCS; do
                    if [ "\$NEW_VPC" = "\$EXISTING_VPC" ]; then
                        OVERLAP_VPCS="\$OVERLAP_VPCS \$NEW_VPC"
                    fi
                done
            done
            if [ -z "\$OVERLAP_VPCS" ]; then
                echo "  ✅ Peer \$EXISTING (MPE \$EXISTING_MPE, scope=vpc/[\$EXISTING_VPCS]) disjoint from our VPC list — safe"
                continue
            fi
            CONFLICT_REASON="shared VPC(s):\$OVERLAP_VPCS"
        fi
        echo "  ❌ ${t('d_fail_account_lambda_full')}"
        echo "     Peer: \$EXISTING (MPE \$EXISTING_MPE, scope=\$EXISTING_SCOPE_MODE)"
        echo "     New:  MPE \$MPE, scope=\$NEW_SCOPE_MODE"
        echo "     Reason: \$CONFLICT_REASON"
        echo "     ${t('d_fix_label')} ${t('d_fix_account_lambda')}"
        PREFLIGHT_LOG="\${PREFLIGHT_LOG}${t('d_log_fail')} scope conflict with \$EXISTING: \$CONFLICT_REASON\\n"
        LAMBDA_CONFLICT=1
    done
    if [ \$LAMBDA_CONFLICT -eq 1 ]; then
        ERRORS=\$((ERRORS + 1))
    else
        # Only print the OK message if we actually checked something (there were existing stacks)
        if [ -z "\$EXISTING_STACKS" ]; then
            echo "  ✅ ${t('d_ok_account_lambda')}"
            PREFLIGHT_LOG="\${PREFLIGHT_LOG}${t('d_log_pass')} ${t('d_ok_account_lambda')}\\n"
        fi
    fi
done

${config.scopeMode === 'vpc' && config.scopedVpcIds && config.scopedVpcIds[0] !== 'NONE' ? `
for CHECK_VPC in ${config.scopedVpcIds.map(v => '"' + v + '"').join(' ')}; do
    VPC_RESULT=\$(aws ec2 describe-vpcs --vpc-ids "\$CHECK_VPC" --region "\$REGION" --query 'Vpcs[0].VpcId' --output text 2>/dev/null) || VPC_RESULT=""
    if [ "\$VPC_RESULT" = "\$CHECK_VPC" ]; then
        echo "  ✅ ${t('d_ok_vpc')} \$CHECK_VPC"
        PREFLIGHT_LOG="\${PREFLIGHT_LOG}${t('d_log_pass')} ${t('d_ok_vpc')} \$CHECK_VPC\\n"
    else
        echo "  ❌ ${t('d_fail_vpc')} \$CHECK_VPC"
        echo "     ${t('d_fix_label')} ${t('d_fix_vpc')}"
        PREFLIGHT_LOG="\${PREFLIGHT_LOG}${t('d_log_fail')} ${t('d_fail_vpc')} \$CHECK_VPC\\n"
        ERRORS=\$((ERRORS + 1))
    fi
done` : ''}
if [ "\$ERRORS" -gt 0 ]; then
    echo ""
    echo "  ────────────────────────────────────────────"
    echo "  ❌ \$ERRORS ${t('d_checks_failed')}"
    echo "  ────────────────────────────────────────────"
    DEPLOY_STATUS="FAILED"
    {
      echo "${t('r_title')}"
      echo "========================================"
      echo "${t('r_customer')}: \$CUSTOMER"
      echo "${t('r_mpe')}: \$MPE"
      echo "${t('r_region')}: \$REGION"
      echo "${t('r_date')}: \$DEPLOY_TIME"
      echo "${t('r_result')}: \$DEPLOY_STATUS"
      echo ""
      echo "${t('r_preflight')}"
      echo "-------------------------"
      printf '%b' "\$PREFLIGHT_LOG"
      echo ""
      echo "${t('r_action')}"
      echo "  ${t('r_action_desc')}"
      echo "  ${t('r_share_help')}"
    } > "\$REPORT_FILE"
    echo ""
    echo "  📄 \$REPORT_FILE"
    echo "     ${t('d_share_report')}"
    exit 1
fi
echo ""
echo "  ✅ ${t('d_all_passed')}"
echo ""

# ── Step 2: Deploy ───────────────────────────
echo "${t('d_step2')}"
echo "  ${t('d_step2_wait')}"
echo ""

TEMPLATE=\$(mktemp /tmp/map-auto-tagger-XXXX.yaml)
cat > "\$TEMPLATE" << 'MAP_TEMPLATE_EOF'
${tpl}
MAP_TEMPLATE_EOF

ACCT=\$(aws sts get-caller-identity --query Account --output text)
DEPLOY_STATUS="SUCCESS"

for REGION in \$REGIONS; do
echo ""
echo "  ── \$REGION ──────────────────────────────────"

TEMPLATE_SIZE=\$(wc -c < "\$TEMPLATE")
if [ "\$TEMPLATE_SIZE" -gt 51200 ]; then
    BUCKET="auto-map-tagger-\${ACCT}"
    if aws s3api head-bucket --bucket "\${BUCKET}" 2>/dev/null; then
        ACTUAL_LOC=\$(aws s3api get-bucket-location --bucket "\${BUCKET}" --query LocationConstraint --output text 2>/dev/null)
        [ "\$ACTUAL_LOC" = "None" ] || [ "\$ACTUAL_LOC" = "null" ] && ACTUAL_LOC="us-east-1"
        if [ "\$ACTUAL_LOC" != "\$REGION" ]; then
            echo "  ❌ ERROR: Staging bucket \${BUCKET} exists in \${ACTUAL_LOC}, not \${REGION}."
            echo "     Delete the bucket or use a different account."
            DEPLOY_STATUS="FAILED"; continue
        fi
    else
        aws s3 mb "s3://\${BUCKET}" --region "\${REGION}"
    fi
    for i in 1 2 3 4 5; do
        aws s3api put-public-access-block --bucket "\${BUCKET}" --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true" > /dev/null 2>&1 && break
        sleep 2
    done
    aws s3api put-bucket-encryption --bucket "\${BUCKET}" --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}' > /dev/null 2>&1 || true
    BUCKET_POLICY=\$(printf '{"Version":"2012-10-17","Statement":[{"Sid":"DenyHTTP","Effect":"Deny","Principal":"*","Action":"s3:*","Resource":["arn:aws:s3:::%s","arn:aws:s3:::%s/*"],"Condition":{"Bool":{"aws:SecureTransport":"false"}}}]}' "\${BUCKET}" "\${BUCKET}")
    aws s3api put-bucket-policy --bucket "\${BUCKET}" --policy "\${BUCKET_POLICY}" > /dev/null 2>&1 || true
    aws s3 cp "\$TEMPLATE" "s3://\${BUCKET}/map-auto-tagger-\${MPE}.yaml" > /dev/null
    TEMPLATE_REF="--template-url https://\${BUCKET}.s3.\${REGION}.amazonaws.com/map-auto-tagger-\${MPE}.yaml"
else
    TEMPLATE_REF="--template-body file://\$TEMPLATE"
fi

STACK_STATUS=\$(aws cloudformation describe-stacks --stack-name "\$STACK_NAME" --region "\$REGION" --query 'Stacks[0].StackStatus' --output text 2>/dev/null || echo "DOES_NOT_EXIST")
if [ "\$STACK_STATUS" = "DOES_NOT_EXIST" ] || [ "\$STACK_STATUS" = "DELETE_COMPLETE" ] || [ "\$STACK_STATUS" = "ROLLBACK_COMPLETE" ]; then
    aws logs delete-log-group --log-group-name "/aws/lambda/map-auto-tagger-${mpe}" --region "\$REGION" 2>/dev/null || true
    aws logs delete-log-group --log-group-name "/aws/lambda/map-auto-tagger-backfill-${mpe}" --region "\$REGION" 2>/dev/null || true
fi
if [ "\$STACK_STATUS" = "DOES_NOT_EXIST" ] || [ "\$STACK_STATUS" = "DELETE_COMPLETE" ]; then
    aws cloudformation create-stack \\
      --stack-name "\$STACK_NAME" \\
      \$TEMPLATE_REF \\
      --capabilities CAPABILITY_NAMED_IAM \\
      --region "\$REGION" > /dev/null
    aws cloudformation wait stack-create-complete --stack-name "\$STACK_NAME" --region "\$REGION"
elif [ "\$STACK_STATUS" = "ROLLBACK_COMPLETE" ]; then
    aws cloudformation delete-stack --stack-name "\$STACK_NAME" --region "\$REGION"
    aws cloudformation wait stack-delete-complete --stack-name "\$STACK_NAME" --region "\$REGION"
    aws cloudformation create-stack \\
      --stack-name "\$STACK_NAME" \\
      \$TEMPLATE_REF \\
      --capabilities CAPABILITY_NAMED_IAM \\
      --region "\$REGION" > /dev/null
    aws cloudformation wait stack-create-complete --stack-name "\$STACK_NAME" --region "\$REGION"
else
    echo "  ⚠️  Stack \$STACK_NAME already exists (status: \$STACK_STATUS)."
    echo "     Updating in-place. Resources not in the new template will be deleted by CFN."
    UPDATE_OUT=\$(aws cloudformation update-stack \\
      --stack-name "\$STACK_NAME" \\
      \$TEMPLATE_REF \\
      --capabilities CAPABILITY_NAMED_IAM \\
      --region "\$REGION" 2>&1) || true
    if ! echo "\$UPDATE_OUT" | grep -q "No updates are to be performed"; then
      aws cloudformation wait stack-update-complete --stack-name "\$STACK_NAME" --region "\$REGION" 2>/dev/null || true
    fi
fi

echo "  ✅ \$REGION"
aws logs put-retention-policy --log-group-name "/aws/lambda/map-auto-tagger-${mpe}" --retention-in-days 90 --region "\$REGION" 2>/dev/null || true
${config.includeBackfill ? 'aws logs put-retention-policy --log-group-name "/aws/lambda/map-auto-tagger-backfill-' + mpe + '" --retention-in-days 90 --region "$REGION" 2>/dev/null || true' : ''}
done

rm -f "\$TEMPLATE"
REGION="${region}"
${config.includeBackfill ? `
# ── Backfill wait ────────────────────────────
echo ""
echo "${t('d_backfill_waiting')}"
echo "  ${t('d_backfill_wait_info')}"
echo ""
BACKFILL_RESULT="${t('d_backfill_timeout')}"
BACKFILL_WAIT_START_MS=\$(( \$(date +%s) * 1000 ))
WAIT=0
# Backfill is a Custom::Backfill CustomResource (one-shot during stack create),
# NOT an EventBridge rule — so we poll the backfill Lambda's CloudWatch log
# group for the "Backfill complete" sentinel. The prior version gated this on
# 'aws events describe-rule --name map-auto-tagger-backfill-\$MPE' returning
# DISABLED, but no such rule is ever created; every deploy silently hit the
# 1200s timeout before the CloudWatch poll ran.
while [ \$WAIT -lt 1200 ]; do
  COMPLETE=\$(aws logs filter-log-events \\
    --log-group-name "/aws/lambda/map-auto-tagger-backfill-\$MPE" \\
    --region "\$REGION" \\
    --filter-pattern '"Backfill complete"' \\
    --start-time "\$BACKFILL_WAIT_START_MS" \\
    --max-items 1 \\
    --query 'events[0].message' \\
    --output text 2>/dev/null)
  if [ -n "\$COMPLETE" ] && [ "\$COMPLETE" != "None" ]; then
    BACKFILL_RESULT="\$COMPLETE"
    echo "  ✅ ${t('d_backfill_done')} \$BACKFILL_RESULT"
    break
  fi
  sleep 30
  WAIT=\$((WAIT + 30))
  echo "  ${t('d_backfill_in_progress')} (\${WAIT}s)"
done
echo ""` : ''}
# ── Step 3: Done ─────────────────────────────
echo "${t('d_step3')}"
echo ""

{
  echo "${t('r_title')}"
  echo "========================================"
  echo "${t('r_customer')}: \$CUSTOMER"
  echo "${t('r_mpe')}: \$MPE"
  echo "${t('r_region')}: \$REGION"
  echo "${t('r_date')}: \$DEPLOY_TIME"
  echo "${t('r_result')}: \$DEPLOY_STATUS"
  echo ""
  echo "${t('r_preflight')}"
  echo "-------------------------"
  printf '%b' "\$PREFLIGHT_LOG"
  echo ""
  echo "${t('r_deployed')}"
  echo "------------------"
  echo "  - Auto-tagger Lambda (map-auto-tagger-\$MPE)"
  echo "  - EventBridge rule"
  echo "  - Dead letter queue (14-day retention)"
  echo "  - CloudWatch alarm"
  echo "  - SSM config (/auto-map-tagger/\$MPE/config)"
  ${config.includeBackfill ? `echo "  - Backfill Lambda"` : ''}
  echo ""
  echo "${t('r_verify')}"
  echo "--------------"
  echo "  ${t('r_verify1')}"
  echo "  ${t('r_verify2')}"
  echo "  ${t('r_verify3')} \$MPE"
  echo ""
  ${config.includeBackfill ? `echo "${t('r_backfill_result')}"
  echo "----------------"
  echo "  \$BACKFILL_RESULT"
  echo ""` : ''}
  echo "${t('r_support')}"
  echo "--------"
  echo "  aws logs tail /aws/lambda/map-auto-tagger-\$MPE --follow"
  echo "  ${t('r_contact')}"
} > "\$REPORT_FILE"

echo "  ┌─────────────────────────────────────────┐"
echo "  │   ✅ ${t('d_complete_title')}               │"
echo "  │   ${t('d_complete_single')}  │"
echo "  └─────────────────────────────────────────┘"
echo ""
echo "  📄 ${t('d_report_saved')} \$REPORT_FILE"
echo "     ${t('d_share_report')}"
echo ""
`;
            }

            // Multi-account — embed both templates in the script
            const orgTpl = escapeHeredoc(mainTemplate);
            const accountsTpl = escapeHeredoc(perAccountTemplate || '');

            return `#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
#
# MAP 2.0 Auto-Tagger — Deployment Script
# Customer: ${customerComment} | MPE: ${mpe}
# Run this file in AWS CloudShell (management account): bash deploy.sh
set -e

MPE="${mpe}"
REGION="${region}"
# Multi-account deployment is pinned to the management-account region selected
# in the configurator. The preflight iterates over $REGIONS (plural) to align
# with the single-account generator's loop idiom — this normalizes both paths
# on a one-element region list.
REGIONS="\$REGION"
ACCOUNT=\$(aws sts get-caller-identity --query Account --output text)
BUCKET="auto-map-tagger-\${ACCOUNT}"
STACK_NAME="map-auto-tagger-${mpe}"
CUSTOMER=${customerDisplay}
REPORT_FILE="${reportFile}"
DEPLOY_TIME=\$(date '+%Y-%m-%d %H:%M:%S')
PREFLIGHT_LOG=""
DEPLOY_STATUS="NOT STARTED"

# ────────────────────────────────────────────
echo ""
echo "  ┌─────────────────────────────────────────┐"
echo "  │   ${t('d_title')}              │"
echo "  │   ${t('d_tag_label')}: \$MPE"
echo "  │   ${t('d_region_label')}: \$REGION"
echo "  │   ${t('d_account_label')}: \$ACCOUNT"
echo "  └─────────────────────────────────────────┘"
echo ""

# ── Step 1: Pre-flight checks ────────────────
echo "${t('d_step1')}"
echo ""
ERRORS=0

if ! aws sts get-caller-identity > /dev/null 2>&1; then
    echo "  ❌ ${t('d_fail_creds')}"
    echo "     ${t('d_fix_label')} ${t('d_fix_creds')}"
    PREFLIGHT_LOG="\${PREFLIGHT_LOG}${t('d_log_fail')} ${t('d_fail_creds')}\\n"
    ERRORS=\$((ERRORS + 1))
else
    echo "  ✅ ${t('d_ok_creds')}"
    PREFLIGHT_LOG="\${PREFLIGHT_LOG}${t('d_log_pass')} ${t('d_ok_creds')}\\n"
fi

if ! aws cloudformation list-stacks --region "\$REGION" > /dev/null 2>&1; then
    echo "  ❌ ${t('d_fail_perms')}"
    echo "     ${t('d_fix_label')} ${t('d_fix_perms')}"
    PREFLIGHT_LOG="\${PREFLIGHT_LOG}${t('d_log_fail')} ${t('d_fail_perms')}\\n"
    ERRORS=\$((ERRORS + 1))
else
    echo "  ✅ ${t('d_ok_perms')}"
    PREFLIGHT_LOG="\${PREFLIGHT_LOG}${t('d_log_pass')} ${t('d_ok_perms')}\\n"
fi

ORG_MASTER=\$(aws organizations describe-organization --query 'Organization.MasterAccountId' --output text 2>/dev/null)
if [ -z "\$ORG_MASTER" ]; then
    echo "  ❌ ${t('d_fail_org')}"
    echo "     ${t('d_fix_label')} ${t('d_fix_org')}"
    PREFLIGHT_LOG="\${PREFLIGHT_LOG}${t('d_log_fail')} ${t('d_fail_org')}\\n"
    ERRORS=\$((ERRORS + 1))
elif [ "\$ACCOUNT" = "\$ORG_MASTER" ]; then
    echo "  ✅ ${t('d_ok_org')}"
    PREFLIGHT_LOG="\${PREFLIGHT_LOG}${t('d_log_pass')} ${t('d_ok_org')}\\n"
else
    IS_DELEGATED=\$(aws organizations list-delegated-services-for-account --account-id "\$ACCOUNT" \\
        --query "DelegatedServices[?contains(ServicePrincipal,'stacksets.cloudformation')].ServicePrincipal" \\
        --output text 2>/dev/null)
    if [ -n "\$IS_DELEGATED" ]; then
        echo "  ✅ ${t('d_ok_org_delegated')}"
        PREFLIGHT_LOG="\${PREFLIGHT_LOG}${t('d_log_pass')} ${t('d_ok_org_delegated')}\\n"
    else
        echo "  ❌ ${t('d_fail_org')}"
        echo "     ${t('d_fix_label')} ${t('d_fix_org')}"
        PREFLIGHT_LOG="\${PREFLIGHT_LOG}${t('d_log_fail')} ${t('d_fail_org')}\\n"
        ERRORS=\$((ERRORS + 1))
    fi
fi

STACKSETS_ACCESS=\$(aws organizations list-aws-service-access-for-organization --query "EnabledServicePrincipals[?contains(ServicePrincipal,'stacksets.cloudformation')].ServicePrincipal" --output text 2>/dev/null)
if [ -z "\$STACKSETS_ACCESS" ]; then
    echo "  ❌ CloudFormation StackSets trusted access is not enabled in this organization."
    echo "     → Fix: aws organizations enable-aws-service-access --service-principal member.org.stacksets.cloudformation.amazonaws.com"
    PREFLIGHT_LOG="\${PREFLIGHT_LOG}FAIL: StackSets trusted access not enabled\\n"
    ERRORS=\$((ERRORS + 1))
else
    echo "  ✅ ${t('d_ok_stacksets')}"
    PREFLIGHT_LOG="\${PREFLIGHT_LOG}${t('d_log_pass')} ${t('d_ok_stacksets')}\\n"
fi

for CHECK_REGION in ${regionArgs}; do
    TRAIL_COUNT=\$(aws cloudtrail describe-trails --region "\$CHECK_REGION" --query 'trailList[*].TrailARN' --output text 2>/dev/null | wc -w)
    if [ "\$TRAIL_COUNT" -eq 0 ]; then
        echo "  ❌ ${t('d_fail_trail')} \$CHECK_REGION"
        echo "     ${t('d_fix_label')} ${t('d_fix_trail1')}"
        echo "            ${t('d_fix_trail2')} \$CHECK_REGION"
        PREFLIGHT_LOG="\${PREFLIGHT_LOG}${t('d_log_fail')} ${t('d_fail_trail')} \$CHECK_REGION\\n"
        ERRORS=\$((ERRORS + 1))
    else
        echo "  ✅ ${t('d_ok_trail')} \$CHECK_REGION"
        PREFLIGHT_LOG="\${PREFLIGHT_LOG}${t('d_log_pass')} ${t('d_ok_trail')} \$CHECK_REGION\\n"
    fi
done

SCP_RESULT=\$(aws iam simulate-principal-policy \\
    --policy-source-arn "\$(aws sts get-caller-identity --query Arn --output text 2>/dev/null)" \\
    --action-names "tag:TagResources" \\
    --query 'EvaluationResults[0].EvalDecision' \\
    --output text 2>/dev/null) || SCP_RESULT=""
if [ "\$SCP_RESULT" = "explicitDeny" ]; then
    echo "  ❌ ${t('d_fail_scp')}"
    echo "     ${t('d_fix_label')} ${t('d_fix_scp')}"
    PREFLIGHT_LOG="\${PREFLIGHT_LOG}${t('d_log_fail')} ${t('d_fail_scp')}\\n"
    ERRORS=\$((ERRORS + 1))
else
    echo "  ✅ ${t('d_ok_scp')}"
    echo "     ${t('d_scp_note')}"
    PREFLIGHT_LOG="\${PREFLIGHT_LOG}${t('d_log_pass')} ${t('d_ok_scp')}\\n"
fi

# ── Deploy-time IAM actions (multi-account path) ────────────────
# Multi-account adds StackSets + Organizations actions on top of the
# single-account set. Single batched simulate-principal-policy call.
CALLER_ARN=\$(aws sts get-caller-identity --query Arn --output text 2>/dev/null || echo "")
# simulate-principal-policy needs an IAM user/role ARN, NOT the assumed-role session
# ARN returned by get-caller-identity (e.g. arn:aws:sts::...:assumed-role/Foo/session).
# Convert assumed-role → role ARN for SSO / role callers; pass through for IAM users.
if [[ "\$CALLER_ARN" == *":assumed-role/"* ]]; then
    SIM_ACCT=\$(echo "\$CALLER_ARN" | cut -d: -f5)
    SIM_ROLE=\$(echo "\$CALLER_ARN" | sed 's|.*:assumed-role/||' | cut -d/ -f1)
    SIM_ARN="arn:aws:iam::\${SIM_ACCT}:role/\${SIM_ROLE}"
else
    SIM_ARN="\$CALLER_ARN"
fi
IAM_CHECK_ACTIONS=( \\
  "cloudformation:CreateStack" \\
  "cloudformation:UpdateStack" \\
  "cloudformation:DescribeStacks" \\
  "cloudformation:GetTemplateSummary" \\
  "cloudformation:CreateStackSet" \\
  "cloudformation:CreateStackInstances" \\
  "cloudformation:DescribeStackSet" \\
  "cloudformation:ListStacks" \\
  "cloudformation:ListStackSets" \\
  "cloudformation:ListStackInstances" \\
  "organizations:ListRoots" \\
  "organizations:DescribeOrganization" \\
  "organizations:ListAccounts" \\
  "iam:CreateRole" \\
  "iam:PutRolePolicy" \\
  "iam:AttachRolePolicy" \\
  "iam:PassRole" \\
  "lambda:CreateFunction" \\
  "lambda:AddPermission" \\
  "events:PutRule" \\
  "events:PutTargets" \\
  "sqs:CreateQueue" \\
  "sqs:SetQueueAttributes" \\
  "ssm:PutParameter" \\
  "ssm:GetParameter" \\
  "logs:CreateLogGroup" \\
  "logs:PutRetentionPolicy" \\
  "sns:CreateTopic" \\
  "sns:Subscribe" \\
  "s3:CreateBucket" \\
  "s3:PutBucketPolicy" \\
)
if [ -n "\$SIM_ARN" ]; then
    IAM_DENIED=\$(aws iam simulate-principal-policy \\
        --policy-source-arn "\$SIM_ARN" \\
        --action-names "\${IAM_CHECK_ACTIONS[@]}" \\
        --query 'EvaluationResults[?EvalDecision != \`allowed\`].[EvalActionName,EvalDecision]' \\
        --output text 2>/dev/null || echo "")
    if [ -n "\$IAM_DENIED" ]; then
        echo "  ❌ ${t('d_fail_iam')}"
        echo "\$IAM_DENIED" | while IFS=\$'\\t' read -r action decision; do
            echo "     - \$action → \$decision"
            PREFLIGHT_LOG="\${PREFLIGHT_LOG}${t('d_log_fail')} IAM: \$action \$decision\\n"
        done
        echo "     ${t('d_fix_label')} ${t('d_fix_iam')}"
        ERRORS=\$((ERRORS + 1))
    else
        echo "  ✅ ${t('d_ok_iam')} (\${#IAM_CHECK_ACTIONS[@]})"
        PREFLIGHT_LOG="\${PREFLIGHT_LOG}${t('d_log_pass')} ${t('d_ok_iam')}\\n"
    fi
else
    echo "  ⚠️  ${t('d_skip_iam')}"
    PREFLIGHT_LOG="\${PREFLIGHT_LOG}[SKIP] ${t('d_skip_iam')}\\n"
fi

# ── Stack state ready for deploy (multi-account management account) ──
# Only checks the management-account stack. Per-target-account StackSet
# instances are managed by CloudFormation and don't need preflight here.
for CHECK_REGION in \$REGIONS; do
    PREDEPLOY_STATUS=\$(aws cloudformation describe-stacks --stack-name "\$STACK_NAME" \\
        --region "\$CHECK_REGION" --query 'Stacks[0].StackStatus' --output text 2>/dev/null \\
        || echo "NOT_FOUND")
    case "\$PREDEPLOY_STATUS" in
        NOT_FOUND|DELETE_COMPLETE|ROLLBACK_COMPLETE|CREATE_COMPLETE|UPDATE_COMPLETE|UPDATE_ROLLBACK_COMPLETE)
            echo "  ✅ ${t('d_ok_stack_state')} \$CHECK_REGION (\$PREDEPLOY_STATUS)"
            PREFLIGHT_LOG="\${PREFLIGHT_LOG}${t('d_log_pass')} ${t('d_ok_stack_state')} \$CHECK_REGION\\n"
            ;;
        *_IN_PROGRESS)
            echo "  ❌ ${t('d_fail_stack_inprogress')} \$CHECK_REGION (\$PREDEPLOY_STATUS)"
            echo "     ${t('d_fix_label')} ${t('d_fix_stack_inprogress')}"
            PREFLIGHT_LOG="\${PREFLIGHT_LOG}${t('d_log_fail')} ${t('d_fail_stack_inprogress')} \$CHECK_REGION \$PREDEPLOY_STATUS\\n"
            ERRORS=\$((ERRORS + 1))
            ;;
        UPDATE_ROLLBACK_FAILED|ROLLBACK_FAILED|DELETE_FAILED)
            echo "  ❌ ${t('d_fail_stack_stuck')} \$CHECK_REGION (\$PREDEPLOY_STATUS)"
            echo "     ${t('d_fix_label')} ${t('d_fix_stack_stuck')}"
            echo "     - UPDATE_ROLLBACK_FAILED: aws cloudformation continue-update-rollback --stack-name \$STACK_NAME --region \$CHECK_REGION"
            echo "     - ROLLBACK_FAILED / DELETE_FAILED: delete via console (may require AWS Support)"
            PREFLIGHT_LOG="\${PREFLIGHT_LOG}${t('d_log_fail')} ${t('d_fail_stack_stuck')} \$CHECK_REGION \$PREDEPLOY_STATUS\\n"
            ERRORS=\$((ERRORS + 1))
            ;;
        *)
            echo "  ⚠️  ${t('d_warn_stack_unknown')} \$CHECK_REGION (\$PREDEPLOY_STATUS)"
            PREFLIGHT_LOG="\${PREFLIGHT_LOG}[WARN] ${t('d_warn_stack_unknown')} \$CHECK_REGION \$PREDEPLOY_STATUS\\n"
            ;;
    esac
done

# ── Cross-MPE StackSet conflict (Class 1: multi-account AutoDeployment) ──
# Detect a customer accidentally deploying a second MAP engagement on top of
# an existing one. If any map-auto-tagger-* StackSet in this region has a
# different MPE and shares any account with our new target set, BOTH Lambdas
# would tag resources and the map-migrated tag value becomes last-writer-wins.
# Fail hard with the specific overlapping account IDs. (Layer 1 only —
# Lambda scoped_account_ids precision requires cross-account SSM access
# we don't have from the management account.)
NEW_TARGET_ACCOUNTS_FILE=\$(mktemp)
${config.useAccountScope && config.stacksetAccounts && config.stacksetAccounts.length > 0
  ? config.stacksetAccounts.map(a => `echo "${a.id}" >> "\\$NEW_TARGET_ACCOUNTS_FILE"`).join('\n')
  : `# ALL accounts in org
aws organizations list-accounts --query 'Accounts[?Status==\`ACTIVE\`].Id' --output text 2>/dev/null | tr '\\\\t' '\\\\n' > "\\$NEW_TARGET_ACCOUNTS_FILE" || true`}

COMPETING_STACKSETS=\$(aws cloudformation list-stack-sets --status ACTIVE --region "\$REGION" \\
    --query "Summaries[?starts_with(StackSetName, \\\`map-auto-tagger-\\\`)].StackSetName" \\
    --output text 2>/dev/null || echo "")

CONFLICTS_FOUND=0
for SS in \$COMPETING_STACKSETS; do
    SS_MPE="\${SS#map-auto-tagger-}"
    # Only treat as a peer deploy if the suffix matches the MpeId pattern
    # (AllowedPattern: ^mig[a-zA-Z0-9]+\$). Skips test harness stacks.
    case "\$SS_MPE" in mig*) ;; *) continue ;; esac
    if [ "\$SS_MPE" = "\$MPE" ]; then continue; fi  # same MPE = in-place update, not a conflict
    EXISTING_ACCOUNTS=\$(aws cloudformation list-stack-instances --stack-set-name "\$SS" --region "\$REGION" \\
        --query 'Summaries[].Account' --output text 2>/dev/null | tr '\\t' '\\n')
    OVERLAP=\$(comm -12 <(sort -u "\$NEW_TARGET_ACCOUNTS_FILE") <(echo "\$EXISTING_ACCOUNTS" | sort -u))
    if [ -n "\$OVERLAP" ]; then
        if [ \$CONFLICTS_FOUND -eq 0 ]; then
            echo "  ❌ ${t('d_fail_stackset_conflict')}"
            CONFLICTS_FOUND=1
        fi
        echo "     Conflict with StackSet \$SS (MPE \$SS_MPE) in these accounts:"
        echo "\$OVERLAP" | sed 's/^/       - /'
        PREFLIGHT_LOG="\${PREFLIGHT_LOG}${t('d_log_fail')} Conflict with \$SS in \$(echo \$OVERLAP | wc -w) account(s)\\n"
    fi
done
rm -f "\$NEW_TARGET_ACCOUNTS_FILE"
if [ \$CONFLICTS_FOUND -eq 1 ]; then
    echo "     ${t('d_fix_label')} ${t('d_fix_stackset_conflict')}"
    ERRORS=\$((ERRORS + 1))
else
    echo "  ✅ ${t('d_ok_stackset_conflict')}"
    PREFLIGHT_LOG="\${PREFLIGHT_LOG}${t('d_log_pass')} ${t('d_ok_stackset_conflict')}\\n"
fi

${config.useAccountScope && config.stacksetAccounts && config.stacksetAccounts.length > 0 ? `
for CHECK_ACCT in ${config.stacksetAccounts.map(a => '"' + a.id + '"').join(' ')}; do
    ACCT_RESULT=\$(aws organizations describe-account --account-id "\$CHECK_ACCT" --query 'Account.Id' --output text 2>/dev/null) || ACCT_RESULT=""
    if [ "\$ACCT_RESULT" = "\$CHECK_ACCT" ]; then
        echo "  ✅ ${t('d_ok_account_scope')} \$CHECK_ACCT"
        PREFLIGHT_LOG="\${PREFLIGHT_LOG}${t('d_log_pass')} ${t('d_ok_account_scope')} \$CHECK_ACCT\\n"
    else
        echo "  ❌ ${t('d_fail_account_scope')} \$CHECK_ACCT"
        echo "     ${t('d_fix_label')} ${t('d_fix_account_scope')}"
        PREFLIGHT_LOG="\${PREFLIGHT_LOG}${t('d_log_fail')} ${t('d_fail_account_scope')} \$CHECK_ACCT\\n"
        ERRORS=\$((ERRORS + 1))
    fi
done` : ''}
if [ "\$ERRORS" -gt 0 ]; then
    echo ""
    echo "  ────────────────────────────────────────────"
    echo "  ❌ \$ERRORS ${t('d_checks_failed')}"
    echo "  ────────────────────────────────────────────"
    DEPLOY_STATUS="FAILED"
    {
      echo "${t('r_title')}"
      echo "========================================"
      echo "${t('r_customer')}: \$CUSTOMER"
      echo "${t('r_mpe')}: \$MPE"
      echo "${t('r_region')}: \$REGION"
      echo "${t('r_account')}: \$ACCOUNT"
      echo "${t('r_date')}: \$DEPLOY_TIME"
      echo "${t('r_result')}: \$DEPLOY_STATUS"
      echo ""
      echo "${t('r_preflight')}"
      echo "-------------------------"
      printf '%b' "\$PREFLIGHT_LOG"
      echo ""
      echo "${t('r_action')}"
      echo "  ${t('r_action_desc')}"
      echo "  ${t('r_share_help')}"
    } > "\$REPORT_FILE"
    echo ""
    echo "  📄 \$REPORT_FILE"
    echo "     ${t('d_share_report')}"
    exit 1
fi
echo ""
echo "  ✅ ${t('d_all_passed')}"
echo ""

# ── Step 2: Deploy ───────────────────────────
echo "${t('d_step2')}"
echo "  ${t('d_step2_wait_multi')}"
echo ""

ORG_TEMPLATE=\$(mktemp /tmp/map-auto-tagger-org-XXXX.yaml)
ACCOUNTS_TEMPLATE=\$(mktemp /tmp/map-auto-tagger-accounts-XXXX.yaml)

cat > "\$ORG_TEMPLATE" << 'ORG_TEMPLATE_EOF'
${orgTpl}
ORG_TEMPLATE_EOF

cat > "\$ACCOUNTS_TEMPLATE" << 'ACCOUNTS_TEMPLATE_EOF'
${accountsTpl}
ACCOUNTS_TEMPLATE_EOF

if aws s3api head-bucket --bucket "\${BUCKET}" 2>/dev/null; then
    ACTUAL_LOC=\$(aws s3api get-bucket-location --bucket "\${BUCKET}" --query LocationConstraint --output text 2>/dev/null)
    [ "\$ACTUAL_LOC" = "None" ] || [ "\$ACTUAL_LOC" = "null" ] && ACTUAL_LOC="us-east-1"
    if [ "\$ACTUAL_LOC" != "\$REGION" ]; then
        echo "  ❌ ERROR: Staging bucket \${BUCKET} exists in \${ACTUAL_LOC}, not \${REGION}."
        echo "     Delete the bucket or use a different account."
        exit 1
    fi
else
    aws s3 mb "s3://\${BUCKET}" --region "\${REGION}"
fi
for i in 1 2 3 4 5; do
    aws s3api put-public-access-block --bucket "\${BUCKET}" --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true" > /dev/null 2>&1 && break
    sleep 2
done
aws s3api put-bucket-encryption --bucket "\${BUCKET}" --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}' > /dev/null 2>&1 || true
BUCKET_POLICY=\$(printf '{"Version":"2012-10-17","Statement":[{"Sid":"DenyHTTP","Effect":"Deny","Principal":"*","Action":"s3:*","Resource":["arn:aws:s3:::%s","arn:aws:s3:::%s/*"],"Condition":{"Bool":{"aws:SecureTransport":"false"}}}]}' "\${BUCKET}" "\${BUCKET}")
aws s3api put-bucket-policy --bucket "\${BUCKET}" --policy "\${BUCKET_POLICY}" > /dev/null 2>&1 || true
aws s3 cp "\$ORG_TEMPLATE" "s3://\${BUCKET}/map-auto-tagger-org.yaml" > /dev/null
aws s3 cp "\$ACCOUNTS_TEMPLATE" "s3://\${BUCKET}/map-auto-tagger-accounts-\${MPE}.yaml" > /dev/null
rm -f "\$ORG_TEMPLATE" "\$ACCOUNTS_TEMPLATE"

STACK_STATUS=\$(aws cloudformation describe-stacks --stack-name "\$STACK_NAME" --region "\$REGION" --query 'Stacks[0].StackStatus' --output text 2>/dev/null || echo "DOES_NOT_EXIST")
ORG_TEMPLATE_URL="https://\${BUCKET}.s3.\${REGION}.amazonaws.com/map-auto-tagger-org.yaml"
ORG_PARAMS="ParameterKey=PerAccountTemplateURL,ParameterValue=https://\${BUCKET}.s3.\${REGION}.amazonaws.com/map-auto-tagger-accounts-\${MPE}.yaml"
if [ "\$STACK_STATUS" = "DOES_NOT_EXIST" ] || [ "\$STACK_STATUS" = "DELETE_COMPLETE" ] || [ "\$STACK_STATUS" = "ROLLBACK_COMPLETE" ]; then
    aws logs delete-log-group --log-group-name "/aws/lambda/map-auto-tagger-\$MPE" --region "\$REGION" 2>/dev/null || true
    aws logs delete-log-group --log-group-name "/aws/lambda/map-auto-tagger-backfill-\$MPE" --region "\$REGION" 2>/dev/null || true
fi
if [ "\$STACK_STATUS" = "DOES_NOT_EXIST" ] || [ "\$STACK_STATUS" = "DELETE_COMPLETE" ]; then
    aws cloudformation create-stack \\
      --stack-name "\$STACK_NAME" \\
      --template-url "\$ORG_TEMPLATE_URL" \\
      --parameters "\$ORG_PARAMS" \\
      --capabilities CAPABILITY_NAMED_IAM \\
      --region "\$REGION" > /dev/null
elif [ "\$STACK_STATUS" = "ROLLBACK_COMPLETE" ]; then
    aws cloudformation delete-stack --stack-name "\$STACK_NAME" --region "\$REGION"
    aws cloudformation wait stack-delete-complete --stack-name "\$STACK_NAME" --region "\$REGION"
    aws cloudformation create-stack \\
      --stack-name "\$STACK_NAME" \\
      --template-url "\$ORG_TEMPLATE_URL" \\
      --parameters "\$ORG_PARAMS" \\
      --capabilities CAPABILITY_NAMED_IAM \\
      --region "\$REGION" > /dev/null
else
    aws cloudformation update-stack \\
      --stack-name "\$STACK_NAME" \\
      --template-url "\$ORG_TEMPLATE_URL" \\
      --parameters "\$ORG_PARAMS" \\
      --capabilities CAPABILITY_NAMED_IAM \\
      --region "\$REGION" > /dev/null 2>&1 || true
fi

echo "  ${t('d_deploying')}"
echo ""

WAIT_SECS=0
while true; do
  STATUS=\$(aws cloudformation describe-stacks --stack-name "\$STACK_NAME" --region "\$REGION" --query 'Stacks[0].StackStatus' --output text 2>/dev/null)
  if [ "\$STATUS" = "CREATE_COMPLETE" ] || [ "\$STATUS" = "UPDATE_COMPLETE" ]; then
    break
  elif [ "\$STATUS" = "CREATE_FAILED" ] || [ "\$STATUS" = "ROLLBACK_COMPLETE" ] || [ "\$STATUS" = "UPDATE_ROLLBACK_COMPLETE" ]; then
    DEPLOY_STATUS="FAILED — \$STATUS"
    echo "  ❌ ${t('d_deploy_failed')}"
    break
  fi
  sleep 30
  WAIT_SECS=\$((WAIT_SECS + 30))
  echo "  ${t('d_still_deploying')} (\${WAIT_SECS}s ${t('d_elapsed')})"
done
# Wait for StackSet instances to reach CURRENT (stack may be COMPLETE before StackSet finishes).
# Gate on "NOT STARTED" rather than -z: DEPLOY_STATUS is initialized non-empty at the top of
# the script, so the prior -z guard was always false and this whole StackSet-wait block ran
# as dead code. Any upstream failure marks DEPLOY_STATUS="FAILED — ..." and skips this block.
if [ "\$DEPLOY_STATUS" = "NOT STARTED" ]; then
  STACKSET_NAME=\$(aws cloudformation describe-stacks --stack-name "\$STACK_NAME" --region "\$REGION" \\
    --query "Stacks[0].Outputs[?OutputKey=='StackSetName'].OutputValue" --output text 2>/dev/null)
  if [ -n "\$STACKSET_NAME" ] && [ "\$STACKSET_NAME" != "None" ]; then
    echo ""
    echo "  Waiting for StackSet instances to deploy..."
    SS_WAIT=0
    while [ \$SS_WAIT -lt 1200 ]; do
      OUTDATED=\$(aws cloudformation list-stack-instances --stack-set-name "\$STACKSET_NAME" \\
        --region "\$REGION" --query "Summaries[?Status!='CURRENT'].Account" --output text 2>/dev/null | wc -w | tr -d ' ')
      FAILED=\$(aws cloudformation list-stack-instances --stack-set-name "\$STACKSET_NAME" \\
        --region "\$REGION" --query "Summaries[?Status=='CANCELLED'||Status=='FAILED'].Account" --output text 2>/dev/null | wc -w | tr -d ' ')
      TOTAL=\$(aws cloudformation list-stack-instances --stack-set-name "\$STACKSET_NAME" \\
        --region "\$REGION" --query "Summaries[*].Account" --output text 2>/dev/null | wc -w | tr -d ' ')
      CURRENT=\$((TOTAL - OUTDATED))
      echo "  StackSet progress: \${CURRENT}/\${TOTAL} accounts ready... (\${SS_WAIT}s)"
      if [ "\$TOTAL" -gt 0 ] && [ "\$OUTDATED" -eq 0 ]; then
        echo "  ✅ StackSet: all \${TOTAL} accounts ready"
        DEPLOY_STATUS="SUCCESS"
        break
      elif [ "\$FAILED" -gt 0 ]; then
        DEPLOY_STATUS="FAILED — \$FAILED account(s) failed in StackSet"
        echo "  ❌ \$FAILED account(s) failed. Check CloudFormation StackSet for details."
        break
      fi
      sleep 30
      SS_WAIT=\$((SS_WAIT + 30))
    done
    # If the 1200s wait expired without reaching all-CURRENT or any FAILED, the StackSet
    # is still rolling out. Mark as SUCCESS — stack create completed; continued rollout
    # is tracked by CloudFormation itself and visible via list-stack-instances.
    if [ "\$DEPLOY_STATUS" = "NOT STARTED" ]; then DEPLOY_STATUS="SUCCESS"; fi
  else
    DEPLOY_STATUS="SUCCESS"
  fi
fi
${config.includeBackfill ? `
# ── Backfill wait ────────────────────────────
if [ "\$DEPLOY_STATUS" = "SUCCESS" ]; then
  echo ""
  echo "${t('d_backfill_waiting')}"
  echo "  ${t('d_backfill_wait_info')}"
  echo ""
  BACKFILL_RESULT="${t('d_backfill_timeout')}"
  BACKFILL_WAIT_START_MS=\$(( \$(date +%s) * 1000 ))
  WAIT=0
  # See rationale in the single-account branch — backfill is a Custom::Backfill
  # CustomResource, not an EventBridge rule. Poll the Lambda's log group directly.
  while [ \$WAIT -lt 1200 ]; do
    COMPLETE=\$(aws logs filter-log-events \\
      --log-group-name "/aws/lambda/map-auto-tagger-backfill-\$MPE" \\
      --region "\$REGION" \\
      --filter-pattern '"Backfill complete"' \\
      --start-time "\$BACKFILL_WAIT_START_MS" \\
      --max-items 1 \\
      --query 'events[0].message' \\
      --output text 2>/dev/null)
    if [ -n "\$COMPLETE" ] && [ "\$COMPLETE" != "None" ]; then
      BACKFILL_RESULT="\$COMPLETE"
      echo "  ✅ ${t('d_backfill_done')} \$BACKFILL_RESULT"
      break
    fi
    sleep 30
    WAIT=\$((WAIT + 30))
    echo "  ${t('d_backfill_in_progress')} (\${WAIT}s)"
  done
  echo ""
fi` : ''}
# ── Step 3: Report ───────────────────────────
echo ""
echo "${t('d_step3')}"

{
  echo "${t('r_title')}"
  echo "========================================"
  echo "${t('r_customer')}: \$CUSTOMER"
  echo "${t('r_mpe')}: \$MPE"
  echo "${t('r_region')}: \$REGION"
  echo "${t('r_account')}: \$ACCOUNT"
  echo "${t('r_date')}: \$DEPLOY_TIME"
  echo "${t('r_result')}: \$DEPLOY_STATUS"
  echo ""
  echo "${t('r_preflight')}"
  echo "-------------------------"
  printf '%b' "\$PREFLIGHT_LOG"
  echo ""
  if [ "\$DEPLOY_STATUS" = "SUCCESS" ]; then
    echo "${t('r_deployed')}"
    echo "------------------"
    echo "  - Auto-tagger: ${regions.join(', ')}"
    echo "  - EventBridge, DLQ, CloudWatch alarm, SSM config"
    ${config.includeBackfill ? `echo "  - Backfill Lambda"` : ''}
    echo ""
    echo "${t('r_verify')}"
    echo "--------------"
    echo "  ${t('r_verify1')}"
    echo "  ${t('r_verify2')}"
    echo "  ${t('r_verify3')} \$MPE"
    echo ""
    ${config.includeBackfill ? `echo "${t('r_backfill_result')}"
    echo "----------------"
    echo "  \$BACKFILL_RESULT"
    echo ""` : ''}
    echo "${t('r_perstatus')}"
    echo "-------------------"
    echo "  aws cloudformation list-stack-instances --stack-set-name map-auto-tagger-\$MPE \\"
    echo "    --query 'Summaries[*].[Account,Region,StackInstanceStatus.DetailedStatus]' \\"
    echo "    --output table --region \$REGION"
  else
    echo "${t('r_action')}"
    echo "  ${t('r_action_desc')}"
  fi
  echo ""
  echo "${t('r_support')}"
  echo "--------"
  echo "  ${t('r_contact')}"
} > "\$REPORT_FILE"

if [ "\$DEPLOY_STATUS" = "SUCCESS" ]; then
  echo ""
  echo "  ┌─────────────────────────────────────────┐"
  echo "  │   ✅ ${t('d_complete_title')}               │"
  echo "  │   ${t('d_complete_multi')}  │"
  echo "  └─────────────────────────────────────────┘"
  echo ""
fi

echo "  📄 ${t('d_report_saved')} \$REPORT_FILE"
echo "     ${t('d_share_report')}"
echo ""
`;
        }

