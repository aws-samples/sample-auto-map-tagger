        // Mirror the Editor/Update MPE regex: 10 chars, uppercase A–Z + 0–9, at least one
        // letter and one digit. Stricter than the Lambda AllowedPattern on purpose — the
        // configurator enforces the MAP Engagement ID format at the UI boundary so all
        // three flows (Editor, Update, Delete) behave identically.
        const DELETE_MPE_REGEX = /^[A-Z0-9]+$/;

        function deleteSetStep(num) {
            ['dstep1', 'dstep2', 'dstep3'].forEach((id, i) => {
                document.getElementById(id).classList.toggle('hidden', i + 1 !== num);
                const ind = document.getElementById(id + '-indicator');
                ind.classList.remove('active', 'done');
                if (i + 1 < num) ind.classList.add('done');
                if (i + 1 === num) ind.classList.add('active');
            });
            window.scrollTo(0, 0);
        }

        function deleteToggleScope() {
            const enabled = document.getElementById('delete-scopeToMpe').checked;
            document.getElementById('delete-mpeSection').classList.toggle('hidden', !enabled);
        }

        function deleteAddMpe() {
            const list = document.getElementById('delete-mpeList');
            const row = document.createElement('div');
            row.className = 'entry-row';
            row.style.cssText = 'display:flex;align-items:center;gap:8px;';
            row.innerHTML = '<div style="display:flex;align-items:center;gap:0;flex:1;"><span style="padding:8px 10px;background:#f2f3f3;border:1px solid #aab7b8;border-right:none;border-radius:4px 0 0 4px;font-size:14px;color:#687078;white-space:nowrap;">mig</span><input type="text" class="delete-mpe-input" placeholder="A1B2C3D4E5" maxlength="10" style="border-radius:0 4px 4px 0;" oninput="this.value=this.value.toUpperCase().replace(/[^A-Z0-9]/g,\'\')"></div><button class="btn-remove" onclick="editorRemoveRow(this)" title="Remove">&times;</button>';
            list.appendChild(row);
        }

        function deleteReview() {
            const region = document.getElementById('delete-region').value;
            const scopeToMpe = document.getElementById('delete-scopeToMpe').checked;
            const deleteLogs = document.getElementById('delete-deleteLogs').checked;

            let valid = true;
            if (!region) {
                document.getElementById('delete-region-error').style.display = 'block';
                valid = false;
            } else {
                document.getElementById('delete-region-error').style.display = 'none';
            }

            let selectedMpes = [];
            if (scopeToMpe) {
                const inputs = [...document.getElementById('delete-mpeList').querySelectorAll('.delete-mpe-input')];
                selectedMpes = inputs
                    .map(el => el.value.trim())
                    .filter(v => DELETE_MPE_REGEX.test(v))
                    .map(v => 'mig' + v);
                const hasInvalid = inputs.some(el => el.value.trim() && !DELETE_MPE_REGEX.test(el.value.trim()));
                inputs.forEach(el => {
                    const bad = el.value.trim() && !DELETE_MPE_REGEX.test(el.value.trim());
                    el.classList.toggle('error', bad);
                });
                if (selectedMpes.length === 0 || hasInvalid) {
                    document.getElementById('delete-mpe-error').style.display = 'block';
                    valid = false;
                } else {
                    document.getElementById('delete-mpe-error').style.display = 'none';
                }
            } else {
                document.getElementById('delete-mpe-error').style.display = 'none';
            }
            if (!valid) return;

            window._deleteReview = { region, scopeToMpe, deleteLogs, selectedMpes };
            deleteRenderReview(window._deleteReview);

            document.getElementById('delete-confirmInput').value = '';
            document.getElementById('delete-confirm-error').style.display = 'none';
            deleteSetStep(2);
        }

        function deleteRenderReview(cfg) {
            const yes = t('rv_yes');
            const no = t('rv_no');
            const scopeLabel = cfg.scopeToMpe
                ? t('ui_delete_scope_specific') + ': ' + cfg.selectedMpes.join(', ')
                : t('ui_delete_scope_all');
            const bucketLabel = cfg.scopeToMpe
                ? t('ui_delete_bucket_conditional')
                : t('ui_delete_bucket_yes');

            const rows = [
                [t('ui_editor_region'), cfg.region],
                [t('ui_delete_scope_title'), scopeLabel],
                [t('ui_delete_optin_bucket'), bucketLabel],
                [t('ui_delete_optin_logs'), cfg.deleteLogs ? yes : no],
            ];
            // Safe DOM construction: v may contain user-controlled values
            // (MPE IDs, region strings) so use textContent rather than
            // innerHTML template-literal interpolation. Preserves the
            // delete-review styles (padding 10px 12px, v-cell font-weight
            // 600). (§1.94, 21.0.6)
            const deleteTable = document.getElementById('delete-reviewTable');
            deleteTable.replaceChildren();
            rows.forEach(([k, v], i) => {
                const tr = document.createElement('tr');
                tr.style.borderBottom = '1px solid #eaeded';
                if (i % 2 === 0) tr.style.background = '#fafafa';
                const td1 = document.createElement('td');
                td1.style.padding = '10px 12px';
                td1.style.width = '40%';
                td1.style.color = '#687078';
                td1.textContent = k;
                const td2 = document.createElement('td');
                td2.style.padding = '10px 12px';
                td2.style.fontWeight = '600';
                td2.textContent = v;
                tr.append(td1, td2);
                deleteTable.appendChild(tr);
            });
        }

        function deleteGenerate() {
            const typed = document.getElementById('delete-confirmInput').value.trim();
            if (typed !== 'DELETE') {
                document.getElementById('delete-confirm-error').style.display = 'block';
                return;
            }
            document.getElementById('delete-confirm-error').style.display = 'none';

            const region = document.getElementById('delete-region').value;
            const scopeToMpe = document.getElementById('delete-scopeToMpe').checked;
            const deleteLogs = document.getElementById('delete-deleteLogs').checked;
            const mpeInputs = [...document.getElementById('delete-mpeList').querySelectorAll('.delete-mpe-input')];
            const selectedMpes = scopeToMpe
                ? mpeInputs
                    .map(el => el.value.trim())
                    .filter(v => DELETE_MPE_REGEX.test(v))
                    .map(v => 'mig' + v)
                : [];

            const mpeListShell = selectedMpes.length > 0 ? selectedMpes.map(m => `"${m}"`).join(' ') : '';
            const scopeNote = selectedMpes.length > 0
                ? `specific MPE(s): ${selectedMpes.join(', ')}`
                : 'all MAP Auto-Tagger deployments in this region';

            const script = `#!/bin/bash
# MAP 2.0 Auto-Tagger — Delete Script
# Scope: ${scopeNote}
# Region: ${region}
# Template version: ${TEMPLATE_VERSION}
#
# Deletes:
#   - All matching Stack(s) and StackSet(s) in the region
#   - S3 staging bucket — only when no map-auto-tagger-mig* deployments remain
${deleteLogs ? '#   - CloudWatch Log Groups for deleted deployments\n' : ''}#
# Preserves:
#   - map-migrated tags on already-tagged AWS resources (credits stay intact)
#   - StackSet admin/execution IAM roles (shared org scaffolding — never deleted)
${deleteLogs ? '' : '#   - CloudWatch Log Groups (audit history)\n'}set -e

REGION="${region}"
SCOPE_MPES=(${mpeListShell})
DELETE_LOGS=${deleteLogs ? 'true' : 'false'}

echo ""
echo "  ┌──────────────────────────────────────────────────────┐"
echo "  │   MAP 2.0 Auto-Tagger — Delete                        │"
echo "  │   Region: $REGION"
echo "  │   Scope: ${selectedMpes.length > 0 ? 'specific MPE(s) — ' + selectedMpes.join(', ') : 'ALL map-auto-tagger-mig* in region'}"
echo "  └──────────────────────────────────────────────────────┘"
echo ""

ACCOUNT=\$(aws sts get-caller-identity --query Account --output text)
DELETED=0
SKIPPED=0
FAILED=0

# ── Step 1: Enumerate deployments ────────────────────────────
echo "Step 1: Locating deployments..."
STACKSETS=()
STACKS=()

if [ \${#SCOPE_MPES[@]} -gt 0 ]; then
    for MPE in "\${SCOPE_MPES[@]}"; do
        if aws cloudformation describe-stack-set --region "\$REGION" --stack-set-name "map-auto-tagger-\${MPE}" > /dev/null 2>&1; then
            STACKSETS+=("map-auto-tagger-\${MPE}")
        elif aws cloudformation describe-stacks --region "\$REGION" --stack-name "map-auto-tagger-\${MPE}" > /dev/null 2>&1; then
            STACKS+=("map-auto-tagger-\${MPE}")
        else
            echo "  ⚠️  MPE '\${MPE}' — no Stack or StackSet found. Skipping."
            SKIPPED=\$((SKIPPED + 1))
        fi
    done
else
    while IFS= read -r NAME; do
        [ -n "\$NAME" ] && STACKSETS+=("\$NAME")
    done < <(aws cloudformation list-stack-sets --region "\$REGION" --status ACTIVE --query "Summaries[?starts_with(StackSetName, 'map-auto-tagger-mig')].StackSetName" --output text | tr '\\t' '\\n')
    while IFS= read -r NAME; do
        [ -n "\$NAME" ] && STACKS+=("\$NAME")
    done < <(aws cloudformation list-stacks --region "\$REGION" --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE UPDATE_ROLLBACK_COMPLETE --query "StackSummaries[?starts_with(StackName, 'map-auto-tagger-mig')].StackName" --output text | tr '\\t' '\\n')
fi

TOTAL=\$((\${#STACKSETS[@]} + \${#STACKS[@]}))
if [ \$TOTAL -eq 0 ]; then
    echo "  ⚠️  No MAP Auto-Tagger deployments found matching criteria."
    # Check for legacy pre-namespacing stack (same pattern as upgrade.sh).
    if aws cloudformation describe-stacks --region "\$REGION" --stack-name "map-auto-tagger" > /dev/null 2>&1; then
        echo ""
        echo "  Found legacy unnamespaced stack 'map-auto-tagger' in this region."
        echo "  This script targets namespaced (map-auto-tagger-mig*) deployments only."
        echo "  To remove the legacy stack manually:"
        echo "    aws cloudformation delete-stack --stack-name map-auto-tagger --region \$REGION"
        echo "    aws cloudformation wait stack-delete-complete --stack-name map-auto-tagger --region \$REGION"
    fi
    exit 0
fi
echo "  Found \${#STACKSETS[@]} StackSet(s) and \${#STACKS[@]} Stack(s) — \$TOTAL total."
for SS in "\${STACKSETS[@]}"; do echo "    • StackSet \$SS"; done
for ST in "\${STACKS[@]}"; do echo "    • Stack    \$ST"; done
echo ""

# ── Helper: delete one deployment ───────────────────────────
delete_one() {
    local KIND="\$1" NAME="\$2"
    echo "── \$KIND: \$NAME ──────────────────────────────"

    if [ "\$KIND" = "stackset" ]; then
        local INSTANCES
        INSTANCES=\$(aws cloudformation list-stack-instances --region "\$REGION" --stack-set-name "\$NAME" --query "Summaries[].[Account,Region]" --output text 2>/dev/null)
        if [ -n "\$INSTANCES" ]; then
            local REGIONS PERM_MODEL
            REGIONS=\$(echo "\$INSTANCES" | awk '{print \$2}' | sort -u | tr '\\n' ' ')
            PERM_MODEL=\$(aws cloudformation describe-stack-set --region "\$REGION" --stack-set-name "\$NAME" --query "StackSet.PermissionModel" --output text 2>/dev/null)
            local DELETE_TARGETS
            if [ "\$PERM_MODEL" = "SERVICE_MANAGED" ]; then
                local ROOT_OU
                ROOT_OU=\$(aws organizations list-roots --query "Roots[0].Id" --output text 2>/dev/null)
                echo "  SERVICE_MANAGED StackSet — targeting root OU \$ROOT_OU..."
                DELETE_TARGETS="--deployment-targets OrganizationalUnitIds=\$ROOT_OU"
            else
                local ACCOUNTS
                ACCOUNTS=\$(echo "\$INSTANCES" | awk '{print \$1}' | sort -u | tr '\\n' ' ')
                echo "  Deleting stack instances (\$(echo \$ACCOUNTS | wc -w) account(s))..."
                DELETE_TARGETS="--accounts \$ACCOUNTS"
            fi
            local OP_ID
            OP_ID=\$(aws cloudformation delete-stack-instances --region "\$REGION" --stack-set-name "\$NAME" \$DELETE_TARGETS --regions \$REGIONS --no-retain-stacks --operation-preferences "MaxConcurrentPercentage=100,FailureTolerancePercentage=100,RegionConcurrencyType=PARALLEL" --query OperationId --output text 2>&1) || { echo "  ❌ \$OP_ID"; return 1; }
            local WAIT=0
            while [ \$WAIT -lt 1800 ]; do
                local STATUS
                STATUS=\$(aws cloudformation describe-stack-set-operation --region "\$REGION" --stack-set-name "\$NAME" --operation-id "\$OP_ID" --query "StackSetOperation.Status" --output text 2>/dev/null)
                if [ "\$STATUS" = "SUCCEEDED" ]; then echo "  ✅ Instances deleted."; break
                elif [ "\$STATUS" = "FAILED" ] || [ "\$STATUS" = "STOPPED" ]; then
                    echo "  ❌ \$STATUS. Investigate: aws cloudformation describe-stack-set-operation --stack-set-name \$NAME --operation-id \$OP_ID --region \$REGION"
                    return 1
                fi
                sleep 30; WAIT=\$((WAIT + 30)); echo "  Still deleting... (\${WAIT}s)"
            done
        fi
        aws cloudformation delete-stack-set --region "\$REGION" --stack-set-name "\$NAME" && echo "  ✅ StackSet deleted." || { echo "  ❌ delete-stack-set failed."; return 1; }
    else
        aws cloudformation delete-stack --region "\$REGION" --stack-name "\$NAME"
        echo "  Waiting for deletion..."
        if aws cloudformation wait stack-delete-complete --region "\$REGION" --stack-name "\$NAME"; then
            echo "  ✅ Stack deleted."
        else
            echo "  ❌ Deletion failed. Investigate: aws cloudformation describe-stack-events --stack-name \$NAME --region \$REGION"
            return 1
        fi
    fi
    echo ""
    return 0
}

# ── Step 2: Delete all matching deployments ─────────────────
echo "Step 2: Deleting \${#STACKSETS[@]} StackSet(s) and \${#STACKS[@]} Stack(s)..."
echo ""
for NAME in "\${STACKSETS[@]}"; do
    if delete_one "stackset" "\$NAME"; then DELETED=\$((DELETED + 1)); else FAILED=\$((FAILED + 1)); fi
done
for NAME in "\${STACKS[@]}"; do
    if delete_one "stack" "\$NAME"; then DELETED=\$((DELETED + 1)); else FAILED=\$((FAILED + 1)); fi
done

# ── Step 3: S3 staging bucket (auto-decide) ─────────────────
echo "Step 3: Checking S3 staging bucket..."
BUCKET="auto-map-tagger-\${ACCOUNT}"
if ! aws s3api head-bucket --bucket "\$BUCKET" 2>/dev/null; then
    echo "  Bucket \$BUCKET not found — nothing to delete."
else
    REMAINING_SS=\$(aws cloudformation list-stack-sets --region "\$REGION" --status ACTIVE --query "Summaries[?starts_with(StackSetName, 'map-auto-tagger-mig')].StackSetName" --output text 2>/dev/null)
    REMAINING_ST=\$(aws cloudformation list-stacks --region "\$REGION" --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE UPDATE_ROLLBACK_COMPLETE --query "StackSummaries[?starts_with(StackName, 'map-auto-tagger-mig')].StackName" --output text 2>/dev/null)
    if [ -n "\$REMAINING_SS" ] || [ -n "\$REMAINING_ST" ]; then
        echo "  Other MAP Auto-Tagger deployments still use this bucket:"
        [ -n "\$REMAINING_SS" ] && echo "    StackSets: \$REMAINING_SS"
        [ -n "\$REMAINING_ST" ] && echo "    Stacks:    \$REMAINING_ST"
        echo "  Bucket \$BUCKET retained."
    else
        echo "  No MAP Auto-Tagger deployments remain. Emptying and deleting bucket..."
        aws s3 rm "s3://\$BUCKET" --recursive > /dev/null 2>&1 || true
        if aws s3api delete-bucket --bucket "\$BUCKET" --region "\$REGION" 2>/dev/null || aws s3api delete-bucket --bucket "\$BUCKET" 2>/dev/null; then
            echo "  ✅ Bucket deleted."
            DELETED=\$((DELETED + 1))
        else
            echo "  ❌ Bucket deletion failed (may contain versioned objects)."
            FAILED=\$((FAILED + 1))
        fi
    fi
fi
echo ""

# ── Step 4: Optional — CloudWatch Log Groups ────────────────
if [ "\$DELETE_LOGS" = "true" ]; then
    echo "Step 4: Deleting CloudWatch Log Groups..."
    if [ \${#SCOPE_MPES[@]} -gt 0 ]; then
        for MPE in "\${SCOPE_MPES[@]}"; do
            LOG_GROUPS=\$(aws logs describe-log-groups --region "\$REGION" --log-group-name-prefix "/aws/lambda/map-auto-tagger" --query "logGroups[?ends_with(logGroupName, '-\${MPE}')].logGroupName" --output text 2>/dev/null)
            for LG in \$LOG_GROUPS; do
                aws logs delete-log-group --region "\$REGION" --log-group-name "\$LG" 2>/dev/null && { echo "  ✅ Deleted \$LG"; DELETED=\$((DELETED + 1)); } || { echo "  ❌ Failed: \$LG"; FAILED=\$((FAILED + 1)); }
            done
        done
    else
        LOG_GROUPS=\$(aws logs describe-log-groups --region "\$REGION" --log-group-name-prefix "/aws/lambda/map-auto-tagger" --query "logGroups[].logGroupName" --output text 2>/dev/null)
        for LG in \$LOG_GROUPS; do
            aws logs delete-log-group --region "\$REGION" --log-group-name "\$LG" 2>/dev/null && { echo "  ✅ Deleted \$LG"; DELETED=\$((DELETED + 1)); } || { echo "  ❌ Failed: \$LG"; FAILED=\$((FAILED + 1)); }
        done
    fi
    echo ""
fi

# ── Summary ─────────────────────────────────────────────────
echo "  ┌──────────────────────────────────────────────────────┐"
if [ \$FAILED -gt 0 ]; then
    echo "  │   ⚠️  Delete completed with failures                  │"
    echo "  │   Deleted: \$DELETED  Skipped: \$SKIPPED  Failed: \$FAILED"
    echo "  └──────────────────────────────────────────────────────┘"
    echo ""
    echo "  Preserved: map-migrated tags, StackSet admin IAM roles"
    exit 1
else
    echo "  │   ✅ Delete complete                                  │"
    echo "  │   Deleted: \$DELETED  Skipped: \$SKIPPED"
    echo "  └──────────────────────────────────────────────────────┘"
    echo ""
    echo "  Preserved: map-migrated tags on AWS resources, StackSet admin IAM roles"
    [ "\$DELETE_LOGS" != "true" ] && echo "             CloudWatch Log Groups (audit history)"
fi
`;

            document.getElementById('delete-scriptContent').textContent = script;
            window._deleteScript = script;
            window._deleteLabel = selectedMpes.length > 0 ? selectedMpes.join('-') : 'all';

            document.getElementById('delete-instructions').textContent = deleteBuildInstructions(window._deleteReview);
            deleteSetStep(3);
        }

        function deleteBuildInstructions(cfg) {
            const scopeLine = cfg.selectedMpes.length > 0
                ? t('d_instr_scope_specific') + ' ' + cfg.selectedMpes.join(', ')
                : t('d_instr_scope_all');
            const whatDoesLine = cfg.selectedMpes.length > 0
                ? '  - ' + t('d_instr_what_scoped') + '\n'
                : '  - ' + t('d_instr_what_all') + '\n';
            const logsLine = cfg.deleteLogs ? '  - ' + t('d_instr_logs_delete') + '\n' : '';
            const logsPreserved = cfg.deleteLogs ? '' : '  - ' + t('d_instr_logs_preserve') + '\n';
            return `${t('d_instr_title')}
=========================================

${t('d_instr_region_label')} ${cfg.region}
${t('d_instr_scope_label')} ${scopeLine}
${t('d_instr_version_label')} ${TEMPLATE_VERSION}

── ${t('d_instr_opt1')} ──────────────────
${t('d_instr_opt1_step1')}
${t('d_instr_opt1_step2')}
${t('d_instr_opt1_step3')}
   bash delete.sh

── ${t('d_instr_opt2')} ──────────────────
${t('d_instr_opt2_step1')}
${t('d_instr_opt2_step2')}

─────────────────────────────────────────────────
${t('d_instr_what_title')}
${whatDoesLine}  - ${t('d_instr_what_stackset')}
  - ${t('d_instr_what_stack')}
  - ${t('d_instr_what_bucket')}
${logsLine}
${t('d_instr_preserved_title')}
  - ${t('d_instr_preserved_tags')}
  - ${t('d_instr_preserved_iam')}
${logsPreserved}
${t('d_instr_idempotent')}`;
        }

        function deleteDownload() {
            const blob = new Blob([window._deleteScript], { type: 'text/x-sh' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `delete-${window._deleteLabel}.sh`;
            a.click();
        }

        function deleteCopyInstructions() {
            navigator.clipboard.writeText(document.getElementById('delete-instructions').textContent).then(() => {
                const btn = document.querySelector('[onclick="deleteCopyInstructions()"]');
                const orig = btn.textContent;
                btn.textContent = '✓ Copied';
                setTimeout(() => { btn.textContent = orig; }, 1500);
            });
        }

