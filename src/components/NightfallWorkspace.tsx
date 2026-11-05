import WorkbenchIcon from "./WorkbenchIcon";
import React, { useEffect, useState } from "react";
import TeamSyncPanel, { nfButton } from "./TeamSyncPanel";
import NightfallScenePanel from "./NightfallScenePanel";
import { useModalAccessibility } from "../hooks/useModalAccessibility";
export default function NightfallWorkspace({
  root,
  dirty,
  onClose,
  onSceneDirtyChange,
}: {
  root: string;
  dirty: boolean;
  onClose: () => void;
  onSceneDirtyChange: (dirty: boolean) => void;
}) {
  const [tab, setTab] = useState<"team" | "scene">("team");
  const [sceneDirty, setSceneDirty] = useState(false),
    [sceneVisited, setSceneVisited] = useState(false),
    [confirm, setConfirm] = useState(false);
  useEffect(() => {
    onSceneDirtyChange(sceneDirty);
    return () => onSceneDirtyChange(false);
  }, [sceneDirty, onSceneDirtyChange]);
  const { contentRef } = useModalAccessibility({
    isOpen: true,
    onClose: () => (sceneDirty ? setConfirm(true) : onClose()),
  });
  return (
    <section
      ref={contentRef}
      role="dialog"
      aria-modal="true"
      aria-label="夜幕制作工作台"
      className="nightfall-workspace fixed inset-0 z-50 flex flex-col bg-slate-950 text-slate-100 overflow-hidden"
    >
      <header className="flex items-center gap-3 px-5 py-3 border-b border-slate-700">
        <span className="flex items-center gap-2 font-semibold mr-6">
          <WorkbenchIcon name="moon" className="w-6 h-6 text-emerald-300" />
          夜幕
          <span className="text-xs font-normal text-slate-500 ml-1">
            制作工作台
          </span>
        </span>
        <button
          className={`${nfButton} ${tab === "team" ? "border-emerald-500/60 text-emerald-300 bg-emerald-950/30" : ""}`}
          onClick={() => setTab("team")}
        >
          <span className="inline-flex items-center gap-2">
            <WorkbenchIcon name="branch" />
            团队同步
          </span>
        </button>
        <button
          className={`${nfButton} ${tab === "scene" ? "border-emerald-500/60 text-emerald-300 bg-emerald-950/30" : ""}`}
          onClick={() => {
            setSceneVisited(true);
            setTab("scene");
          }}
        >
          <span className="inline-flex items-center gap-2">
            <WorkbenchIcon name="film" />
            场景演出{sceneDirty ? " *" : ""}
          </span>
        </button>
        <span className="flex-1 text-xs text-slate-500 truncate">{root}</span>
        <button
          className={nfButton}
          onClick={() => (sceneDirty ? setConfirm(true) : onClose())}
        >
          <span className="inline-flex items-center gap-1">
            <WorkbenchIcon name="back" />
            返回编辑器
          </span>
        </button>
      </header>
      <div className={`flex-1 min-h-0 ${tab === "team" ? "" : "hidden"}`}>
        {tab === "team" && <TeamSyncPanel dirty={dirty || sceneDirty} />}
      </div>
      {sceneVisited && (
        <div
          className={`flex-1 min-h-0 relative ${tab === "scene" ? "" : "hidden"}`}
        >
          <NightfallScenePanel
            active={tab === "scene"}
            root={root}
            onDirtyChange={setSceneDirty}
          />
        </div>
      )}
      {confirm && (
        <div className="absolute inset-0 z-20 bg-black/80 flex items-center justify-center">
          <div className="bg-slate-900 border border-slate-600 rounded-xl p-6 space-y-4">
            <h2>场景有未保存的修改</h2>
            <p>返回场景审阅并保存，或明确丢弃本次未保存修改。</p>
            <button
              className={nfButton}
              onClick={() => {
                setConfirm(false);
                setTab("scene");
              }}
            >
              返回编辑
            </button>
            <button className={`${nfButton} ml-3`} onClick={onClose}>
              丢弃并关闭
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
