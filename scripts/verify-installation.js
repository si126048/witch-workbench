import fs from "node:fs/promises";
import path from "node:path";
const { version } = JSON.parse(await fs.readFile('package.json', 'utf8'));

import crypto from "node:crypto";
import { execFile, spawn } from "node:child_process";
const installer = path.resolve(`release/Nightfall_Workbench_Windows_${version}.exe`);
const cache = path.resolve("../.cache/witch-tools");
const target = path.join(cache, "installed-nightfall");
if (path.dirname(target) !== cache)
  throw new Error("Unexpected installation target");
try {
  if ((await fs.readdir(target)).length)
    throw new Error("Installation test target must be empty");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
function execute(file, args, timeout = 180000) {
  return new Promise((resolve, reject) =>
    execFile(
      file,
      args,
      { windowsHide: true, timeout },
      (error, stdout, stderr) =>
        error
          ? reject(new Error(`${error.message}\n${stdout}\n${stderr}`))
          : resolve(),
    ),
  );
}
await execute(installer, ["/S", `/D=${target}`]);
const executable = path.join(target, "nightfall-workbench.exe");
await fs.access(executable);
let verified = false;
let missingUninstaller = false;
try {
  const digest = async (file) =>
    crypto
      .createHash("sha256")
      .update(await fs.readFile(file))
      .digest("hex");
  const expected = await digest("release/win-unpacked/resources/app.asar");
  const actual = await digest(path.join(target, "resources/app.asar"));
  await fs.mkdir("acceptance-output", { recursive: true });
  await fs.writeFile(
    "acceptance-output/installation-payload.json",
    JSON.stringify({ expected, actual, equal: expected === actual }, null, 2),
  );
  if (actual !== expected)
    throw new Error("Installer payload differs from the accepted packaged app");
  await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        "scripts/verify-packaged.js",
        executable,
        path.resolve("../nightfall-sample"),
      ],
      { shell: false, windowsHide: true, stdio: "inherit" },
    );
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`Installed application test exited ${code}`)),
    );
  });
  await execute(path.join(process.env.SystemRoot || 'C:/Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe'), ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.resolve('scripts/verify-team-launcher.ps1'), '-LauncherPath', path.join(target, 'resources/team-launcher/Start-Team.ps1'), '-ExpectedExecutable', executable]);
  verified = true;
  await fs.mkdir("acceptance-output", { recursive: true });
  await fs.writeFile(
    "acceptance-output/installation.json",
    JSON.stringify(
      {
        verified: true,
        installerSha256: await digest(installer),
        payloadSha256: actual,
        uninstalled: false,
      },
      null,
      2,
    ),
  );
} finally {
  const files = await fs.readdir(target);
  const uninstaller = files.find((file) => /^Uninstall .*\.exe$/i.test(file));
  missingUninstaller = !uninstaller;
  if (
    uninstaller &&
    path.dirname(path.resolve(target, uninstaller)) === target
  ) {
    await execute(path.join(target, uninstaller), ["/S"]);
    for (let i = 0; i < 60; i++) {
      try {
        await fs.access(executable);
      } catch {
        if (verified) {
          const result = JSON.parse(
            await fs.readFile("acceptance-output/installation.json", "utf8"),
          );
          result.uninstalled = true;
          await fs.writeFile(
            "acceptance-output/installation.json",
            JSON.stringify(result, null, 2),
          );
        }
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}
if (missingUninstaller)
  throw new Error("Installer did not provide an uninstaller");
if (
  !JSON.parse(await fs.readFile("acceptance-output/installation.json", "utf8"))
    .uninstalled
)
  throw new Error("Test uninstall did not finish");
console.log(
  "Windows installation, launch, payload verification and uninstall passed",
);
