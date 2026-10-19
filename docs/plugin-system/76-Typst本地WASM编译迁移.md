# 76. Typst 本地 WASM 编译迁移

日期：2026-10-19。关联决策 D-175、D-168，SDK 0.24.0，插件 `tau.typst` v0.2.0。

## 背景

D-168 把 Typst 节点迁到独立插件，但编译仍复用宿主 `services.typst.compile`：主进程 worker 加载 `@myriaddreamin/typst-ts-node-compiler` 原生二进制，随安装包分发约 37–42 MB/平台，绝大多数用户不用 Typst 却要为此买单。

## 结论

宿主彻底移除 Typst 编译能力，插件在渲染进程本地编译：

- **编译引擎**：typst.ts 0.6.1-rc3 的 `typst-ts-web-compiler`（wasm）编译 vector 产物，`typst-ts-renderer`（wasm，0.35 MiB）导出自包含 SVG。与旧原生版同版本号，排版行为一致。npm 官方 wasm 不带 HTML 导出（`compile(fmt: "html")` 在 0.6/0.7/0.8 均报 `Unsupported fmt`），SVG 是唯一可行的自包含产物形态。
- **分发**：wasm（8.35 MiB gzip）与官方默认字体集（`@typst-wasm/fonts` 1.0.0，17 个文件 9.3 MiB，含 New CM Math）不进插件 ZIP（30 KB 级），首次编译时从 jsdelivr 主源 + unpkg 备源下载，逐文件做大小与 sha256 校验后缓存 IndexedDB，之后离线可用。选择运行时下载而非包内资产，是因为插件包协议（manifest/main.js/css + integrity）不携带额外文件，扩展资产机制需要宿主、SDK、门户三方同步演进。
- **数据兼容**：`TypstElement.html` 字段自 v0.2.0 保存 SVG 字符串；历史 HTML 缓存与 `compiledFrom` 机制不变。博客端 htmlSerializers 对 SVG 去掉交互脚本并注入 `max-width:100%;height:auto`，旧 HTML 缓存原样透传。
- **宿主删除面**：主进程 typst 模块与 worker、`compile-typst` IPC 命令、`desktopPluginServices.typst`、`CompilerRequest` typst 分支、三平台原生依赖、electron-builder asarUnpack 与 prune 名单、`ITypstCompiler` 服务 token 及其注册（桌面/浏览器扩展）、旧聊天 TypstBlockRenderer 的实时编译（保留缓存展示）。SDK 移除 `PluginServices.typst` 并发布 0.24.0。
- **兼容边界**：插件 0.2.0 不依赖宿主服务，新旧宿主均可运行；旧插件 0.1.x 在移除服务后的宿主上不能实时编译，只显示已保存缓存或源码，不崩溃。先发插件新版本，再发宿主清理版。

## 验证

- 插件仓库：`pnpm test`（单测 + 序列化/预览生命周期）；`TYPST_E2E=1 pnpm test` 真实下载 32 MiB 资源并编译中文、数学公式、表格断言 SVG 输出。
- 宿主：类型检查、相关测试（服务样例改用 tailwind）、`verify-plugin-services.mjs` 移除 typst 段后通过。
- 待办：插件 0.2.0 经 CI 发布后，将 `tests/fixtures/plugins/releases/tau.typst` 冻结夹具升级到新版本；PDF 导出能力（wasm 支持 `fmt: "pdf"`）留待后续按需实现。
