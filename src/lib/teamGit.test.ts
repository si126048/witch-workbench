// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { parseGitStatus, runGit, teamStatus, teamDiff, teamOperation } from './teamGit.js';

const roots: string[] = [];
async function repo() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), '夜幕 team ')); roots.push(root);
  await runGit(root, ['init', '-b', 'main']);
  await runGit(root, ['config', 'user.name', 'Workbench Test']);
  await runGit(root, ['config', 'user.email', 'test@example.invalid']);
  await runGit(root, ['config', 'core.autocrlf', 'false']);
  await fs.writeFile(path.join(root, 'script.rpy'), 'label start:\n    return\n');
  await teamOperation(root, 'commit', { files: ['script.rpy'], message: 'Initial' });
  return root;
}
afterEach(async () => { await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true }))); });
describe('team working copies', () => {
  it('reports authentication failure without prompting or losing local commits', async () => {
    const root=await repo();
    const server=createServer((_request,response)=>{response.writeHead(401,{'WWW-Authenticate':'Basic realm="nightfall-test"'});response.end('Authentication required');});
    await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
    try {
      const address=server.address();
      if(!address || typeof address==='string') throw new Error('Local test server unavailable');
      await expect(runGit(root,['-c','credential.helper=','-c','http.proxy=','ls-remote',`http://127.0.0.1:${address.port}/private.git`],{timeout:10000})).rejects.toThrow();
      expect(await runGit(root,['log','-1','--format=%s'])).toContain('Initial');
    } finally { await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve())); }
  },60000);
  it('parses renames, whitespace and conflict paths without shell quoting', () => {
    expect(parseGitStatus('R  新 名.rpy\0old.rpy\0UU scene.json\0?? -flag.rpy\0')).toEqual([
      { path: '新 名.rpy', original: 'old.rpy', status: 'R ', conflicted: false },
      { path: 'scene.json', status: 'UU', conflicted: true },
      { path: '-flag.rpy', status: '??', conflicted: false },
    ]);
  });
  it('commits offline and blocks dirty branch changes and escaping paths', async () => {
    const root = await repo();
    await fs.writeFile(path.join(root, '中文 file.rpy'), '# scene\n');
    await expect(teamOperation(root, 'branch', { name: 'scene/opening' })).rejects.toThrow('local changes');
    await expect(teamDiff(root, '../secret')).rejects.toThrow('Invalid');
    await teamOperation(root, 'commit', { files: ['中文 file.rpy'], message: 'Scene' });
    await teamOperation(root, 'branch', { name: 'scene/opening' });
    const state = await teamStatus(root);
    expect(state.branch).toBe('scene/opening'); expect(state.files).toEqual([]);
    expect(state.history).toHaveLength(2);
    await expect(teamOperation(root, 'push')).rejects.toThrow();
    expect((await teamStatus(root)).history).toHaveLength(2);
  }, 120000);
  it('supports two copies, fast-forward pull, and explicit three-way conflicts', async () => {
    const first = await repo();
    const bare = await fs.mkdtemp(path.join(os.tmpdir(), 'nightfall-remote-')); roots.push(bare);
    await runGit(bare, ['init', '--bare']);
    await runGit(first, ['remote', 'add', 'origin', bare]);
    await teamOperation(first, 'push');
    const second = await fs.mkdtemp(path.join(os.tmpdir(), 'nightfall-second-')); roots.push(second);
    await runGit(second, ['clone', '--branch', 'main', bare, '.']);
    await runGit(second, ['config', 'user.name', 'Second']);
    await runGit(second, ['config', 'user.email', 'second@example.invalid']);
    await fs.writeFile(path.join(first, 'extra.rpy'), '# extra\n');
    await teamOperation(first, 'commit', { files: ['extra.rpy'], message: 'Extra' });
    await teamOperation(first, 'push');
    await teamOperation(second, 'pull');
    expect((await fs.readFile(path.join(second, 'extra.rpy'), 'utf8')).replace(/\r\n/g,'\n')).toBe('# extra\n');
    for (const [root, text] of [[first, '# first\n'], [second, '# second\n']]) {
      await fs.writeFile(path.join(root, 'script.rpy'), text);
      await teamOperation(root, 'commit', { files: ['script.rpy'], message: text });
    }
    await teamOperation(first, 'push');
    await expect(teamOperation(second, 'pull')).rejects.toThrow();
    await expect(teamOperation(second, 'merge')).rejects.toThrow();
    expect((await teamStatus(second)).files.some(f => f.conflicted)).toBe(true);
    const diff = await teamDiff(second, 'script.rpy');
    expect(diff).toMatchObject({ conflict: true, ours: '# second\n', theirs: '# first\n' });
    await expect(teamOperation(second, 'commit', { files: ['script.rpy'], message: 'bad' })).rejects.toThrow('conflicts');
  }, 180000);
});
