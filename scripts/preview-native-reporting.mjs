// Offline interactive QA: real Admin renderer, injected synthetic responses.
// No environment files, sessions, provider calls or database connections.
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const admin = resolve(root, '../Furnio Admin');
const webRequire = createRequire(resolve(root, '../AI Virtual Staging/apps/web/package.json'));
const { build } = createRequire(webRequire.resolve('vite'))('esbuild');
const output = resolve(root, 'output/playwright/native-reporting');
mkdirSync(output, { recursive: true });
await build({ stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
  import {NativeReportingPanel} from './src/components/native-reporting';
  createRoot(document.getElementById('root')).render(<main style={{maxWidth:1100,margin:'0 auto',padding:16}}>
    <p>OFFLINE SAMPLE · No real revenue, customer data or API access</p>
    <button onClick={()=>{window.fixtureFail=true}}>Simulate report failure</button>
    <button onClick={()=>{window.fixtureFail=false}}>Restore fixture responses</button>
    <NativeReportingPanel enabled /></main>);`, resolveDir: admin, loader: 'tsx' },
  bundle: true, platform: 'browser', jsx: 'automatic', alias: { '@': resolve(admin, 'src') },
  define: { 'process.env.NODE_ENV': '"production"' }, outfile: resolve(output, 'reporting.js'), logLevel: 'error',
  plugins: [{ name: 'offline-report-api', setup(plugin) {
    plugin.onResolve({ filter: /^@\/lib\/admin-client$/ }, () => ({ path: 'client', namespace: 'offline' }));
    plugin.onLoad({ filter: /.*/, namespace: 'offline' }, () => ({ resolveDir: admin, contents: String.raw`
      import {nativeReportingFixture} from '@/lib/native-reporting.fixture';
      window.fixtureRequests=[];
      export async function adminFetch(path,init={}) {
        window.fixtureRequests.push(path);
        if (init.method && init.method!=='GET') throw new Error('Read-only fixture');
        if (path.startsWith('/api/admin/native-reporting?offset=')) {
          if(window.fixtureFail) throw new Error('Synthetic outage');
          const report=nativeReportingFixture(); const offset=Number(new URL(path,'https://offline.invalid').searchParams.get('offset'));
          report.followUp.totalAccounts=51;report.followUp.totalSignals=51;report.followUp.offset=offset;
          const sample=report.followUp.customers[0];
          report.followUp.customers=Array.from({length:51},(_,i)=>({...sample,userId:'00000000-0000-4000-8000-'+String(401+i).padStart(12,'0')})).slice(offset,offset+50);
          return {report};
        }
        if (/^\/api\/admin\/customers\/[a-f0-9-]+\/native-billing$/.test(path)) return {nativeBilling:{billing:{creditsRemaining:5,subscriptionCount:0,subscriptions:[]},payments:[],alerts:[]}};
        if (/^\/api\/admin\/customers\/[a-f0-9-]+\/native-checkouts$/.test(path)) return {support:{intents:[]},cancellationAlerts:[],canLink:false};
        throw new Error('Unexpected fixture route');
      }` }));
  } }] });
const css = readFileSync(resolve(admin, 'src/app/styles.css'), 'utf8').replace(/^@import.*$/gm, '');
writeFileSync(resolve(output, 'index.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'"><link rel="icon" href="data:,"><title>Native reporting · OFFLINE SAMPLE</title><style>${css}</style></head><body><div id="root"></div><script src="reporting.js"></script></body></html>`);
console.log(`Offline report fixture: ${resolve(output, 'index.html')}`);
