import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { _electron } from "playwright";
import JSZip from "jszip";
import { runGit, TEAM_IGNORE } from "../src/lib/teamGit.js";
import {
  launchElectron,
  suppressFirstRunTutorial,
  forceExit,
} from "../e2e/electron-launch.js";
const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), "nightfall-hub-ui-"));
assert.equal(path.dirname(sandbox), os.tmpdir());
assert.ok(path.basename(sandbox).startsWith("nightfall-hub-ui-"));
let app;
try {
  const owner = path.join(sandbox, "owner"),
    member = path.join(sandbox, "member"),
    remote = path.join(sandbox, "remote.git"),
    userData = path.join(sandbox, "user");
  for (const directory of [owner, member, remote]) await fs.mkdir(directory);
  await fs.mkdir(path.join(owner, "game"));
  await fs.writeFile(
    path.join(owner, "game/script.rpy"),
    "label start:\n    return\n",
  );
  await fs.writeFile(path.join(owner, ".gitignore"), TEAM_IGNORE);
  await runGit(owner, ["init", "-b", "main"]);
  await runGit(owner, ["config", "user.name", "Owner"]);
  await runGit(owner, ["config", "user.email", "owner@example.invalid"]);
  await runGit(owner, ["add", "."]);
  await runGit(owner, ["commit", "-m", "Game"]);
  await runGit(remote, ["init", "--bare", "-b", "main"]);
  await runGit(owner, ["remote", "add", "origin", remote]);
  await runGit(owner, ["push", "origin", "main"]);
  const profile = {
    kind: "nightfall-team",
    version: 1,
    name: "夜幕验收团队",
    remote: "https://example.invalid/team/game.git",
    branch: "main",
    sdkVersion: "8.5.3",
  };
  await runGit(owner, ["remote", "set-url", "origin", profile.remote]);
  const env = {
    ...process.env,
    NIGHTFALL_USER_DATA_DIR: userData,
    RENIDE_RECOVERY_DIR: path.join(sandbox, "recovery"),
    RENIDE_SETTINGS_OVERRIDE: JSON.stringify({
      theme: "dark",
      renpyPath: path.resolve("../.cache/witch-tools/renpy/renpy-8.5.3-sdk"),
    }),
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: `url.${pathToFileURL(remote).href}.insteadOf`,
    GIT_CONFIG_VALUE_0: profile.remote,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.NODE_OPTIONS;
  app = await launchElectron(_electron, {
    args: [path.resolve("bootstrap.cjs"), "--project", owner],
    env,
  });
  await suppressFirstRunTutorial(app);
  const page = await app.firstWindow();
  page.setDefaultTimeout(30000);
  await page.evaluate(() =>
    localStorage.setItem("renpy-ide-tutorial-completed", "true"),
  );
  await page.reload();
  await page.waitForSelector('[data-project-ready="true"]', {
    timeout: 120000,
  });
  console.log("Owner project loaded");
  const save = page.getByRole("button", { name: "Save All", exact: true });
  if (await save.isEnabled()) {
    await save.click();
    await save.waitFor({ state: "visible" });
    await page.waitForFunction(
      () =>
        document.querySelector('button[aria-label="Save All"]')?.disabled ===
        true,
    );
  }
  const joinZip = path.join(sandbox, "join.zip");
  await app.evaluate(
    ({ dialog }, targets) => {
      dialog.showSaveDialog = async () => ({
        canceled: false,
        filePath: targets.zip,
      });
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [targets.member],
      });
    },
    { zip: joinZip, member },
  );
  await page.getByRole("button", { name: "团队协作启动", exact: true }).click();
  await page.getByRole("button", { name: "负责人建队", exact: true }).click();
  await page.getByLabel("团队名称", { exact: true }).fill(profile.name);
  await page.getByLabel("游戏仓库地址", { exact: true }).fill(profile.remote);
  if (
    await page
      .getByRole("button", { name: "配置当前游戏仓库", exact: true })
      .isDisabled()
  )
    await page
      .getByRole("button", { name: "保存剧本与项目设置", exact: true })
      .click();
  await page
    .getByRole("button", { name: "配置当前游戏仓库", exact: true })
    .click();
  await page.getByText("团队远端已配置。", { exact: false }).waitFor();
  await page.getByLabel("导出时选择并附带工作台安装包").uncheck();
  await page
    .getByRole("button", { name: "生成成员加入包", exact: true })
    .click();
  await page.getByText("加入包已保存：", { exact: false }).waitFor();
  const zip = await JSZip.loadAsync(await fs.readFile(joinZip));
  assert.deepEqual(
    JSON.parse(await zip.file("team.nightfall-team.json").async("string")),
    profile,
  );
  await fs.mkdir("acceptance-output", { recursive: true });
  await page.screenshot({ path: "acceptance-output/team-hub-owner.png" });
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  const config = path.join(sandbox, "team.nightfall-team.json");
  await fs.writeFile(config, JSON.stringify(profile));
  const second = spawn(
    path.resolve("node_modules/electron/dist/electron.exe"),
    [path.resolve("bootstrap.cjs"), "--team", config],
    { env, windowsHide: true, stdio: "ignore" },
  );
  assert.equal(
    await new Promise((resolve, reject) => {
      second.on("error", reject);
      second.on("exit", resolve);
    }),
    0,
  );
  await page.getByRole("dialog", { name: "团队协作启动" }).waitFor();
  assert.equal(
    await page.getByLabel("游戏仓库地址", { exact: true }).inputValue(),
    profile.remote,
  );
  await page
    .getByRole("button", { name: "选择目录并加入团队", exact: true })
    .click();
  await page
    .getByText("克隆完成。", { exact: false })
    .waitFor({ timeout: 120000 });
  assert.match(
    await fs.readFile(path.join(member, "game/script.rpy"), "utf8"),
    /label start/,
  );
  await page.getByLabel("提交姓名", { exact: true }).fill("Member");
  await page
    .getByLabel("提交邮箱", { exact: true })
    .fill("member@example.invalid");
  await page
    .getByRole("button", { name: "保存该副本的身份", exact: true })
    .click();
  await page.getByText("已为该副本保存提交身份", { exact: false }).waitFor();
  assert.equal(
    (await runGit(member, ["config", "--local", "user.name"])).trim(),
    "Member",
  );
  await page.screenshot({ path: "acceptance-output/team-hub-member.png" });
  const shortcut = path.join(sandbox, "daily.lnk");
  await app.evaluate(({ dialog }, destination) => {
    dialog.showSaveDialog = async () => ({
      canceled: false,
      filePath: destination,
    });
  }, shortcut);
  await page
    .getByRole("button", { name: "创建日常快捷方式", exact: true })
    .click();
  await page.getByText("日常快捷方式已保存：", { exact: false }).waitFor();
  assert.ok((await fs.stat(shortcut)).size > 0);
  await forceExit(app);
  app = null;
  const localLaunch = path.join(
    userData,
    "team-launch",
    (await fs.readdir(path.join(userData, "team-launch"))).find(
      (file) => file.endsWith(".json") && file,
    ),
  );
  // Pick the member entry when the owner also has a saved profile.
  let memberLaunch = localLaunch;
  for (const file of await fs.readdir(path.join(userData, "team-launch"))) {
    const candidate = path.join(userData, "team-launch", file);
    if (JSON.parse(await fs.readFile(candidate, "utf8")).root === member)
      memberLaunch = candidate;
  }
  app = await launchElectron(_electron, {
    args: [path.resolve("bootstrap.cjs"), "--team", memberLaunch],
    env,
  });
  const dailyPage = await app.firstWindow();
  await dailyPage.waitForSelector('[data-project-ready="true"]', {
    timeout: 120000,
  });
  await dailyPage
    .getByRole("dialog", { name: "团队协作启动" })
    .waitFor({ state: "hidden" });
  assert.ok((await dailyPage.title()).includes(member));
  await fs.writeFile(
    "acceptance-output/team-launch-ui.json",
    JSON.stringify(
      {
        passed: true,
        ownerExport: true,
        secondInstanceRouting: true,
        memberClone: true,
        localIdentity: true,
        windowsShortcut: true,
        dailyAutomaticOpen: true,
      },
      null,
      2,
    ),
  );
  console.log(
    "Owner setup/export, second-instance join, real clone, local identity, Windows shortcut and daily auto-open passed",
  );
} catch (error) {
  if (app) {
    const pages = app.context().pages();
    for (const [index, page] of pages.entries()) {
      await page
        .screenshot({ path: `acceptance-output/team-hub-failure-${index}.png` })
        .catch(() => {});
      console.error(
        await page
          .locator("body")
          .innerText()
          .catch(() => ""),
      );
    }
  }
  throw error;
} finally {
  if (app) await forceExit(app);
  await fs.rm(sandbox, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 200,
  });
}
