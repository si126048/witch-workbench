import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { StringDecoder } from "node:string_decoder";
import { validateProjectPath } from "./ipcSecurity.js";

const MAX_OUTPUT = 8 * 1024 * 1024;
const queues = new Map();

/** No shell, prompts or secret-bearing command logging. Local operations work offline. */
export function runGit(root, args, { timeout = 120000, progress } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("git", ["-C", root, ...args], {
      shell: false,
      windowsHide: true,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: "0",
        GCM_INTERACTIVE: "Never",
        GIT_LITERAL_PATHSPECS: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "",
      stderr = "",
      size = 0,
      failure,
      deadline;
    const outDecoder = new StringDecoder("utf8"),
      errDecoder = new StringDecoder("utf8");
    const abort = (error) => {
      if (failure) return;
      failure = error;
      if (process.platform === "win32" && child.pid) {
        const killer = spawn(
          "taskkill",
          ["/PID", String(child.pid), "/T", "/F"],
          { shell: false, windowsHide: true, stdio: "ignore" },
        );
        killer.on("error", () => child.kill());
      } else child.kill();
      deadline = setTimeout(() => {
        child.stdout.destroy();
        child.stderr.destroy();
        reject(failure);
      }, 5000);
    };
    const timer = setTimeout(
      () =>
        abort(
          new Error("Git operation timed out; local changes are retained."),
        ),
      timeout,
    );
    const collect = (kind, chunk) => {
      size += chunk.length;
      if (size > MAX_OUTPUT) {
        abort(new Error("Git output exceeds 8 MB. Narrow the selected files."));
        return;
      }
      const value = (kind === "stdout" ? outDecoder : errDecoder).write(chunk);
      if (kind === "stdout") stdout += value;
      else {
        stderr += value;
        progress?.(value);
      }
    };
    child.stdout.on("data", (c) => collect("stdout", c));
    child.stderr.on("data", (c) => collect("stderr", c));
    child.on("error", (error) => {
      clearTimeout(timer);
      clearTimeout(deadline);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      clearTimeout(deadline);
      stdout += outDecoder.end();
      stderr += errDecoder.end();
      if (failure) reject(failure);
      else if (code !== 0)
        reject(
          new Error(
            stderr.trim() || stdout.trim() || `Git exited with code ${code}`,
          ),
        );
      else resolve(stdout);
    });
  });
}

async function optional(root, args, trim = true) {
  try {
    const text = await runGit(root, args);
    return trim ? text.trim() : text;
  } catch {
    return null;
  }
}

let environmentCache;
export async function gitEnvironment(root) {
  if (environmentCache && Date.now() - environmentCache.at < 30000)
    return environmentCache.value;
  const [git, lfs] = await Promise.all([
    optional(root, ["--version"]),
    optional(root, ["lfs", "version"]),
  ]);
  const value = { git, lfs };
  environmentCache = { at: Date.now(), value };
  return value;
}

export function parseGitStatus(raw) {
  const entries = raw.split("\0"),
    result = [];
  for (let i = 0; i < entries.length; i++) {
    const row = entries[i];
    if (!row) continue;
    const status = row.slice(0, 2),
      file = row.slice(3);
    const original = /[RC]/.test(status) ? entries[++i] : undefined;
    result.push({
      path: file,
      status,
      ...(original ? { original } : {}),
      conflicted: ["DD", "AU", "UD", "UA", "DU", "AA", "UU"].includes(status),
    });
  }
  return result;
}

export async function assertRepository(root) {
  const top = await fs.realpath(
    (await runGit(root, ["rev-parse", "--show-toplevel"])).trim(),
  );
  const actual = await fs.realpath(root);
  if (top.toLowerCase() !== actual.toLowerCase())
    throw new Error("Open the repository root as the project.");
}

export async function teamStatus(root) {
  const environment = await gitEnvironment(root);
  if (!environment.git)
    return { environment, repository: false, files: [], history: [] };
  try {
    await assertRepository(root);
  } catch {
    return { environment, repository: false, files: [], history: [] };
  }
  const [rawFiles, branch, upstream, log, remote, merging] = await Promise.all([
    runGit(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]),
    optional(root, ["symbolic-ref", "--short", "HEAD"]),
    optional(root, ["rev-parse", "--abbrev-ref", "@{upstream}"]),
    optional(root, ["log", "-20", "--format=%H%x00%an%x00%aI%x00%s"]),
    optional(root, ["remote", "get-url", "origin"]),
    optional(root, ["rev-parse", "--verify", "MERGE_HEAD"]),
  ]);
  const files = parseGitStatus(rawFiles);
  const counts = upstream
    ? await optional(root, [
        "rev-list",
        "--left-right",
        "--count",
        "HEAD...@{upstream}",
      ])
    : null;
  const [ahead, behind] = counts ? counts.split(/\s+/).map(Number) : [0, 0];
  return {
    environment,
    repository: true,
    branch,
    upstream,
    ahead,
    behind,
    files,
    remote,
    merging: !!merging,
    history: log
      ? log.split("\n").map((line) => {
          const [id, author, date, subject] = line.split("\0");
          return { id, author, date, subject };
        })
      : [],
  };
}

