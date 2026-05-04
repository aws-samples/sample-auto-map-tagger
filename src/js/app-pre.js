        function selectMode(mode) {
            document.getElementById('landing').classList.toggle('hidden', mode !== null);
            document.getElementById('deploy-flow').classList.toggle('hidden', mode !== 'deploy');
            document.getElementById('edit-flow').classList.toggle('hidden', mode !== 'edit');
            document.getElementById('update-flow').classList.toggle('hidden', mode !== 'update');
            document.getElementById('delete-flow').classList.toggle('hidden', mode !== 'delete');
            if (mode === 'edit') editorSetStep(1);
            if (mode === 'update') updateSetStep(1);
            if (mode === 'delete') deleteSetStep(1);
            window.scrollTo(0, 0);
        }

        // --- Editor step navigation ---
        function editorSetStep(num) {
            ['estep1', 'estep2', 'estep3'].forEach((id, i) => {
                document.getElementById(id).classList.toggle('hidden', i + 1 !== num);
                const ind = document.getElementById(id + '-indicator');
                ind.classList.remove('active', 'done');
                if (i + 1 < num) ind.classList.add('done');
                if (i + 1 === num) ind.classList.add('active');
            });
            window.scrollTo(0, 0);
        }

        // --- Update step navigation ---
        function updateSetStep(num) {
            ['ustep1', 'ustep2', 'ustep3'].forEach((id, i) => {
                document.getElementById(id).classList.toggle('hidden', i + 1 !== num);
                const ind = document.getElementById(id + '-indicator');
                ind.classList.remove('active', 'done');
                if (i + 1 < num) ind.classList.add('done');
                if (i + 1 === num) ind.classList.add('active');
            });
            if (num === 1) {
                const host = document.getElementById('update-versionHistoryContent');
                if (host) host.innerHTML = renderVersionHistory();
            }
            window.scrollTo(0, 0);
        }

        function editorReview() {
            // Validate step 1 first
            const mpeRaw = document.getElementById('editor-mpeId').value.trim();
            const region = document.getElementById('editor-region').value;
            const actionEl = document.querySelector('input[name="editor-action"]:checked');
            const actionVal = actionEl ? actionEl.value : null;
            const listId = actionVal === 'remove' ? 'editor-remove-accountList' : 'editor-add-accountList';
            const errorId = actionVal === 'remove' ? 'editor-remove-account-error' : 'editor-account-error';
            const allInputs = [...document.getElementById(listId).querySelectorAll('.editor-account-input')];
            const accounts = allInputs.map(el => el.value.trim()).filter(v => /^\d{12}$/.test(v));
            const hasInvalid = allInputs.some(el => el.value.trim() && !/^\d{12}$/.test(el.value.trim()));

            let valid = true;

            if (!/^(?=.*[A-Z])(?=.*[0-9])[A-Z0-9]{10}$/.test(mpeRaw)) {
                document.getElementById('editor-mpeId').classList.add('error');
                document.getElementById('editor-mpeId-error').style.display = 'block';
                valid = false;
            } else {
                document.getElementById('editor-mpeId').classList.remove('error');
                document.getElementById('editor-mpeId-error').style.display = 'none';
            }

            if (!region) {
                document.getElementById('editor-region').classList.add('error');
                document.getElementById('editor-region-error').style.display = 'block';
                valid = false;
            } else {
                document.getElementById('editor-region').classList.remove('error');
                document.getElementById('editor-region-error').style.display = 'none';
            }

            if (!actionVal) {
                document.getElementById('editor-opt-add').style.outline = '2px solid #d13212';
                document.getElementById('editor-opt-remove').style.outline = '2px solid #d13212';
                valid = false;
            } else {
                document.getElementById('editor-opt-add').style.outline = '';
                document.getElementById('editor-opt-remove').style.outline = '';
            }

            allInputs.forEach(el => {
                const bad = el.value.trim() && !/^\d{12}$/.test(el.value.trim());
                el.classList.toggle('error', bad);
                el.title = bad ? t('err_account_format') : '';
            });
            if (accounts.length === 0 || hasInvalid) {
                document.getElementById(errorId).style.display = 'block';
                const errKey = hasInvalid ? 'err_account_format' : 'err_editor_account';
                document.getElementById(errorId).setAttribute('data-i18n', errKey);
                document.getElementById(errorId).textContent = t(errKey);
                valid = false;
            } else {
                document.getElementById(errorId).style.display = 'none';
            }

            if (!valid) return;

            // Build review table
            const mpe = 'mig' + mpeRaw;
            const action = actionVal || '';
            const backfill = document.getElementById('editor-includeBackfill').checked && action === 'add';
            const table = document.getElementById('editor-reviewTable');
            const rows = [
                [t('ui_mpe_tag'), mpe],
                [t('ui_editor_region'), region],
                [t('ui_editor_action_title'), action === 'add' ? t('ui_editor_add_title') : t('ui_editor_remove_title')],
                [t('ui_editor_review_accounts'), accounts.join(', ')],
            ];
            if (action === 'add') rows.push([t('ui_backfill_title'), backfill ? t('rv_backfill_enabled') : t('rv_disabled')]);
            // Safe DOM construction: v may contain user-controlled values
            // (customer name, account IDs) so use textContent rather than
            // innerHTML template-literal interpolation. (§1.94, 21.0.6)
            table.replaceChildren();
            rows.forEach(([k, v], i) => {
                const tr = document.createElement('tr');
                tr.style.borderBottom = '1px solid #eaeded';
                if (i % 2 === 0) tr.style.background = '#fafafa';
                const td1 = document.createElement('td');
                td1.style.padding = '8px';
                td1.style.fontWeight = '600';
                td1.style.width = '40%';
                td1.style.color = '#687078';
                td1.textContent = k;
                const td2 = document.createElement('td');
                td2.style.padding = '8px';
                td2.textContent = v;
                tr.append(td1, td2);
                table.appendChild(tr);
            });

            // Reset confirm checkbox
            document.getElementById('editor-confirm').checked = false;
            document.getElementById('editor-confirm-error').style.display = 'none';

            editorSetStep(2);
        }

        // --- Editor functions ---
        function editorSelectAction(action) {
            document.querySelector(`input[name="editor-action"][value="${action}"]`).checked = true;
            document.getElementById('editor-opt-add').classList.toggle('selected', action === 'add');
            document.getElementById('editor-opt-remove').classList.toggle('selected', action === 'remove');
            document.getElementById('editor-opt-add').style.outline = '';
            document.getElementById('editor-opt-remove').style.outline = '';
            document.getElementById('editor-add-accounts-section').classList.toggle('hidden', action !== 'add');
            document.getElementById('editor-remove-accounts-section').classList.toggle('hidden', action !== 'remove');
        }

        // --- Update flow handlers ---
        function updateToggleScope() {
            const checked = document.getElementById('update-scopeToMpe').checked;
            document.getElementById('update-mpeSection').classList.toggle('hidden', !checked);
        }

        function updateAddMpe() {
            const list = document.getElementById('update-mpeList');
            const row = document.createElement('div');
            row.className = 'entry-row';
            row.style.cssText = 'display:flex;align-items:center;gap:8px;';
            row.innerHTML =
                '<div style="display:flex;align-items:center;gap:0;flex:1;">' +
                    '<span style="padding:8px 10px;background:#f2f3f3;border:1px solid #aab7b8;border-right:none;border-radius:4px 0 0 4px;font-size:14px;color:#687078;white-space:nowrap;">mig</span>' +
                    '<input type="text" class="update-mpe-input" placeholder="A1B2C3D4E5" maxlength="10" style="border-radius:0 4px 4px 0;" oninput="this.value=this.value.toUpperCase().replace(/[^A-Z0-9]/g,\'\')">' +
                '</div>' +
                '<button class="btn-remove" onclick="editorRemoveRow(this)" title="Remove">&times;</button>';
            list.appendChild(row);
        }

        function updateReview() {
            const region = document.getElementById('update-region').value;
            const scopeToMpe = document.getElementById('update-scopeToMpe').checked;
            const mpeInputs = [...document.getElementById('update-mpeList').querySelectorAll('.update-mpe-input')];
            const mpeRegex = /^(?=.*[A-Z])(?=.*[0-9])[A-Z0-9]{10}$/;
            const selectedMpes = scopeToMpe
                ? mpeInputs.map(el => el.value.trim()).filter(v => mpeRegex.test(v))
                : [];

            let valid = true;

            if (!region) {
                document.getElementById('update-region').classList.add('error');
                document.getElementById('update-region-error').style.display = 'block';
                valid = false;
            } else {
                document.getElementById('update-region').classList.remove('error');
                document.getElementById('update-region-error').style.display = 'none';
            }

            if (scopeToMpe) {
                const hasInvalid = mpeInputs.some(el => el.value.trim() && !mpeRegex.test(el.value.trim()));
                mpeInputs.forEach(el => {
                    const bad = el.value.trim() && !mpeRegex.test(el.value.trim());
                    el.classList.toggle('error', bad);
                });
                if (selectedMpes.length === 0 || hasInvalid) {
                    document.getElementById('update-mpe-error').style.display = 'block';
                    valid = false;
                } else {
                    document.getElementById('update-mpe-error').style.display = 'none';
                }
            } else {
                document.getElementById('update-mpe-error').style.display = 'none';
            }

            if (!valid) return;

            // Build review table
            const table = document.getElementById('update-reviewTable');
            const rows = [
                [t('ui_editor_region'), region],
                [t('ui_update_scope_review'),
                    selectedMpes.length > 0
                        ? selectedMpes.map(m => 'mig' + m).join(', ')
                        : t('ui_update_all_review')],
                [t('ui_update_target_version'), TEMPLATE_VERSION],
            ];
            // Safe DOM construction: v may contain user-controlled values
            // (MPE IDs) so use textContent rather than innerHTML template-
            // literal interpolation. (§1.94, 21.0.6)
            table.replaceChildren();
            rows.forEach(([k, v], i) => {
                const tr = document.createElement('tr');
                tr.style.borderBottom = '1px solid #eaeded';
                if (i % 2 === 0) tr.style.background = '#fafafa';
                const td1 = document.createElement('td');
                td1.style.padding = '8px';
                td1.style.fontWeight = '600';
                td1.style.width = '40%';
                td1.style.color = '#687078';
                td1.textContent = k;
                const td2 = document.createElement('td');
                td2.style.padding = '8px';
                td2.textContent = v;
                tr.append(td1, td2);
                table.appendChild(tr);
            });

            document.getElementById('update-confirm').checked = false;
            document.getElementById('update-confirm-error').style.display = 'none';

            updateSetStep(2);
        }

        function updateGenerate() {
            if (!document.getElementById('update-confirm').checked) {
                document.getElementById('update-confirm-error').style.display = 'block';
                return;
            }
            document.getElementById('update-confirm-error').style.display = 'none';

            const region = document.getElementById('update-region').value;
            editorGenerateUpgrade(region);
        }

        function updateDownload() {
            const blob = new Blob([window._upgradeScript], { type: 'text/x-sh' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `upgrade-${window._upgradeMpe}.sh`;
            a.click();
        }

        function updateCopyInstructions() {
            navigator.clipboard.writeText(document.getElementById('update-instructions').textContent).then(() => {
                const btn = document.querySelector('[onclick="updateCopyInstructions()"]');
                const orig = btn.textContent;
                btn.textContent = '✓ Copied';
                setTimeout(() => { btn.textContent = orig; }, 1500);
            });
        }

        // --- Delete flow ---
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

        function editorAddAccount(type) {
            const listId = type === 'remove' ? 'editor-remove-accountList' : 'editor-add-accountList';
            const list = document.getElementById(listId);
            const row = document.createElement('div');
            row.className = 'entry-row';
            row.innerHTML = '<input type="text" class="editor-account-input" placeholder="123456789012" maxlength="12"><button class="btn-remove" onclick="editorRemoveRow(this)" title="Remove">&times;</button>';
            list.appendChild(row);
            const input = row.querySelector('input');
            input.addEventListener('blur',  () => editorValidateAccount(input));
            input.addEventListener('input', () => editorValidateAccount(input));
        }

        function editorValidateAccount(input) {
            const val = input.value.trim();
            const bad = val && !/^\d{12}$/.test(val);
            input.classList.toggle('error', bad);
            input.title = bad ? 'Account ID must be exactly 12 digits' : '';
        }

        function editorRemoveRow(btn) {
            const list = btn.parentElement.parentElement;
            if (list.children.length > 1) btn.parentElement.remove();
        }

        function editorGenerate() {
            // Only confirmation needs checking here — all other fields validated in editorReview()
            if (!document.getElementById('editor-confirm').checked) {
                document.getElementById('editor-confirm-error').style.display = 'block';
                return;
            }
            document.getElementById('editor-confirm-error').style.display = 'none';

            const mpeRaw = document.getElementById('editor-mpeId').value.trim();
            const mpe = 'mig' + mpeRaw;
            const region = document.getElementById('editor-region').value;
            const action = document.querySelector('input[name="editor-action"]:checked').value;
            const backfill = document.getElementById('editor-includeBackfill').checked && action === 'add';
            const listId = action === 'remove' ? 'editor-remove-accountList' : 'editor-add-accountList';
            const accounts = [...document.getElementById(listId).querySelectorAll('.editor-account-input')]
                .map(el => el.value.trim())
                .filter(v => /^\d{12}$/.test(v));

            const stacksetName = `map-auto-tagger-${mpe}`;
            const accountsJson = JSON.stringify(accounts);

            const addCmds = accounts.map(id =>
                `if ! grep -q '"${id}"' "$TEMPLATE"; then\n  sed -i.bak 's|"scoped_account_ids": \\[|"scoped_account_ids": ["${id}",|' "$TEMPLATE"\nfi`
            ).join('\n');

            const removeCmds = accounts.map(id =>
                `sed -i.bak 's|"${id}"||g' "$TEMPLATE"\nsed -i.bak 's|,,|,|g; s|\\[,|[|g; s|,\\]|]|g' "$TEMPLATE"`
            ).join('\n');

            const script = `#!/bin/bash
# MAP 2.0 Auto-Tagger — Update Script
# Action: ${action} accounts | MPE: ${mpe}
# Accounts: ${accounts.join(', ')}
set -e

STACKSET_NAME="${stacksetName}"
REGION="${region}"
MPE="${mpe}"
ACTION="${action}"
ACCOUNTS_TO_MODIFY='${accountsJson}'

echo ""
echo "  ┌─────────────────────────────────────────┐"
echo "  │   MAP 2.0 Auto-Tagger — Update          │"
echo "  │   StackSet: $STACKSET_NAME"
echo "  │   Action: $ACTION"
echo "  │   Accounts: $ACCOUNTS_TO_MODIFY"
echo "  └─────────────────────────────────────────┘"
echo ""

# ── Step 1: Verify StackSet exists ────────────
echo "Step 1: Checking existing deployment..."
if ! aws cloudformation describe-stack-set --region "$REGION" --stack-set-name "$STACKSET_NAME" > /dev/null 2>&1; then
    SINGLE_STATUS=\$(aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACKSET_NAME" --query 'Stacks[0].StackStatus' --output text 2>/dev/null || echo "NONE")
    if [ "$SINGLE_STATUS" != "NONE" ] && [ "$SINGLE_STATUS" != "None" ]; then
        echo "  ⚠️  Single-account stack '$STACKSET_NAME' found (status: $SINGLE_STATUS)."
        echo "     This update tool targets multi-account StackSet deployments."
        echo "     For single-account scope changes, update SSM directly:"
        echo "       aws ssm get-parameter --name '/auto-map-tagger/$MPE/config' --region $REGION"
        echo "       # Edit the JSON, then:"
        echo "       aws ssm put-parameter --name '/auto-map-tagger/$MPE/config' --value '<new-json>' --type String --overwrite --region $REGION"
        exit 1
    fi
    echo "  ❌ No deployment '$STACKSET_NAME' found in region $REGION."
    echo "     Run the initial deploy.sh from the configurator first."
    exit 1
fi
echo "  ✅ StackSet found"

# ── Step 2: Fetch current template and update scope in place ──
echo ""
echo "Step 2: Updating account scope..."

TEMPLATE=$(mktemp /tmp/map-update-XXXX.yaml)
# Read the StackSet's live TemplateBody directly; avoids depending on the S3
# staging copy (which exists only for the initial multi-account deploy and may
# have been garbage-collected or never created for a single-account deployment
# later promoted to multi-account).
if ! aws cloudformation describe-stack-set \\
        --region "$REGION" \\
        --stack-set-name "$STACKSET_NAME" \\
        --query "StackSet.TemplateBody" \\
        --output text > "$TEMPLATE" 2>/dev/null; then
    echo "  ❌ Could not read StackSet TemplateBody. Aborting."
    rm -f "$TEMPLATE"
    exit 1
fi
if [ ! -s "$TEMPLATE" ]; then
    echo "  ❌ StackSet TemplateBody is empty. Aborting."
    rm -f "$TEMPLATE"
    exit 1
fi

echo "  Current scope:"
grep "scoped_account_ids" "$TEMPLATE" | head -1 | sed 's/.*scoped_account_ids/  scoped_account_ids/'

${action === 'add' ? addCmds : removeCmds}
rm -f "$TEMPLATE.bak"

NEW_SCOPE=$(grep -o '"scoped_account_ids": \\[[^]]*\\]' "$TEMPLATE" | head -1 | sed 's/"scoped_account_ids": //')
if ! python3 -c "import json; json.loads('$NEW_SCOPE')" 2>/dev/null; then
    echo "  ❌ Scope update produced invalid JSON: $NEW_SCOPE"
    echo "     Update SSM parameter directly instead."
    rm -f "$TEMPLATE" "$TEMPLATE.bak"
    exit 1
fi
sed -i.bak "s|ScopedAccounts: .*|ScopedAccounts: '$NEW_SCOPE'|" "$TEMPLATE"
rm -f "$TEMPLATE.bak"

echo "  Updated scope:"
grep "scoped_account_ids" "$TEMPLATE" | head -1 | sed 's/.*scoped_account_ids/  scoped_account_ids/'

# ── Step 3: Push update ──────────────────────
echo ""
echo "Step 3: Pushing update to all accounts..."

UPDATE_OUT=$(aws cloudformation update-stack-set \\
    --region "$REGION" \\
    --stack-set-name "$STACKSET_NAME" \\
    --template-body "file://$TEMPLATE" \\
    --capabilities CAPABILITY_NAMED_IAM 2>&1) || true

if echo "$UPDATE_OUT" | grep -q "No updates"; then
    echo "  StackSet already up to date"
elif echo "$UPDATE_OUT" | grep -q "OperationId"; then
    echo "  StackSet update initiated"
    WAIT=0
    while [ $WAIT -lt 600 ]; do
        STATUS=$(aws cloudformation list-stack-set-operations \\
            --region "$REGION" \\
            --stack-set-name "$STACKSET_NAME" \\
            --query "Summaries[0].Status" --output text 2>/dev/null)
        if [ "$STATUS" = "SUCCEEDED" ]; then
            echo "  ✅ Update complete — all accounts updated"
            break
        elif [ "$STATUS" = "FAILED" ]; then
            echo "  ❌ Update failed. Check:"
            echo "     aws cloudformation list-stack-instances --region $REGION --stack-set-name $STACKSET_NAME"
            break
        fi
        sleep 15
        WAIT=$((WAIT + 15))
        echo "  Still updating... (\${WAIT}s)"
    done
elif echo "$UPDATE_OUT" | grep -q "OperationInProgress"; then
    echo "  ⚠️  Another operation is in progress. Try again in a few minutes."
else
    echo "  $UPDATE_OUT"
fi
${backfill ? `
echo ""
echo "  ⏳ Backfill runs automatically as part of the StackSet update."
echo "     Check logs: aws logs tail /aws/lambda/map-auto-tagger-backfill-${mpe} --region ${region}"` : ''}

rm -f "$TEMPLATE"

echo ""
echo "  ┌─────────────────────────────────────────┐"
echo "  │   ✅ Update complete                     │"
echo "  └─────────────────────────────────────────┘"
`;

            document.getElementById('editor-scriptContent').textContent = script;
            window._editorScript = script;
            window._editorMpe = mpe;

            const instructions = `UPDATE INSTRUCTIONS — MAP Auto-Tagger Account Scope
=========================================

── Option 1: AWS CloudShell (Recommended) ──────────────────
1. Log into the AWS Console for your management account.
2. Open CloudShell (click the terminal icon in the top menu bar).
3. Upload the file (CloudShell → Actions → Upload file):
     update.sh
4. Run:
   bash update.sh

── Option 2: Local AWS CLI ──────────────────────────────────
1. Ensure AWS CLI v2 is installed and configured with credentials
   for the management account.
2. Download update.sh to your local machine.
3. Open a terminal in the folder containing update.sh.
4. Run:
   bash update.sh

─────────────────────────────────────────────────
The script handles everything automatically:
  - Verifies the existing StackSet deployment
  - Updates the account scope parameter
  - Pushes the update to all accounts in the org
${action === 'add' && backfill ? `  - Re-runs backfill for newly added accounts (CloudTrail, last 90 days)\n` : ''}
Check update status:
   aws cloudformation list-stack-instances \\
     --stack-set-name map-auto-tagger-${mpe} \\
     --query "Summaries[*].[Account,Region,StackInstanceStatus.DetailedStatus]" \\
     --output table
   # Expected: SUCCEEDED for all accounts

Note: Only resources created AFTER this update will be tagged in newly added accounts
(unless backfill is enabled). Existing tags on removed accounts are not affected.`;

            document.getElementById('editor-instructions').textContent = instructions;
            editorSetStep(3);
        }

        function editorGenerateUpgrade(region) {
            const scopeToMpe = document.getElementById('update-scopeToMpe').checked;
            const mpeInputs = [...document.getElementById('update-mpeList').querySelectorAll('.update-mpe-input')];
            const mpeRegex = /^(?=.*[A-Z])(?=.*[0-9])[A-Z0-9]{10}$/;
            const selectedMpes = scopeToMpe
                ? mpeInputs.map(el => 'mig' + el.value.trim()).filter(m => mpeRegex.test(m.slice(3)))
                : [];

            // Generate two baked templates (with + without backfill) using a placeholder
            // MPE ID so the shell can sed-substitute the real MPE at runtime. Auto-detect
            // of backfill presence in the stack picks the right variant.
            const PLACEHOLDER = 'migUPGRADEPLACE';
            const placeholderConfig = {
                mpeId: PLACEHOLDER,
                deployMode: 'single',
                scopeMode: 'account',
                useAccountScope: false,
                stacksetAccounts: [],
                scopedVpcIds: [],
                tagNonVpcServices: true,
                alertEmail: '',
                customerName: '',
                includeBackfill: false,
                // Dates are irrelevant at upgrade time — the ParameterKey=X,UsePreviousValue=true
                // list built below reuses the deployed values. Use a valid date format so the
                // Default matches AllowedPattern.
                agreementDate: '1900-01-01',
                agreementEndDate: '2099-12-31',
            };
            const tmplNoBackfill = generateMainTemplate(placeholderConfig);
            const tmplWithBackfill = generateMainTemplate(Object.assign({}, placeholderConfig, { includeBackfill: true }));

            const mpeListShell = selectedMpes.length > 0
                ? selectedMpes.map(m => `"${m}"`).join(' ')
                : '';
            const scopeNote = selectedMpes.length > 0
                ? `specific MPE(s): ${selectedMpes.join(', ')}`
                : 'all MAP Auto-Tagger deployments found in this account';

            const script = `#!/bin/bash
# MAP 2.0 Auto-Tagger — Upgrade Script
# Target template version: ${TEMPLATE_VERSION}
# Scope: ${scopeNote}
# Region: ${region}
#
# Behavior:
#   - Auto-detects single-account stacks and multi-account StackSets matching
#     map-auto-tagger-mig*.
#   - Reads each deployment's current version from SSM Parameter Store
#     (/auto-map-tagger/<mpe>/version) and compares to the target.
#   - Refuses cross-MAJOR upgrades (e.g. v19 → v21) without --force.
#   - Warns on downgrade; requires --force to proceed.
#   - Detects presence of the backfill Lambda in the stack and picks the
#     matching baked template variant (backfill config is preserved).
#   - Applies full template replacement via update-stack / update-stack-set
#     with each existing parameter preserved (ParameterKey=X,UsePreviousValue=true).
#   - For StackSets, uses OperationPreferences {Max=100%, Tolerance=100%,
#     RegionConcurrency=PARALLEL} for parallel per-account rollout.
set -e

TARGET_VERSION="${TEMPLATE_VERSION}"
REGION="${region}"
SCOPE_MPES=(${mpeListShell})
FORCE="\${1:-}"

echo ""
echo "  ┌──────────────────────────────────────────────────────┐"
echo "  │   MAP 2.0 Auto-Tagger — Upgrade                       │"
echo "  │   Target version: $TARGET_VERSION"
echo "  │   Region: $REGION"
echo "  │   Scope: ${selectedMpes.length > 0 ? 'specific MPE(s) — ' + selectedMpes.join(', ') : 'all MAP Auto-Tagger deployments in this account'}"
echo "  └──────────────────────────────────────────────────────┘"
echo ""

if [ "$FORCE" = "--force" ]; then
    echo "  ⚠️  --force flag set — version guard will not block cross-major / downgrade."
    echo ""
fi

ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
BUCKET="auto-map-tagger-\${ACCOUNT}"

# ── Step 1: Enumerate deployments ────────────────────────────
echo "Step 1: Scanning for MAP Auto-Tagger deployments..."

STACKSETS=()
STACKS=()

if [ \${#SCOPE_MPES[@]} -gt 0 ]; then
    for MPE in "\${SCOPE_MPES[@]}"; do
        if aws cloudformation describe-stack-set --region "$REGION" --stack-set-name "map-auto-tagger-\${MPE}" > /dev/null 2>&1; then
            STACKSETS+=("map-auto-tagger-\${MPE}")
        elif aws cloudformation describe-stacks --region "$REGION" --stack-name "map-auto-tagger-\${MPE}" > /dev/null 2>&1; then
            STACKS+=("map-auto-tagger-\${MPE}")
        else
            echo "  ⚠️  MPE '\${MPE}' — no StackSet or Stack found with name 'map-auto-tagger-\${MPE}' in $REGION. Skipping."
        fi
    done
else
    while IFS= read -r NAME; do
        [ -n "$NAME" ] && STACKSETS+=("$NAME")
    done < <(aws cloudformation list-stack-sets --region "$REGION" --status ACTIVE --query "Summaries[?starts_with(StackSetName, 'map-auto-tagger-mig')].StackSetName" --output text | tr '\\t' '\\n')
    while IFS= read -r NAME; do
        [ -n "$NAME" ] && STACKS+=("$NAME")
    done < <(aws cloudformation list-stacks --region "$REGION" --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE UPDATE_ROLLBACK_COMPLETE --query "StackSummaries[?starts_with(StackName, 'map-auto-tagger-mig')].StackName" --output text | tr '\\t' '\\n')
fi

TOTAL=\$((\${#STACKSETS[@]} + \${#STACKS[@]}))
if [ $TOTAL -eq 0 ]; then
    echo "  ⚠️  No MAP Auto-Tagger deployments found matching criteria. Exiting."
    exit 0
fi

echo "  Found \${#STACKSETS[@]} StackSet(s) and \${#STACKS[@]} Stack(s) — $TOTAL total."
for SS in "\${STACKSETS[@]}"; do echo "    • StackSet $SS"; done
for ST in "\${STACKS[@]}"; do echo "    • Stack    $ST"; done
echo ""

# ── Step 2: Write baked templates to disk ──────────────────────
echo "Step 2: Preparing upgrade templates (version $TARGET_VERSION)..."
TMPL_NB=$(mktemp /tmp/map-upgrade-nobackfill-XXXX.yaml)
TMPL_BF=$(mktemp /tmp/map-upgrade-backfill-XXXX.yaml)

cat > "$TMPL_NB" <<'MAP_UPGRADE_TEMPLATE_NO_BACKFILL_EOF'
${tmplNoBackfill}
MAP_UPGRADE_TEMPLATE_NO_BACKFILL_EOF

cat > "$TMPL_BF" <<'MAP_UPGRADE_TEMPLATE_WITH_BACKFILL_EOF'
${tmplWithBackfill}
MAP_UPGRADE_TEMPLATE_WITH_BACKFILL_EOF

echo "  ✅ Templates written."
echo ""

# ── Helper: compare SemVer versions ────────────────────────────
version_parts() { echo "$1" | sed -E 's/^v//' | tr '.' ' '; }

# Strict plain three-part numeric SemVer match, no pre-release / build suffix.
# Prior behavior fell through to "patch" on malformed input because shell
# integer tests (-lt/-eq) printed an error to stderr but did not abort the
# function, leaving downgrade / cross-major checks silently misclassified.
is_valid_semver() {
    echo "$1" | grep -Eq '^v?[0-9]+\\.[0-9]+\\.[0-9]+$'
}

compare_versions() {
    # Returns: "same" | "patch" | "minor" | "major" | "downgrade" | "error"
    local FROM="$1" TO="$2"
    if ! is_valid_semver "$FROM" || ! is_valid_semver "$TO"; then
        echo "error"; return
    fi
    local FM FN FP TM TN TP
    read FM FN FP <<< "$(version_parts "$FROM")"
    read TM TN TP <<< "$(version_parts "$TO")"
    if [ "$FROM" = "$TO" ]; then echo "same"; return; fi
    if [ "$TM" -lt "$FM" ] || { [ "$TM" -eq "$FM" ] && [ "$TN" -lt "$FN" ]; } || { [ "$TM" -eq "$FM" ] && [ "$TN" -eq "$FN" ] && [ "$TP" -lt "$FP" ]; }; then
        echo "downgrade"; return
    fi
    if [ "$TM" -gt "$FM" ]; then echo "major"; return; fi
    if [ "$TN" -gt "$FN" ]; then echo "minor"; return; fi
    echo "patch"
}

# ── Helper: upgrade a single deployment ────────────────────────
upgrade_one() {
    local KIND="$1"       # "stack" or "stackset"
    local NAME="$2"       # full name including mpe suffix
    local MPE="\${NAME#map-auto-tagger-}"

    echo "── $KIND: $NAME ──────────────────────────────"

    # Read current version from SSM. Deployments from before version visibility
    # (added in a v20 MINOR release) have no such param — treat them as pre-target
    # and allow the upgrade without running the SemVer guard.
    local CURRENT
    CURRENT=$(aws ssm get-parameter --region "$REGION" --name "/auto-map-tagger/\${MPE}/version" --query Parameter.Value --output text 2>/dev/null || echo "unknown")

    if [ "$CURRENT" = "unknown" ]; then
        echo "  ⚠️  No version parameter found in SSM — deployment predates version visibility."
        echo "     Proceeding with upgrade (SemVer guard skipped)."
    else
        local CMP
        CMP=$(compare_versions "$CURRENT" "$TARGET_VERSION")
        echo "  Current: $CURRENT → Target: $TARGET_VERSION ($CMP)"

        if [ "$CMP" = "error" ] && [ "$FORCE" != "--force" ]; then
            echo "  ❌ Could not parse SemVer for comparison (current=$CURRENT, target=$TARGET_VERSION)."
            echo "     Expected vMAJOR.MINOR.PATCH. Re-run with --force to override the guard."
            return 1
        fi

        if [ "$CMP" = "same" ]; then
            echo "  ✅ Already on target version. Skipping."
            return 0
        fi

        if [ "$CMP" = "downgrade" ] && [ "$FORCE" != "--force" ]; then
            echo "  ❌ Downgrade detected ($CURRENT → $TARGET_VERSION). Refusing."
            echo "     Re-run with --force to override."
            return 1
        fi

        if [ "$CMP" = "major" ] && [ "$FORCE" != "--force" ]; then
            echo "  ❌ Cross-MAJOR upgrade detected ($CURRENT → $TARGET_VERSION). Refusing."
            echo "     MAJOR bumps per SemVer may require customer action (see CHANGELOG.md)."
            echo "     Re-run with --force to override, or upgrade through intermediate MAJOR versions."
            return 1
        fi
    fi

    # Detect backfill presence in the stack to pick the matching template variant
    local HAS_BACKFILL="false"
    if [ "$KIND" = "stackset" ]; then
        if aws cloudformation describe-stack-set --region "$REGION" --stack-set-name "$NAME" --query "StackSet.TemplateBody" --output text 2>/dev/null | grep -q 'BackfillFunction'; then
            HAS_BACKFILL="true"
        fi
    else
        if aws cloudformation describe-stack-resources --region "$REGION" --stack-name "$NAME" --query "StackResources[?LogicalResourceId=='BackfillFunction'].LogicalResourceId" --output text 2>/dev/null | grep -q 'BackfillFunction'; then
            HAS_BACKFILL="true"
        fi
    fi

    local SRC_TMPL
    if [ "$HAS_BACKFILL" = "true" ]; then
        SRC_TMPL="$TMPL_BF"
        echo "  Backfill detected in existing stack → using with-backfill template variant."
    else
        SRC_TMPL="$TMPL_NB"
        echo "  No backfill in existing stack → using no-backfill template variant."
    fi

    # MPE-substitute the placeholder
    local TMPL=\$(mktemp /tmp/map-upgrade-${PLACEHOLDER}-XXXX.yaml)
    sed "s|${PLACEHOLDER}|\${MPE}|g" "$SRC_TMPL" > "$TMPL"

    # Parameter preservation: build a --parameters list with UsePreviousValue=true
    # for every parameter the existing stack/stack-set declares. AWS CLI v2 has NO
    # --use-previous-parameters flag (only --use-previous-template, different thing);
    # passing that flag fails with "Unknown options". The per-parameter form below
    # is the documented equivalent.
    #
    # We also avoid listing parameters the current stack doesn't declare (e.g. a
    # pre-ReconciliationInterval stack upgrading to a template that adds it).
    # CFN picks up the new template's Default for parameters omitted from the
    # --parameters list, which is the intended behavior for newly-added params.
    local PARAM_KEYS
    if [ "$KIND" = "stackset" ]; then
        PARAM_KEYS=$(aws cloudformation describe-stack-set \\
            --region "$REGION" --stack-set-name "$NAME" \\
            --query "StackSet.Parameters[].ParameterKey" --output text 2>/dev/null)
    else
        PARAM_KEYS=$(aws cloudformation describe-stacks \\
            --region "$REGION" --stack-name "$NAME" \\
            --query "Stacks[0].Parameters[].ParameterKey" --output text 2>/dev/null)
    fi
    if [ -z "$PARAM_KEYS" ]; then
        echo "  ⚠️  Could not enumerate existing parameters for $NAME. Aborting."
        rm -f "$TMPL"
        return 1
    fi
    local PREV_PARAMS=""
    for K in $PARAM_KEYS; do
        PREV_PARAMS="$PREV_PARAMS ParameterKey=$K,UsePreviousValue=true"
    done

    if [ "$KIND" = "stackset" ]; then
        echo "  Pushing StackSet update (parallel rollout, 100% tolerance)..."
        local OUT
        OUT=$(aws cloudformation update-stack-set \\
            --region "$REGION" \\
            --stack-set-name "$NAME" \\
            --template-body "file://$TMPL" \\
            --parameters $PREV_PARAMS \\
            --capabilities CAPABILITY_NAMED_IAM \\
            --operation-preferences "MaxConcurrentPercentage=100,FailureTolerancePercentage=100,RegionConcurrencyType=PARALLEL" \\
            2>&1) || true

        if echo "$OUT" | grep -q "No updates"; then
            echo "  ✅ StackSet already matches target template. SSM version will be refreshed."
        elif echo "$OUT" | grep -q "OperationId"; then
            echo "  StackSet update initiated. Polling (up to 30 min)..."
            local WAIT=0
            while [ $WAIT -lt 1800 ]; do
                local STATUS
                STATUS=$(aws cloudformation list-stack-set-operations --region "$REGION" --stack-set-name "$NAME" --query "Summaries[0].Status" --output text 2>/dev/null)
                if [ "$STATUS" = "SUCCEEDED" ]; then
                    echo "  ✅ StackSet upgrade complete."
                    break
                elif [ "$STATUS" = "FAILED" ] || [ "$STATUS" = "STOPPED" ]; then
                    echo "  ❌ Update failed. Per-account status:"
                    aws cloudformation list-stack-instances --region "$REGION" --stack-set-name "$NAME" --query "Summaries[?StackInstanceStatus.DetailedStatus!=\\\`SUCCEEDED\\\`].[Account,Region,StackInstanceStatus.DetailedStatus,StatusReason]" --output table
                    rm -f "$TMPL"
                    return 1
                fi
                sleep 30
                WAIT=$((WAIT + 30))
                echo "  Still updating... (\${WAIT}s)"
            done
        elif echo "$OUT" | grep -q "OperationInProgress"; then
            echo "  ⚠️  Another operation is in progress on this StackSet. Try again in a few minutes."
            rm -f "$TMPL"
            return 1
        else
            echo "  $OUT"
            rm -f "$TMPL"
            return 1
        fi
    else
        echo "  Pushing Stack update..."
        local OUT
        OUT=$(aws cloudformation update-stack \\
            --region "$REGION" \\
            --stack-name "$NAME" \\
            --template-body "file://$TMPL" \\
            --parameters $PREV_PARAMS \\
            --capabilities CAPABILITY_NAMED_IAM \\
            2>&1) || true

        if echo "$OUT" | grep -q "No updates"; then
            echo "  ✅ Stack already matches target template. SSM version will be refreshed."
        elif echo "$OUT" | grep -q "StackId"; then
            echo "  Stack update initiated. Waiting (up to 30 min)..."
            aws cloudformation wait stack-update-complete --region "$REGION" --stack-name "$NAME" || {
                echo "  ❌ Stack update failed."
                aws cloudformation describe-stack-events --region "$REGION" --stack-name "$NAME" --query "StackEvents[?ResourceStatus=='UPDATE_FAILED'].[LogicalResourceId,ResourceStatusReason]" --output table | head -20
                rm -f "$TMPL"
                return 1
            }
            echo "  ✅ Stack upgrade complete."
        else
            echo "  $OUT"
            rm -f "$TMPL"
            return 1
        fi
    fi

    rm -f "$TMPL"
    echo ""
    return 0
}

# ── Step 3: Process all deployments ────────────────────────────
echo "Step 3: Upgrading \${#STACKSETS[@]} StackSet(s) and \${#STACKS[@]} Stack(s)..."
echo ""

UPGRADED=0
SKIPPED=0
FAILED=0

for NAME in "\${STACKSETS[@]}"; do
    if upgrade_one "stackset" "$NAME"; then
        UPGRADED=$((UPGRADED + 1))
    else
        FAILED=$((FAILED + 1))
    fi
done

for NAME in "\${STACKS[@]}"; do
    if upgrade_one "stack" "$NAME"; then
        UPGRADED=$((UPGRADED + 1))
    else
        FAILED=$((FAILED + 1))
    fi
done

rm -f "$TMPL_NB" "$TMPL_BF"

echo ""
echo "  ┌──────────────────────────────────────────────────────┐"
if [ $FAILED -gt 0 ]; then
    echo "  │   ⚠️  Upgrade complete with failures                  │"
    echo "  │   Processed: $UPGRADED succeeded, $FAILED failed       "
    echo "  └──────────────────────────────────────────────────────┘"
    exit 1
else
    echo "  │   ✅ Upgrade complete                                 │"
    echo "  │   Processed: $UPGRADED deployment(s)                  "
    echo "  └──────────────────────────────────────────────────────┘"
fi
`;

            document.getElementById('update-scriptContent').textContent = script;
            window._upgradeScript = script;
            window._upgradeMpe = selectedMpes.length > 0 ? selectedMpes.join('-') : 'all';

            const instructions = `UPGRADE INSTRUCTIONS — MAP Auto-Tagger ${TEMPLATE_VERSION}
=========================================

Target template version: ${TEMPLATE_VERSION}
Scope: ${selectedMpes.length > 0 ? 'MPE(s) — ' + selectedMpes.join(', ') : 'all MAP Auto-Tagger deployments in this account'}
Region: ${region}

── Option 1: AWS CloudShell (Recommended) ──────────────────
1. Log into the AWS Console for the account where the MAP Auto-Tagger is deployed.
   (For multi-account deployments, this is the management account.)
2. Open CloudShell (click the terminal icon in the top menu bar).
3. Upload the file (CloudShell → Actions → Upload file):
     upgrade.sh
4. Run:
   bash upgrade.sh

   To force cross-MAJOR or downgrade:
   bash upgrade.sh --force

── Option 2: Local AWS CLI ──────────────────────────────────
1. Ensure AWS CLI v2 is installed and configured with admin credentials
   for the deployment account.
2. Download upgrade.sh to your local machine.
3. Run:
   bash upgrade.sh

─────────────────────────────────────────────────
What the script does:
  - Enumerates single-account Stacks and multi-account StackSets matching
    map-auto-tagger-mig*.
  - For each deployment, reads the current template version from SSM.
  - Compares current vs target version (SemVer):
      • same    → skip
      • patch   → proceed
      • minor   → proceed
      • major   → refuse (unless --force)
      • downgrade → refuse (unless --force)
  - Detects whether the stack has the backfill Lambda and picks the
    matching template variant. Backfill setting is preserved.
  - Applies the upgrade while preserving every current parameter value
    (scope, agreement dates, VPC config) via per-parameter UsePreviousValue=true.
  - For StackSets: parallel rollout (100% tolerance, region PARALLEL) —
    accounts update in parallel per AWS limit.

Check status after the script runs:
   aws ssm get-parameter --name /auto-map-tagger/<mpe>/version --query Parameter.Value
   # Expected: ${TEMPLATE_VERSION}

Note: the new template is bundled inside this upgrade.sh. No outbound
network calls are made from your environment during the upgrade.`;

            document.getElementById('update-instructions').textContent = instructions;
            updateSetStep(3);
        }

        function editorDownload() {
            const blob = new Blob([window._editorScript], { type: 'text/x-sh' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `update-${window._editorMpe}.sh`;
            a.click();
        }

        function editorCopyInstructions() {
            navigator.clipboard.writeText(document.getElementById('editor-instructions').textContent).then(() => {
                const btn = document.querySelector('[onclick="editorCopyInstructions()"]');
                const orig = btn.textContent;
                btn.textContent = '✅ Copied!';
                setTimeout(() => { btn.textContent = orig; }, 2000);
            });
        }

        // --- UI State ---
        document.addEventListener('DOMContentLoaded', () => {
            const firstVpc = document.querySelector('.vpc-input');
            if (firstVpc) {
                firstVpc.addEventListener('blur', () => validateVpcInput(firstVpc));
                firstVpc.addEventListener('input', () => validateVpcInput(firstVpc));
            }
            const firstAcct = document.querySelector('.stackset-account-id');
            if (firstAcct) {
                firstAcct.addEventListener('blur', () => validateAccountInput(firstAcct));
                firstAcct.addEventListener('input', () => validateAccountInput(firstAcct));
            }
            // Editor: wire up first account input and MPE field
            document.querySelectorAll('.editor-account-input').forEach(input => {
                input.addEventListener('blur',  () => editorValidateAccount(input));
                input.addEventListener('input', () => editorValidateAccount(input));
            });
            const editorMpe = document.getElementById('editor-mpeId');
            if (editorMpe) {
                editorMpe.addEventListener('blur', () => {
                    const val = editorMpe.value.trim();
                    const bad = val && !/^(?=.*[A-Z])(?=.*[0-9])[A-Z0-9]{10}$/.test(val);
                    editorMpe.classList.toggle('error', bad);
                    document.getElementById('editor-mpeId-error').style.display = bad ? 'block' : 'none';
                });
            }
        });

        function selectDeployMode(mode) {
            document.querySelector(`input[name="deployMode"][value="${mode}"]`).checked = true;
            document.getElementById('opt-single').classList.toggle('selected', mode === 'single');
            document.getElementById('opt-multi').classList.toggle('selected', mode === 'multi');
            document.getElementById('opt-single').style.outline = '';
            document.getElementById('opt-multi').style.outline = '';
            document.getElementById('multi-account-options').classList.toggle('hidden', mode !== 'multi');
            document.getElementById('single-account-options').classList.toggle('hidden', mode !== 'single');
            document.getElementById('prereq-multi').style.display = mode === 'multi' ? 'block' : 'none';
        }

        function toggleVpcScope() {
            document.getElementById('vpc-scope-fields').classList.toggle('hidden', !document.getElementById('useVpcScope').checked);
            updateBackfillScopeNote();
        }

        function toggleAccountScope() {
            document.getElementById('account-scope-fields').classList.toggle('hidden', !document.getElementById('useAccountScope').checked);
            updateBackfillScopeNote();
        }

        function updateBackfillScopeNote() {
            const note = document.getElementById('backfill-scope-note');
            if (!note) return;
            const vpcScoped = document.getElementById('useVpcScope') && document.getElementById('useVpcScope').checked;
            const acctScoped = document.getElementById('useAccountScope') && document.getElementById('useAccountScope').checked;
            if (vpcScoped || acctScoped) {
                note.textContent = t('ui_backfill_scope_note');
                note.style.display = 'block';
            } else {
                note.style.display = 'none';
            }
        }

        // --- Dynamic lists ---
        function validateVpcInput(input) {
            const v = input.value.trim();
            if (v && !/^vpc-[0-9a-f]{8,17}$/.test(v)) {
                input.style.borderColor = '#d13212';
                input.title = t('err_vpc_format');
            } else {
                input.style.borderColor = '';
                input.title = '';
            }
        }

        function validateAccountInput(input) {
            const v = input.value.trim();
            if (v && !/^\d{12}$/.test(v)) {
                input.style.borderColor = '#d13212';
                input.title = t('err_account_format');
            } else {
                input.style.borderColor = '';
                input.title = '';
            }
        }

        function addStacksetAccount() {
            const list = document.getElementById('stacksetAccountList');
            const row = document.createElement('div');
            row.className = 'entry-row';
            const idInput = document.createElement('input');
            idInput.type = 'text'; idInput.className = 'stackset-account-id';
            idInput.placeholder = '123456789012'; idInput.maxLength = 12;
            idInput.addEventListener('blur', () => validateAccountInput(idInput));
            idInput.addEventListener('input', () => validateAccountInput(idInput));
            const labelInput = document.createElement('input');
            labelInput.type = 'text'; labelInput.className = 'account-label';
            labelInput.placeholder = 'e.g., Prod Account';
            const btn = document.createElement('button');
            btn.className = 'btn-remove'; btn.title = 'Remove';
            btn.onclick = function(){ removeEntry(this); };
            btn.textContent = '×';
            row.appendChild(idInput); row.appendChild(labelInput); row.appendChild(btn);
            list.appendChild(row);
        }

        function addVpc() {
            const list = document.getElementById('vpcList');
            const row = document.createElement('div');
            row.className = 'entry-row';
            const input = document.createElement('input');
            input.type = 'text'; input.className = 'vpc-input';
            input.placeholder = 'vpc-0abc1234def56789';
            input.addEventListener('blur', () => validateVpcInput(input));
            input.addEventListener('input', () => validateVpcInput(input));
            const btn = document.createElement('button');
            btn.className = 'btn-remove'; btn.title = 'Remove';
            btn.onclick = function(){ removeEntry(this); };
            btn.textContent = '×';
            row.appendChild(input); row.appendChild(btn);
            list.appendChild(row);
        }

        function addRegion() {
            const list = document.getElementById('regionList');
            const firstSelect = list.querySelector('.region-select');
            const selected = new Set([...list.querySelectorAll('.region-select')].map(s => s.value).filter(v => v));
            const select = document.createElement('select');
            select.className = 'region-select';
            [...firstSelect.options].forEach(opt => {
                if (!selected.has(opt.value)) {
                    select.appendChild(opt.cloneNode(true));
                }
            });
            const btn = document.createElement('button');
            btn.className = 'btn-remove'; btn.title = 'Remove'; btn.onclick = function(){ removeEntry(this); };
            btn.textContent = '×';
            const row = document.createElement('div');
            row.className = 'entry-row';
            row.appendChild(select); row.appendChild(btn);
            list.appendChild(row);
        }

        function addSingleRegion() {
            const list = document.getElementById('singleRegionList');
            const firstSelect = list.querySelector('.region-select');
            const selected = new Set([...list.querySelectorAll('.region-select')].map(s => s.value).filter(v => v));
            const select = document.createElement('select');
            select.className = 'region-select';
            [...firstSelect.options].forEach(opt => {
                if (!selected.has(opt.value)) {
                    select.appendChild(opt.cloneNode(true));
                }
            });
            const btn = document.createElement('button');
            btn.className = 'btn-remove'; btn.title = 'Remove'; btn.onclick = function(){ removeEntry(this); };
            btn.textContent = '×';
            const row = document.createElement('div');
            row.className = 'entry-row';
            row.appendChild(select); row.appendChild(btn);
            list.appendChild(row);
        }

        function removeEntry(btn) {
            const list = btn.parentElement.parentElement;
            if (list.children.length > 1) btn.parentElement.remove();
        }

        function getValues(selector) {
            return Array.from(document.querySelectorAll(selector)).map(i => i.value.trim()).filter(v => v);
        }


        // --- Validation ---
        function isValidCalendarDate(dateStr) {
            if (!dateStr) return false;
            const [y, m, d] = dateStr.split('-').map(Number);
            const dt = new Date(y, m - 1, d);
            return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
        }

        function validate() {
            let valid = true;
            const mpeId = document.getElementById('mpeId').value.trim();
            const date = document.getElementById('agreementDate').value;

            if (!/^[A-Z0-9]+$/.test(mpeId) || mpeId.length < 1 || mpeId.length > 44) {
                document.getElementById('mpeId').classList.add('error');
                document.getElementById('mpeId-error').style.display = 'block';
                valid = false;
            } else {
                document.getElementById('mpeId').classList.remove('error');
                document.getElementById('mpeId-error').style.display = 'none';
            }

            if (!date || !isValidCalendarDate(date)) {
                document.getElementById('agreementDate').classList.add('error');
                document.getElementById('agreementDate-error').style.display = 'block';
                valid = false;
            } else {
                document.getElementById('agreementDate').classList.remove('error');
                document.getElementById('agreementDate-error').style.display = 'none';
            }

            const endDate = document.getElementById('agreementEndDate').value;
            if (!endDate || !isValidCalendarDate(endDate) || endDate <= date) {
                document.getElementById('agreementEndDate').classList.add('error');
                document.getElementById('agreementEndDate-error').style.display = 'block';
                valid = false;
            } else {
                document.getElementById('agreementEndDate').classList.remove('error');
                document.getElementById('agreementEndDate-error').style.display = 'none';
            }

            if (!document.querySelector('input[name="deployMode"]:checked')) {
                document.getElementById('opt-single').style.outline = '2px solid #d13212';
                document.getElementById('opt-multi').style.outline = '2px solid #d13212';
                valid = false;
            } else {
                document.getElementById('opt-single').style.outline = '';
                document.getElementById('opt-multi').style.outline = '';
            }

            // Account scope: at least one account ID required, no duplicates
            // Only validate if multi-account mode is active (checkbox may stay checked when switching modes)
            const currentMode = (document.querySelector('input[name="deployMode"]:checked') || {}).value;
            const useAcctScope = document.getElementById('useAccountScope');
            if (currentMode === 'multi' && useAcctScope && useAcctScope.checked) {
                const acctVals = getValues('.stackset-account-id').filter(v => v.trim());
                const acctErr = document.getElementById('account-scope-error');
                const dupeAcct = acctVals.length !== new Set(acctVals).size;
                const invalidAcct = acctVals.some(v => v && !/^\d{12}$/.test(v));
                document.querySelectorAll('.stackset-account-id').forEach(el => validateAccountInput(el));
                const acctKey = acctVals.length === 0 ? 'err_account_scope_required' : (invalidAcct ? 'err_account_format' : (dupeAcct ? 'err_duplicate_account' : null));
                if (acctKey) {
                    acctErr.setAttribute('data-i18n', acctKey);
                    acctErr.textContent = t(acctKey);
                    acctErr.style.display = 'block';
                    valid = false;
                } else {
                    acctErr.setAttribute('data-i18n', 'err_account_scope_required');
                    acctErr.style.display = 'none';
                }
            }

            // VPC scope: at least one VPC ID required, no duplicates
            // Only validate if single-account mode is active (checkbox may stay checked when switching modes)
            if (currentMode === 'single' && document.getElementById('useVpcScope').checked) {
                const vpcVals = getValues('.vpc-input').filter(v => v.trim());
                const vpcErr = document.getElementById('vpc-error');
                const dupeVpc = vpcVals.length !== new Set(vpcVals).size;
                const invalidVpc = vpcVals.some(v => v && !/^vpc-[0-9a-f]{8,17}$/.test(v));
                document.querySelectorAll('.vpc-input').forEach(el => validateVpcInput(el));
                const vpcKey = vpcVals.length === 0 ? 'err_vpc_required' : (invalidVpc ? 'err_vpc_format' : (dupeVpc ? 'err_duplicate_vpc' : null));
                if (vpcKey) {
                    vpcErr.setAttribute('data-i18n', vpcKey);
                    vpcErr.textContent = t(vpcKey);
                    vpcErr.style.display = 'block';
                    valid = false;
                } else {
                    vpcErr.setAttribute('data-i18n', 'err_vpc_required');
                    vpcErr.style.display = 'none';
                }
            }

            return valid;
        }

        // --- Config gathering ---
        function getConfig() {
            const deployModeEl = document.querySelector('input[name="deployMode"]:checked');
            const deployMode = deployModeEl ? deployModeEl.value : '';
            const useVpcScope = document.getElementById('useVpcScope').checked;
            const tagNonVpcServices = document.getElementById('tagNonVpcServices').checked;

            const config = {
                mpeId: 'mig' + document.getElementById('mpeId').value.trim(),
                agreementDate: document.getElementById('agreementDate').value,
                agreementEndDate: document.getElementById('agreementEndDate').value,
                alertEmail: document.getElementById('alertEmail').value.trim(),
                customerName: document.getElementById('customerName').value.trim(),
                deployMode,
                scopeMode: useVpcScope ? 'vpc' : 'account',
                scopedVpcIds: useVpcScope ? [...new Set(getValues('.vpc-input').map(v => v.trim()).filter(v => v))] : ['NONE'],
                tagNonVpcServices,
                includeBackfill: document.getElementById('includeBackfill').checked,
            };

            if (deployMode === 'single') {
                const singleRegions = getValues('#singleRegionList .region-select');
                config.regions = [...new Set(singleRegions.length > 0 ? singleRegions : ['ap-northeast-2'])];
            } else if (deployMode === 'multi') {
                config.regions = [...new Set(getValues('.region-select'))];
                config.useAccountScope = document.getElementById('useAccountScope').checked;
                const ssIds = document.querySelectorAll('.stackset-account-id');
                const ssLabels = document.querySelectorAll('.stackset-account-label');
                config.stacksetAccounts = [];
                const seenIds = new Set();
                ssIds.forEach((input, i) => {
                    const id = input.value.trim();
                    const label = ssLabels[i] ? ssLabels[i].value.trim() : '';
                    if (id && !seenIds.has(id)) {
                        seenIds.add(id);
                        config.stacksetAccounts.push({ id, label: label || id });
                    }
                });
            }

            return config;
        }

        // --- Step navigation ---
        function setStep(num) {
            ['step1', 'step2', 'step3'].forEach((id, i) => {
                document.getElementById(id).classList.toggle('hidden', i + 1 !== num);
                const ind = document.getElementById(id + '-indicator');
                ind.classList.remove('active', 'done');
                if (i + 1 < num) ind.classList.add('done');
                if (i + 1 === num) ind.classList.add('active');
            });
        }

        function backToConfig() { setStep(1); }

        // --- Review ---
        function reviewConfig() {
            if (!validate()) return;
            const config = getConfig();
            const table = document.getElementById('reviewTable');

            const rows = [
                [t('r_customer'), config.customerName || t('rv_not_specified')],
                [t('ui_mpe_tag'), config.mpeId],
                [t('ui_agree_start'), config.agreementDate],
                [t('ui_agree_end'), config.agreementEndDate],
                [t('ui_alert_email'), config.alertEmail || t('rv_none')],
                [t('ui_deploy_mode'), config.deployMode === 'single' ? t('ui_single_title') : t('ui_multi_title')],
            ];

            if (config.regions && config.regions.length > 0) {
                rows.push([t('ui_deployment_regions'), config.regions.join(', ')]);
            }

            if (config.deployMode === 'multi') {
                if (config.useAccountScope) {
                    const acctDisplay = (config.stacksetAccounts || []).map(a => `${a.id}${a.label !== a.id ? ' (' + a.label + ')' : ''}`).join('<br>');
                    rows.push([t('rv_target_accounts'), acctDisplay || t('rv_none_specified')]);
                } else {
                    rows.push([t('rv_target_accounts'), t('rv_targets_all')]);
                }
            }

            if (config.scopeMode === 'vpc') {
                rows.push([t('ui_vpc_ids'), config.scopedVpcIds.join(', ')]);
                rows.push([t('rv_tag_non_vpc'), config.tagNonVpcServices ? t('rv_yes') : t('rv_no')]);
            } else {
                rows.push([t('ui_tagging_scope'), t('rv_all_resources')]);
            }

            rows.push([t('ui_backfill_title'), config.includeBackfill ? t('rv_backfill_enabled') : t('rv_disabled')]);

            // Safe DOM construction: v may contain user-controlled values
            // (customer name, email, account IDs, VPC IDs) so use textContent
            // rather than innerHTML template-literal interpolation. Preserves
            // the main-deploy styles (width 200px, v-cell monospace 13px).
            // (§1.94, 21.0.6)
            table.replaceChildren();
            rows.forEach(([k, v]) => {
                const tr = document.createElement('tr');
                tr.style.borderBottom = '1px solid #eaeded';
                const td1 = document.createElement('td');
                td1.style.padding = '8px';
                td1.style.fontWeight = '600';
                td1.style.width = '200px';
                td1.style.verticalAlign = 'top';
                td1.textContent = k;
                const td2 = document.createElement('td');
                td2.style.padding = '8px';
                td2.style.fontFamily = 'monospace';
                td2.style.fontSize = '13px';
                td2.textContent = v;
                tr.append(td1, td2);
                table.appendChild(tr);
            });

            const desc = document.getElementById('deployDescription');
            const templateListEl = document.getElementById('templateList');

            const baseResources = `
                <tr style="border-bottom:1px solid #eaeded;"><td style="padding:8px;font-weight:600;">${t('rv_res_lambda')}</td><td style="padding:8px;">${t('rv_res_lambda_desc')}</td></tr>
                <tr style="border-bottom:1px solid #eaeded;"><td style="padding:8px;font-weight:600;">${t('rv_res_eventbridge')}</td><td style="padding:8px;">${t('rv_res_eventbridge_desc')}</td></tr>
                <tr style="border-bottom:1px solid #eaeded;"><td style="padding:8px;font-weight:600;">${t('rv_res_ssm')}</td><td style="padding:8px;">${t('rv_res_ssm_desc')}</td></tr>
                <tr style="border-bottom:1px solid #eaeded;"><td style="padding:8px;font-weight:600;">${t('rv_res_iam')}</td><td style="padding:8px;">${t('rv_res_iam_desc')}</td></tr>
                <tr style="border-bottom:1px solid #eaeded;"><td style="padding:8px;font-weight:600;">${t('rv_res_dlq')}</td><td style="padding:8px;">${t('rv_res_dlq_desc')}</td></tr>
                <tr style="border-bottom:1px solid #eaeded;"><td style="padding:8px;font-weight:600;">${t('rv_res_sns')}</td><td style="padding:8px;">${t('rv_res_sns_desc')}</td></tr>`;

            if (config.deployMode === 'single') {
                desc.textContent = t('rv_desc_single');
                templateListEl.innerHTML = `<table style="width:100%;font-size:14px;border-collapse:collapse;">${baseResources}</table>`;
            } else {
                const accts = config.stacksetAccounts || [];
                const scopeDesc = accts.length > 0
                    ? `${t('rv_targets')} ${accts.length} ${t('rv_specific_accounts')}: ${accts.map(a=>a.id).join(', ')}`
                    : t('rv_targets_all');
                desc.textContent = t('rv_desc_stackset');
                templateListEl.innerHTML = `<table style="width:100%;font-size:14px;border-collapse:collapse;">
                    <tr style="border-bottom:1px solid #eaeded;background:#f2f8fd;"><td style="padding:8px;font-weight:600;" colspan="2">📄 map-auto-tagger-org-${config.mpeId}.yaml — ${t('rv_deploy_mgmt')}</td></tr>
                    <tr style="border-bottom:1px solid #eaeded;"><td style="padding:8px;font-weight:600;padding-left:20px;">${t('rv_res_custom')}</td><td style="padding:8px;">${t('rv_res_custom_desc')}</td></tr>
                    <tr style="border-bottom:1px solid #eaeded;"><td style="padding:8px;font-weight:600;padding-left:20px;">AWS::CloudFormation::StackSet</td><td style="padding:8px;">${scopeDesc}</td></tr>
                    <tr style="border-bottom:1px solid #eaeded;background:#f2f8fd;"><td style="padding:8px;font-weight:600;" colspan="2">📄 map-auto-tagger-accounts-${config.mpeId}.yaml — ${t('rv_deploy_accounts')}</td></tr>
                    ${baseResources}
                    </table>`;
            }

            setStep(2);
        }

        // --- Template generation ---

        // ── i18n ─────────────────────────────────────────────────────────────
