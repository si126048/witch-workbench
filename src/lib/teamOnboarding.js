import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import JSZip from "jszip";
import {
  runGit,
  teamStatus,
  assertRepository,
  gitEnvironment,
} from "./teamGit.js";
import { atomicWriteFile } from "./atomicFileWrite.js";
const controlCharacters = (value) =>
  [...value].some(
    (character) =>
      character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
  );

export function validateTeamRemote(remote) {
  if (
    typeof remote !== "string" ||
    remote.length > 2000 ||
    /\s/.test(remote) ||
    controlCharacters(remote)
  )
    throw new Error("请输入不含凭据的 HTTPS 或 SSH 仓库地址。");
  if (/^https:\/\//.test(remote)) {
    const url = new URL(remote);
    if (!url.hostname || url.username || url.password || url.search || url.hash)
      throw new Error("仓库地址不能包含密码、令牌、查询参数或片段。");
  } else if (!/^[\w.-]+@[\w.-]+:[\w./-]+$/.test(remote))
    throw new Error("仅支持 HTTPS 或 user@host:path 形式的 SSH 地址。");
  return remote;
}
export function validateTeamProfile(input) {
  if (!input || input.kind !== "nightfall-team" || input.version !== 1)
    throw new Error("不支持的团队配置版本。");
  if (
    typeof input.name !== "string" ||
    !input.name.trim() ||
    input.name.length > 80 ||
    controlCharacters(input.name)
  )
    throw new Error("团队名称应为 1–80 个字符。");
  if (
    typeof input.branch !== "string" ||
    !/^[a-zA-Z0-9][a-zA-Z0-9/_-]{0,100}$/.test(input.branch) ||
    input.branch.includes("//") ||
    input.branch.endsWith("/")
  )
    throw new Error("请输入有效的默认分支名称。");
  if (
    typeof input.sdkVersion !== "string" ||
    !/^\d+\.\d+\.\d+$/.test(input.sdkVersion)
  )
    throw new Error("SDK 版本应为例如 8.5.3 的格式。");
  return {
    kind: "nightfall-team",
    version: 1,
    name: input.name.trim(),
    remote: validateTeamRemote(input.remote),
    branch: input.branch,
    sdkVersion: input.sdkVersion,
  };
}
export async function readTeamProfile(file) {
  const stat = await fs.stat(file);
  if (stat.size > 16384) throw new Error("团队配置文件过大。");
  return validateTeamProfile(JSON.parse(await fs.readFile(file, "utf8")));
}
export async function configureTeam(root, input) {
  const profile = validateTeamProfile(input);
  await runGit(root, ["check-ref-format", "--branch", profile.branch]);
  try {
    await runGit(root, ["rev-parse", "--show-toplevel"]);
    await assertRepository(root);
  } catch (error) {
    // Only initialise a genuinely unversioned directory, never a nested repo.
    let inside = false;
    try {
      await runGit(root, ["rev-parse", "--show-toplevel"]);
      inside = true;
    } catch {
      /* no enclosing repository */
    }
    if (inside) throw error;
    await runGit(root, ["init", "-b", profile.branch]);
  }
  let remote;
  try {
    remote = (
      await runGit(root, ["config", "--get", "remote.origin.url"])
    ).trim();
  } catch {
    /* no origin */
  }
  if (remote && remote !== profile.remote)
    throw new Error(
      "现有 origin 与配置不同，请在仓库管理中明确处理；不会覆盖远端。",
    );
  if (!remote) await runGit(root, ["remote", "add", "origin", profile.remote]);
  return profile;
}
export async function prepareDaily(root) {
  const status = await teamStatus(root);
  if (!status.repository) throw new Error("该目录不是独立的 Git 工作副本。");
  let warning = "";
  try {
    await runGit(root, ["fetch", "--progress", "origin"], { timeout: 30000 });
  } catch (error) {
    warning = `远端获取失败，仍可离线工作：${error.message}`;
  }
  return { root, warning, status: await teamStatus(root) };
}
export async function teamReadiness(root) {
  const environment = await gitEnvironment(root);
  let name = "",
    email = "";
  if (environment.git) {
    for (const key of ["user.name", "user.email"]) {
      try {
        const value = (await runGit(root, ["config", "--get", key])).trim();
        if (key === "user.name") name = value;
        else email = value;
      } catch {
        /* first use */
      }
    }
  }
  return { ...environment, name, email };
}
export async function configureIdentity(root, name, email) {
  for (const value of [name, email])
    if (
      typeof value !== "string" ||
      !value.trim() ||
      value.length > 200 ||
      controlCharacters(value)
    )
      throw new Error("请填写有效的提交姓名和邮箱。");
  await runGit(root, ["config", "--local", "user.name", name.trim()]);
  await runGit(root, ["config", "--local", "user.email", email.trim()]);
  await runGit(root, ["lfs", "install", "--local"]);
}
export async function createTeamArchive(profile, resources, installerFile) {
  const validated = validateTeamProfile(profile),
    zip = new JSZip();
  zip.file(
    "team.nightfall-team.json",
    JSON.stringify(validated, null, 2) + "\n",
  );
  for (const file of ["加入团队.cmd", "Start-Team.ps1", "README.txt"])
    zip.file(file, await fs.readFile(path.join(resources, file)));
  if (installerFile) {
    if (path.extname(installerFile).toLowerCase() !== ".exe")
      throw new Error("安装程序必须是 .exe 文件。");
    const stat = await fs.stat(installerFile);
    if (stat.size > 400 * 1024 * 1024) throw new Error("安装包超过 400 MB。");
    const bytes = await fs.readFile(installerFile);
    if (bytes.length < 2 || bytes[0] !== 0x4d || bytes[1] !== 0x5a)
      throw new Error("请选择有效的 Windows 安装程序。");
    zip.file("Nightfall_Setup.exe", bytes);
    zip.file(
      "installer.sha256",
      crypto.createHash("sha256").update(bytes).digest("hex"),
    );
  }
  return zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 3 },
  });
}
export async function saveTeamLaunch(userData, root, profile) {
  const directory = path.join(userData, "team-launch");
  await fs.mkdir(directory, { recursive: true });
  const id = crypto
    .createHash("sha256")
    .update(root)
    .digest("hex")
    .slice(0, 24);
  const file = path.join(directory, id + ".json");
  await atomicWriteFile(
    file,
    JSON.stringify(
      {
        kind: "nightfall-local-launch",
        version: 1,
        root,
        team: validateTeamProfile(profile),
      },
      null,
      2,
    ),
    "utf8",
  );
  return file;
}
