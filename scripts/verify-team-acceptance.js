import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {runGit,teamStatus,teamDiff,TEAM_IGNORE,TEAM_ATTRIBUTES} from '../src/lib/teamGit.js';
import {registerNightfallHandlers,loadScene,saveScene} from '../src/lib/nightfallService.js';
import {sampleScene,scenePaths} from '../src/lib/sceneDocument.js';

// Exercises the same validated handlers exposed through IPC, with real local
// repositories. No network accounts, credentials or desktop windows are used.
const sandbox=await fs.mkdtemp(path.join(os.tmpdir(),'夜幕 协作验收 '));
if(path.dirname(sandbox)!==os.tmpdir()||!path.basename(sandbox).startsWith('夜幕 协作验收 '))throw new Error('Unexpected acceptance cleanup target');
const checks=[];
let current;
const handlers=new Map();
registerNightfallHandlers({ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},getRoot:()=>current,isTrusted:()=>true,sendProgress:()=>{},recoveryRoot:path.join(sandbox,'recovery')});
async function call(root,action,payload={}){
  current=root;
  const result=await handlers.get('nightfall:team')({sender:{}},action,payload);
  if(!result.ok) throw new Error(`${action}: ${result.error}`);
  return result.value;
}
async function identity(root){await runGit(root,['config','user.name','Acceptance']);await runGit(root,['config','user.email','acceptance@example.invalid']);await runGit(root,['config','core.autocrlf','false']);}
async function commit(root,files,message){return call(root,'commit',{files,message});}
async function edit(root,id,title){const loaded=await loadScene(root,id);await saveScene(root,{...loaded.scene,title},loaded.revision);}
const pair=id=>Object.values(scenePaths(id));
try {
  const first=path.join(sandbox,'第一位 制作者'),second=path.join(sandbox,'第二位 制作者'),remote=path.join(sandbox,'remote.git');
  await fs.mkdir(first);await fs.mkdir(remote);
  await runGit(first,['init','-b','main']);await identity(first);
  await fs.writeFile(path.join(first,'.gitignore'),TEAM_IGNORE);
  await fs.writeFile(path.join(first,'.gitattributes'),TEAM_ATTRIBUTES);
  await runGit(first,['lfs','install','--local']);
  const sample=sampleScene();
  for(const file of [...sample.layers.map(layer=>layer.asset),...sample.events.filter(event=>event.asset).map(event=>event.asset)]){
    await fs.mkdir(path.dirname(path.join(first,file)),{recursive:true});await fs.writeFile(path.join(first,file),'acceptance asset');
  }
  for(const id of ['opening','second']){const initial=await loadScene(first,id);await saveScene(first,{...sample,id},initial.revision);}
  await commit(first,(await teamStatus(first)).files.map(file=>file.path),'Initial paired scenes');
  await runGit(remote,['init','--bare','-b','main']);await runGit(first,['remote','add','origin',remote]);await call(first,'push');
  await runGit(sandbox,['-c','core.autocrlf=false','clone',remote,second]);await identity(second);checks.push('首次克隆与中文空格路径');

  await edit(first,'opening','First owner');await commit(first,pair('opening'),'Opening parallel edit');await call(first,'push');
  await edit(second,'second','Second owner');await commit(second,pair('second'),'Second parallel edit');
  await assert.rejects(()=>call(second,'pull'));
  await call(second,'merge');
  await commit(second,pair('opening'),'Review disjoint scene merge');await call(second,'push');
  await call(first,'pull');
  assert.equal((await loadScene(first,'opening')).scene.title,'First owner');
  assert.equal((await loadScene(first,'second')).scene.title,'Second owner');checks.push('不同场景并行修改、分叉拒绝快进、显式合并');

  await edit(first,'opening','Remote conflict');await commit(first,pair('opening'),'Remote scene edit');await call(first,'push');
  await edit(second,'opening','Local conflict');await commit(second,pair('opening'),'Local scene edit');
  await assert.rejects(()=>call(second,'pull'));await assert.rejects(()=>call(second,'merge'));
  const documentPath=scenePaths('opening').document;
  const comparison=await teamDiff(second,documentPath);assert.equal(comparison.conflict,true);
  await assert.rejects(()=>call(second,'resolve',{file:documentPath,content:comparison.ours,expected:{...comparison,theirs:'stale'}}),/changed/);
  await assert.rejects(()=>call(second,'resolve',{file:documentPath,content:'{}',expected:comparison}));
  for(const file of (await teamStatus(second)).files.filter(file=>file.conflicted)){
    const expected=await teamDiff(second,file.path);
    await call(second,'resolve',{file:file.path,content:expected.ours,expected});
  }
  const chosen=await loadScene(second,'opening');await saveScene(second,chosen.scene,chosen.revision);
  await commit(second,pair('opening'),'Resolve complete local scene');await call(second,'push');
  assert.equal((await teamStatus(second)).merging,false);checks.push('演出三方冲突、拒绝过期比较及无效文档、选择完整版本、重新生成并提交');

  await fs.writeFile(path.join(second,'offline.rpy'),'# offline commit\n');await commit(second,['offline.rpy'],'Offline retained commit');
  const head=(await runGit(second,['rev-parse','HEAD'])).trim();
  await runGit(second,['remote','set-url','--push','origin',path.join(sandbox,'unavailable.git')]);
  await assert.rejects(()=>call(second,'push'));assert.equal((await runGit(second,['rev-parse','HEAD'])).trim(),head);
  await runGit(second,['remote','set-url','--push','origin',remote]);await call(second,'push');
  assert.equal((await runGit(remote,['rev-parse','main'])).trim(),head);checks.push('离线提交、推送失败保留提交、恢复远端后重试成功');

  const existing=await loadScene(second,'opening');
  const invalid={...existing.scene,layers:existing.scene.layers.map((layer,index)=>index===0?{...layer,asset:'game/images/missing.png'}:layer)};
  await assert.rejects(()=>saveScene(second,invalid,existing.revision));
  assert.deepEqual((await loadScene(second,'opening')).revision,existing.revision);checks.push('缺失素材拒绝保存且原文件不变');
  await assert.rejects(()=>call(second,'lock',{file:sample.layers[0].asset}));checks.push('无 locking 接口的远端锁定失败并保留原因');
  await fs.mkdir('acceptance-output',{recursive:true});
  await fs.writeFile('acceptance-output/team-acceptance.json',JSON.stringify({passed:true,checks},null,2));
  console.log(JSON.stringify({passed:true,checks},null,2));
} finally {
  await fs.rm(sandbox,{recursive:true,force:true});
}
