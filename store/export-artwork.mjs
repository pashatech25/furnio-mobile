import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
mkdirSync('output/playwright/store', { recursive: true });
const code = `async page => {
  const root = 'http://127.0.0.1:4347/store/artwork.html';
  for (const [platform,width,height] of [['ios',1320,2868],['android',1080,1920],['ipad',2048,2732]]) {
    for (let index=0;index<6;index++) {
      await page.setViewportSize({width,height});
      await page.goto(root+'?platform='+platform+'&export='+index);
      await page.evaluate(async()=>{await document.fonts.ready; await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})))});
      const missing=await page.locator('.selected img').evaluateAll(images=>images.filter(i=>!i.naturalWidth).map(i=>i.src));
      if(missing.length) throw new Error('Missing images: '+missing.join(', '));
      await page.screenshot({path:'output/playwright/store/'+platform+'-'+String(index+1).padStart(2,'0')+'.png'});
    }
    await page.setViewportSize({width:1500,height:1100});
    await page.goto(root);
    await page.evaluate(p=>platform(p,document.querySelectorAll('nav button')[p==='ios'?0:p==='android'?1:2]),platform);
    await page.evaluate(async()=>{await document.fonts.ready; await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})))});
    await page.screenshot({path:'output/playwright/store/'+platform+'-review.png',fullPage:true});
  }
}`;
execFileSync('/Users/alipashaamidi/.codex/skills/playwright/scripts/playwright_cli.sh', ['--session','furnio-store','run-code',code], {stdio:'inherit', timeout:180000});
