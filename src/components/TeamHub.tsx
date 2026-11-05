import React, { useCallback, useEffect, useRef, useState } from "react";
import type {
  TeamProfile,
  TeamLaunch,
  TeamReadiness,
  TeamHubCommands,
} from "../nightfallTypes";
import { bridgeValue, nfButton, nfInput } from "./TeamSyncPanel";
import WorkbenchIcon from "./WorkbenchIcon";
import { useModalAccessibility } from "../hooks/useModalAccessibility";
const initialProfile: TeamProfile = {
  kind: "nightfall-team",
  version: 1,
  name: "我的制作团队",
  remote: "",
  branch: "main",
  sdkVersion: "8.5.3",
};
export default function TeamHub({
  open,
  setOpen,
  root,
  dirty,
  onOpen,
  onSdk,
  onSave,
  sdkPath,
}: {
  open: boolean;
  setOpen: (value: boolean) => void;
  root: string | null;
  dirty: boolean;
  onOpen: (root: string) => Promise<void>;
  onSdk: () => Promise<void>;
  onSave?: () => Promise<void>;
  sdkPath: string;
}) {
  const api = window.electronAPI?.nightfall;
  const latest = useRef({ dirty, onOpen });
  const identityEdited = useRef(false);
  latest.current = { dirty, onOpen };
  const [mode, setMode] = useState<"owner" | "join" | "daily">("join"),
    [profile, setProfile] = useState<TeamProfile>(initialProfile);
  const [environment, setEnvironment] = useState<TeamReadiness | null>(null),
    [recent, setRecent] = useState<TeamLaunch[]>([]);
  const [workingRoot, setWorkingRoot] = useState<string | null>(root),
    [name, setName] = useState(""),
    [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [includeInstaller, setIncludeInstaller] = useState(true);
  const { contentRef } = useModalAccessibility({
    isOpen: open,
    onClose: () => {
      if (!busy) setOpen(false);
    },
  });
  const request = useCallback(
    async <K extends keyof TeamHubCommands>(
      action: K,
      ...args: TeamHubCommands[K]["args"]
    ): Promise<TeamHubCommands[K]["result"]> => {
      if (!api?.hub) throw new Error("请升级到支持团队启动的工作台版本。");
      return bridgeValue(api.hub(action, ...args));
    },
    [api],
  );
  const task = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (!api?.hub) return;
    const startup = () => {
      request("startup")
        .then(async (launch) => {
          if (launch) {
            setProfile(launch.profile);
            setWorkingRoot(launch.root);
            setMode(launch.root ? "daily" : "join");
            setOpen(true);
            if (launch.root) {
              if (latest.current.dirty)
                throw new Error("当前编辑尚未保存，请先保存再打开团队项目。");
              setBusy(true);
              try {
                const result = await request("daily", launch.root);
                await latest.current.onOpen(launch.root);
                if (result.warning) setMessage(result.warning);
                else setOpen(false);
              } finally {
                setBusy(false);
              }
            }
          }
        })
        .catch((e) => {
          setError(e.message);
          setOpen(true);
        });
    };
    startup();
    return api.onTeamRequest?.(startup);
  }, [api, request, setOpen]);
  useEffect(() => {
    if (!open || !api?.hub) return;
    let cancelled = false;
    identityEdited.current = false;
    request("environment")
      .then((next) => {
        if (cancelled) return;
        setEnvironment(next);
        if (!identityEdited.current) {
          setName(next.name || "");
          setEmail(next.email || "");
        }
      })
      .catch((e) => setError(e.message));
    request("recent")
      .then((next) => {
        if (cancelled) return;
        setRecent(next);
        const current = next.find((entry) => entry.root === root);
        if (current) setProfile(current.profile);
      })
      .catch((e) => setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [open, api, request, root]);
  useEffect(() => {
    if (root) setWorkingRoot(root);
  }, [root]);
  if (!open) return null;
  const field = (
    key: "name" | "remote" | "branch" | "sdkVersion",
    label: string,
  ) => (
    <label className="block text-sm text-slate-300">
      {label}
      <input
        className={`${nfInput} block w-full mt-2`}
        value={profile[key]}
        onChange={(e) => setProfile({ ...profile, [key]: e.target.value })}
      />
    </label>
  );
  const launch = async (selectedRoot: string) => {
    if (dirty) throw new Error("请先保存当前编辑，再打开团队项目。");
    const result = await request("daily", selectedRoot);
    await onOpen(selectedRoot);
    setWorkingRoot(selectedRoot);
    setMessage(
      result.warning ||
        `已打开本地副本；${result.status.ahead || 0} 个待推送、${result.status.behind || 0} 个待拉取提交。未自动合并。`,
    );
  };
  return (
    <section
      role="dialog"
      aria-modal="true"
      aria-label="团队协作启动"
      ref={contentRef}
      className="fixed inset-0 z-[120] bg-black/75 flex items-center justify-center p-5 text-slate-100"
    >
      <div className="w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-950 shadow-2xl">
        <header className="p-6 shrink-0 border-b border-slate-800 flex items-center gap-3">
          <WorkbenchIcon name="branch" />
          <div className="flex-1">
            <h2 className="text-xl font-semibold">团队协作启动</h2>
            <p className="text-sm text-slate-400 mt-1">
              一个团队配置，每人一个工作副本。
            </p>
          </div>
          <button
            className={nfButton}
            disabled={busy}
            onClick={() => setOpen(false)}
          >
            关闭
          </button>
        </header>
        <nav
          className="shrink-0 flex gap-2 p-5 border-b border-slate-800"
          aria-label="团队启动方式"
        >
          {(
            [
              ["owner", "负责人建队"],
              ["join", "成员首次加入"],
              ["daily", "日常开工"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              disabled={busy}
              aria-pressed={mode === key}
              className={`${nfButton} ${mode === key ? "border-emerald-500 text-emerald-300" : ""}`}
              onClick={() => {
                setMode(key);
                setError("");
                setMessage("");
              }}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="p-6 space-y-5 min-h-0 overflow-auto">
          <div className="p-3 rounded-lg bg-slate-900 text-sm text-slate-300">
            Git：{environment?.git || "未检测到"}
            <br />
            LFS：{environment?.lfs || "未检测到"}
            <br />
            Ren’Py SDK：{sdkPath || "未配置"}
          </div>
          {environment && (!environment.git || !environment.lfs) && (
            <p className="text-sm text-amber-200">
              请安装 Git for Windows（包含 Git LFS），安装后重启工作台。
              <button
                className={`${nfButton} ml-2`}
                onClick={() =>
                  window.electronAPI?.openExternal(
                    "https://git-scm.com/downloads/win",
                  )
                }
              >
                打开官方下载页
              </button>
            </p>
          )}
          {mode === "owner" && (
            <>
              <p className="text-sm text-slate-400">
                先在 GitHub
                等平台创建游戏仓库并邀请成员，再打开本地游戏项目。工作台配置
                origin 并导出加入包；首次提交与推送仍由你审阅完成。
                <button
                  className={`${nfButton} mt-2`}
                  onClick={() =>
                    window.electronAPI?.openExternal("https://github.com/new")
                  }
                >
                  打开 GitHub 创建仓库
                </button>
              </p>
              <div className="grid grid-cols-2 gap-4">
                {field("name", "团队名称")}
                {field("sdkVersion", "推荐 SDK 版本")}
                <div className="col-span-2">
                  {field("remote", "游戏仓库地址")}
                </div>
                {field("branch", "默认分支")}
              </div>
              <button
                className={nfButton}
                disabled={busy || dirty || !root || !environment?.git}
                onClick={() =>
                  task(async () => {
                    const configured = await request("configure", profile);
                    setProfile(configured);
                    setWorkingRoot(root);
                    setMessage(
                      "团队远端已配置。请在团队同步页审阅 LFS 规则、提交并推送游戏内容，再分发加入包。",
                    );
                  })
                }
              >
                配置当前游戏仓库
              </button>
              <label className="block text-sm">
                <input
                  type="checkbox"
                  checked={includeInstaller}
                  onChange={(e) => setIncludeInstaller(e.target.checked)}
                />{" "}
                导出时选择并附带工作台安装包
              </label>
              <button
                className={nfButton}
                disabled={busy || !profile.remote}
                onClick={() =>
                  task(async () => {
                    const destination = await request(
                      "export",
                      profile,
                      includeInstaller,
                    );
                    if (destination)
                      setMessage(
                        `加入包已保存：${destination}。发给成员解压后双击“加入团队.cmd”。`,
                      );
                  })
                }
              >
                生成成员加入包
              </button>
            </>
          )}
          {mode === "join" && (
            <>
              <p className="text-sm text-slate-400">
                导入负责人提供的配置，或填写仓库信息。点击加入后选择空文件夹，自动克隆指定分支并下载
                LFS 素材。私有仓库须先配置系统 Git 凭据或 SSH。
              </p>
              <button
                className={nfButton}
                disabled={busy}
                onClick={() =>
                  task(async () => {
                    const next = await request("import");
                    if (next) setProfile(next);
                  })
                }
              >
                导入团队配置
              </button>
              <div className="grid grid-cols-2 gap-4">
                {field("name", "团队名称")}
                {field("branch", "默认分支")}
                <div className="col-span-2">
                  {field("remote", "游戏仓库地址")}
                </div>
              </div>
              <button
                className={nfButton}
                disabled={
                  busy ||
                  dirty ||
                  !environment?.git ||
                  !environment?.lfs ||
                  !profile.remote
                }
                onClick={() =>
                  task(async () => {
                    const joined = await request("join", profile);
                    if (joined?.root) {
                      setWorkingRoot(joined.root);
                      setMode("daily");
                      await onOpen(joined.root);
                      setMessage(
                        "克隆完成。请填写本机提交身份、配置 SDK 并创建日常快捷方式。",
                      );
                      setRecent(await request("recent"));
                    }
                  })
                }
              >
                {busy ? "正在处理…" : "选择目录并加入团队"}
              </button>
            </>
          )}
          {mode === "daily" && (
            <>
              <p className="text-sm text-slate-400">
                只获取远端状态，不自动拉取、合并或丢弃修改。网络不可用时仍能打开本地副本。
              </p>
              {recent.map((entry) => (
                <button
                  key={entry.root}
                  className={`${nfButton} w-full justify-start`}
                  disabled={busy || dirty}
                  onClick={() =>
                    task(async () => {
                      setProfile(entry.profile);
                      await launch(entry.root!);
                    })
                  }
                >
                  <span className="text-left">
                    <strong>{entry.profile.name}</strong>
                    <span className="block text-xs text-slate-500">
                      {entry.root}
                    </span>
                  </span>
                </button>
              ))}
              {!recent.length && !workingRoot && (
                <p className="text-sm text-slate-500">
                  还没有团队项目。先加入团队或打开本地游戏。
                </p>
              )}
              {workingRoot && (
                <div className="space-y-4 border border-slate-800 rounded-lg p-4">
                  <p className="text-sm break-all">当前副本：{workingRoot}</p>
                  <div className="flex gap-2">
                    <button
                      className={nfButton}
                      disabled={busy || dirty}
                      onClick={() => task(() => launch(workingRoot))}
                    >
                      打开并获取远端状态
                    </button>
                    <button
                      className={nfButton}
                      disabled={busy || !profile.remote}
                      onClick={() =>
                        task(async () => {
                          const saved = await request(
                            "shortcut",
                            workingRoot,
                            profile,
                          );
                          if (saved) setMessage(`日常快捷方式已保存：${saved}`);
                        })
                      }
                    >
                      创建日常快捷方式
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="text-sm">
                      提交姓名
                      <input
                        className={`${nfInput} block w-full mt-1`}
                        value={name}
                        onChange={(e) => {
                          identityEdited.current = true;
                          setName(e.target.value);
                        }}
                      />
                    </label>
                    <label className="text-sm">
                      提交邮箱
                      <input
                        className={`${nfInput} block w-full mt-1`}
                        value={email}
                        onChange={(e) => {
                          identityEdited.current = true;
                          setEmail(e.target.value);
                        }}
                      />
                    </label>
                  </div>
                  <button
                    className={nfButton}
                    disabled={busy || !name.trim() || !email.trim()}
                    onClick={() =>
                      task(async () => {
                        await request("identity", workingRoot, name, email);
                        setMessage(
                          "已为该副本保存提交身份并启用 Git LFS，不修改全局 Git 配置。",
                        );
                      })
                    }
                  >
                    保存该副本的身份
                  </button>
                  <button
                    className={`${nfButton} ml-2`}
                    disabled={busy}
                    onClick={() => task(onSdk)}
                  >
                    选择 Ren’Py SDK
                  </button>
                  <p className="text-xs text-slate-500">
                    团队推荐 SDK {profile.sdkVersion}；SDK 由成员分别安装。
                  </p>
                </div>
              )}
            </>
          )}
          {dirty && (
            <p className="text-amber-200 text-sm">
              当前编辑尚未保存，已暂停项目切换与仓库配置。
              {onSave && (
                <button
                  className={`${nfButton} ml-2`}
                  disabled={busy}
                  onClick={() =>
                    task(async () => {
                      await onSave();
                      setMessage(
                        "已请求保存剧本与项目设置；未保存的演出仍需返回演出页审阅。",
                      );
                    })
                  }
                >
                  保存剧本与项目设置
                </button>
              )}
            </p>
          )}
          {error && (
            <p
              role="alert"
              className="bg-red-950/60 text-red-200 p-3 rounded whitespace-pre-wrap"
            >
              {error}
            </p>
          )}
          {message && (
            <p
              role="status"
              className="bg-emerald-950/40 text-emerald-200 p-3 rounded whitespace-pre-wrap"
            >
              {message}
            </p>
          )}
          {busy && (
            <p role="status" className="text-slate-400">
              正在处理，请等待完成后再关闭…
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
