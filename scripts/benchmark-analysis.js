import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
const current = process.cwd();
const baseline = path.resolve(
  "../.cache/witch-tools/upstream/bmf-vangard-renpy-ide-fa3999a977b7f374df75962d6da3a0cbe42a3810",
);
const cli = path.join(current, "node_modules/vitest/vitest.mjs");
const config = "nightfall-bench-policy.config.ts";
await fs.writeFile(
  path.join(baseline, config),
  `import {defineConfig,mergeConfig} from 'vitest/config';\nimport base from './vitest.bench.config';\nexport default defineConfig(env=>mergeConfig(typeof base==='function'?base(env):base,{server:{fs:{allow:${JSON.stringify([baseline, path.join(current, "node_modules")])}}}}));\n`,
);
for (const [root, label, configuration] of [
  [baseline, "upstream", config],
  [current, "nightfall", "vitest.bench.config.ts"],
]) {
  await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [cli, "run", "--config", configuration],
      {
        cwd: root,
        env: { ...process.env, BENCH_LABEL: label },
        windowsHide: true,
        shell: false,
        stdio: "inherit",
      },
    );
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`Analysis benchmark ${label} exited ${code}`)),
    );
  });
}
const a = JSON.parse(
  await fs.readFile(
    path.join(baseline, "bench-results/analysis-upstream.json"),
    "utf8",
  ),
);
const b = JSON.parse(
  await fs.readFile(
    path.join(current, "bench-results/analysis-nightfall.json"),
    "utf8",
  ),
);
const comparison = a.results.map((before) => {
  const after = b.results.find(
    (row) => row.size === before.size && row.scenario === before.scenario,
  );
  return {
    scenario: before.scenario,
    size: before.size,
    lines: before.lines,
    baselineMs: before.timing.median,
    nightfallMs: after.timing.median,
    ratio: after.timing.median / before.timing.median,
  };
});
await fs.mkdir("acceptance-output", { recursive: true });
await fs.writeFile(
  "acceptance-output/analysis-comparison.json",
  JSON.stringify(
    { baseline: "fa3999a977b7f374df75962d6da3a0cbe42a3810", comparison },
    null,
    2,
  ),
);
console.log(JSON.stringify(comparison, null, 2));
if (comparison.some((row) => row.ratio > 1.2))
  throw new Error(
    "Analysis regression exceeds 20%; investigate before release.",
  );
