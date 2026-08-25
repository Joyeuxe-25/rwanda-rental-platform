#!/usr/bin/env node
/**
 * Deployment GUARD (F10) — dependency-free. This script NEVER deploys.
 *
 * It runs the frontend production preflight (env validator) and then PRINTS the
 * exact manual commands the operator runs from their OWN terminal/Vercel account.
 * There is intentionally no `vercel deploy` here.
 */
import { spawnSync } from 'node:child_process';

console.log('Rwanda Rental Platform — FRONTEND deployment preflight (no deploy is performed)\n');

// 1) Preflight: validate the production env (fails while the URL is a placeholder).
const res = spawnSync(process.execPath, ['scripts/validate-production-env.mjs'], {
  stdio: 'inherit',
});
const preflightOk = res.status === 0;

console.log('\n──────────────────────────────────────────────────────────────');
console.log('MANUAL DEPLOY STEPS (run these yourself — Claude Code will not):\n');
console.log('  1. Push the monorepo to GitHub (see frontend/DEPLOYMENT.md).');
console.log('  2. In Vercel: New Project → import the repo → Root Directory = "frontend".');
console.log('  3. Set the Vercel env var (Production):');
console.log('       NEXT_PUBLIC_API_URL = https://api.YOUR_DOMAIN.com/api/v1');
console.log('  4. Ensure the backend CORS FRONTEND_URL matches the Vercel origin,');
console.log('     over HTTPS, and that the session cookie is same-site compatible.');
console.log('  5. Deploy from the Vercel dashboard (or `vercel --prod` from YOUR machine).');
console.log('  6. Run the smoke test:  FRONTEND_URL=https://www.YOUR_DOMAIN.com \\');
console.log('       node scripts/smoke-production.mjs');
console.log('──────────────────────────────────────────────────────────────\n');

if (!preflightOk) {
  console.log(
    'Preflight is not green yet (expected until a real NEXT_PUBLIC_API_URL is supplied).',
  );
  console.log(
    'Set it and re-run: NEXT_PUBLIC_API_URL=https://api.example.com/api/v1 npm run deploy:production',
  );
}
// Always exit 0 — this is a documentation/guard step, not a gate.
process.exit(0);
