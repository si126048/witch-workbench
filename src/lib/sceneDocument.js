// Pure, browser-safe scene model. No arbitrary Python is accepted from visual fields.
export const SCENE_VERSION = 1;
export function newSceneDocument(id) {
  return {
    version: 1,
    id,
    title: "新场景",
    width: 1920,
    height: 1080,
    duration: 8,
    layers: [],
    events: [],
  };
}
const idPattern = /^[a-z][a-z0-9_]{0,63}$/;
const numeric = (n, min, max) =>
  typeof n === "number" && Number.isFinite(n) && n >= min && n <= max;
const assetPath = (p) =>
  typeof p === "string" &&
  p.startsWith("game/") &&
  !p.includes("\\") &&
  !p.includes("\0") &&
  !p.split("/").some((s) => s === ".." || s === "." || !s);
const quote = (text) =>
  JSON.stringify(text)
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
const number = (n) => String(Number(n.toFixed(4)));
export const scenePaths = (id) => {
  if (!idPattern.test(id)) throw new Error("Invalid scene ID");
  return {
    document: `.nightfall/scenes/${id}.json`,
    script: `game/nightfall_generated/${id}.rpy`,
  };
};

export function validateScene(doc) {
  if (!doc || doc.version !== SCENE_VERSION)
    throw new Error("Unsupported SceneDocument version.");
  if (
    !idPattern.test(doc.id) ||
    typeof doc.title !== "string" ||
    doc.title.length > 200
  )
    throw new Error("Invalid scene identity.");
  if (
    !numeric(doc.duration, 0.1, 3600) ||
    !numeric(doc.width, 320, 7680) ||
    !numeric(doc.height, 240, 4320)
  )
    throw new Error("Invalid scene dimensions or duration.");
  if (
    !Array.isArray(doc.layers) ||
    doc.layers.length > 64 ||
    !Array.isArray(doc.events) ||
    doc.events.length > 10000
  )
    throw new Error("Invalid scene layers or events.");
  const ids = new Set([doc.id]);
  const unique = (id) => {
    if (typeof id !== "string" || !idPattern.test(id) || ids.has(id))
      throw new Error("Scene IDs must be unique stable identifiers.");
    ids.add(id);
  };
  for (const layer of doc.layers) {
    unique(layer.id);
    if (
      !assetPath(layer.asset) ||
      !["background", "sprite"].includes(layer.kind) ||
      !Number.isInteger(layer.z) ||
      Math.abs(layer.z) > 1000
    )
      throw new Error("Invalid scene layer.");
    if (
      !Array.isArray(layer.keyframes) ||
      !layer.keyframes.length ||
      layer.keyframes.length > 1000
    )
      throw new Error("A layer requires keyframes.");
    let prior = -1;
    for (const k of layer.keyframes) {
      if (!numeric(k.time, 0, doc.duration) || k.time <= prior)
        throw new Error("Keyframe times must be strictly increasing.");
      if (
        !numeric(k.x, -4, 4) ||
        !numeric(k.y, -4, 4) ||
        !numeric(k.zoom, 0.01, 10) ||
        !numeric(k.rotation, -3600, 3600) ||
        !numeric(k.alpha, 0, 1)
      )
        throw new Error("Invalid keyframe pose.");
      prior = k.time;
    }
    if (layer.keyframes[0].time !== 0)
      throw new Error("Every layer needs a pose at time zero.");
  }
  for (const event of doc.events) {
    unique(event.id);
    if (!numeric(event.at, 0, doc.duration))
      throw new Error("Event is outside the scene duration.");
    if (event.type === "dialogue") {
      if (
        typeof event.text !== "string" ||
        event.text.length > 20000 ||
        typeof event.speaker !== "string" ||
        event.speaker.length > 100
      )
        throw new Error("Invalid dialogue.");
    } else if (event.type === "music" || event.type === "sound") {
      if (!assetPath(event.asset)) throw new Error("Invalid audio path.");
    } else if (event.type === "transition") {
      if (!numeric(event.duration, 0.01, 10))
        throw new Error("Invalid dissolve duration.");
    } else throw new Error("Unsupported scene event.");
  }
  return doc;
}

/** Explicit field selection strips accidental editor state; same semantic document gives same bytes. */
export function serializeScene(doc) {
  validateScene(doc);
  return (
    JSON.stringify(
      {
        version: 1,
        id: doc.id,
        title: doc.title,
        width: doc.width,
        height: doc.height,
        duration: doc.duration,
        layers: [...doc.layers]
          .sort((a, b) => a.z - b.z || a.id.localeCompare(b.id, "en"))
          .map((l) => ({
            id: l.id,
            kind: l.kind,
            asset: l.asset,
            z: l.z,
            keyframes: l.keyframes.map((k) => ({
              time: k.time,
              x: k.x,
              y: k.y,
              zoom: k.zoom,
              rotation: k.rotation,
              alpha: k.alpha,
            })),
          })),
        events: [...doc.events]
          .sort((a, b) => a.at - b.at || a.id.localeCompare(b.id, "en"))
          .map((e) =>
            e.type === "dialogue"
              ? {
                  id: e.id,
                  type: e.type,
                  at: e.at,
                  speaker: e.speaker,
                  text: e.text,
                }
              : e.type === "transition"
                ? { id: e.id, type: e.type, at: e.at, duration: e.duration }
                : { id: e.id, type: e.type, at: e.at, asset: e.asset },
          ),
      },
      null,
      2,
    ) + "\n"
  );
}

