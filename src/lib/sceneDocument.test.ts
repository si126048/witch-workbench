// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { generateScene, sampleScene, serializeScene, scenePoseAt, validateScene } from './sceneDocument.js';
import { loadScene, saveScene, validateScenePairs } from './nightfallService.js';
const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(p => fs.rm(p, { recursive: true, force: true }))); });
describe('scene production contract', () => {
  it('serializes deterministically and treats dialogue as literal text', () => {
    const doc = sampleScene();
    const swapped = { ...doc, layers: [...doc.layers].reverse(), events: [...doc.events].reverse() };
    expect(serializeScene(doc)).toBe(serializeScene(swapped));
    expect(generateScene(doc)).toContain('label nf_opening:');
    expect(generateScene(doc)).toContain('linear 8 xcenter 0.48');
    const dialogue = doc.events.find(e => e.type === 'dialogue')!;
    dialogue.text = '[secret] {b} 100%';
    expect(generateScene(doc)).toContain('[[secret] {{b} 100%%');
    expect(scenePoseAt(doc.layers[1],1).alpha).toBe(.5);
  });
  it('rejects invalid versions, duplicate IDs, traversal, nonfinite poses and unordered frames', () => {
    const cases = [
      (d: ReturnType<typeof sampleScene>) => { d.version = 99; },
      (d: ReturnType<typeof sampleScene>) => { d.layers[0].asset = 'game/../../secret.png'; },
      (d: ReturnType<typeof sampleScene>) => { d.layers[0].id = d.layers[1].id; },
      (d: ReturnType<typeof sampleScene>) => { d.layers[0].keyframes[0].x = NaN; },
      (d: ReturnType<typeof sampleScene>) => { d.layers[0].keyframes.reverse(); },
    ];
    for (const modify of cases) { const doc=sampleScene();modify(doc);expect(() => validateScene(doc)).toThrow(); }
  });
  it('saves a pair, reopens it, and rejects stale or inconsistent changes', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), '夜幕 scene ')); directories.push(root);
    const doc = sampleScene();
    for (const file of ['game/images/nightfall_street.png','game/images/nightfall_traveler.png','game/audio/nightfall_rain.wav','game/audio/nightfall_bell.wav']) {
      await fs.mkdir(path.dirname(path.join(root,file)), {recursive:true}); await fs.writeFile(path.join(root,file),'asset');
    }
    const initial=await loadScene(root,'opening');
    const saved=await saveScene(root,doc,initial.revision);
    expect(saved.script).toBe(generateScene(doc));
    expect((await loadScene(root,'opening')).scene).toEqual(JSON.parse(serializeScene(doc)));
    const concurrent = await Promise.allSettled([
      saveScene(root,{...doc,title:'First edit'},saved.revision),
      saveScene(root,{...doc,title:'Second edit'},saved.revision),
    ]);
    expect(concurrent.filter(result=>result.status==='fulfilled')).toHaveLength(1);
    await expect(saveScene(root,doc,initial.revision)).rejects.toThrow('changed on disk');
    const pair=['.nightfall/scenes/opening.json','game/nightfall_generated/opening.rpy'];
    await validateScenePairs(root,pair);
    await expect(validateScenePairs(root,pair.slice(0,1))).rejects.toThrow('together');
    await fs.writeFile(path.join(root,pair[1]),'# manual edit');
    await expect(validateScenePairs(root,pair)).rejects.toThrow('out of date');
    await fs.unlink(path.join(root,pair[0]));await fs.unlink(path.join(root,pair[1]));
    await validateScenePairs(root,pair);
  }, 30000);
});