async function safeFiles(root, files) {
  if (!Array.isArray(files) || !files.length || files.length > 5000)
    throw new Error("Select 1–5000 files.");
  return Promise.all(
    files.map(async (file) => {
      if (
        typeof file !== "string" ||
        !file ||
        path.isAbsolute(file) ||
        file.includes("\\") ||
        file.split("/").some((p) => p === ".." || p.toLowerCase() === ".git")
      )
        throw new Error("Invalid project-relative path.");
      const error = await validateProjectPath(path.resolve(root, file), root);
      if (error) throw new Error(error);
      return file;
    }),
  );
}

export async function teamDiff(root, file) {
  await assertRepository(root);
  await safeFiles(root, [file]);
  const state = (await teamStatus(root)).files.find((f) => f.path === file);
  if (
    /\.(png|jpe?g|webp|gif|avif|ogg|wav|mp3|flac|mp4|webm|ttf|otf|woff2?|psd|clip)$/i.test(
      file,
    )
  )
    return {
      text: state?.conflicted
        ? "二进制素材冲突：请在外部选择完整文件版本，再提交。"
        : "二进制素材请使用素材库预览；此处不将其转换为文本。",
    };
  if (state?.conflicted) {
    const versions = await Promise.all(
      [1, 2, 3].map((stage) =>
        optional(root, ["show", `:${stage}:${file}`], false),
      ),
    );
    return {
      base: versions[0] ?? "",
      ours: versions[1] ?? "",
      theirs: versions[2] ?? "",
      conflict: true,
    };
  }
  if (state?.status === "??") {
    const stat = await fs.stat(path.join(root, file));
    if (stat.size > 1024 * 1024)
      return { text: "Large untracked file; preview unavailable." };
    return { text: await fs.readFile(path.join(root, file), "utf8") };
  }
  const staged = await runGit(root, [
    "diff",
    "--cached",
    "--no-ext-diff",
    "--no-textconv",
    "--",
    file,
  ]);
  const unstaged = await runGit(root, [
    "diff",
    "--no-ext-diff",
    "--no-textconv",
    "--",
    file,
  ]);
  return { text: [staged, unstaged].filter(Boolean).join("\n") };
}

export const TEAM_ATTRIBUTES =
  "\n# Nightfall binary assets\n*.rpy text eol=lf\n*.json text eol=lf\n" +
  [
    "png",
    "jpg",
    "jpeg",
    "webp",
    "gif",
    "avif",
    "ogg",
    "wav",
    "mp3",
    "flac",
    "mp4",
    "webm",
    "ttf",
    "otf",
    "woff",
    "woff2",
    "psd",
    "clip",
  ]
    .map((ext) => `*.${ext} filter=lfs diff=lfs merge=lfs -text`)
    .join("\n") +
  "\n";
export const TEAM_IGNORE =
  "\n# Nightfall local and generated runtime files\n.renide/screenshots/\n.renide/save-journal.json\n.nightfall/local/\n**/.recovery/\n**/cache/\n**/saves/\n**/*.rpyc\n**/*.rpymc\n**/*.txn-*\n**/*.tmp-*\n**/traceback.txt\n**/errors.txt\n*.log\n.env\n.env.*\n!.env.example\nrenpy-sdk/\nsdk/\nbuild/\ndist/\nnode_modules/\n";

