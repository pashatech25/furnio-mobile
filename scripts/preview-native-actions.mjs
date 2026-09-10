// Bounded offline QA for the actual Admin shell, notification menu and native
// reporting panel. Auth/API are in-memory samples; unrelated tabs are stubbed.
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const admin = resolve(root, '../Furnio Admin');
const webRequire = createRequire(resolve(root, '../AI Virtual Staging/apps/web/package.json'));
const { build } = createRequire(webRequire.resolve('vite'))('esbuild');
const output = resolve(root, 'output/playwright/native-actions');
mkdirSync(output, { recursive: true });
await build({ stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
  import {AdminApp} from './src/components/admin-app';
  createRoot(document.getElementById('root')).render(<><div style={{padding:12,background:'#fee',position:'relative',zIndex:100}}>OFFLINE ADMIN SAMPLE · NO REAL AUTH, PAYMENTS OR DATABASE
    <button onClick={()=>{window.fixtureFail=true}}>Simulate native outage</button>
    <button onClick={()=>{window.fixtureFail=false}}>Restore fixture</button></div><AdminApp /></>);`, resolveDir: admin, loader: 'tsx' },
  bundle: true, platform: 'browser', jsx: 'automatic', alias: { '@': resolve(admin, 'src') },
  define: { 'process.env.NODE_ENV': '"production"' }, outfile: resolve(output, 'actions.js'), logLevel: 'error',
  plugins: [{ name: 'offline-admin-shell', setup(plugin) {
    plugin.onResolve({ filter: /^(@\/lib\/(admin-client|supabase)|next\/image)$/ }, args => ({ path: args.path, namespace: 'offline' }));
    plugin.onResolve({ filter: /^@\/components\/(admin-guide|automation-studio|developer-applications|email-studio|focus-campaign-panel|llm-registry)$/ }, args => ({ path: args.path, namespace: 'unused-tab' }));
    plugin.onLoad({ filter: /.*/, namespace: 'unused-tab' }, () => ({ contents: 'export const AdminGuide=()=>null,AutomationStudio=()=>null,DeveloperApplications=()=>null,EmailStudio=()=>null,FocusCampaignPanel=()=>null,LlmRegistry=()=>null;' }));
    plugin.onLoad({ filter: /^next\/image$/, namespace: 'offline' }, () => ({ contents: 'export default function Image(){return null}' }));
    plugin.onLoad({ filter: /supabase$/, namespace: 'offline' }, () => ({ contents: `
      export function createBrowserSupabase(){return {auth:{getSession:async()=>({data:{session:{user:{id:'00000000-0000-4000-8000-000000000001',email:'offline@example.invalid',user_metadata:{full_name:'Offline fixture'}}}}}),onAuthStateChange:()=>({data:{listener:null,subscription:{unsubscribe(){}}}}),signOut:async()=>{throw Error('Fixture cannot sign out a real session')}}}};
      export function createAdminSupabase(){throw Error('No server client in offline fixture')}` }));
    plugin.onLoad({ filter: /admin-client$/, namespace: 'offline' }, () => ({ resolveDir: admin, contents: String.raw`
      import {nativeReportingFixture} from '@/lib/native-reporting.fixture';
      window.fixtureRequests=[];
      const nativeSignal=()=>window.fixtureFail?{id:'native-reporting-unavailable',count:1,severity:'warning',targetView:'overview',title:'App store reporting unavailable',detail:'Synthetic outage. Open the report and refresh to retry.'}:{id:'native-billing-follow-up',count:51,severity:'warning',targetView:'overview',title:'Sandbox · App store billing follow-up',detail:'51 synthetic customers need review.'};
      const funnel={label:'Synthetic funnel',period:'Sample only',steps:[]};
      export async function adminFetch(path,init={}) {
        window.fixtureRequests.push(path);
        if (init.method && init.method!=='GET') throw new Error('Read-only fixture');
        if(path==='/api/admin/overview')return {overview:{nativeReportingEnabled:true,actions:[nativeSignal()],currency:'usd',mrrCents:5000,revenueCollected30DaysCents:5000,revenueUnpricedPayments:0,activeSubscriptions:1,trialingSubscriptions:0,pastDueSubscriptions:0,completedImages30Days:2,completedImagesPrevious30Days:1,completedImagesChangePercent:100,
          operations:{queuedJobs:0,runningJobs:0,failedLast24Hours:0,stalledJobs:0,oldestWaitingMinutes:null,averageProcessingSeconds:12,p95ProcessingSeconds:14,successRatePercent:100,providerCostConfigured:false,providerCostCents:null,providerCostCoveragePercent:0,grossMarginPercent:null},
          fal:{configured:false,balanceCents:null,currency:'usd',costByService:[],costPerCompletedImageCents:null,error:null,fetchedAt:null,linkedRequestCount:0,lowBalance:false,lowBalancePopupEnabled:false,lowBalanceThresholdCents:2500,p95ProcessingSeconds:null,requestCount30Days:0,spend30DaysCents:0,spend7DaysCents:0,spendTodayCents:0,successRatePercent:null},
          conversions:{signup:funnel,focus:funnel,referral:funnel,developer:funnel}}};
        if(path.startsWith('/api/admin/customers?')||path==='/api/admin/customers')return {customers:[]};
        if (path.startsWith('/api/admin/native-reporting?offset=')) {
          if(window.fixtureFail) throw new Error('Synthetic outage');
          const report=nativeReportingFixture();const offset=Number(new URL(path,'https://offline.invalid').searchParams.get('offset'));
          report.followUp.totalAccounts=51;report.followUp.totalSignals=51;report.followUp.offset=offset;
          const sample=report.followUp.customers[0];report.followUp.customers=Array.from({length:51},(_,i)=>({...sample,userId:'00000000-0000-4000-8000-'+String(401+i).padStart(12,'0')})).slice(offset,offset+50);
          return {report};
        }
        if (/^\/api\/admin\/customers\/[a-f0-9-]+\/native-billing$/.test(path)) return {nativeBilling:{billing:{creditsRemaining:5,subscriptionCount:0,subscriptions:[]},payments:[],alerts:[]}};
        if (/^\/api\/admin\/customers\/[a-f0-9-]+\/native-checkouts$/.test(path)) return {support:{intents:[]},cancellationAlerts:[],canLink:false};
        throw new Error('Unexpected fixture route: '+path);
      }` }));
  } }] });
const css = readFileSync(resolve(admin, 'src/app/styles.css'), 'utf8').replace(/^@import.*$/gm, '');
writeFileSync(resolve(output, 'index.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'"><link rel="icon" href="data:,"><title>Native Action Centre · OFFLINE SAMPLE</title><style>${css}</style></head><body><div id="root"></div><script src="actions.js"></script></body></html>`);
console.log(`Offline Admin shell: ${resolve(output, 'index.html')}`);
