        let currentLang = 'en';

        const LANG_LABELS = { en:'English', ko:'한국어', ja:'日本語', zh:'中文简体', id:'Bahasa Indonesia', th:'ภาษาไทย', vi:'Tiếng Việt' };

        const TRANSLATIONS = {
          en: en_translations,
          ko: ko_translations,
          ja: ja_translations,
          zh: zh_translations,
          id: id_translations,
          th: th_translations,
          vi: vi_translations
        };

        function t(key) {
            return (TRANSLATIONS[currentLang] && TRANSLATIONS[currentLang][key])
                || TRANSLATIONS['en'][key] || key;
        }

        function setLanguage(lang) {
            currentLang = lang;
            // Update active flag
            Object.keys(LANG_LABELS).forEach(l => {
                const el = document.getElementById('lang-' + l);
                if (el) el.classList.toggle('active', l === lang);
            });
            document.documentElement.lang = lang === 'zh' ? 'zh-CN' : lang;
            applyTranslations();
        }

        function applyTranslations() {
            document.querySelectorAll('[data-i18n]').forEach(el => {
                const key = el.getAttribute('data-i18n');
                el.textContent = t(key);
            });
            // Regenerate review table if on Step 2 (dynamically generated, no data-i18n)
            const step2 = document.getElementById('step2');
            if (step2 && !step2.classList.contains('hidden')) {
                reviewConfig();
            }
            // Same for the Delete flow's Review step (dstep2)
            const dstep2 = document.getElementById('dstep2');
            if (dstep2 && !dstep2.classList.contains('hidden') && window._deleteReview) {
                deleteRenderReview(window._deleteReview);
            }
            document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
                const key = el.getAttribute('data-i18n-placeholder');
                el.placeholder = t(key);
            });
            // Regenerate instructions preview if on Step 3
            if (window._generated) {
                const instrEl = document.getElementById('instructions');
                if (instrEl && instrEl.textContent) {
                    instrEl.textContent = generateInstructions(window._generated.config);
                }
            }
            // Delete-flow Step 3 instructions are also dynamic — re-render if visible
            const dstep3 = document.getElementById('dstep3');
            if (dstep3 && !dstep3.classList.contains('hidden') && window._deleteReview) {
                const instrEl = document.getElementById('delete-instructions');
                if (instrEl && instrEl.textContent) {
                    instrEl.textContent = deleteBuildInstructions(window._deleteReview);
                }
            }
            // Re-render version history with translated labels if visible
            const vhHost = document.getElementById('update-versionHistoryContent');
            if (vhHost && vhHost.innerHTML) {
                vhHost.innerHTML = renderVersionHistory();
            }
        }
