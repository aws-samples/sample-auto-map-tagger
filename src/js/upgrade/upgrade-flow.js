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
                    '<input type="text" class="update-mpe-input" placeholder="A1B2C3D4E5" maxlength="44" style="border-radius:0 4px 4px 0;" oninput="this.value=this.value.toUpperCase().replace(/[^A-Z0-9]/g,\'\')">' +
                '</div>' +
                '<button class="btn-remove" onclick="editorRemoveRow(this)" title="Remove">&times;</button>';
            list.appendChild(row);
        }

        function updateReview() {
            const region = document.getElementById('update-region').value;
            const scopeToMpe = document.getElementById('update-scopeToMpe').checked;
            const mpeInputs = [...document.getElementById('update-mpeList').querySelectorAll('.update-mpe-input')];
            const mpeRegex = /^(?=.*[A-Z])(?=.*[0-9])[A-Z0-9]{1,44}$/;
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
