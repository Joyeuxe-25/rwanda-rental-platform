#!/usr/bin/env node
/**
 * B16 production deploy GUARD — runs preflight checks and then STOPS.
 *
 * This script intentionally NEVER deploys. Production deployment is a manual,
 * human-approved action (see docs/DEPLOYMENT.md). It runs the production-config
 * validator as a preflight and prints the exact command the user should run
 * themselves. Wiring `deploy` into automation would risk an accidental deploy,
 * so this guard exists instead.
 */
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

let preflightOk = false;
try {
  const out = execFileSync('node', [join(HERE, 'validate-production-config.mjs')], {
    encoding: 'utf8',
  });
  process.stdout.write(out);
  preflightOk = true;
} catch (e) {
  if (e.stdout) process.stdout.write(e.stdout);
  if (e.stderr) process.stderr.write(e.stderr);
  preflightOk = false;
}

console.log('\n──────────────────────────────────────────────────────────────');
console.log('Production deployment is intentionally MANUAL.');
console.log(
  preflightOk
    ? 'Preflight passed. When you are ready, run the documented command yourself:'
    : 'Preflight is NOT satisfied yet (see above). Finish docs/DEPLOYMENT.md first, then run:',
);
console.log('\n    npx wrangler deploy --env production\n');
console.log('This guard never deploys on your behalf. See docs/DEPLOYMENT.md and');
console.log('docs/PRODUCTION-CHECKLIST.md for the full procedure.');
console.log('──────────────────────────────────────────────────────────────');
// Exit 0: the guard did its job (it is not the deploy itself).
process.exit(0);