const pose = (k) =>
  `xcenter ${number(k.x)} ycenter ${number(k.y)} zoom ${number(k.zoom)} rotate ${number(k.rotation)} alpha ${number(k.alpha)}`;
// User dialogue is literal, rather than Ren'Py interpolation or text tags.
const dialogueQuote = (text) =>
  quote(text.replace(/\[/g, "[[").replace(/\{/g, "{{").replace(/%/g, "%%"));

export function generateScene(input) {
  const doc = JSON.parse(serializeScene(input));
  const lines = [
    "# Generated by Nightfall Workbench. Edit the matching SceneDocument.",
    "# Dialogue pauses extend the scene clock; preview motion uses engine time.",
    "",
  ];
  for (const layer of doc.layers) {
    const name = `nf_${doc.id}_${layer.id}`;
    lines.push(`transform ${name}:`, `    ${pose(layer.keyframes[0])}`);
    for (let i = 1; i < layer.keyframes.length; i++) {
      const k = layer.keyframes[i];
      lines.push(
        `    linear ${number(k.time - layer.keyframes[i - 1].time)} ${pose(k)}`,
      );
    }
    lines.push("");
  }
  lines.push(`label nf_${doc.id}:`, "    scene black");
  for (const layer of doc.layers)
    lines.push(
      `    show expression ${quote(layer.asset.slice(5))} as nf_${doc.id}_${layer.id} at nf_${doc.id}_${layer.id} zorder ${layer.z}`,
    );
  let time = 0;
  for (const event of doc.events) {
    if (event.at > time) lines.push(`    pause ${number(event.at - time)}`);
    time = event.at;
    lines.push(`    # cue ${event.id}`);
    if (event.type === "dialogue")
      lines.push(
        `    ${event.speaker ? dialogueQuote(event.speaker) + " " : ""}${dialogueQuote(event.text)}`,
      );
    else if (event.type === "transition")
      lines.push(`    with Dissolve(${number(event.duration)})`);
    else lines.push(`    play ${event.type} ${quote(event.asset.slice(5))}`);
  }
  if (doc.duration > time)
    lines.push(`    pause ${number(doc.duration - time)}`);
  lines.push("    stop music fadeout 1.0", "    return", "");
  return lines.join("\n");
}

export function sampleScene() {
  return {
    version: 1,
    id: "opening",
    title: "序章 · 雨停之前",
    width: 1920,
    height: 1080,
    duration: 8,
    layers: [
      {
        id: "street",
        kind: "background",
        asset: "game/images/nightfall_street.png",
        z: 0,
        keyframes: [
          { time: 0, x: 0.5, y: 0.5, zoom: 1.1, rotation: 0, alpha: 1 },
          { time: 8, x: 0.48, y: 0.5, zoom: 1.18, rotation: 0, alpha: 1 },
        ],
      },
      {
        id: "traveler",
        kind: "sprite",
        asset: "game/images/nightfall_traveler.png",
        z: 10,
        keyframes: [
          { time: 0, x: 0.72, y: 0.58, zoom: 0.8, rotation: 0, alpha: 0 },
          { time: 2, x: 0.62, y: 0.58, zoom: 0.8, rotation: 0, alpha: 1 },
        ],
      },
    ],
    events: [
      {
        id: "rain",
        type: "music",
        at: 0,
        asset: "game/audio/nightfall_rain.wav",
      },
      { id: "reveal", type: "transition", at: 0, duration: 1 },
      {
        id: "arrival",
        type: "dialogue",
        at: 2,
        speaker: "林",
        text: "雨停之前，这条街不会出现在地图上。",
      },
      {
        id: "bell",
        type: "sound",
        at: 4,
        asset: "game/audio/nightfall_bell.wav",
      },
      {
        id: "answer",
        type: "dialogue",
        at: 5,
        speaker: "",
        text: "远处的钟声响起。路灯下，影子迟了一步。",
      },
    ],
  };
}

export function scenePoseAt(layer, time) {
  const first = layer.keyframes[0];
  if (time <= first.time) return first;
  for (let i = 1; i < layer.keyframes.length; i++) {
    const b = layer.keyframes[i],
      a = layer.keyframes[i - 1];
    if (time <= b.time) {
      const ratio = (time - a.time) / (b.time - a.time);
      return Object.fromEntries(
        ["x", "y", "zoom", "rotation", "alpha"].map((key) => [
          key,
          a[key] + (b[key] - a[key]) * ratio,
        ]),
      );
    }
  }
  return layer.keyframes[layer.keyframes.length - 1];
}