export async function teamRulesPreview(root) {
  await assertRepository(root);
  const read = async (file) => {
    const absolute = path.join(root, file);
    const denied = await validateProjectPath(absolute, root);
    if (denied) throw new Error(denied);
    try {
      return await fs.readFile(absolute, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") return "";
      throw error;
    }
  };
  const attributes = await read(".gitattributes"),
    ignore = await read(".gitignore");
  const trackedBinary = (await runGit(root, ["ls-files", "-z"]))
    .split("\0")
    .filter((f) =>
      /\.(png|jpe?g|webp|gif|ogg|wav|mp3|flac|mp4|webm|ttf|otf|psd|clip)$/i.test(
        f,
      ),
    );
  return {
    attributes: attributes.includes("# Nightfall binary assets")
      ? attributes
      : attributes + TEAM_ATTRIBUTES,
    ignore: ignore.includes("# Nightfall local and generated runtime files")
      ? ignore
      : ignore + TEAM_IGNORE,
    trackedBinary,
  };
}

async function clean(root) {
  if (
    (
      await runGit(root, [
        "status",
        "--porcelain=v1",
        "-z",
        "--untracked-files=all",
      ])
    ).length
  )
    throw new Error(
      "Commit or explicitly resolve local changes before this operation.",
    );
}

/** Serialize mutations for each working copy. */
export function teamOperation(root, action, payload = {}, options = {}) {
  const previous = queues.get(root) ?? Promise.resolve();
  const next = previous
    .catch(() => {})
    .then(async () => {
      await assertRepository(root);
      switch (action) {
        case "branch": {
          await clean(root);
          if (
            typeof payload.name !== "string" ||
            !/^[a-zA-Z0-9][a-zA-Z0-9/_-]{0,100}$/.test(payload.name)
          )
            throw new Error("Invalid branch name.");
          await runGit(root, ["check-ref-format", "--branch", payload.name]);
          return runGit(root, ["switch", "-c", payload.name]);
        }
        case "commit": {
          const files = await safeFiles(root, payload.files);
          if (
            typeof payload.message !== "string" ||
            !payload.message.trim() ||
            payload.message.length > 4000
          )
            throw new Error(
              "A commit message is required (up to 4000 characters).",
            );
          const state = {
            files: parseGitStatus(
              await runGit(root, [
                "status",
                "--porcelain=v1",
                "-z",
                "--untracked-files=all",
              ]),
            ),
          };
          if (state.files.some((f) => f.conflicted))
            throw new Error("Resolve all conflicts before committing.");
          const stagedOutsideSelection = state.files.some(
            (f) =>
              f.status[0] !== " " &&
              f.status !== "??" &&
              !files.includes(f.path),
          );
          if (stagedOutsideSelection)
            throw new Error(
              "Other files are already staged. Include or resolve them explicitly.",
            );
          await options.validateScenePairs?.(files);
          await runGit(root, ["add", "--", ...files]);
          await options.validateStagedPairs?.(files);
          return runGit(root, ["commit", "-m", payload.message.trim()]);
        }
        case "fetch":
          return runGit(root, ["fetch", "--progress", "origin"], options);
        case "resolve": {
          const [file] = await safeFiles(root, [payload.file]);
          const versions = await teamDiff(root, file);
          if (
            !versions.conflict ||
            JSON.stringify(versions) !== JSON.stringify(payload.expected)
          )
            throw new Error(
              "Conflict changed; reload the three-way comparison.",
            );
          if (
            typeof payload.content !== "string" ||
            payload.content.length > 4 * 1024 * 1024 ||
            payload.content.includes("\0") ||
            /^(<<<<<<<|=======|>>>>>>>)/m.test(payload.content)
          )
            throw new Error(
              "Provide complete text without conflict markers. Binary conflicts must be resolved externally.",
            );
          await options.resolveFile(file, payload.content);
          await runGit(root, ["add", "--", file]);
          return "Conflict resolution saved and staged. Review before committing.";
        }
        case "pull":
          await clean(root);
          await runGit(root, ["fetch", "--progress", "origin"], options);
          if (
            !(await optional(root, [
              "rev-parse",
              "--abbrev-ref",
              "@{upstream}",
            ]))
          )
            throw new Error("No tracking branch. Push this branch first.");
          return runGit(root, ["merge", "--ff-only", "@{upstream}"]);
        case "merge":
          await clean(root);
          if (
            !(await optional(root, [
              "rev-parse",
              "--abbrev-ref",
              "@{upstream}",
            ]))
          )
            throw new Error("No tracking branch.");
          return runGit(root, [
            "merge",
            "--no-commit",
            "--no-ff",
            "@{upstream}",
          ]);
        case "push": {
          const [branch, merging, files] = await Promise.all([
            optional(root, ["symbolic-ref", "--short", "HEAD"]),
            optional(root, ["rev-parse", "--verify", "MERGE_HEAD"]),
            runGit(root, ["status", "--porcelain=v1", "-z"]),
          ]);
          if (
            !branch ||
            merging ||
            parseGitStatus(files).some((f) => f.conflicted)
          )
            throw new Error(
              "Resolve merge state and use a named branch before pushing.",
            );
          return runGit(
            root,
            ["push", "--progress", "--set-upstream", "origin", branch],
            options,
          );
        }
        case "rules": {
          if (!(await gitEnvironment(root)).lfs)
            throw new Error(
              "Install Git LFS before enabling binary asset rules.",
            );
          const preview = await teamRulesPreview(root);
          if (
            preview.attributes !== payload.attributes ||
            preview.ignore !== payload.ignore
          )
            throw new Error("Rules changed on disk; review the preview again.");
          await runGit(root, ["lfs", "install", "--local"]);
          await options.saveRules(preview);
          return "Rules saved. Existing history was not rewritten.";
        }
        case "locks":
          return runGit(root, ["lfs", "locks", "--json"], options);
        case "lock": {
          const [file] = await safeFiles(root, [payload.file]);
          return runGit(root, ["lfs", "lock", "--", file], options);
        }
        case "unlock": {
          const [file] = await safeFiles(root, [payload.file]);
          return runGit(root, ["lfs", "unlock", "--", file], options);
        }
        default:
          throw new Error("Unsupported team operation.");
      }
    });
  queues.set(root, next);
  void next
    .finally(() => {
      if (queues.get(root) === next) queues.delete(root);
    })
    .catch(() => {});
  return next;
}
