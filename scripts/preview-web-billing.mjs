// Offline visual fixture using the actual website component and styles. No
// Supabase, Stripe, RevenueCat or live browser-session data is accessed.
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const web = resolve(root, '../AI Virtual Staging/apps/web');
const mainRequire = createRequire(resolve(web, 'package.json'));
const viteRequire = createRequire(mainRequire.resolve('vite'));
const { build } = viteRequire('esbuild');
const output = resolve(root, 'output/playwright/web-billing');
mkdirSync(output, { recursive: true });
const billing = { subscriptionCount: 1, creditsRemaining: 40, subscriptions: [{
  id: '00000000-0000-4000-8000-000000000041', provider: 'app_store', name: 'Furnio Studio',
  status: 'active', monthlyCredits: 50, currentPeriodEnd: '2026-10-09T00:00:00Z',
  cancelAtPeriodEnd: false, verifiedAt: '2026-09-09T00:00:00Z', periodElapsed: false,
}], recentTransactions: [] };
await build({ stdin: { contents: `import React from 'react'; import {renderToStaticMarkup} from 'react-dom/server';
  import {NativeBillingSummary} from './src/components/native-billing-summary';
  export const content = renderToStaticMarkup(<main className="billing-page"><header className="billing-heading"><div>
    <p className="eyebrow">Sample data · offline QA</p><h1>Credits & plan</h1></div></header>
    <NativeBillingSummary billing={${JSON.stringify(billing)}} hasStripeSubscription={false}/></main>);`,
  resolveDir: web, loader: 'tsx' }, bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic',
  outfile: resolve(output, 'render.cjs'), logLevel: 'error' });
const { content } = mainRequire(resolve(output, 'render.cjs'));
const css = ['tokens', 'foundation', 'application', 'theme'].map(name => readFileSync(resolve(web, `src/styles/${name}.css`), 'utf8')).join('\n');
writeFileSync(resolve(output, 'index.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><title>Furnio native billing · offline fixture</title><style>${css}</style></head><body>${content}</body></html>`);
console.log(`Offline component fixture: ${resolve(output, 'index.html')}`);
