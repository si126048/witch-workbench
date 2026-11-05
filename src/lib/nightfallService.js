import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { validateProjectPath } from "./ipcSecurity.js";
import {
  commitSaveTransaction,
  recoverSaveTransaction,
} from "./saveTransaction.js";
import { atomicWriteFile } from "./atomicFileWrite.js";
import {
  generateScene,
  scenePaths,
  serializeScene,
  validateScene,
} from "./sceneDocument.js";
import {
  runGit,
  teamStatus,
  teamDiff,
  teamOperation,
  teamRulesPreview,
} from "./teamGit.js";

const hash = (text) =>
  text === null ? null : crypto.createHash("sha256").update(text).digest("hex");
async function read(root, relative) {
  const absolute = path.join(root, relative);
  const error = await validateProjectPath(absolute, root);
  if (error) throw new Error(error);
  try {
    return await fs.readFile(absolute, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

export async function loadScene(root, id) {
  const recovery = await recoverSaveTransaction(root);
  if (recovery.status === "failed") throw new Error(recovery.error);
  const paths = scenePaths(id);
  const document = await read(root, paths.document),
    script = await read(root, paths.script);
  return {
    scene: document === null ? null : validateScene(JSON.parse(document)),
    document,
    script,
    revision: { document: hash(document), script: hash(script) },
  };
}

export async function saveScene(root, scene, expected) {
  validateScene(scene);
  const paths = scenePaths(scene.id),
    current = await loadScene(root, scene.id);
  if (
    !expected ||
    current.revision.document !== expected.document ||
    current.revision.script !== expected.script
  )
    throw new Error("Scene changed on disk. Reload and compare before saving.");
  for (const layer of scene.layers) {
    const error = await validateProjectPath(path.join(root, layer.asset), root);
    if (error) throw new Error(error);
    await fs.access(path.join(root, layer.asset));
  }
  for (const event of scene.events.filter(
    (e) => e.type === "music" || e.type === "sound",
  )) {
    const error = await validateProjectPath(path.join(root, event.asset), root);
    if (error) throw new Error(error);
    await fs.access(path.join(root, event.asset));
  }
  const entries = [
    { path: path.join(root, paths.document), content: serializeScene(scene) },
    { path: path.join(root, paths.script), content: generateScene(scene) },
  ];
  await commitSaveTransaction(root, entries, {
    validateBeforeStage: async () => {
      const [document, script] = await Promise.all([
        read(root, paths.document),
        read(root, paths.script),
      ]);
      if (
        hash(document) !== expected.document ||
        hash(script) !== expected.script
      )
        throw new Error(
          "Scene changed on disk. Reload and compare before saving.",
        );
    },
  });
  return loadScene(root, scene.id);
}

export async function validateScenePairs(root, files) {
  const ids = new Set();
  for (const file of files) {
    const match =
      file.match(/^\.nightfall\/scenes\/([a-z][a-z0-9_]*)\.json$/) ??
      file.match(/^game\/nightfall_generated\/([a-z][a-z0-9_]*)\.rpy$/);
    if (match) ids.add(match[1]);
  }
  for (const id of ids) {
    const paths = scenePaths(id);
    if (!files.includes(paths.document) || !files.includes(paths.script))
      throw new Error(
        `Commit scene ${id} document and generated script together.`,
      );
    const loaded = await loadScene(root, id);
    if (loaded.document === null && loaded.script === null) continue;
    if (
      !loaded.scene ||
      loaded.script?.replace(/\r\n/g, "\n") !== generateScene(loaded.scene)
    )
      throw new Error(
        `Scene ${id} script is missing or out of date. Regenerate before committing.`,
      );
  }
}

export function registerNightfallHandlers({
  ipcMain,
  getRoot,
  isTrusted,
  sendProgress,
  recoveryRoot,
  chooseCloneDirectory,
  authorizeProject,
}) {
  ipcMain.handle("nightfall:clone", async (event, remote) => {
    if (!isTrusted(event.sender))
      return { ok: false, error: "Untrusted sender." };
    try {
      if (
        typeof remote !== "string" ||
        remote.length > 2000 ||
        !(
          /^[\w.-]+@[\w.-]+:[\w./-]+$/.test(remote) ||
          /^https:\/\//.test(remote)
        )
      )
        throw new Error("Use an HTTPS or SSH Git remote.");
      if (remote.startsWith("https:")) {
        const url = new URL(remote);
        if (url.username || url.password || url.search || url.hash)
          throw new Error(
            "Do not embed credentials or tokens in the remote URL.",
          );
      }
      const destination = await chooseCloneDirectory();
      if (!destination) return { ok: true, value: null };
      if ((await fs.readdir(destination)).length)
        throw new Error("Choose an empty folder for the new working copy.");
      await runGit(destination, ["clone", "--progress", "--", remote, "."], {
        timeout: 600000,
        progress: sendProgress,
      });
      await authorizeProject(destination);
      return { ok: true, value: destination };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });
  const register = (name, fn) =>
    ipcMain.handle(`nightfall:${name}`, async (event, ...args) => {
      if (!isTrusted(event.sender))
        return { ok: false, error: "Untrusted sender." };
      const root = getRoot();
      if (!root) return { ok: false, error: "Open a project first." };
      try {
        return { ok: true, value: await fn(root, ...args) };
      } catch (error) {
        return { ok: false, error: error.message };
      }
    });
  register("status", teamStatus);
  register("init", async (root) => {
    // Do not silently create a nested repository inside another worktree.
    try {
      await runGit(root, ["rev-parse", "--show-toplevel"]);
    } catch {
      return runGit(root, ["init", "-b", "main"]);
    }
    throw new Error(
      "This directory is already inside a Git working tree. Open its root.",
    );
  });
  register("diff", teamDiff);
  register("rules", teamRulesPreview);
  register("team", (root, action, payload) =>
    teamOperation(root, action, payload, {
      progress: (text) => sendProgress(text),
      validateScenePairs: (files) => validateScenePairs(root, files),
      validateStagedPairs: async (files) => {
        const ids = files
          .map(
            (file) =>
              file.match(/^\.nightfall\/scenes\/([a-z][a-z0-9_]*)\.json$/)?.[1],
          )
          .filter(Boolean);
        const deleted = new Set(
          (
            await runGit(root, [
              "diff",
              "--cached",
              "--name-only",
              "--diff-filter=D",
              "-z",
            ])
          ).split("\0"),
        );
        for (const id of ids) {
          const paths = scenePaths(id);
          if (deleted.has(paths.document) && deleted.has(paths.script))
            continue;
          const [doc, script] = await Promise.all([
            runGit(root, ["show", `:${paths.document}`]),
            runGit(root, ["show", `:${paths.script}`]),
          ]);
          if (script.replace(/\r\n/g, "\n") !== generateScene(JSON.parse(doc)))
            throw new Error(
              `Staged scene ${id} is inconsistent; review the selected files again.`,
            );
        }
      },
      resolveFile: async (file, content) => {
        if (/^\.nightfall\/scenes\/.*\.json$/.test(file))
          validateScene(JSON.parse(content));
        const error = await validateProjectPath(path.join(root, file), root);
        if (error) throw new Error(error);
        await commitSaveTransaction(root, [
          { path: path.join(root, file), content },
        ]);
      },
      saveRules: (preview) =>
        commitSaveTransaction(root, [
          {
            path: path.join(root, ".gitattributes"),
            content: preview.attributes,
          },
          { path: path.join(root, ".gitignore"), content: preview.ignore },
        ]),
    }),
  );
  register("scene-load", loadScene);
  register("scene-save", saveScene);
  const draftPath = (root, id) => {
    scenePaths(id);
    return path.join(recoveryRoot, hash(root), id + ".json");
  };
  register("scene-draft-write", async (root, scene, revision) => {
    validateScene(scene);
    const target = draftPath(root, scene.id);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await atomicWriteFile(target, JSON.stringify({ scene, revision }), "utf8");
  });
  register("scene-draft-read", async (root, id) => {
    try {
      const draft = JSON.parse(await fs.readFile(draftPath(root, id), "utf8"));
      validateScene(draft.scene);
      return draft;
    } catch (err) {
      if (err.code === "ENOENT") return null;
      throw err;
    }
  });
  register("scene-draft-clear", async (root, id) => {
    await fs.rm(draftPath(root, id), { force: true });
  });
  register("scene-list", async (root) => {
    const directory = path.join(root, ".nightfall/scenes");
    const error = await validateProjectPath(directory, root);
    if (error) throw new Error(error);
    try {
      return (await fs.readdir(directory))
        .filter((f) => /^[a-z][a-z0-9_]{0,63}\.json$/.test(f))
        .map((f) => f.slice(0, -5));
    } catch (err) {
      if (err.code === "ENOENT") return [];
      throw err;
    }
  });
}
