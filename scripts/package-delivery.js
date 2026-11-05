import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import JSZip from 'jszip';
const output=path.resolve('delivery/0.2.0');await fs.mkdir(output,{recursive:true});
const git=args=>execFileSync('git',args,{encoding:'utf8',windowsHide:true});
assert.equal(git(['status','--porcelain']).trim(),'','Commit the reviewed source before packaging');
const revision=git(['rev-parse','HEAD']).trim();
const analysis=JSON.parse(await fs.readFile('acceptance-output/analysis-comparison.json','utf8'));
assert.equal(analysis.comparison.length,9,'All fixed analysis scenarios are required');
assert.ok(analysis.comparison.every(row=>Number.isFinite(row.ratio)&&row.ratio<=1.2),'Analysis regression exceeds the 20% release limit');
const io=JSON.parse(await fs.readFile('acceptance-output/project-io-benchmark.json','utf8'));
assert.equal(io.fixture.lines,100000);assert.equal(io.fixture.assets,1000);
assert.ok(Object.values(io.comparison).every(row=>Number.isFinite(row.ratio)&&row.ratio<=1.2),'Project I/O regression exceeds the 20% release limit');
for(const file of ['team-acceptance.json','recovery-acceptance.json','manual-result.json','team-launch-ui.json','team-launcher.json'])assert.equal(JSON.parse((await fs.readFile(path.join('acceptance-output',file),'utf8')).replace(/^\uFEFF/, '')).passed,true,`${file} must pass before delivery`);
const digest=buffer=>crypto.createHash('sha256').update(buffer).digest('hex');
const installation=JSON.parse(await fs.readFile('acceptance-output/installation.json','utf8'));
assert.equal(installation.verified,true);assert.equal(installation.uninstalled,true);
const installer=await fs.readFile('release/Nightfall_Workbench_Windows_0.2.0.exe');
assert.equal(digest(installer),installation.installerSha256);
await fs.writeFile(path.join(output,'Nightfall_Workbench_Windows_0.2.0.exe'),installer);
const source=new JSZip();const root=source.folder('Nightfall_Workbench_Source_0.2.0');
for(const file of git(['ls-files','-z']).split('\0').filter(Boolean)){
  if(file.startsWith('.beads/')||/(^|\/)\.env(?:\.|$)/.test(file))continue;
  const stat=await fs.lstat(file);assert.ok(stat.isFile(),`Unexpected non-file in source: ${file}`);
  root.file(file,await fs.readFile(file));
}
root.file('SOURCE-REVISION.txt',`Nightfall Workbench 0.2.0\nSource commit: ${revision}\nUpstream baseline: fa3999a977b7f374df75962d6da3a0cbe42a3810\nLocal build, no public upload.\n`);
await fs.writeFile(path.join(output,'Nightfall_Workbench_Source_0.2.0.zip'),await source.generateAsync({type:'nodebuffer',compression:'DEFLATE',compressionOptions:{level:6}}));
const sample=new JSZip(),sampleRoot=sample.folder('Nightfall_Sample');
const sampleDirectory=path.resolve('../nightfall-sample');
async function addDirectory(relative){
  for(const entry of await fs.readdir(path.join(sampleDirectory,relative),{withFileTypes:true})){
    const file=relative?`${relative}/${entry.name}`:entry.name;
    if(entry.isDirectory()){
      if(['cache','saves','.git','tests','build','dist','.renide'].includes(entry.name))continue;
      await addDirectory(file);
    }else{
      if(!entry.isFile()||/\.(rpyc|rpymc|log)$/.test(file)||['project.ide.json','traceback.txt','errors.txt'].includes(entry.name))continue;
      if(relative===''&&!['README.md','.gitattributes','.gitignore','SourceHanSans-LICENSE.txt'].includes(entry.name))continue;
      sampleRoot.file(file,await fs.readFile(path.join(sampleDirectory,file)));
    }
  }
}
await addDirectory('');
for(const file of ['LICENSE','NOTICE-NIGHTFALL.md'])sampleRoot.file(file,await fs.readFile(file));
await fs.writeFile(path.join(output,'Nightfall_Sample_0.2.0.zip'),await sample.generateAsync({type:'nodebuffer',compression:'DEFLATE',compressionOptions:{level:6}}));
for(const file of ['LICENSE','NOTICE-NIGHTFALL.md'])await fs.copyFile(file,path.join(output,file));
await fs.copyFile('docs/团队启动验收记录.md',path.join(output,'验收记录.md'));
await fs.copyFile('docs/nightfall-architecture.md',path.join(output,'架构说明.md'));
await fs.mkdir(path.join(output,'验收证据'),{recursive:true});
for(const file of ['installation.json','installation-payload.json','packaged-result.json','build-fingerprint.json','analysis-comparison.json','project-io-benchmark.json','team-acceptance.json','recovery-acceptance.json','manual-result.json','team-launch-ui.json','team-launcher.json','team-hub-owner.png','team-hub-member.png','packaged-scene.png','packaged-team.png'])await fs.copyFile(path.join('acceptance-output',file),path.join(output,'验收证据',file));
const manifest={version:'0.2.0',sourceCommit:revision,upstream:'fa3999a977b7f374df75962d6da3a0cbe42a3810',installerSha256:installation.installerSha256,files:[]};
async function manifestDirectory(relative=''){
  for(const entry of (await fs.readdir(path.join(output,relative),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
    const file=relative?`${relative}/${entry.name}`:entry.name;
    if(entry.isDirectory())await manifestDirectory(file);
    else if(!['SHA256SUMS.txt','delivery-manifest.json'].includes(file)){
      const bytes=await fs.readFile(path.join(output,file));manifest.files.push({file,bytes:bytes.length,sha256:digest(bytes)});
    }
  }
}
await manifestDirectory();
await fs.writeFile(path.join(output,'delivery-manifest.json'),JSON.stringify(manifest,null,2));
await fs.writeFile(path.join(output,'SHA256SUMS.txt'),manifest.files.map(file=>`${file.sha256}  ${file.file}`).join('\n')+'\n');
console.log(JSON.stringify({directory:output,sourceCommit:revision,files:manifest.files.length},null,2));
