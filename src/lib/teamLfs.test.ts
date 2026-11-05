// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { runGit, TEAM_ATTRIBUTES, teamOperation } from './teamGit.js';
let hasLfs = false;
try { execFileSync('git',['lfs','version'],{windowsHide:true,stdio:'ignore'});hasLfs=true; } catch { /* Availability is reported by the app. */ }
const directories: string[]=[];
afterEach(async()=>{await Promise.all(directories.splice(0).map(p=>fs.rm(p,{recursive:true,force:true,maxRetries:10,retryDelay:100})));});
describe.skipIf(!hasLfs)('LFS working copy transfer',()=>{
  it('uploads binary objects, downloads them in a second copy, and retains a rejected push',async()=>{
    const base=await fs.mkdtemp(path.join(os.tmpdir(),'nightfall-lfs-'));directories.push(base);
    const first=path.join(base,'first'),bare=path.join(base,'remote.git'),second=path.join(base,'second');
    await fs.mkdir(first);await fs.mkdir(bare);await fs.mkdir(second);
    await runGit(bare,['init','--bare']);await runGit(first,['init','-b','main']);
    await runGit(first,['config','user.name','LFS Test']);await runGit(first,['config','user.email','lfs@example.invalid']);
    await runGit(first,['lfs','install','--local']);
    await fs.writeFile(path.join(first,'.gitattributes'),TEAM_ATTRIBUTES);
    const binary=Buffer.from(Array.from({length:2048},(_,i)=>(i*137)%256));
    await fs.writeFile(path.join(first,'sprite.png'),binary);
    await runGit(first,['add','--','.gitattributes','sprite.png']);await runGit(first,['commit','-m','Binary scene asset']);
    expect(await runGit(first,['show','HEAD:sprite.png'])).toContain('https://git-lfs.github.com/spec/v1');
    await runGit(first,['remote','add','origin',bare]);await teamOperation(first,'push');
    await runGit(second,['clone','--branch','main',bare,'.']);
    expect(await fs.readFile(path.join(second,'sprite.png'))).toEqual(binary);
    await fs.writeFile(path.join(first,'script.rpy'),'label start:\n    return\n');
    await teamOperation(first,'commit',{files:['script.rpy'],message:'Offline change'});
    // A deterministic local transport rejection, without depending on public services or credentials.
    await runGit(bare,['config','receive.denyCurrentBranch','refuse']);
    await runGit(first,['remote','set-url','--push','origin',path.join(base,'missing-remote.git')]);
    await expect(teamOperation(first,'push')).rejects.toThrow();
    expect(await runGit(first,['log','-1','--format=%s'])).toContain('Offline change');
  },240000);
});
