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

            if (!/^(?=.*[A-Z])(?=.*[0-9])[A-Z0-9]{1,44}$/.test(mpeRaw)) {
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
            const mpeRegex = /^(?=.*[A-Z])(?=.*[0-9])[A-Z0-9]{1,44}$/;
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
BUCKET="auto-map-tagger-\${ACCOUNT}-\${REGION}"

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

