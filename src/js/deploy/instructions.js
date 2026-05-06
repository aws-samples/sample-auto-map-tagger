        function generateInstructions(config) {
            const mpe = config.mpeId;

            if (config.deployMode === 'single') {
                return `${t('ui_instr_single_title')}
=========================================

── ${t('ui_instr_opt1_title')} ──────────────────────────────
1. ${t('ui_instr_login_single')}
2. ${t('ui_instr_open_cloudshell')}
3. ${t('ui_instr_upload_files')}
     deploy.sh
     map-auto-tagger-${mpe}.yaml
4. ${t('ui_instr_run')}
   bash deploy.sh

── ${t('ui_instr_opt2_title')} ─────────────────────────────────
1. ${t('ui_instr_cli_prereq_single')}
2. ${t('ui_instr_cli_download')}
3. ${t('ui_instr_cli_terminal')}
4. ${t('ui_instr_run')}
   bash deploy.sh

─────────────────────────────────────────────────
${t('ui_instr_done_single')}

${t('ui_instr_verify_title')}
   aws s3 mb s3://test-map-$(date +%s)
   sleep 90
   aws s3api get-bucket-tagging --bucket test-map-XXXX
   # ${t('ui_instr_expected')}: {"TagSet": [{"Key": "map-migrated", "Value": "${mpe}"}]}

${t('ui_instr_thats_it')}
${t('ui_instr_existing_only')}`;
            }

            if (config.deployMode === 'multi') {
                const accounts = (config.stacksetAccounts || []);
                const accountList = accounts.map(a => `   - ${a.id}${a.label !== a.id ? ' (' + a.label + ')' : ''}`).join('\n') || `   ${t('ui_instr_all_accounts')}`;

                return `${t('ui_instr_multi_title')}
==========================================

${t('ui_instr_files_received')}: deploy.sh, map-auto-tagger-org-${mpe}.yaml, map-auto-tagger-accounts-${mpe}.yaml
${t('ui_instr_target_accounts')}: ${accounts.map(a => a.id + (a.label !== a.id ? ' (' + a.label + ')' : '')).join(', ') || t('ui_instr_all_org')}

── ${t('ui_instr_opt1_title')} ──────────────────────────────
1. ${t('ui_instr_login_multi')}
2. ${t('ui_instr_open_cloudshell')}
3. ${t('ui_instr_upload_all')}
     deploy.sh
     map-auto-tagger-org-${mpe}.yaml
     map-auto-tagger-accounts-${mpe}.yaml
4. ${t('ui_instr_run')}
   bash deploy.sh

── ${t('ui_instr_opt2_title')} ─────────────────────────────────
1. ${t('ui_instr_cli_prereq_multi')}
2. ${t('ui_instr_cli_download_all')}
3. ${t('ui_instr_cli_terminal')}
4. ${t('ui_instr_run')}
   bash deploy.sh

─────────────────────────────────────────────────
${t('ui_instr_auto_handles')}
  - ${t('ui_instr_uploads_s3')}
  - ${t('ui_instr_enables_stacksets')}
  - ${t('ui_instr_discovers_org')}
  - ${t('ui_instr_deploys_all')}

${t('ui_instr_check_status')}:

   aws cloudformation list-stack-instances \\
     --stack-set-name map-auto-tagger-${mpe} \\
     --query "Summaries[*].[Account,Region,StackInstanceStatus.DetailedStatus]" \\
     --output table
   # ${t('ui_instr_expected')}: SUCCEEDED

${t('ui_instr_done_multi')}
${t('ui_instr_cloudtrail_note')}`;
        }
        }

