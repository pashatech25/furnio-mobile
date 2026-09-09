// Actual native Wallet + UI through React Native Web, with compile-time offline
// adapters. No Auth, network API, store SDK, credentials or real account data.
import { createRequire } from "node:module";
import { mkdirSync, copyFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const local = createRequire(resolve(root, "package.json"));
const web = createRequire(resolve(root, "../AI Virtual Staging/apps/web/package.json"));
const { build } = createRequire(web.resolve("vite"))("esbuild");
const output = resolve(root, "output/playwright/mobile-wallet");
mkdirSync(output, { recursive: true });
const fixtures = {
  config: `export const demo=false;`,
  state: `const app={user:{id:'00000000-0000-4000-8000-000000000051'},billing:{balance:50,products:[{productId:'fixture-pack',name:'Offline credit pack',credits:50,interval:'one_time'}],transactions:[]},refresh:async()=>{},demoPurchase:()=>{}}; export function useApp(){return app;}`,
  commerce: `let done=false; const allowed=['cancelled_unresolved','awaiting_store','store_owned','interrupted'];
    const query=new URLSearchParams(location.search).get('outcome'); const status=allowed.includes(query)?query:'cancelled_unresolved';
    export const purchasesEnabled=true,restorationAvailable=true;
    export async function loadStoreProducts(){return [{identifier:'fixture-pack',priceString:'SAMPLE $10'}]}
    export async function purchase(){throw new Error('Offline fixture never purchases')}
    export async function purchaseRecoveryNotice(){return done?null:{reference:'00000000-0000-4000-8000-000000000053',status}}
    export async function checkRecovery(){return {status}}
    export async function restore(){done=true;return {status:'verified'}}`,
  router: `export const router={back:()=>{},push:()=>{},replace:()=>{}};`,
};
await build({
  stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
    import {SafeAreaProvider} from 'react-native-safe-area-context';
    import {DialogProvider} from './src/ui'; import Wallet from './app/wallet';
    createRoot(document.getElementById('root')).render(<SafeAreaProvider initialMetrics={{frame:{x:0,y:0,width:390,height:844},insets:{top:0,right:0,bottom:0,left:0}}}><DialogProvider><Wallet/></DialogProvider></SafeAreaProvider>);`,
    resolveDir: root, loader: "tsx" },
  bundle: true, platform: "browser", jsx: "automatic", format: "iife",
  alias: { "react-native": local.resolve("react-native-web"), "react-native-svg": resolve(root, "node_modules/react-native-svg/lib/module/ReactNativeSVG.web.js") },
  resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".js", ".json"],
  mainFields: ["browser", "module", "main"],
  define: { "process.env.NODE_ENV": '"production"', "__DEV__": "false" },
  outfile: resolve(output, "wallet.js"), logLevel: "error",
  plugins: [{ name: "offline-wallet-only", setup(plugin) {
    plugin.onResolve({ filter: /(^expo-router$|(^|\/)(state|commerce|config)$)/ }, (args) => {
      const name = args.path === "expo-router" ? "router" : args.path.split("/").at(-1);
      if (Object.hasOwn(fixtures, name) && (args.path === "expo-router" || args.importer.startsWith(root + "/app/") || args.importer.startsWith(root + "/src/")))
        return { path: name, namespace: "offline-wallet" };
    });
    plugin.onLoad({ filter: /.*/, namespace: "offline-wallet" }, (args) => ({ contents: fixtures[args.path] }));
  } }],
});
for (const [name, font] of Object.entries({
  DM: "dm-sans/400Regular/DMSans_400Regular.ttf", DMBold: "dm-sans/700Bold/DMSans_700Bold.ttf", Serif: "instrument-serif/400Regular/InstrumentSerif_400Regular.ttf",
})) copyFileSync(resolve(root, "node_modules/@expo-google-fonts", font), resolve(output, `${name}.ttf`));
const fonts = ["DM", "DMBold", "Serif"].map((name) => `@font-face{font-family:${name};src:url('${name}.ttf')}`).join("");
writeFileSync(resolve(output, "index.html"), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Furnio wallet — OFFLINE SAMPLE</title><link rel="icon" href="data:,"><style>${fonts}html,body,#root{margin:0;height:100%;background:#f7f5ef}#root{padding-top:30px;box-sizing:border-box}.sample{position:fixed;z-index:9999;inset:0 0 auto;background:#ad5037;color:white;padding:6px;font:12px DM;text-align:center}</style></head><body><div class="sample">OFFLINE SAMPLE · no real payment or customer data</div><div id="root"></div><script src="wallet.js"></script></body></html>`);
console.log(`Offline actual Wallet fixture: ${resolve(output, "index.html")}`);
