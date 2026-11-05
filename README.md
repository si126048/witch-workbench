# 夜幕工作台

Windows 本地 Ren’Py 制作工作台，基于 Vangard Studio。使用 Electron、React、TypeScript 和 Monaco，增加中文深色制作界面、版本化场景演出及 Git / Git LFS 团队同步。无需专用协作后端。

本版为 0.1.0，手动升级、未签名 Windows 安装包。实际验证范围和限制见随交付提供的验收记录，不将未验证能力视为生产可用。

## 使用与分发

- [使用说明书与团队安装指南](docs/使用说明书.md)
- [架构与数据契约](docs/nightfall-architecture.md)
- [上游版权声明](NOTICE-NIGHTFALL.md) 与 [AGPL 许可证](LICENSE)
- [保留的上游说明](docs/UPSTREAM_README.md)

安装包位于本机构建的 `release/Nightfall_Workbench_Windows_0.1.0.exe`。交付目录 `delivery` 包含分发材料。尚未上传公共下载站点；负责人可将安装包、匹配源码、许可证、说明书和校验文件放入团队网盘或自己仓库的 Releases。游戏项目使用独立仓库，成员分别克隆工作副本。

## 开发与验证

使用 Node.js 24、Git 和 Git LFS。在 Windows 终端执行：

```text
npm ci
npm run typecheck
npm run lint
npm run test:coverage
npm run build
npm run docs:check
npm run test:e2e
```

端到端测试会多次启动桌面窗口，请在专用测试桌面或 CI 中运行。开发启动：`npm run electron:start`。Ren’Py SDK 另行配置，验收版本为 8.5.3。

Windows 打包使用 `node scripts/build-windows.js`。构建时冻结源码，完成后检查 ASAR 中脚本字节与语法。生成离线说明书使用 `node scripts/build-manual.js`。

仓库保留上游历史，基线为 `fa3999a977b7f374df75962d6da3a0cbe42a3810`；`upstream` 禁止推送。请为自己的发布配置独立远端，不向上游自动发布。继承的发布工作流已停用，Windows 校验工作流不会自动发布安装包。
