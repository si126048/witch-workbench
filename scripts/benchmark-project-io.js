import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import crypto from "node:crypto";
const fixture = path.resolve("../.cache/witch-tools/production-benchmark");
await fs.mkdir(path.join(fixture, "game/images"), { recursive: true });
const image = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZuoAAAAASUVORK5CYII=",
  "base64",
);
for (let i = 0; i < 1000; i++)
  await fs.writeFile(
    path.join(fixture, `game/images/asset_${String(i).padStart(4, "0")}.png`),
    image,
  );
const script =
  Array.from({ length: 100000 }, (_, i) =>
    i % 100 === 0
      ? `label scene_${i}:`
      : `    "Line ${i} of the nightfall benchmark."`,
  ).join("\n") + "\n";
await fs.writeFile(path.join(fixture, "game/script.rpy"), script);
const baseline = path.resolve(
  "../.cache/witch-tools/upstream/bmf-vangard-renpy-ide-fa3999a977b7f374df75962d6da3a0cbe42a3810",
);
const current = process.cwd();
const results = {
  fixture: {
    lines: 100000,
    assets: 1000,
    sha256: crypto.createHash("sha256").update(script).digest("hex"),
  },
  runs: [],
};
for (const [label, root] of [
  ["baseline", baseline],
  ["nightfall", current],
]) {
  const { scanDirectoryForAssets } = await import(
    pathToFileURL(path.join(root, "src/lib/assetScanner.js")).href
  );
  const { searchInDirectory } = await import(
    pathToFileURL(path.join(root, "src/lib/projectSearch.js")).href
  );
  const row = { label, scan: [], search: [], cancelled: false };
  for (let round = 0; round < 4; round++) {
    let start = performance.now();
    const scanned = await scanDirectoryForAssets(
      path.join(fixture, "game/images"),
    );
    const scan = performance.now() - start;
    if (scanned.images.length !== 1000)
      throw new Error("Asset scan lost files");
    start = performance.now();
    const searched = await searchInDirectory(
      path.join(fixture, "game"),
      "Line 99999",
      { projectPath: fixture },
    );
    const search = performance.now() - start;
    if (searched.results.length !== 1)
      throw new Error("Search did not find the expected line");
    if (round) {
      row.scan.push(scan);
      row.search.push(search);
    }
  }
  let calls = 0;
  row.cancelled = (
    await scanDirectoryForAssets(path.join(fixture, "game/images"), {
      isCancelled: () => ++calls > 100,
    })
  ).cancelled;
  if (!row.cancelled) throw new Error("Cancellation failed");
  results.runs.push(row);
}
const median = (values) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
results.comparison = Object.fromEntries(
  ["scan", "search"].map((key) => [
    key,
    {
      baselineMs: median(results.runs[0][key]),
      nightfallMs: median(results.runs[1][key]),
      ratio: median(results.runs[1][key]) / median(results.runs[0][key]),
    },
  ]),
);
await fs.mkdir("acceptance-output", { recursive: true });
await fs.writeFile(
  "acceptance-output/project-io-benchmark.json",
  JSON.stringify(results, null, 2),
);
console.log(JSON.stringify(results.comparison, null, 2));
if (Object.values(results.comparison).some((result) => result.ratio > 1.2))
  throw new Error(
    "Project I/O regression exceeds 20%; investigate before release.",
  );
