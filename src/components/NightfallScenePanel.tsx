import React, { useEffect, useMemo, useRef, useState } from "react";
import type {
  LoadedScene,
  SceneDocument,
  SceneLayer,
  ScenePose,
  SceneRevision,
} from "../nightfallTypes";
import {
  generateScene,
  newSceneDocument,
  scenePoseAt,
  serializeScene,
} from "../lib/sceneDocument.js";
import { bridgeValue, nfButton, nfInput } from "./TeamSyncPanel";
import { useDocumentHistory } from "../hooks/useDocumentHistory";
import WorkbenchIcon from "./WorkbenchIcon";

const media = (root: string, relative: string) =>
  "media:///" +
  (root.replace(/\\/g, "/") + "/" + relative)
    .split("/")
    .map((segment) =>
      /^[a-z]:$/i.test(segment) ? segment : encodeURIComponent(segment),
    )
    .join("/");
export default function NightfallScenePanel({
  root,
  onDirtyChange,
  active = true,
}: {
  root: string;
  onDirtyChange: (dirty: boolean) => void;
  active?: boolean;
}) {
  const api = window.electronAPI!.nightfall!;
  const {
    state: scene,
    setState: setScene,
    reset: resetScene,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useDocumentHistory<SceneDocument>(
    newSceneDocument("opening") as SceneDocument,
  );
  const [loaded, setLoaded] = useState<LoadedScene | null>(null),
    [ids, setIds] = useState<string[]>([]);
  const [selected, setSelected] = useState("street"),
    [frame, setFrame] = useState(0),
    [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(true),
    [preview, setPreview] = useState(false);
  const [asset, setAsset] = useState("game/images/"),
    [notice, setNotice] = useState("");
  const [recovery, setRecovery] = useState<{
    scene: SceneDocument;
    revision: SceneRevision;
  } | null>(null);
  const [diskComparison, setDiskComparison] = useState<LoadedScene | null>(
    null,
  );
  const baseline = useRef("");
  const layer = scene.layers.find((l) => l.id === selected);
  const pose = layer?.keyframes[Math.min(frame, layer.keyframes.length - 1)];
  useEffect(() => {
    const current = scene.layers.find((item) => item.id === selected);
    if (!current) {
      setSelected(scene.layers[0]?.id ?? "");
      setFrame(0);
    } else if (frame >= current.keyframes.length) setFrame(0);
  }, [frame, scene.layers, selected]);
  const serialized = useMemo(() => {
    try {
      return serializeScene(scene);
    } catch {
      return "";
    }
  }, [scene]);
  const dirty = (serialized || JSON.stringify(scene)) !== baseline.current;
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (!loaded || !dirty || !serialized || recovery) return;
    const timer = setTimeout(() => {
      api.sceneDraftWrite(scene, loaded.revision).then((result) => {
        if (result.ok === false) setError(result.error);
      });
    }, 1000);
    return () => clearTimeout(timer);
  }, [api, dirty, loaded, recovery, scene, serialized]);
  const load = async (id: string) => {
    setBusy(true);
    setError("");
    try {
      const next = await bridgeValue(api.sceneLoad(id));
      setLoaded(next);
      resetScene(next.scene ?? (newSceneDocument(id) as SceneDocument));
      baseline.current = next.scene ? serializeScene(next.scene) : "";
      setSelected(next.scene?.layers[0]?.id ?? "street");
      setFrame(0);
      setTime(0);
      setPlaying(false);
      setPreview(false);
      setRecovery(await bridgeValue(api.sceneDraftRead(id)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    let mounted = true;
    api
      .sceneList()
      .then((result) => {
        if (!mounted) return;
        if (result.ok) {
          setIds(result.value);
          void load(result.value[0] ?? "opening");
        } else if (result.ok === false) {
          setError(result.error);
          setBusy(false);
        }
      })
      .catch((error) => {
        if (mounted) {
          setError(error.message);
          setBusy(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, [api]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!playing) return;
    const started = performance.now() - time * 1000;
    const timer = setInterval(() => {
      const current = Math.min(
        scene.duration,
        (performance.now() - started) / 1000,
      );
      setTime(current);
      if (current >= scene.duration) setPlaying(false);
    }, 33);
    return () => clearInterval(timer);
  }, [playing, scene.duration]); // eslint-disable-line react-hooks/exhaustive-deps
  const editLayer = (fn: (l: SceneLayer) => SceneLayer) => {
    setPreview(false);
    setScene((s) => ({
      ...s,
      layers: s.layers.map((l) => (l.id === selected ? fn(l) : l)),
    }));
  };
  const editPose = (key: keyof ScenePose, value: number) =>
    editLayer((l) => ({
      ...l,
      keyframes: l.keyframes.map((k, i) =>
        i === frame ? { ...k, [key]: value } : k,
      ),
    }));
  let code = "",
    invalid = "";
  try {
    code = generateScene(scene);
  } catch (e) {
    invalid = (e as Error).message;
  }
  useEffect(() => {
    if (!active) {
      setPlaying(false);
      return;
    }
    const handleSaveShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!busy && !invalid && loaded) setPreview(true);
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        const target = event.target as HTMLElement;
        if (
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable
        )
          return;
        event.preventDefault();
        event.stopImmediatePropagation();
        setPreview(false);
        setPlaying(false);
        if (!busy) {
          if (event.shiftKey) redo();
          else undo();
        }
      }
    };
    window.addEventListener("keydown", handleSaveShortcut, true);
    return () =>
      window.removeEventListener("keydown", handleSaveShortcut, true);
  }, [active, busy, invalid, loaded, redo, undo]);
  const save = async () => {
    if (!loaded) return;
    setBusy(true);
    setError("");
    try {
      const next = await bridgeValue(api.sceneSave(scene, loaded.revision));
      baseline.current = serializeScene(scene);
      setLoaded(next);
      await bridgeValue(api.sceneDraftClear(scene.id));
      setRecovery(null);
      setPreview(false);
      setNotice("场景文档与脚本已成对保存。可使用主工具栏运行 Ren’Py。");
      setIds((prior) => [...new Set([...prior, scene.id])]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const currentDialogue = [...scene.events]
    .filter((e) => e.type === "dialogue" && e.at <= time)
    .sort((a, b) => b.at - a.at)[0];
  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-200">
      {busy && (
        <p
          role="status"
          className="p-2 text-xs text-slate-400 border-b border-slate-800"
        >
          正在读取或保存场景…
        </p>
      )}
      <fieldset disabled={busy} className="contents border-0 p-0 m-0">
        <div className="flex flex-wrap items-center gap-3 p-3 border-b border-slate-800">
          <select
            className={nfInput}
            aria-label="场景"
            value={ids.includes(scene.id) ? scene.id : ""}
            disabled={busy || dirty}
            onChange={(e) => load(e.target.value)}
          >
            <option value="">新场景</option>
            {ids.map((id) => (
              <option key={id}>{id}</option>
            ))}
          </select>
          <input
            className={nfInput}
            aria-label="场景标题"
            value={scene.title}
            onChange={(e) => {
              setPreview(false);
              setScene((s) => ({ ...s, title: e.target.value }));
            }}
          />
          <button
            className={nfButton}
            disabled={busy || dirty}
            onClick={() =>
              load(
                "scene_" + crypto.randomUUID().replaceAll("-", "").slice(0, 8),
              )
            }
          >
            新建场景
          </button>
          <label className="text-xs">
            时长 / 秒{" "}
            <input
              className={`${nfInput} w-20`}
              type="number"
              min={0.1}
              max={3600}
              step={0.1}
              value={scene.duration}
              onChange={(e) => {
                setPreview(false);
                setScene((s) => ({ ...s, duration: +e.target.value }));
              }}
            />
          </label>
          <span className="text-xs text-slate-400">
            {scene.id} {dirty ? "· 未保存" : "· 已保存"}
          </span>
          <button
            className={nfButton}
            disabled={busy || !!invalid || !loaded}
            onClick={() => setPreview(true)}
          >
            审阅生成差异
          </button>
          <button
            className={nfButton}
            disabled={busy}
            onClick={async () => {
              try {
                setDiskComparison(await bridgeValue(api.sceneLoad(scene.id)));
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            比较磁盘版本
          </button>
          <button
            className={nfButton}
            disabled={busy || !preview || !!invalid}
            onClick={save}
          >
            确认成对保存
          </button>
        </div>
        {(error || invalid) && (
          <p role="alert" className="bg-red-950 text-red-200 p-3">
            {error || invalid}
          </p>
        )}
        {recovery && (
          <div className="bg-amber-950 text-amber-100 p-3 text-sm">
            发现本机恢复草稿。
            {JSON.stringify(recovery.revision) !==
              JSON.stringify(loaded?.revision) &&
              "磁盘版本已变化；恢复草稿仍保留旧基线，保存时将拒绝直接覆盖。"}
            <button
              className={`${nfButton} ml-3`}
              onClick={() => {
                setScene(recovery.scene);
                setLoaded((l) =>
                  l ? { ...l, revision: recovery.revision } : l,
                );
                setRecovery(null);
              }}
            >
              恢复草稿
            </button>
            <button
              className={`${nfButton} ml-3`}
              onClick={() => {
                api.sceneDraftClear(scene.id).then((result) => {
                  if (result.ok) setRecovery(null);
                  else if (result.ok === false) setError(result.error);
                });
              }}
            >
              丢弃恢复草稿
            </button>
          </div>
        )}
        {notice && (
          <p
            role="status"
            className="bg-emerald-950 text-emerald-200 p-2 text-sm"
          >
            {notice}
          </p>
        )}
        <div className="flex-1 min-h-0 grid grid-cols-[220px_minmax(300px,1fr)_260px]">
          <aside className="p-3 border-r border-slate-800 overflow-auto space-y-3">
            <h3>素材与图层</h3>
            {scene.layers.map((l) => (
              <button
                key={l.id}
                className={`${nfButton} !flex-col !items-start w-full text-left ${l.id === selected ? "!border-emerald-500/60" : ""}`}
                onClick={() => {
                  setSelected(l.id);
                  setFrame(0);
                }}
              >
                {l.kind === "background" ? "背景" : "立绘"} · {l.id}
                <small className="block text-slate-400 truncate">
                  {l.asset}
                </small>
              </button>
            ))}
            <label className="block text-sm">
              新图层资源路径
              <input
                className={`${nfInput} w-full mt-2`}
                value={asset}
                onChange={(e) => setAsset(e.target.value)}
              />
            </label>
            <button
              className={nfButton}
              onClick={() => {
                const id =
                  "layer_" +
                  crypto.randomUUID().replaceAll("-", "").slice(0, 8);
                setScene((s) => ({
                  ...s,
                  layers: [
                    ...s.layers,
                    {
                      id,
                      asset,
                      kind: "sprite",
                      z: s.layers.length * 10,
                      keyframes: [
                        {
                          time: 0,
                          x: 0.5,
                          y: 0.5,
                          zoom: 1,
                          rotation: 0,
                          alpha: 1,
                        },
                      ],
                    },
                  ],
                }));
                setSelected(id);
                setFrame(0);
                setPreview(false);
              }}
            >
              添加图层
            </button>
            <p className="text-xs text-slate-500">
              素材先放入项目 game/images 或
              game/audio，可通过主工作台素材库导入。
            </p>
          </aside>
          <main className="flex flex-col min-h-0">
            <div className="flex-1 flex items-center justify-center p-5 min-h-0">
              <div
                className="relative overflow-hidden bg-black w-full max-h-full"
                style={{ aspectRatio: `${scene.width}/${scene.height}` }}
              >
                {[...scene.layers]
                  .sort((a, b) => a.z - b.z)
                  .map((l) => {
                    const p = scenePoseAt(l, time);
                    return (
                      <img
                        key={l.id}
                        src={media(root, l.asset)}
                        alt={l.id}
                        draggable={false}
                        onClick={() => {
                          setSelected(l.id);
                          setFrame(0);
                        }}
                        style={{
                          position: "absolute",
                          maxWidth: "none",
                          width: l.kind === "background" ? "100%" : "auto",
                          height: l.kind === "sprite" ? "85%" : "auto",
                          left: `${p.x * 100}%`,
                          top: `${p.y * 100}%`,
                          opacity: p.alpha,
                          transform: `translate(-50%,-50%) rotate(${p.rotation}deg) scale(${p.zoom})`,
                        }}
                      />
                    );
                  })}
                {currentDialogue?.type === "dialogue" && (
                  <div className="absolute bottom-5 left-5 right-5 bg-slate-950/85 p-4 rounded border border-slate-600">
                    <strong className="text-emerald-300">
                      {currentDialogue.speaker}
                    </strong>
                    <p>{currentDialogue.text}</p>
                  </div>
                )}
              </div>
            </div>
            <div className="p-3 border-t border-slate-800 space-y-2">
              <div className="flex items-center gap-3">
                <button
                  className={nfButton}
                  onClick={() => {
                    if (time >= scene.duration) setTime(0);
                    setPlaying((p) => !p);
                  }}
                >
                  {playing ? "暂停" : "播放舞台"}
                </button>
                <button
                  className={nfButton}
                  onClick={() => {
                    setPlaying(false);
                    setTime(0);
                  }}
                >
                  回到开头
                </button>
                <button
                  className={nfButton}
                  aria-label="撤销场景修改"
                  title="撤销场景修改"
                  disabled={!canUndo}
                  onClick={() => {
                    undo();
                    setPreview(false);
                    setPlaying(false);
                    setFrame(0);
                  }}
                >
                  <WorkbenchIcon name="back" />
                </button>
                <button
                  className={nfButton}
                  aria-label="重做场景修改"
                  title="重做场景修改"
                  disabled={!canRedo}
                  onClick={() => {
                    redo();
                    setPreview(false);
                    setPlaying(false);
                    setFrame(0);
                  }}
                >
                  <WorkbenchIcon name="back" className="h-4 w-4 rotate-180" />
                </button>
                <span className="text-xs">
                  {time.toFixed(2)} / {scene.duration}s
                </span>
              </div>
              <input
                className="w-full"
                aria-label="时间游标"
                type="range"
                min={0}
                max={scene.duration}
                step={0.01}
                value={time}
                onChange={(e) => {
                  setPlaying(false);
                  setTime(+e.target.value);
                }}
              />
              <div className="text-xs text-slate-500">
                舞台预览不播放音频。对白等待与音画同步以 Ren’Py 实机为准。
              </div>
              <div className="flex gap-2 flex-wrap">
                {layer?.keyframes.map((k, i) => (
                  <button
                    className={nfButton}
                    key={i}
                    onClick={() => {
                      setFrame(i);
                      setTime(k.time);
                      setPlaying(false);
                    }}
                  >
                    {k.time}s ◆
                  </button>
                ))}
              </div>
            </div>
          </main>
          <aside className="border-l border-slate-800 p-3 overflow-auto space-y-3">
            <h3>图层与关键帧属性</h3>
            {layer && (
              <>
                <button
                  className={nfButton}
                  onClick={() => {
                    setPreview(false);
                    setScene((s) => ({
                      ...s,
                      layers: s.layers.filter((l) => l.id !== selected),
                    }));
                    setSelected("");
                    setFrame(0);
                  }}
                >
                  删除图层
                </button>
                <label className="block text-sm">
                  资源
                  <input
                    className={`${nfInput} w-full mt-1`}
                    value={layer.asset}
                    onChange={(e) =>
                      editLayer((l) => ({ ...l, asset: e.target.value }))
                    }
                  />
                </label>
                <label className="block text-sm">
                  层级
                  <input
                    className={`${nfInput} w-full mt-1`}
                    type="number"
                    value={layer.z}
                    onChange={(e) =>
                      editLayer((l) => ({ ...l, z: +e.target.value }))
                    }
                  />
                </label>
                {pose &&
                  (
                    ["time", "x", "y", "zoom", "rotation", "alpha"] as const
                  ).map((key) => (
                    <label
                      className="flex justify-between items-center text-sm"
                      key={key}
                    >
                      {
                        {
                          time: "时间 / 秒",
                          x: "水平中心",
                          y: "垂直中心",
                          zoom: "缩放",
                          rotation: "旋转 / 度",
                          alpha: "透明度",
                        }[key]
                      }
                      <input
                        className={`${nfInput} w-28`}
                        type="number"
                        step={0.01}
                        value={pose[key]}
                        onChange={(e) => editPose(key, +e.target.value)}
                      />
                    </label>
                  ))}
                <button
                  className={nfButton}
                  disabled={
                    !!invalid ||
                    !layer ||
                    layer.keyframes.some((k) => Math.abs(k.time - time) < 0.001)
                  }
                  onClick={() => {
                    const current = scenePoseAt(layer, time);
                    editLayer((l) => ({
                      ...l,
                      keyframes: [
                        ...l.keyframes,
                        { ...current, time } as ScenePose,
                      ].sort((a, b) => a.time - b.time),
                    }));
                    setFrame(0);
                  }}
                >
                  在游标处添加关键帧
                </button>
                <button
                  className={nfButton}
                  disabled={frame === 0}
                  onClick={() => {
                    editLayer((l) => ({
                      ...l,
                      keyframes: l.keyframes.filter((_, i) => i !== frame),
                    }));
                    setFrame(0);
                  }}
                >
                  删除选中关键帧
                </button>
              </>
            )}
          </aside>
        </div>
        <details className="border-t border-slate-800 max-h-72 overflow-auto p-3">
          <summary>对白、转场与音频事件 · {scene.events.length}</summary>
          <div className="flex gap-2 my-3">
            {(["dialogue", "music", "sound", "transition"] as const).map(
              (type) => (
                <button
                  key={type}
                  className={nfButton}
                  onClick={() => {
                    const id =
                      "cue_" +
                      crypto.randomUUID().replaceAll("-", "").slice(0, 8);
                    setPreview(false);
                    setScene((s) => ({
                      ...s,
                      events: [
                        ...s.events,
                        type === "dialogue"
                          ? { id, type, at: time, speaker: "", text: "新对白" }
                          : type === "transition"
                            ? { id, type, at: time, duration: 0.5 }
                            : { id, type, at: time, asset: "game/audio/" },
                      ],
                    }));
                  }}
                >
                  添加{" "}
                  {
                    {
                      dialogue: "对白",
                      music: "音乐",
                      sound: "音效",
                      transition: "转场",
                    }[type]
                  }
                </button>
              ),
            )}
          </div>
          <div className="space-y-2 mt-3">
            {scene.events.map((event, index) => (
              <div className="flex gap-2 items-center" key={event.id}>
                <input
                  className={`${nfInput} w-24`}
                  aria-label={`${event.id} 时间`}
                  type="number"
                  step={0.1}
                  value={event.at}
                  onChange={(e) => {
                    setPreview(false);
                    setScene((s) => ({
                      ...s,
                      events: s.events.map((x, i) =>
                        i === index ? { ...x, at: +e.target.value } : x,
                      ),
                    }));
                  }}
                />
                <button
                  className={nfButton}
                  aria-label={`删除 ${event.id}`}
                  onClick={() => {
                    setPreview(false);
                    setScene((s) => ({
                      ...s,
                      events: s.events.filter((x) => x.id !== event.id),
                    }));
                  }}
                >
                  删除
                </button>
                <span className="text-xs w-20">
                  {
                    {
                      dialogue: "对白",
                      music: "音乐",
                      sound: "音效",
                      transition: "转场",
                    }[event.type]
                  }
                </span>
                {event.type === "dialogue" ? (
                  <>
                    <input
                      className={`${nfInput} w-28`}
                      aria-label={`${event.id} 说话人`}
                      value={event.speaker}
                      onChange={(e) => {
                        setPreview(false);
                        setScene((s) => ({
                          ...s,
                          events: s.events.map((x, i) =>
                            i === index
                              ? { ...event, speaker: e.target.value }
                              : x,
                          ),
                        }));
                      }}
                    />
                    <input
                      className={`${nfInput} flex-1`}
                      aria-label={`${event.id} 对白`}
                      value={event.text}
                      onChange={(e) => {
                        setPreview(false);
                        setScene((s) => ({
                          ...s,
                          events: s.events.map((x, i) =>
                            i === index
                              ? { ...event, text: e.target.value }
                              : x,
                          ),
                        }));
                      }}
                    />
                  </>
                ) : event.type === "transition" ? (
                  <input
                    className={nfInput}
                    aria-label="转场时长"
                    type="number"
                    step={0.1}
                    value={event.duration}
                    onChange={(e) => {
                      setPreview(false);
                      setScene((s) => ({
                        ...s,
                        events: s.events.map((x, i) =>
                          i === index
                            ? { ...event, duration: +e.target.value }
                            : x,
                        ),
                      }));
                    }}
                  />
                ) : (
                  <input
                    className={`${nfInput} flex-1`}
                    aria-label={`${event.id} 音频路径`}
                    value={event.asset}
                    onChange={(e) => {
                      setPreview(false);
                      setScene((s) => ({
                        ...s,
                        events: s.events.map((x, i) =>
                          i === index ? { ...event, asset: e.target.value } : x,
                        ),
                      }));
                    }}
                  />
                )}
              </div>
            ))}
          </div>
        </details>
        {diskComparison && (
          <div className="absolute inset-6 bg-slate-950 border border-slate-500 rounded-xl p-5 flex flex-col z-20">
            <h3 className="text-lg">当前编辑内容与磁盘版本</h3>
            <p className="text-sm text-slate-400 my-2">
              可复制当前内容作为备份。重新打开将明确丢弃当前编辑，使用磁盘版本。
            </p>
            <div className="grid grid-cols-2 gap-3 flex-1 overflow-auto">
              <pre className="text-xs whitespace-pre-wrap bg-slate-900 p-3">
                {serialized || JSON.stringify(scene, null, 2)}
              </pre>
              <pre className="text-xs whitespace-pre-wrap bg-slate-900 p-3">
                {diskComparison.document ?? "磁盘上尚无此场景"}
              </pre>
            </div>
            <div className="flex gap-3 mt-3">
              <button
                className={nfButton}
                onClick={() => setDiskComparison(null)}
              >
                保留当前编辑
              </button>
              <button
                className={nfButton}
                onClick={async () => {
                  try {
                    await bridgeValue(api.sceneDraftClear(scene.id));
                    setDiskComparison(null);
                    await load(scene.id);
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                丢弃当前编辑并重新打开
              </button>
            </div>
          </div>
        )}
        {preview && (
          <div className="absolute inset-6 bg-slate-950 border border-slate-500 rounded-xl p-5 flex flex-col z-10">
            <h3 className="text-lg">审阅生成脚本：原文件 → 新文件</h3>
            <p className="text-sm text-slate-400 my-2">
              保存时会再次检查两个文件的磁盘版本。外部修改将阻止覆盖。
            </p>
            <div className="grid grid-cols-2 gap-4 overflow-auto flex-1">
              <pre className="text-xs whitespace-pre-wrap bg-slate-900 p-3">
                {loaded?.script ?? "新文件"}
              </pre>
              <pre className="text-xs whitespace-pre-wrap bg-slate-900 p-3">
                {code}
              </pre>
            </div>
            <div className="flex gap-3 mt-3">
              <button
                className={nfButton}
                disabled={busy || !!invalid}
                onClick={save}
              >
                确认成对保存
              </button>
              <button className={nfButton} onClick={() => setPreview(false)}>
                返回编辑
              </button>
            </div>
          </div>
        )}
      </fieldset>
    </div>
  );
}
