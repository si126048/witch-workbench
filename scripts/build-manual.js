import fs from "node:fs/promises";
import path from "node:path";
const { version } = JSON.parse(await fs.readFile('package.json', 'utf8'));

import { marked } from "marked";
const output = path.resolve(`delivery/${version}`);
await fs.mkdir(output, { recursive: true });
const markdown = await fs.readFile("docs/使用说明书.md", "utf8");
const content = await marked.parse(markdown);
const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>夜幕工作台 · 使用说明书</title><style>
*{box-sizing:border-box}body{margin:0;background:#f5f7f9;color:#172334;font:16px/1.85 "Segoe UI","Microsoft YaHei",sans-serif}header{padding:24px 5vw;background:#0f172a;color:#e2e8f0;border-bottom:3px solid #6ee7b7}header strong{font-size:22px}header span{margin-left:20px;color:#94a3b8;font-size:14px}.layout{display:grid;grid-template-columns:240px minmax(0,900px);gap:48px;max-width:1280px;margin:auto;padding:40px 28px}nav{position:sticky;top:24px;align-self:start;font-size:14px}nav a{display:block;padding:6px 12px;color:#526274;text-decoration:none;border-left:2px solid #dce3e9}nav a:hover{border-color:#059669;color:#047857}article{background:white;border:1px solid #e2e8f0;padding:36px 48px;border-radius:12px;min-width:0}h1{font-size:32px;line-height:1.4;margin-top:0}h2{font-size:23px;margin-top:44px;padding-top:12px;border-top:1px solid #e2e8f0;scroll-margin-top:24px}a{color:#047857}pre{overflow:auto;background:#0f172a;color:#e2e8f0;border-radius:8px;padding:18px;font-size:13px;line-height:1.7}code{font:0.9em Consolas,monospace;background:#eef2f6;padding:2px 5px;border-radius:3px}pre code{background:none;padding:0}table{border-collapse:collapse;width:100%;font-size:14px}th,td{padding:10px 12px;border:1px solid #dce3e9;text-align:left}th{background:#f1f5f9}li{margin:8px 0}footer{color:#64748b;font-size:13px;margin-top:40px;padding-top:20px;border-top:1px solid #e2e8f0}@media(max-width:900px){.layout{display:block;padding:16px}nav{position:static;margin-bottom:20px}article{padding:24px}header span{display:block;margin:0}}@media print{body{background:white;font-size:11pt}header,nav{display:none}.layout{display:block;padding:0}article{border:0;padding:0}h2{break-after:avoid}pre,table{break-inside:avoid}a{color:inherit}}
article{overflow-wrap:anywhere}table{table-layout:fixed}
</style><header><strong>夜幕工作台</strong><span>Windows ${version} · 本地制作与 Git 团队协作</span></header><div class="layout"><nav aria-label="章节目录"><strong>使用说明</strong><div id="toc"></div></nav><article>${content}<footer>此说明书随安装包、源码与验收记录一起分发。最终可用能力以该版本验收记录为准。</footer></article></div><script>document.querySelectorAll('article h2').forEach((h,i)=>{h.id='chapter-'+i;const a=document.createElement('a');a.href='#'+h.id;a.textContent=h.textContent;document.getElementById('toc').appendChild(a);});</script></html>`;
await fs.writeFile(path.join(output, "夜幕工作台使用说明书.html"), html);
await fs.copyFile(
  "docs/使用说明书.md",
  path.join(output, "夜幕工作台使用说明书.md"),
);
console.log(output);
