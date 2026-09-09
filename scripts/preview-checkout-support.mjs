// Offline interactive QA. Actual Admin components/styles; every API call is
// replaced at build time with an in-memory fixture. No credentials or live data.
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const admin = resolve(root, '../Furnio Admin');
const webRequire = createRequire(resolve(root, '../AI Virtual Staging/apps/web/package.json'));
const { build } = createRequire(webRequire.resolve('vite'))('esbuild');
const output = resolve(root, 'output/playwright/web-billing');
mkdirSync(output, { recursive: true });
const id = '00000000-0000-4000-8000-000000000053';
const support = { intents: [{ intentId: id, provider: 'APP_STORE', kind: 'consumable', name: 'Furnio Studio credits',
  createdAt: '2026-09-09T01:00:00Z', launchedAt: '2026-09-09T01:01:00Z', hasTransactionHint: false,
  candidates: [{ id: '00000000-0000-4000-8000-000000000054', purchasedAt: '2026-09-09T01:02:00Z', credits: 50, refunded: false }] }] };
const cancellationAlerts = [{ intentId:'00000000-0000-4000-8000-000000000055', transactionId:'00000000-0000-4000-8000-000000000056',
  name:'Furnio Studio credits', provider:'APP_STORE', credits:50, cancelledAt:'2026-09-09T01:01:00Z', purchasedAt:'2026-09-09T01:00:45Z', verifiedAt:'2026-09-09T01:02:00Z' }];
await build({ stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
  import {NativeCheckoutSupport} from './src/components/native-checkout-support';
  createRoot(document.getElementById('root')).render(<main style={{maxWidth:960,margin:'0 auto',padding:16}}>
    <p>OFFLINE SAMPLE · No real payment or customer data</p><NativeCheckoutSupport customerId="00000000-0000-4000-8000-000000000051" onResolved={()=>{document.documentElement.dataset.resolved='true'}}/></main>);`,
  resolveDir: admin, loader: 'tsx' }, bundle: true, platform: 'browser', jsx: 'automatic',
  alias: { '@': resolve(admin, 'src') },
  define: { 'process.env.NODE_ENV': '"production"' }, outfile: resolve(output, 'checkout.js'), logLevel: 'error',
  plugins: [{ name: 'offline-admin-api', setup(plugin) {
    plugin.onResolve({ filter: /^@\/lib\/admin-client$/ }, () => ({ path: 'client', namespace: 'offline' }));
    plugin.onLoad({ filter: /.*/, namespace: 'offline' }, () => ({ contents: `let linked=false;
      export async function adminFetch(path,init={}) {
        if (!path.endsWith('/native-checkouts')) throw new Error('Unexpected fixture route');
        if (init.method==='POST') { const body=JSON.parse(init.body); if (body.intentId!=='${id}' || body.reason.length<10) throw new Error('Invalid fixture selection'); linked=true; return {intentId:'${id}',status:'verified'}; }
        return {support:linked?{intents:[]}:${JSON.stringify(support)},cancellationAlerts:${JSON.stringify(cancellationAlerts)},canLink:true};
      }` }));
  } }] });
const css = readFileSync(resolve(admin, 'src/app/styles.css'), 'utf8').replace(/^@import.*$/gm, '');
writeFileSync(resolve(output, 'checkout.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><title>Furnio checkout recovery · OFFLINE SAMPLE</title><style>${css}</style></head><body><div id="root"></div><script src="checkout.js"></script></body></html>`);
console.log(`Offline interactive fixture: ${resolve(output, 'checkout.html')}`);
