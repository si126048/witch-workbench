import { spawn, execFile } from "node:child_process";
import { chromium } from "playwright";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
const executable = path.resolve(
  process.argv[2] ?? "release/win-unpacked/nightfall-workbench.exe",
);
const project = path.resolve(process.argv[3] ?? "../nightfall-sample");
const data = await fs.mkdtemp(path.join(os.tmpdir(), "nightfall-installed-"));
const output = path.resolve("acceptance-output");
await fs.mkdir(output, { recursive: true });
const env = {
  ...process.env,
  NIGHTFALL_USER_DATA_DIR: data,
  RENIDE_RECOVERY_DIR: path.join(data, "recovery"),
  RENIDE_SETTINGS_OVERRIDE: JSON.stringify({ theme: "dark" }),
};
delete env.ELECTRON_RUN_AS_NODE;
delete env.NODE_OPTIONS;
const preload = process.env.NIGHTFALL_DIAGNOSTIC_PRELOAD;
const child = spawn(
  executable,
  [
    ...(preload ? ["-r", preload] : []),
    "--remote-debugging-port=0",
    "--project",
    project,
  ],
  { env, windowsHide: true, shell: false, stdio: ["ignore", "pipe", "pipe"] },
);
let log = "",
  browser,
  timer;
try {
  const endpoint = await new Promise((resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error("Packaged app startup timeout.\n" + log)),
      60000,
    );
    const receive = (chunk) => {
      log += chunk.toString();
      const match = log.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) resolve(match[1]);
    };
    child.stdout.on("data", receive);
    child.stderr.on("data", receive);
    child.on("error", reject);
    child.on("exit", (code) =>
      reject(new Error(`Packaged app exited ${code}.\n${log}`)),
    );
  });
  clearTimeout(timer);
  browser = await chromium.connectOverCDP(endpoint);
  const context = browser.contexts()[0];
  await context.addInitScript(() =>
    localStorage.setItem("renpy-ide-tutorial-completed", "true"),
  );
  let page = context.pages()[0];
  if (!page) page = await context.waitForEvent("page");
  await page.evaluate(() =>
    localStorage.setItem("renpy-ide-tutorial-completed", "true"),
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-app-ready="true"]', { timeout: 60000 });
  await page
    .locator('[data-analyzing="true"]')
    .waitFor({ state: "hidden", timeout: 120000 });
  await page.getByRole("button", { name: "制作工作台", exact: true }).click();
  await page.getByRole("heading", { name: "团队同步", exact: true }).waitFor();
  await page.screenshot({ path: path.join(output, "packaged-team.png") });
  await page.getByRole("button", { name: "场景演出", exact: true }).click();
  await page.waitForFunction(() =>
    Array.from(document.images).some(
      (i) => i.alt === "street" && i.naturalWidth > 0,
    ),
  );
  await page.getByLabel("时间游标").fill("3");
  await page.screenshot({ path: path.join(output, "packaged-scene.png") });
  await fs.writeFile(
    path.join(output, "packaged-result.json"),
    JSON.stringify({ executable, project, title: await page.title() }, null, 2),
  );
  console.log("Packaged application acceptance passed");
} finally {
  clearTimeout(timer);
  await fs.writeFile(path.join(output, "packaged-start.log"), log);
  try {
    await fs.copyFile(
      path.join(data, "logs/startup.log"),
      path.join(output, "packaged-startup-error.log"),
    );
  } catch {
    /* No startup exception was recorded. */
  }
  await browser?.close().catch(() => {});
  if (child.pid)
    await new Promise((resolve) =>
      execFile(
        "taskkill",
        ["/PID", String(child.pid), "/T", "/F"],
        { windowsHide: true },
        () => resolve(),
      ),
    );
  await fs.rm(data, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 200,
  });
}
