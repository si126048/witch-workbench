// Synchronous Electron entry: establish pre-ready settings before loading ESM services.
const { app, protocol, dialog } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

app.setName("Nightfall Workbench");
app.setPath(
  "userData",
  process.env.NIGHTFALL_USER_DATA_DIR ||
    path.join(app.getPath("appData"), "nightfall-workbench"),
);
protocol.registerSchemesAsPrivileged([
  {
    scheme: "media",
    privileges: {
      secure: true,
      supportFetchAPI: true,
      bypassCSP: true,
      corsEnabled: true,
      stream: true,
      standard: true,
    },
  },
]);
globalThis.__nightfallBootstrap = true;
function teamArgument(argv) {
  const combined = argv.find((argument) => argument.startsWith("--team="));
  if (combined) return combined.slice("--team=".length) || null;
  const index = argv.indexOf("--team");
  const value = index >= 0 ? argv[index + 1] : null;
  return value && !value.startsWith("--") ? value : null;
}
globalThis.__nightfallTeamRequest = teamArgument(process.argv);
const primaryInstance = app.requestSingleInstanceLock({
  teamRequest: globalThis.__nightfallTeamRequest,
});
if (!primaryInstance) app.exit(0);
else
  app.on(
    "second-instance",
    (_event, _argv, _workingDirectory, additionalData) => {
      // Chromium may reorder argv; additionalData preserves the original request.
      globalThis.__nightfallTeamRequest =
        typeof additionalData?.teamRequest === "string"
          ? additionalData.teamRequest
          : null;
      app.emit("nightfall-team-request");
    },
  );

let reporting = false;
function fatal(error) {
  if (reporting) return;
  reporting = true;
  const target = path.join(app.getPath("userData"), "logs", "startup.log");
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.appendFileSync(
      target,
      `${new Date().toISOString()}\n${error?.stack || String(error)}\n`,
    );
  } catch {
    /* Preserve original failure. */
  }
  dialog.showErrorBox(
    "夜幕工作台启动失败",
    `程序未能正常启动，编辑内容的恢复数据将保留。\n\n诊断日志：${target}\n\n${error?.message || String(error)}`,
  );
  app.exit(1);
}
process.on("uncaughtException", fatal);
process.on("unhandledRejection", fatal);
if (primaryInstance) import("./electron.js").catch(fatal);
