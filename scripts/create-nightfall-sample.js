import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {
  sampleScene,
  serializeScene,
  generateScene,
} from "../src/lib/sceneDocument.js";
import { TEAM_ATTRIBUTES, TEAM_IGNORE } from "../src/lib/teamGit.js";

const root = path.resolve(process.argv[2] ?? "../nightfall-sample");
const sdk = process.env.RENPY_SDK || process.argv[3];
if (!sdk)
  throw new Error("Provide a RenPy SDK directory as argument 3 or RENPY_SDK.");
await fs.access(path.join(sdk, "sdk-fonts/SourceHanSansLite.ttf"));
await fs.mkdir(root, { recursive: true });
if ((await fs.readdir(root)).length)
  throw new Error("Sample destination must be empty.");
const game = path.join(root, "game");
await fs.cp(new URL("../resources/renpy-template/", import.meta.url), game, {
  recursive: true,
});
await fs.copyFile(
  path.join(sdk, "sdk-fonts/SourceHanSansLite.ttf"),
  path.join(game, "SourceHanSansLite.ttf"),
);
await fs.copyFile(
  new URL("../resources/font-licenses/SourceHanSans.txt", import.meta.url),
  path.join(root, "SourceHanSans-LICENSE.txt"),
);
for (const dir of ["images", "audio", "nightfall_generated"])
  await fs.mkdir(path.join(game, dir), { recursive: true });
