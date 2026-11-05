import React, { useState } from "react";
import { bridgeValue, nfButton, nfInput } from "./TeamSyncPanel";
export default function CloneProjectButton({
  onOpen,
}: {
  onOpen: (root: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false),
    [url, setUrl] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <>
      <button className={nfButton} onClick={() => setOpen(true)}>
        克隆团队项目
      </button>
      {open && (
        <section
          role="dialog"
          aria-modal="true"
          aria-label="克隆团队项目"
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center"
        >
          <div className="bg-slate-900 text-slate-100 rounded-xl border border-slate-600 p-6 w-[600px] space-y-4">
            <h2 className="text-xl">克隆团队项目</h2>
            <p className="text-sm text-slate-400">
              填写 HTTPS 或 SSH 地址，随后选择一个空文件夹。凭据由系统 Git
              管理，不要在地址中填写令牌。
            </p>
            <input
              className={`${nfInput} w-full`}
              aria-label="团队 Git 仓库地址"
              placeholder="https://github.com/team/game.git"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            {error && (
              <p role="alert" className="text-red-300 whitespace-pre-wrap">
                {error}
              </p>
            )}
            <button
              className={nfButton}
              disabled={busy || !url.trim()}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  const root = await bridgeValue(
                    window.electronAPI!.nightfall!.clone(url.trim()),
                  );
                  if (root) {
                    await onOpen(root);
                    setOpen(false);
                  }
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "正在克隆…" : "选择空文件夹并克隆"}
            </button>
            <button
              className={`${nfButton} ml-3`}
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              取消
            </button>
          </div>
        </section>
      )}
    </>
  );
}
