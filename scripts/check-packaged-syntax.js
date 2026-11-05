import { listPackage,extractFile } from '@electron/asar';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import crypto from 'node:crypto';
const archive='release/win-unpacked/resources/app.asar';
let count=0,failures=0;
for(const entry of listPackage(archive)){
  const file=entry.replaceAll('\\','/').replace(/^\//,'');
  if(!/\.(?:c?js|mjs)$/.test(file) || !(file==='electron.js'||file==='bootstrap.cjs'||file.startsWith('src/lib/')||file.startsWith('node_modules/electron-log/')))continue;
  const source=extractFile(archive,entry.replace(/^[\\/]/,''));count++;
  if(fs.existsSync(file) && crypto.createHash('sha256').update(source).digest('hex')!==crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')){
    failures++;console.error(`Archive content differs from source: ${file}`);
  }
  const module=spawnSync(process.execPath,['--check','--input-type=module'],{input:source,encoding:'utf8',windowsHide:true});
  const common=module.status===0?null:spawnSync(process.execPath,['--check','--input-type=commonjs'],{input:source,encoding:'utf8',windowsHide:true});
  if(module.status!==0 && common?.status!==0){failures++;console.error(file+'\n'+module.stderr+'\n'+common.stderr);}
}
console.log(`Checked ${count} packaged JavaScript files; failures: ${failures}`);
if(failures)process.exitCode=1;
