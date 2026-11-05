import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
function sourceFingerprint() {
  const files=[];
  const walk=directory=>{for(const entry of fs.readdirSync(directory,{withFileTypes:true})){const file=path.join(directory,entry.name);if(entry.isDirectory())walk(file);else files.push(file);}};
  for(const directory of ['src','resources'])walk(directory);
  files.push('bootstrap.cjs','electron.js','preload.js','package.json','package-lock.json','vite.config.ts','index.html','nightfall.png','nightfall.ico');
  const hash=crypto.createHash('sha256');for(const file of files.sort()){hash.update(file);hash.update(fs.readFileSync(file));}return hash.digest('hex');
}
const fingerprint=sourceFingerprint();
function assertFrozen(){if(sourceFingerprint()!==fingerprint)throw new Error('Source changed during packaging. Discard this build and rebuild from a frozen source snapshot.');}
const destination = process.argv[2];
const out = destination ? fs.openSync(destination, "w") : 1;
async function run(args) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      shell: false,
      windowsHide: true,
      stdio: ["ignore", out, out],
      env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: "false" },
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`Build step exited ${code}`)),
    );
  });
}
await run(["node_modules/vite/bin/vite.js", "build"]);
assertFrozen();
await run([
  "node_modules/electron-builder/cli.js",
  "--win",
  "--publish=never",
  "--config.electronDist=node_modules/electron/dist",
]);
assertFrozen();
await run(['scripts/check-packaged-syntax.js']);
fs.mkdirSync('acceptance-output',{recursive:true});
fs.writeFileSync('acceptance-output/build-fingerprint.json',JSON.stringify({sourceSha256:fingerprint},null,2));
if (destination) fs.closeSync(out);
