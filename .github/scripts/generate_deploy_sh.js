/**
 * generate_deploy_sh.js
 *
 * Uses Playwright (headless Chromium) to load configurator.html, inject a
 * test config, call generateDeployScript(), and write the output to a file.
 *
 * Usage:
 *   node generate_deploy_sh.js \
 *     --mpe-id migTEST0000001 \
 *     --agreement-date 2024-01-01 \
 *     --agreement-end-date 2026-12-31 \
 *     --region ap-northeast-2 \
 *     --mode single \
 *     --output deploy-test.sh
 */

const { chromium } = require('playwright');
const fs   = require('fs');
const path = require('path');

// Parse CLI args
const args = {};
process.argv.slice(2).forEach((a, i, arr) => {
  if (a.startsWith('--')) args[a.slice(2)] = arr[i + 1];
});

const mpeId         = args['mpe-id']            || 'migTEST0000001';
const agreementDate = args['agreement-date']     || '2024-01-01';
const agreementEnd  = args['agreement-end-date'] || '2099-12-31';
const region        = args['region']             || 'ap-northeast-2';
const mode          = args['mode']               || 'single';
const outputFile    = args['output']             || 'deploy-test.sh';

const htmlPath = path.resolve(__dirname, '../../configurator.html');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page    = await browser.newPage();

  // Suppress console noise from the page
  page.on('console', msg => {
    if (msg.type() === 'error') console.error('[page error]', msg.text());
  });

  await page.goto(`file://${htmlPath}`);

  // Wait for the JS to fully initialize
  await page.waitForFunction(() => typeof generateDeployScript !== 'undefined');

  // Inject the test config and generate the script
  const deployScript = await page.evaluate(
    ({ mpeId, agreementDate, agreementEnd, region, mode }) => {
      const config = {
        mpeId,
        agreementDate,
        agreementEndDate: agreementEnd,
        alertEmail:       '',
        customerName:     'E2E Test',
        deployMode:       mode,
        scopeMode:        'account',
        scopedVpcIds:     ['NONE'],
        tagNonVpcServices: true,
        includeBackfill:  false,
        regions:          [region],
        stacksetAccounts: [],
        useAccountScope:  false,
      };

      const mainTemplate = generateMainTemplate(config);
      return generateDeployScript(config, mainTemplate, null);
    },
    { mpeId, agreementDate, agreementEnd, region, mode }
  );

  await browser.close();

  if (!deployScript || deployScript.length < 1000) {
    console.error('ERROR: Generated deploy.sh is suspiciously short:', deployScript?.length, 'bytes');
    process.exit(1);
  }
  if (!deployScript.startsWith('#!/bin/bash')) {
    console.error('ERROR: Generated script does not start with #!/bin/bash');
    process.exit(1);
  }
  if (!deployScript.includes('aws cloudformation')) {
    console.error('ERROR: Generated script does not contain aws cloudformation commands');
    process.exit(1);
  }
  if (!deployScript.includes(mpeId)) {
    console.error(`ERROR: Generated script does not contain MPE ID ${mpeId}`);
    process.exit(1);
  }

  fs.writeFileSync(outputFile, deployScript, { mode: 0o755 });
  console.log(`✅ Generated ${outputFile} (${Math.round(deployScript.length / 1024)}KB)`);
  console.log('✅ Script validation passed');
})();
