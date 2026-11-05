import { _electron as electron } from "playwright";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  launchElectron,
  suppressFirstRunTutorial,
  forceExit,
  APP_ENTRY,
} from "../e2e/electron-launch.js";

const project = path.resolve(process.argv[2] ?? "../nightfall-sample");
const output = path.resolve("acceptance-output");
await fs.mkdir(output, { recursive: true });
const data = await fs.mkdtemp(path.join(os.tmpdir(), "nightfall-ui-"));
const executablePath = process.env.NIGHTFALL_EXE;
const app = await launchElectron(electron, {
  ...(executablePath ? { executablePath } : {}),
  args: executablePath
    ? ["--project", project]
    : [APP_ENTRY, "--project", project],
  env: {
    NIGHTFALL_USER_DATA_DIR: data,
    RENIDE_RECOVERY_DIR: path.join(data, "recovery"),
    RENIDE_SETTINGS_OVERRIDE: JSON.stringify({
      theme: "dark",
      renpyPath: "D:/ai/.cache/witch-tools/renpy/renpy-8.5.3-sdk",
    }),
  },
  timeout: 120000,
});
let page;
try {
  await suppressFirstRunTutorial(app);
  page = await app.firstWindow();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.waitForSelector('[data-app-ready="true"]', { timeout: 120000 });
  await page.getByRole("button", { name: "制作工作台" }).click();
  await page.getByRole("heading", { name: "团队同步", exact: true }).waitFor();
  await page.screenshot({ path: path.join(output, "team.png") });
  await page.getByRole("button", { name: "场景演出", exact: true }).click();
  await page.getByLabel("场景标题").waitFor();
  await page.waitForFunction(
    () =>
      Array.from(document.querySelectorAll("img")).some(
        (img) => img.alt === "street" && img.naturalWidth > 0,
      ),
    { timeout: 30000 },
  );
  await page.getByLabel("时间游标").fill("3");
  await page.screenshot({ path: path.join(output, "scene.png") });
  const loaded = await page.evaluate(() =>
    window.electronAPI.nightfall.sceneLoad("opening"),
  );
  if (!loaded.ok || !loaded.value.scene)
    throw new Error("Scene IPC round trip failed");
  if (errors.length) throw new Error(errors.join("\n"));
  await fs.writeFile(
    path.join(output, "ui-result.json"),
    JSON.stringify(
      {
        project,
        title: await page.title(),
        errors,
        scene: loaded.value.scene.id,
      },
      null,
      2,
    ),
  );
  console.log("UI acceptance passed");
} catch (error) {
  if (page) {
    await page
      .screenshot({ path: path.join(output, "failure.png") })
      .catch(() => {});
    console.error(
      await page
        .evaluate(() => ({
          text: document.body.innerText,
          images: Array.from(document.querySelectorAll("img")).map((i) => ({
            src: i.src,
            alt: i.alt,
            width: i.naturalWidth,
          })),
        }))
        .catch(() => null),
    );
  }
  throw error;
} finally {
  await forceExit(app);
  await fs.rm(data, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 200,
  });
}
