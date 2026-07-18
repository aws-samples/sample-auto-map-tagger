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
                    const bad = val && !/^(?=.*[A-Z])(?=.*[0-9])[A-Z0-9]{1,44}$/.test(val);
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
            updateUsEast1Warning();
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
            select.addEventListener('change', updateUsEast1Warning);
            const row = document.createElement('div');
            row.className = 'entry-row';
            row.appendChild(select); row.appendChild(btn);
            list.appendChild(row);
            updateUsEast1Warning();
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
            select.addEventListener('change', updateUsEast1Warning);
            const row = document.createElement('div');
            row.className = 'entry-row';
            row.appendChild(select); row.appendChild(btn);
            list.appendChild(row);
            updateUsEast1Warning();
        }

        function removeEntry(btn) {
            const list = btn.parentElement.parentElement;
            if (list.children.length > 1) btn.parentElement.remove();
            updateUsEast1Warning();
        }

        function getValues(selector) {
            return Array.from(document.querySelectorAll(selector)).map(i => i.value.trim()).filter(v => v);
        }

        // Advisory only — we do NOT force us-east-1. Global services (CloudFront,
        // Route 53, Global Accelerator, etc.) only emit CloudTrail events in
        // us-east-1, so they go untagged unless that region is deployed. Warn when
        // the user has picked regions but omitted us-east-1.
        function updateUsEast1Warning() {
            const toggle = (warnId, regions) => {
                const el = document.getElementById(warnId);
                if (!el) return;
                el.style.display = (regions.length > 0 && !regions.includes('us-east-1')) ? 'block' : 'none';
            };
            toggle('single-no-useast1-warn', getValues('#singleRegionList .region-select'));
            toggle('multi-no-useast1-warn', getValues('#regionList .region-select'));
        }


        // --- Validation ---
        function isValidCalendarDate(dateStr) {
            if (!dateStr) return false;
            const [y, m, d] = dateStr.split('-').map(Number);
            const dt = new Date(y, m - 1, d);
            return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
        }

        // CT6-006: MPE-derived IAM role names must stay within AWS's 64-char
        // RoleName limit. The template derives region-qualified names — the
        // binding one is 'map-auto-tagger-backfill-mig<id>-<region>' (or
        // '...-role-...' when backfill is off), and org deploys also create
        // 'auto-map-tagger-deploy-role-mig<id>'. #96 raised the UI MaxLength
        // 20→44 without auditing these; an MPE fine in the UI then died in
        // CloudFormation with ROLLBACK_COMPLETE (region-dependent, e.g.
        // ap-northeast-2 caps lower than us-east-1). Returns the max allowed
        // user-entered MPE length for the CURRENT config, so validation can
        // fail fast with the actual number.
        function maxMpeLenForConfig() {
            const currentMode = (document.querySelector('input[name="deployMode"]:checked') || {}).value;
            const regionSel = currentMode === 'multi' ? '#regionList .region-select' : '#singleRegionList .region-select';
            const regions = getValues(regionSel).filter(v => v);
            if (regions.length === 0) regions.push('ap-northeast-2'); // getConfig()'s single-mode default
            const maxRegionLen = Math.max(...regions.map(r => r.length));
            const backfill = document.getElementById('includeBackfill');
            const rolePrefixLen = (backfill && backfill.checked)
                ? 'map-auto-tagger-backfill-'.length   // 25 — longest region-qualified prefix
                : 'map-auto-tagger-role-'.length;      // 21
            // RoleName = <prefix> + 'mig' + <id> + '-' + <region>  ≤ 64
            let max = 64 - rolePrefixLen - 3 - 1 - maxRegionLen;
            if (currentMode === 'multi') {
                // org deploy role: 'auto-map-tagger-deploy-role-' + 'mig' + <id> ≤ 64
                max = Math.min(max, 64 - 'auto-map-tagger-deploy-role-'.length - 3);
            }
            return max;
        }

        function validate() {
            let valid = true;
            const mpeId = document.getElementById('mpeId').value.trim();
            const date = document.getElementById('agreementDate').value;

            const mpeErr = document.getElementById('mpeId-error');
            const mpeMax = maxMpeLenForConfig();
            if (!/^[A-Z0-9]+$/.test(mpeId) || mpeId.length < 1 || mpeId.length > 44) {
                document.getElementById('mpeId').classList.add('error');
                mpeErr.setAttribute('data-i18n', 'err_mpe_invalid');
                mpeErr.textContent = t('err_mpe_invalid');
                mpeErr.style.display = 'block';
                valid = false;
            } else if (mpeId.length > mpeMax) {
                document.getElementById('mpeId').classList.add('error');
                mpeErr.setAttribute('data-i18n', 'err_mpe_derived_length');
                mpeErr.textContent = t('err_mpe_derived_length').replace('{max}', mpeMax);
                mpeErr.style.display = 'block';
                valid = false;
            } else {
                document.getElementById('mpeId').classList.remove('error');
                mpeErr.style.display = 'none';
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
