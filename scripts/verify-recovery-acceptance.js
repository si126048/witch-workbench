import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {commitSaveTransaction,recoverSaveTransaction} from '../src/lib/saveTransaction.js';
const childMode=process.argv[2]==='--child';
if(childMode){
  const root=process.argv[3];let renamed=0;
  await commitSaveTransaction(root,['scene.json','scene.rpy'].map(file=>({path:path.join(root,file),content:'new '+file})),{beforeRename:()=>{
    if(++renamed===2){writeFileSync(path.join(root,'ready'),'ready');Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,30000);}
  }});
} else {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'nightfall-real-recovery-'));
  assert.equal(path.dirname(root),os.tmpdir());assert.ok(path.basename(root).startsWith('nightfall-real-recovery-'));
  let child;
  try {
    for(const file of ['scene.json','scene.rpy'])await fs.writeFile(path.join(root,file),'old '+file);
    await assert.rejects(()=>commitSaveTransaction(root,[{path:path.join(root,'scene.json'),content:'failed edit'}],{ops:{writeFile:async()=>{const error=new Error('Simulated disk full');error.code='ENOSPC';throw error;}}}),/disk full/);
    assert.equal(await fs.readFile(path.join(root,'scene.json'),'utf8'),'old scene.json');
    child=spawn(process.execPath,[fileURLToPath(import.meta.url),'--child',root],{windowsHide:true,stdio:'ignore'});
    const closed=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});
    let ready=false;
    for(let attempt=0;attempt<200;attempt++){
      try{await fs.access(path.join(root,'ready'));ready=true;break;}catch{/* wait for the controlled interruption point */}
      await new Promise(resolve=>setTimeout(resolve,50));
    }
    assert.ok(ready,'Child reached the second rename interruption point');
    assert.equal(await fs.readFile(path.join(root,'scene.json'),'utf8'),'new scene.json');
    assert.equal(await fs.readFile(path.join(root,'scene.rpy'),'utf8'),'old scene.rpy');
    child.kill('SIGKILL');await closed;child=null;
    const result=await recoverSaveTransaction(root);assert.equal(result.status,'rolled-forward');
    for(const file of ['scene.json','scene.rpy'])assert.equal(await fs.readFile(path.join(root,file),'utf8'),'new '+file);
    assert.equal((await recoverSaveTransaction(root)).status,'none');
    const report={passed:true,checks:['注入 ENOSPC 写入失败后原文件保留','真实子进程在两文件替换中间被强制终止','重启恢复到全部新版本且第二次恢复幂等']};
    await fs.mkdir('acceptance-output',{recursive:true});await fs.writeFile('acceptance-output/recovery-acceptance.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  }finally{child?.kill('SIGKILL');await fs.rm(root,{recursive:true,force:true});}
}
