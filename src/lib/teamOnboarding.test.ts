// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import JSZip from "jszip";
import {
  validateTeamProfile,
  configureTeam,
  createTeamArchive,
  prepareDaily,
} from "./teamOnboarding.js";
import { registerTeamHub } from "./teamHubService.js";
import { runGit } from "./teamGit.js";
const directories: string[] = [];
async function temporary() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "夜幕 team hub "));
  directories.push(directory);
  return directory;
}
const profile = {
  kind: "nightfall-team",
  version: 1,
  name: "序章制作组",
  remote: "https://example.invalid/team/game.git",
  branch: "main",
  sdkVersion: "8.5.3",
};
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(
    directories
      .splice(0)
      .map((directory) =>
        fs.rm(directory, {
          recursive: true,
          force: true,
          maxRetries: 10,
          retryDelay: 100,
        }),
      ),
  );
});
describe("portable team onboarding", () => {
  it("accepts only data and rejects embedded credentials and invalid versions", () => {
    expect(
      validateTeamProfile({
        ...profile,
        command: "dangerous",
        root: "C:/private",
      }),
    ).toEqual(profile);
    for (const remote of [
      "https://token@example.invalid/repo",
      "https://example.invalid/repo?token=secret",
      "file:///private/repo",
      "--upload-pack=bad",
      "https://example.invalid/\nrepo",
    ])
      expect(() => validateTeamProfile({ ...profile, remote })).toThrow();
    expect(() => validateTeamProfile({ ...profile, version: 2 })).toThrow();
    expect(() =>
      validateTeamProfile({ ...profile, branch: "main;calc" }),
    ).toThrow();
  });
  it("exports a portable package with launcher, optional installer checksum and no local paths", async () => {
    const root = await temporary(),
      installer = path.join(root, "setup.exe");
    await fs.writeFile(installer, Buffer.from("MZtest installer"));
    const zip = await JSZip.loadAsync(
      await createTeamArchive(
        { ...profile, root },
        path.resolve("resources/team-launcher"),
        installer,
      ),
    );
    expect(
      JSON.parse(await zip.file("team.nightfall-team.json")!.async("string")),
    ).toEqual(profile);
    expect(zip.file("加入团队.cmd")).toBeTruthy();
    expect(zip.file("Start-Team.ps1")).toBeTruthy();
    expect(await zip.file("installer.sha256")!.async("string")).toBe(
      crypto
        .createHash("sha256")
        .update(await fs.readFile(installer))
        .digest("hex"),
    );
    expect(
      (
        await JSZip.loadAsync(
          await createTeamArchive(
            profile,
            path.resolve("resources/team-launcher"),
          ),
        )
      ).file("Nightfall_Setup.exe"),
    ).toBeNull();
  });
  it("does not overwrite an existing origin or create nested repositories", async () => {
    const root = await temporary();
    await configureTeam(root, profile);
    await configureTeam(root, profile);
    await expect(
      configureTeam(root, {
        ...profile,
        remote: "https://example.invalid/other.git",
      }),
    ).rejects.toThrow("不会覆盖");
    expect(
      (await runGit(root, ["config", "--get", "remote.origin.url"])).trim(),
    ).toBe(profile.remote);
    const child = path.join(root, "nested");
    await fs.mkdir(child);
    await expect(configureTeam(child, profile)).rejects.toThrow("root");
  }, 60000);
  it("joins a real clone, saves local identity, creates a daily launch and preserves offline edits", async () => {
    const root = await temporary(),
      first = path.join(root, "owner"),
      remote = path.join(root, "remote.git"),
      second = path.join(root, "member"),
      userData = path.join(root, "user");
    for (const directory of [first, remote, second]) await fs.mkdir(directory);
    await runGit(first, ["init", "-b", "main"]);
    await runGit(first, ["config", "user.name", "Owner"]);
    await runGit(first, ["config", "user.email", "owner@example.invalid"]);
    await fs.mkdir(path.join(first, "game"));
    await fs.writeFile(
      path.join(first, "game/script.rpy"),
      "label start:\n    return\n",
    );
    await runGit(first, ["add", "."]);
    await runGit(first, ["commit", "-m", "Initial game"]);
    await runGit(remote, ["init", "--bare", "-b", "main"]);
    await runGit(first, ["remote", "add", "origin", remote]);
    await runGit(first, ["push", "origin", "main"]);
    vi.stubEnv("GIT_CONFIG_COUNT", "1");
    vi.stubEnv(
      "GIT_CONFIG_KEY_0",
      `url.${pathToFileURL(remote).href}.insteadOf`,
    );
    vi.stubEnv("GIT_CONFIG_VALUE_0", profile.remote);
    const handlers = new Map<
      string,
      (
        event: unknown,
        ...args: unknown[]
      ) => Promise<{ ok: boolean; value?: unknown; error?: string }>
    >();
    const authorized = new Set([first]);
    let startup: string | null = null;
    const shortcut = vi.fn();
    const guardRoot = async (target: string) => {
      if (!authorized.has(target)) throw new Error("unvetted");
    };
    registerTeamHub({
      ipcMain: { handle: (name: string, fn: never) => handlers.set(name, fn) },
      isTrusted: (sender: unknown) => sender === "trusted",
      getRoot: () => first,
      guardRoot,
      authorizeProject: async (target: string) => authorized.add(target),
      chooseDirectory: async () => second,
      chooseFile: async () => null,
      chooseSave: async () => path.join(root, "daily.lnk"),
      userData,
      resources: path.resolve("resources/team-launcher"),
      shortcut,
      consumeStartup: () => {
        const value = startup;
        startup = null;
        return value;
      },
      baseDirectory: root,
    });
    const call = async (action: string, ...args: unknown[]) => {
      const result = await handlers.get("nightfall:hub-" + action)!(
        { sender: "trusted" },
        ...args,
      );
      if (!result.ok) throw new Error(result.error);
      return result.value;
    };
    expect(await call("join", profile)).toEqual({ profile, root: second });
    expect(authorized.has(second)).toBe(true);
    await call("identity", second, "Member", "member@example.invalid");
    expect(
      (await runGit(second, ["config", "--local", "user.name"])).trim(),
    ).toBe("Member");
    await call("shortcut", second, profile);
    expect(shortcut).toHaveBeenCalledOnce();
    startup = shortcut.mock.calls[0][1];
    expect(await call("startup")).toEqual({ profile, root: second });
    expect(await call("startup")).toBeNull();
    await fs.writeFile(
      path.join(second, "game/script.rpy"),
      "# local dirty edit\n",
    );
    const daily = (await call("daily", second)) as { warning: string };
    expect(daily.warning).toBe("");
    expect(
      await fs.readFile(path.join(second, "game/script.rpy"), "utf8"),
    ).toContain("local dirty edit");
    vi.unstubAllEnvs();
    const offline = await prepareDaily(second);
    expect(offline.warning).toContain("离线");
    expect(
      await fs.readFile(path.join(second, "game/script.rpy"), "utf8"),
    ).toContain("local dirty edit");
    await expect(call("daily", root)).rejects.toThrow("unvetted");
    expect(
      (await handlers.get("nightfall:hub-recent")!({ sender: "untrusted" })).ok,
    ).toBe(false);
  }, 240000);
});
