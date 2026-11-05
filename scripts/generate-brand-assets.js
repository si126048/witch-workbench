import fs from "node:fs/promises";
import sharp from "sharp";
const svg = await fs.readFile(
  new URL("../resources/nightfall-mark.svg", import.meta.url),
);
await sharp(svg)
  .resize(512, 512)
  .png()
  .toFile(
    new URL("../nightfall.png", import.meta.url).pathname.replace(
      /^\/([a-z]:)/i,
      "$1",
    ),
  );
const sizes = [16, 24, 32, 48, 64, 128, 256];
const images = await Promise.all(
  sizes.map((size) => sharp(svg).resize(size, size).png().toBuffer()),
);
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
images.forEach((image, i) => {
  const at = 6 + i * 16;
  header[at] = sizes[i] === 256 ? 0 : sizes[i];
  header[at + 1] = header[at];
  header.writeUInt16LE(1, at + 4);
  header.writeUInt16LE(32, at + 6);
  header.writeUInt32LE(image.length, at + 8);
  header.writeUInt32LE(offset, at + 12);
  offset += image.length;
});
await fs.writeFile(
  new URL("../nightfall.ico", import.meta.url),
  Buffer.concat([header, ...images]),
);
