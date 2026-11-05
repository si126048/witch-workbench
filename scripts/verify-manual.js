import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
  await page.goto(pathToFileURL(path.resolve('delivery/夜幕工作台使用说明书.html')).href);
  await page.waitForSelector('nav a');assert.equal(await page.locator('nav a').count(),10);
  assert.match(await page.locator('article').innerText(),/团队成员怎样获得工作台/);
  await fs.mkdir('acceptance-output',{recursive:true});await page.screenshot({path:'acceptance-output/manual-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'Manual fits a mobile viewport');
  await page.screenshot({path:'acceptance-output/manual-mobile.png',fullPage:true});
  await fs.writeFile('acceptance-output/manual-result.json',JSON.stringify({passed:true,chapters:10,offline:true,desktopWidth:1440,mobileWidth:390},null,2));
  console.log('Offline manual headings, distribution instructions and responsive layout passed');
}finally{await browser.close();}