await fs.mkdir(path.join(root, ".nightfall/scenes"), { recursive: true });
const street = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="#11192c"/><stop offset="1" stop-color="#38455c"/></linearGradient><radialGradient id="light"><stop stop-color="#f3dd9e" stop-opacity=".8"/><stop offset="1" stop-color="#f3dd9e" stop-opacity="0"/></radialGradient></defs><rect width="1920" height="1080" fill="url(#sky)"/><circle cx="1350" cy="220" r="110" fill="#e4e7ed" opacity=".6"/><path d="M0 320L180 250L340 400L520 240L710 410L930 290L1140 420L1350 260L1520 420L1730 220L1920 330V820H0Z" fill="#151e30"/><path d="M0 630L900 690L1920 590V1080H0Z" fill="#1b2638"/><path d="M920 690L1030 690L1560 1080H400Z" fill="#414c5e"/><path d="M970 710L980 710L990 1080H950Z" fill="#c5cbd2" opacity=".3"/><rect x="440" y="260" width="15" height="610" fill="#080e19"/><path d="M448 270Q450 200 540 220" fill="none" stroke="#080e19" stroke-width="16"/><ellipse cx="548" cy="232" rx="48" ry="12" fill="#eed6a3"/><ellipse cx="548" cy="420" rx="280" ry="350" fill="url(#light)"/><ellipse cx="480" cy="920" rx="100" ry="15" fill="#dfc894" opacity=".25"/><g stroke="#c6d8ef" stroke-width="2" opacity=".2">${Array.from(
  { length: 90 },
  (_, i) => {
    const x = (i * 179) % 1920,
      y = (i * 113) % 1080;
    return `<path d="M${x} ${y}l-15 38"/>`;
  },
).join("")}</g></svg>`;
const traveler = `<svg xmlns="http://www.w3.org/2000/svg" width="620" height="960"><defs><linearGradient id="coat" x2="1" y2="1"><stop stop-color="#33394c"/><stop offset="1" stop-color="#111725"/></linearGradient></defs><ellipse cx="300" cy="930" rx="180" ry="20" fill="#080e19" opacity=".4"/><path d="M205 380L420 380L480 890Q310 950 140 890Z" fill="url(#coat)"/><path d="M230 820L280 820L270 948H210ZM350 820L400 820L420 948H355Z" fill="#121726"/><path d="M185 430L130 730L185 750L250 470ZM390 430L465 700L420 725L345 470Z" fill="#252b3e"/><ellipse cx="305" cy="295" rx="105" ry="125" fill="#d6c9c2"/><path d="M194 310Q140 130 295 130Q455 140 414 360L380 325L360 200Q300 310 194 310Z" fill="#121827"/><path d="M235 385L310 450L385 385L345 535L300 475L255 535Z" fill="#8c9aaf"/><path d="M245 302h25m62 0h25" stroke="#39445b" stroke-width="6"/><path d="M290 350q20 12 34-2" fill="none" stroke="#9b7d7e" stroke-width="3"/><path d="M195 240Q240 180 335 200" fill="none" stroke="#576480" stroke-width="6"/></svg>`;
await sharp(Buffer.from(street))
  .png()
  .toFile(path.join(game, "images/nightfall_street.png"));
await sharp(Buffer.from(traveler))
  .png()
  .toFile(path.join(game, "images/nightfall_traveler.png"));
function wav(seconds, bell) {
  const rate = 22050,
    length = seconds * rate,
    buffer = Buffer.alloc(44 + length * 2);
  buffer.write("RIFF");
  buffer.writeUInt32LE(36 + length * 2, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(length * 2, 40);
  let seed = 12345;
  for (let i = 0; i < length; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const t = i / rate;
    const value = bell
      ? (Math.sin(t * 2 * Math.PI * 660) +
          0.35 * Math.sin(t * 2 * Math.PI * 1321)) *
        Math.exp(-2 * t) *
        0.25
      : ((seed / 4294967296) * 2 - 1) * 0.055;
    buffer.writeInt16LE(
      Math.max(-32768, Math.min(32767, Math.round(value * 32767))),
      44 + i * 2,
    );
  }
  return buffer;
}
await fs.writeFile(path.join(game, "audio/nightfall_rain.wav"), wav(8, false));
await fs.writeFile(path.join(game, "audio/nightfall_bell.wav"), wav(3, true));
const scene = sampleScene();
await fs.writeFile(
  path.join(root, ".nightfall/scenes/opening.json"),
  serializeScene(scene),
);
await fs.writeFile(
  path.join(game, "nightfall_generated/opening.rpy"),
  generateScene(scene),
);
await fs.writeFile(
  path.join(game, "script.rpy"),
  "# Original Nightfall sample\nlabel start:\n    call nf_opening\n    return\n",
);
await fs.copyFile(
  new URL("../resources/nightfall-sample-test.rpy", import.meta.url),
  path.join(game, "nightfall_acceptance.rpy"),
);
const options = await fs.readFile(path.join(game, "options.rpy"), "utf8");
await fs.writeFile(
  path.join(game, "options.rpy"),
  options
    .replaceAll("IDETestProject", "NightfallSample")
    .replace(
      /^define config.name =.*$/m,
      'define config.name = "雨停之前 / Nightfall"',
    )
    .replace(
      /^define config.save_directory =.*$/m,
      'define config.save_directory = "nightfall-sample-01"',
    ),
);
const gui = await fs.readFile(path.join(game, "gui.rpy"), "utf8");
await fs.writeFile(
  path.join(game, "gui.rpy"),
  gui
    .replace(
      /^define gui\.(text_font|name_text_font|interface_text_font) =.*$/gm,
      (_match, key) => `define gui.${key} = "SourceHanSansLite.ttf"`,
    )
    .replace(
      /^define gui.text_color =.*$/m,
      'define gui.text_color = "#e2e8f0"',
    )
    .replace(
      /^define gui.name_text_color =.*$/m,
      'define gui.name_text_color = "#6ee7b7"',
    ),
);
await fs.writeFile(path.join(root, ".gitattributes"), TEAM_ATTRIBUTES);
await fs.writeFile(path.join(root, ".gitignore"), TEAM_IGNORE);
await fs.writeFile(
  path.join(root, "README.md"),
  "# 雨停之前\n\n夜幕工作台原创演出验收样片。图像由本工程 SVG 图形生成，音频由确定性合成生成；不含《魔法使之夜》素材。\n\n用工作台打开本目录，在场景演出页编辑 opening，成对保存后运行 Ren’Py。\n",
);
console.log(root);
