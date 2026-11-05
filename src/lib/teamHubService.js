import fs from "node:fs/promises";
import path from "node:path";
import {
  validateTeamProfile,
  readTeamProfile,
  configureTeam,
  prepareDaily,
  teamReadiness,
  configureIdentity,
  createTeamArchive,
  saveTeamLaunch,
} from "./teamOnboarding.js";
import { runGit, assertRepository } from "./teamGit.js";
import { atomicWriteFile } from "./atomicFileWrite.js";

export function registerTeamHub({
  ipcMain,
  isTrusted,
  getRoot,
  guardRoot,
  authorizeProject,
  chooseDirectory,
  chooseFile,
  chooseSave,
  userData,
  resources,
  shortcut,
  consumeStartup,
  baseDirectory,
}) {
  const register = (name, fn) =>
    ipcMain.handle(`nightfall:hub-${name}`, async (event, ...args) => {
      if (!isTrusted(event.sender))
        return { ok: false, error: "Untrusted sender." };
      try {
        return { ok: true, value: await fn(...args) };
      } catch (error) {
        return { ok: false, error: error.message };
      }
    });
  async function vetted(root) {
    if (typeof root !== "string" || !root)
      throw new Error("请先选择游戏项目。");
    await guardRoot(root);
    return root;
  }
  register("environment", () => teamReadiness(getRoot() || baseDirectory));
  register("import", async () => {
    const file = await chooseFile("选择团队配置", [
      { name: "Nightfall team", extensions: ["json"] },
    ]);
    return file ? readTeamProfile(file) : null;
  });
  register("startup", async () => {
    const file = consumeStartup();
    if (!file) return null;
    const absolute = path.resolve(file),
      localDirectory = path.join(userData, "team-launch");
    if (path.dirname(absolute) === localDirectory) {
      const stat = await fs.stat(absolute);
      if (stat.size > 32768) throw new Error("启动配置过大。");
      const launch = JSON.parse(await fs.readFile(absolute, "utf8"));
      if (
        launch.kind !== "nightfall-local-launch" ||
        launch.version !== 1 ||
        typeof launch.root !== "string" ||
        !path.isAbsolute(launch.root)
      )
        throw new Error("无效的个人启动配置。");
      await fs.access(path.join(launch.root, "game"));
      await authorizeProject(launch.root);
      return { profile: validateTeamProfile(launch.team), root: launch.root };
    }
    return { profile: await readTeamProfile(absolute), root: null };
  });
  register("recent", async () => {
    const directory = path.join(userData, "team-launch");
    let entries;
    try {
      entries = await fs.readdir(directory);
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
    const result = [];
    for (const file of entries
      .filter((file) => /^[a-f0-9]{24}\.json$/.test(file))
      .slice(0, 100)) {
      try {
        const raw = JSON.parse(
          await fs.readFile(path.join(directory, file), "utf8"),
        );
        const profile = validateTeamProfile(raw.team);
        if (
          raw.kind === "nightfall-local-launch" &&
          typeof raw.root === "string" &&
          path.isAbsolute(raw.root)
        ) {
          await fs.access(path.join(raw.root, "game"));
          await authorizeProject(raw.root);
          result.push({ profile, root: raw.root });
        }
      } catch {
        /* stale or malformed local entry */
      }
    }
    return result;
  });
  register("configure", async (input) => {
    const root = await vetted(getRoot());
    await fs.access(path.join(root, "game"));
    const profile = await configureTeam(root, input);
    await saveTeamLaunch(userData, root, profile);
    return profile;
  });
  register("export", async (input, includeInstaller) => {
    const profile = validateTeamProfile(input);
    let installer;
    if (includeInstaller) {
      installer = await chooseFile("选择要附带的夜幕工作台安装程序", [
        { name: "Windows installer", extensions: ["exe"] },
      ]);
      if (!installer) return null;
    }
    const destination = await chooseSave(
      "保存团队加入包",
      "Nightfall_Team_Join.zip",
      [{ name: "ZIP", extensions: ["zip"] }],
    );
    if (!destination) return null;
    const bytes = await createTeamArchive(profile, resources, installer);
    await atomicWriteFile(destination, bytes);
    return destination;
  });
  register("join", async (input) => {
    const profile = validateTeamProfile(input);
    const root = await chooseDirectory("为团队工作副本选择空文件夹");
    if (!root) return null;
    if ((await fs.readdir(root)).length)
      throw new Error("请选择空文件夹，不覆盖已有内容。");
    await runGit(
      root,
      [
        "clone",
        "--progress",
        "--branch",
        profile.branch,
        "--",
        profile.remote,
        ".",
      ],
      { timeout: 600000 },
    );
    await fs.access(path.join(root, "game"));
    await assertRepository(root);
    await authorizeProject(root);
    await runGit(root, ["lfs", "install", "--local"]);
    await saveTeamLaunch(userData, root, profile);
    return { profile, root };
  });
  register("identity", async (root, name, email) =>
    configureIdentity(await vetted(root), name, email),
  );
  register("daily", async (root) => prepareDaily(await vetted(root)));
  register("shortcut", async (root, input) => {
    await vetted(root);
    await assertRepository(root);
    const profile = validateTeamProfile(input);
    if (
      (await runGit(root, ["config", "--get", "remote.origin.url"])).trim() !==
      profile.remote
    )
      throw new Error(
        "团队配置与当前副本的 origin 不一致，请先选择正确的团队。",
      );
    const launch = await saveTeamLaunch(userData, root, profile);
    const destination = await chooseSave(
      "保存日常启动快捷方式",
      "Nightfall_Team.lnk",
      [{ name: "Windows shortcut", extensions: ["lnk"] }],
    );
    if (!destination) return null;
    await shortcut(destination, launch);
    return destination;
  });
}
