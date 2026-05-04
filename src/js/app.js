        function generateAndDownload() {
            const config = getConfig();
            // Warn loudly (but permit) when Alert email is blank.
            // Zero-subscriber SNS topics silently drop every tagging-failure
            // alert — a customer hitting a Lambda bug or SCP drift won't know
            // until they reconcile MAP credit at the end of the quarter. We
            // gate the customer's explicit choice via confirm(), rather than
            // forcing it, so customers who have alternative alerting in place
            // (CloudWatch cross-account, SIEM) can proceed. Subscriber can be
            // added later via scripts/add_subscriber.sh without redeploy.
            if (!config.alertEmail || !config.alertEmail.trim()) {
                const proceed = window.confirm(t('ui_alert_email_missing_warn'));
                if (!proceed) {
                    return;
                }
            }
            const isStackset = config.deployMode === 'multi';
            const mainTemplate = isStackset ? generateOrgTemplate(config) : generateMainTemplate(config);
            const perAccountTemplate = isStackset ? generatePerAccountTemplate(config) : null;
            // Pass templates into script so everything is embedded — customer gets ONE file
            const deployScript = generateDeployScript(config, mainTemplate, perAccountTemplate);
            const instructions = generateInstructions(config);
            window._generated = { config, mainTemplate, perAccountTemplate, deployScript, instructions };

            const btnDiv = document.getElementById('downloadButtons');
            const isMulti = isStackset;
            const accountLabel = t(isMulti ? 'ui_mgmt_account' : 'ui_migration_account_label');
            // Update template download button for multi-account (two templates)
            const tplBtn = document.getElementById('downloadTemplateBtn');
            if (tplBtn) {
                if (isMulti) {
                    tplBtn.onclick = () => { downloadFile('org'); downloadFile('accounts'); };
                } else {
                    tplBtn.onclick = () => downloadFile('');
                }
            }
            btnDiv.innerHTML = `
                <button class="btn-primary" onclick="downloadFile('script')" style="font-size:16px;padding:14px 32px;">⬇ ${t('ui_btn_download')} deploy.sh</button>
                <button class="btn-secondary" onclick="copyInstructions()">📋 ${t('ui_btn_copy')}</button>`;

            document.getElementById('deployHint').innerHTML = `
                <div style="padding:12px 16px;background:#f2fcf3;border-left:4px solid #1d8102;border-radius:0 4px 4px 0;font-size:13px;">
                  <strong>${t('ui_one_file_step')}</strong> ${t('ui_send_script')} <code>deploy.sh</code> ${t('ui_to_customer')}<br>
                  <strong>${t('ui_instr_opt1_title')}:</strong> ${t('ui_cloudshell_open')} <strong>AWS CloudShell</strong> ${t('ui_in_account')} ${accountLabel}, ${t('ui_upload_and_run')}: <code>bash deploy.sh</code><br>
                  <strong>${t('ui_instr_opt2_title')}:</strong> ${t('ui_cli_alt_short')} <code>bash deploy.sh</code>
                </div>`;

            document.getElementById('instructions').textContent = instructions;
            document.getElementById('templatePreview').textContent = mainTemplate;
            setStep(3);
            applyTranslations();
        }

        function downloadFile(type) {
            const { config, mainTemplate, perAccountTemplate, deployScript } = window._generated;
            const customerSlug = config.customerName
                ? config.customerName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
                : '';
            const fileId = customerSlug ? `${customerSlug}-${config.mpeId}` : config.mpeId;
            let content, filename, mime;
            if (type === 'script') {
                // Regenerate in current language in case user switched language after Step 2
                content = generateDeployScript(config, mainTemplate, perAccountTemplate);
                filename = `deploy-${fileId}.sh`;
                mime = 'text/x-sh';
            } else if (type === 'org') {
                content = mainTemplate;
                filename = `map-auto-tagger-org-${fileId}.yaml`;
            } else if (type === 'accounts') {
                content = perAccountTemplate;
                filename = `map-auto-tagger-accounts-${fileId}.yaml`;
            } else {
                content = mainTemplate;
                filename = `map-auto-tagger-${fileId}.yaml`;
            }
            const blob = new Blob([content], { type: mime || 'text/yaml' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);
        }

        function copyInstructions() {
            navigator.clipboard.writeText(document.getElementById('instructions').textContent).then(() => {
                const btn = event.target;
                const orig = btn.textContent;
                btn.textContent = '✓ Copied!';
                setTimeout(() => btn.textContent = orig, 2000);
            });
        }
