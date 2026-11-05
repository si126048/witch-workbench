import { teamRepositoryUrl } from "../lib/teamLinks";
import WorkbenchIcon from "./WorkbenchIcon";
import React, { useCallback, useEffect, useState } from "react";
import type {
  BridgeResult,
  RulesPreview,
  TeamDiff,
  TeamStatus,
} from "../nightfallTypes";
import { nt } from "../lib/nightfallStrings";

export async function bridgeValue<T>(
  promise: Promise<BridgeResult<T>>,
): Promise<T> {
  const result = await promise;
  if (result.ok === false) throw new Error(result.error);
  return result.value;
}
export const nfButton =
  "inline-flex items-center justify-center gap-2 rounded-md border border-slate-700/70 bg-slate-900 px-3 py-2 text-sm text-slate-300 hover:border-slate-500 hover:text-white hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors";
export const nfInput =
  "rounded border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-100";

export default function TeamSyncPanel({ dirty }: { dirty: boolean }) {
  const api = window.electronAPI?.nightfall;
  const [state, setState] = useState<TeamStatus | null>(null);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [output, setOutput] = useState("");
  const [selected, setSelected] = useState<string[]>([]),
    [diff, setDiff] = useState<TeamDiff | null>(null);
  const [file, setFile] = useState(""),
    [message, setMessage] = useState(""),
    [branch, setBranch] = useState("scene/");
  const [rules, setRules] = useState<RulesPreview | null>(null),
    [resolved, setResolved] = useState("");
  const refresh = useCallback(async () => {
    if (!api) return;
    const next = await bridgeValue(api.status());
    setState(next);
    setSelected((prior) =>
      prior.filter((p) => next.files.some((f) => f.path === p)),
    );
  }, [api]);
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
    return api?.onProgress((text) =>
      setOutput((prior) => (prior + text).slice(-24000)),
    );
  }, [api, refresh]);
  const task = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    setOutput("");
    try {
      const result = await fn();
      if (typeof result === "string") setOutput(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      try {
        await refresh();
      } catch (e) {
        setError((e as Error).message);
      }
      setBusy(false);
    }
  };
  const operate = (action: string, payload?: Record<string, unknown>) =>
    task(() => bridgeValue(api!.team(action, payload)));
  const inspect = (p: string) =>
    task(async () => {
      setFile(p);
      const next = await bridgeValue(api!.diff(p));
      setDiff(next);
      setResolved(next.ours ?? "");
    });
  const repositoryUrl = teamRepositoryUrl(state?.remote);
  return (
    <div className="h-full overflow-auto p-6 space-y-5 text-slate-200">
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-xl font-semibold">{nt("team")}</h2>
          <p className="text-sm text-slate-400 mt-2">{nt("auth")}</p>
        </div>
        <button
          className={nfButton}
          disabled={busy}
          onClick={() => task(refresh)}
        >
          <WorkbenchIcon name="refresh" />
          {nt("refresh")}
        </button>
      </div>
      {error && (
        <div
          role="alert"
          className="p-3 rounded bg-red-950 text-red-200 whitespace-pre-wrap"
        >
          {error}
        </div>
      )}
      <div className="text-xs text-slate-400">
        {state
          ? (state.environment.git ?? "未检测到 Git")
          : "正在检测 Git 环境…"}{" "}
        ·{" "}
        {state
          ? (state.environment.lfs ?? "未检测到 Git LFS")
          : "正在检测 LFS…"}{" "}
        ·{" "}
        <button
          className="underline"
          onClick={() =>
            window.electronAPI?.openExternal?.(
              "https://git-scm.com/downloads/win",
            )
          }
        >
          安装 Git
        </button>{" "}
        ·{" "}
        <button
          className="underline"
          onClick={() =>
            window.electronAPI?.openExternal?.("https://git-lfs.com/")
          }
        >
          安装 LFS
        </button>
      </div>
      {state && !state.repository ? (
        <div className="space-y-3">
          <p>{nt("noGit")}</p>
          <button
            className={nfButton}
            disabled={busy}
            onClick={() => task(() => bridgeValue(api!.init()))}
          >
            将当前项目初始化为 Git 仓库
          </button>
        </div>
      ) : (
        state && (
          <>
            <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
              <strong className="text-emerald-300">
                {state.branch ?? "分离 HEAD"}
              </strong>
              <span className="ml-4 text-sm">
                待推送 {state.ahead ?? 0} · 待拉取 {state.behind ?? 0}
              </span>
              <p className="text-xs text-slate-400 mt-2 break-all">
                {state.remote ?? "尚未配置 origin"} →{" "}
                {state.upstream ?? "尚未设置跟踪分支"} ·
                远端状态以最近一次获取为准
              </p>
            </div>
            {dirty && (
              <p role="status" className="text-amber-200">
                编辑器中有未保存内容。请先使用主工具栏“全部保存”，再提交或同步。
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {(["fetch", "pull", "push"] as const).map((action) => (
                <button
                  className={nfButton}
                  key={action}
                  disabled={busy || (dirty && action !== "fetch")}
                  onClick={() => operate(action)}
                >
                  {nt(action)}
                </button>
              ))}
              {repositoryUrl && (
                <>
                  <button
                    className={nfButton}
                    onClick={() =>
                      window.electronAPI?.openExternal?.(repositoryUrl)
                    }
                  >
                    打开仓库
                  </button>
                  <button
                    className={nfButton}
                    disabled={!state.branch}
                    onClick={() =>
                      window.electronAPI?.openExternal?.(
                        `${repositoryUrl}/compare/main...${encodeURIComponent(state.branch ?? "")}?expand=1`,
                      )
                    }
                  >
                    打开审阅页面
                  </button>
                </>
              )}
              <details className="inline-block relative">
                <summary className={`${nfButton} cursor-pointer`}>
                  仓库管理
                </summary>
                <div className="absolute right-0 top-full mt-2 z-10 bg-slate-900 border border-slate-700 rounded-lg p-3 w-64 flex flex-col gap-2">
                  <button
                    className={nfButton}
                    disabled={busy || dirty}
                    onClick={() => operate("merge")}
                  >
                    显式合并跟踪分支
                  </button>
                  <button
                    className={nfButton}
                    disabled={busy}
                    onClick={() =>
                      task(async () =>
                        setRules(await bridgeValue(api!.rules())),
                      )
                    }
                  >
                    {nt("rules")}
                  </button>
                  <button
                    className={nfButton}
                    disabled={busy || !state.remote}
                    onClick={() => operate("locks")}
                  >
                    查看 LFS 锁
                  </button>
                </div>
              </details>
            </div>
            {rules && (
              <section className="border border-amber-800 rounded p-4 space-y-3">
                <h3>LFS 配置预览</h3>
                <p className="text-sm text-amber-200">
                  现有二进制文件 {rules.trackedBinary.length}{" "}
                  个。不会改写历史；规则提交后生效，后续二进制修改使用 LFS。
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <pre className="max-h-48 overflow-auto text-xs">
                    {rules.attributes}
                  </pre>
                  <pre className="max-h-48 overflow-auto text-xs">
                    {rules.ignore}
                  </pre>
                </div>
                <button
                  className={nfButton}
                  disabled={busy}
                  onClick={() =>
                    task(async () => {
                      const result = await bridgeValue(
                        api!.team("rules", { ...rules }),
                      );
                      setRules(null);
                      return result;
                    })
                  }
                >
                  应用已审阅的规则
                </button>
                <button className={nfButton} onClick={() => setRules(null)}>
                  取消
                </button>
              </section>
            )}
            <div className="flex gap-2">
              <input
                className={nfInput}
                aria-label="任务分支名称"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
              />
              <button
                className={nfButton}
                disabled={busy || dirty}
                onClick={() => operate("branch", { name: branch })}
              >
                {nt("branch")}
              </button>
            </div>
            <div className="grid grid-cols-[minmax(220px,1fr)_2fr] gap-4 min-h-72">
              <section className="border border-slate-700 rounded overflow-auto">
                <h3 className="p-3 border-b border-slate-700">
                  工作区变更 · {state.files.length}
                </h3>
                {state.files.map((f) => (
                  <div
                    className="flex gap-2 p-2 text-sm border-b border-slate-800"
                    key={f.path}
                  >
                    <input
                      type="checkbox"
                      aria-label={`选择 ${f.path}`}
                      checked={selected.includes(f.path)}
                      onChange={(e) =>
                        setSelected((prior) =>
                          e.target.checked
                            ? [...prior, f.path]
                            : prior.filter((p) => p !== f.path),
                        )
                      }
                    />
                    <button
                      className={`text-left break-all ${f.conflicted ? "text-red-300" : ""}`}
                      onClick={() => inspect(f.path)}
                    >
                      <code>{f.status}</code> {f.path}
                    </button>
                  </div>
                ))}
                {!state.files.length && (
                  <p className="p-4 text-slate-400">工作区干净</p>
                )}
              </section>
              <section className="border border-slate-700 rounded p-3 overflow-auto">
                <h3 className="text-sm mb-3 break-all">
                  {file || "选择文件查看差异"}
                </h3>
                {diff?.conflict ? (
                  <>
                    <div className="grid grid-cols-3 gap-2">
                      {(["base", "ours", "theirs"] as const).map((side) => (
                        <div key={side}>
                          <h4>
                            {
                              {
                                base: "共同基线",
                                ours: "本地版本",
                                theirs: "远端版本",
                              }[side]
                            }
                          </h4>
                          <pre className="text-xs whitespace-pre-wrap max-h-56 overflow-auto bg-slate-950 p-2">
                            {diff[side]}
                          </pre>
                        </div>
                      ))}
                    </div>
                    <label className="block mt-3 text-sm">
                      解决后的完整内容
                      <textarea
                        className={`${nfInput} w-full h-48 font-mono mt-2`}
                        value={resolved}
                        onChange={(e) => setResolved(e.target.value)}
                      />
                    </label>
                    <button
                      className={nfButton}
                      disabled={busy}
                      onClick={() =>
                        operate("resolve", {
                          file,
                          content: resolved,
                          expected: diff,
                        })
                      }
                    >
                      保存解决结果并标记
                    </button>
                    <p className="text-xs text-slate-400 mt-2">
                      演出文档请保留完整版本，重新生成脚本后再提交。
                    </p>
                  </>
                ) : (
                  <pre className="text-xs whitespace-pre-wrap">
                    {diff?.text}
                  </pre>
                )}
                {file && !diff?.conflict && (
                  <div className="flex gap-2 mt-4">
                    <button
                      className={nfButton}
                      disabled={busy}
                      onClick={() => operate("lock", { file })}
                    >
                      锁定二进制
                    </button>
                    <button
                      className={nfButton}
                      disabled={busy}
                      onClick={() => operate("unlock", { file })}
                    >
                      释放我的锁
                    </button>
                  </div>
                )}
              </section>
            </div>
            <div className="flex gap-2">
              <input
                className={`${nfInput} flex-1`}
                aria-label="提交说明"
                placeholder="说明这次修改的场景与目的"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
              <button
                className={nfButton}
                disabled={busy || dirty || !selected.length || !message.trim()}
                onClick={() =>
                  task(async () => {
                    const result = await bridgeValue(
                      api!.team("commit", { files: selected, message }),
                    );
                    setMessage("");
                    setSelected([]);
                    return result;
                  })
                }
              >
                {nt("commit")}
              </button>
            </div>
            <section>
              <h3 className="mb-2">最近提交</h3>
              {state.history.map((h) => (
                <div
                  key={h.id}
                  className="flex gap-3 text-sm py-2 border-b border-slate-800"
                >
                  <code className="text-emerald-300">{h.id.slice(0, 8)}</code>
                  <span className="flex-1">{h.subject}</span>
                  <span className="text-slate-500">
                    {h.author} · {h.date.slice(0, 10)}
                  </span>
                </div>
              ))}
            </section>
          </>
        )
      )}
      {(busy || output) && (
        <pre
          role="status"
          className="p-3 text-xs whitespace-pre-wrap bg-slate-950 rounded"
        >
          {busy ? "操作进行中…\n" : ""}
          {output}
        </pre>
      )}
    </div>
  );
}
