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

