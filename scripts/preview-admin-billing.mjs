// Offline QA only: actual Admin renderer/styles, synthetic financial records.
// No .env file, authentication, network request, or customer data is used.
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const admin = resolve(root, '../Furnio Admin');
const adminRequire = createRequire(resolve(admin, 'package.json'));
const webRequire = createRequire(resolve(root, '../AI Virtual Staging/apps/web/package.json'));
const viteRequire = createRequire(webRequire.resolve('vite'));
const { build } = viteRequire('esbuild');
const output = resolve(root, 'output/playwright/web-billing');
mkdirSync(output, { recursive: true });
const data = {
  billing: { subscriptionCount: 1, creditsRemaining: 40, subscriptions: [{
    id: '00000000-0000-4000-8000-000000000041', provider: 'app_store', name: 'Furnio Studio',
    status: 'active', monthlyCredits: 50, currentPeriodEnd: '2026-10-09T00:00:00Z',
    cancelAtPeriodEnd: false, periodElapsed: false,
  }] },
  payments: [{ id: '00000000-0000-4000-8000-000000000042', provider: 'app_store', name: 'Furnio Studio',
    kind: 'subscription', credits: 50, refunded: false, purchasedAt: '2026-09-09T00:00:00Z', amount: 59.99, currency: 'CAD' }],
  alerts: [{ id: 'sample-review-1', kind: 'refund_credit_shortfall', credits: 5, createdAt: '2026-09-09T00:00:00Z', state: 'open' }],
};
await build({ stdin: { contents: `import React from 'react'; import {renderToStaticMarkup} from 'react-dom/server';
  import {NativeBillingDetails} from './src/components/native-customer-billing';
  export const content = renderToStaticMarkup(<main style={{maxWidth:1000,margin:'0 auto',padding:16}}>
    <p>Sample data · offline Admin QA</p><NativeBillingDetails data={${JSON.stringify(data)}}/></main>);`,
  resolveDir: admin, loader: 'tsx' }, bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic',
  alias: { '@': resolve(admin, 'src') }, outfile: resolve(output, 'admin-render.cjs'), logLevel: 'error' });
const { content } = adminRequire(resolve(output, 'admin-render.cjs'));
// Omit remote fonts/ReactFlow import in this isolated billing-component fixture.
const css = readFileSync(resolve(admin, 'src/app/styles.css'), 'utf8').replace(/^@import.*$/gm, '');
writeFileSync(resolve(output, 'admin.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><title>Furnio Admin native billing · offline fixture</title><style>${css}</style></head><body>${content}</body></html>`);
console.log(`Offline Admin fixture: ${resolve(output, 'admin.html')}`);
