export interface ScenePose {
  time: number;
  x: number;
  y: number;
  zoom: number;
  rotation: number;
  alpha: number;
}
export interface SceneLayer {
  id: string;
  kind: "background" | "sprite";
  asset: string;
  z: number;
  keyframes: ScenePose[];
}
export type SceneEvent = { id: string; at: number } & (
  | { type: "dialogue"; speaker: string; text: string }
  | { type: "music" | "sound"; asset: string }
  | { type: "transition"; duration: number }
);
export interface SceneDocument {
  version: 1;
  id: string;
  title: string;
  width: number;
  height: number;
  duration: number;
  layers: SceneLayer[];
  events: SceneEvent[];
}
export interface SceneRevision {
  document: string | null;
  script: string | null;
}
export interface LoadedScene {
  scene: SceneDocument | null;
  document: string | null;
  script: string | null;
  revision: SceneRevision;
}
export interface TeamFile {
  path: string;
  original?: string;
  status: string;
  conflicted: boolean;
}
export interface TeamStatus {
  environment: { git: string | null; lfs: string | null };
  repository: boolean;
  branch?: string;
  upstream?: string;
  ahead?: number;
  behind?: number;
  remote?: string;
  merging?: boolean;
  files: TeamFile[];
  history: { id: string; author: string; date: string; subject: string }[];
}
export interface TeamDiff {
  text?: string;
  conflict?: boolean;
  base?: string;
  ours?: string;
  theirs?: string;
}
export interface RulesPreview {
  attributes: string;
  ignore: string;
  trackedBinary: string[];
}
export type BridgeResult<T> =
  { ok: true; value: T } | { ok: false; error: string };
export interface NightfallAPI {
  clone(remote: string): Promise<BridgeResult<string | null>>;
  init(): Promise<BridgeResult<string>>;
  status(): Promise<BridgeResult<TeamStatus>>;
  diff(file: string): Promise<BridgeResult<TeamDiff>>;
  rules(): Promise<BridgeResult<RulesPreview>>;
  team(
    action: string,
    payload?: Record<string, unknown>,
  ): Promise<BridgeResult<string>>;
  sceneList(): Promise<BridgeResult<string[]>>;
  sceneLoad(id: string): Promise<BridgeResult<LoadedScene>>;
  sceneSave(
    scene: SceneDocument,
    revision: SceneRevision,
  ): Promise<BridgeResult<LoadedScene>>;
  sceneDraftWrite(
    scene: SceneDocument,
    revision: SceneRevision,
  ): Promise<BridgeResult<void>>;
  sceneDraftRead(
    id: string,
  ): Promise<
    BridgeResult<{ scene: SceneDocument; revision: SceneRevision } | null>
  >;
  sceneDraftClear(id: string): Promise<BridgeResult<void>>;
  onProgress(callback: (text: string) => void): () => void;
}
