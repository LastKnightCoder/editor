# 文档转换迁移至 anydoc（2026-09）

## 背景

桌面端「知识库资源 → Markdown」转换链路经历三个阶段：

1. **Python Server + markitdown**（2026-02 引入，`bf98b5baa`）：Electron 主进程经 WebSocket 调 Python 侧 `markitdown_converter.py`。
2. **Node 库组合**（2026-09-09，`410354c04` 移除 Python Server）：改为 `mammoth`（docx）+ `officeparser`（pdf/pptx/xlsx/odf/rtf，纯文本提取）+ `turndown`（html）+ `7zip-min`（epub 解包 + 手写 OPF/spine 解析）+ 手写 CSV/TSV 表格。
3. **@firecrawl/anydoc**（本次）：单一 Rust/NAPI 原生模块替换上述组合的大部分。

## 选型说明

[anydoc](https://github.com/firecrawl/anydoc)（MIT 协议，npm 包 `@firecrawl/anydoc`）是 Firecrawl 开源的文档转换库，Rust 实现并提供 NAPI 绑定：

- **输出质量**：直接输出 GitHub Flavored Markdown（标题层级、列表、表格、脚注、数学公式 LaTeX），显著优于 officeparser 的 `toText()` 纯文本拼接。
- **格式覆盖**：Word（doc/docx/docm）、PowerPoint（ppt/pps/pot/pptx/pptm/ppsx/ppsm）、Excel（xls/xlsx/xlsm/xlsb）、OpenDocument（odt/ods/odp）、RTF、EPUB、CSV、PDF——补齐了旧实现完全不支持的 `.doc/.ppt/.xls` 等二进制格式（此前 UI 的上传 accept 列表包含它们，但转换器会拒绝）。
- **工程属性**：NAPI-RS 预编译二进制（无需 node-gyp/electron-rebuild，与 `@node-rs/jieba` 同类）；转换在 libuv 线程池执行，不阻塞事件循环；默认完全不联网（仅显式传 `ocr: 'hosted'` 才会访问 Firecrawl 云端，本项目不使用）。
- **浏览器版本**（`@firecrawl/anydoc-wasm`）本仓库未引入：经排查，mobile（Tauri）、web-server、blog、browser-extension 均无浏览器侧文档转换需求（YAGNI）。

## 格式支持矩阵

核心入口 `convertDocumentToMarkdown(filePath)`（`apps/desktop/src-electron/main/modules/markitdown-node.ts`），契约 `ConvertFileResult { success, textContent, title, filePath, error }` 未变，调用方（`markitdown.ts`、`vibe-learning-index-queue.ts`）零改动。

| 格式                                                                               | 旧实现                         | 新实现                                |
| ---------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------- |
| `.docx`                                                                            | mammoth → HTML → turndown      | anydoc（GFM 直出）                    |
| `.doc` `.docm` `.ppt` `.pps` `.pot` `.pptm` `.ppsx` `.ppsm` `.xls` `.xlsm` `.xlsb` | ❌ 不支持                      | anydoc（净增能力）                    |
| `.pptx` `.xlsx` `.odt` `.ods` `.odp` `.rtf` `.pdf`                                 | officeparser（纯文本）         | anydoc（结构化）                      |
| `.epub`                                                                            | 7zip 解包 + 手写 spine 解析    | anydoc                                |
| `.csv`                                                                             | 手写 Markdown 表格             | anydoc                                |
| `.tsv`                                                                             | 手写 Markdown 表格             | 保留（anydoc 不支持 tsv）             |
| `.html` `.htm`                                                                     | turndown（失败回退正则剥标签） | 保留（anydoc 不支持 html）            |
| `.txt` `.md` 等纯文本                                                              | 直接读取                       | 保留                                  |
| 音视频（mp3/mp4 等）                                                               | whisper 转录 + LLM 整理        | 保留（markitdown.ts，与 anydoc 无关） |
| 图片（jpg/png 等）                                                                 | OpenAI Vision 描述             | 保留（markitdown.ts）                 |

保留的依赖：`turndown`（html 分支 + 渲染进程 web-clipper 仍用）、`7zip-min`（`model-downloader.ts` 仍用）。移除：`mammoth`、`officeparser`。

## API 与错误处理

实际 API 以 `node_modules/@firecrawl/anydoc/anydoc.d.ts` 为准（README 与 0.2.4 实际签名有出入）：

```ts
// 文件路径入参，格式从内容探测（无签名的 CSV 以扩展名兜底）
toMarkdown(path: string, options?: ConvertOptions): Promise<string>
// 字节数组入参（verify-native-runtime 冒烟使用）
toMarkdownBytes(bytes: Uint8Array, format?: Format | null): Promise<string>
```

anydoc 的失败以 `Error.code`（`ConvertErrorCode`）区分：`unsupported` / `needsOcr` / `malformed` / `encrypted` / `resourceLimit` / `missingPart` / `io` / `hosted`。`describeAnydocError` 将其映射为「中文摘要（原始 detail）」格式，例如损坏文档返回 `文档已损坏或格式无效（malformed document: ... invalid Zip archive ...）`，既可读又保留了定位信息。

行为改进说明：

- **扫描版 PDF**：旧 officeparser 静默返回空/残缺文本，现在显式报 `needsOcr`（「PDF 为扫描版或纯图片页面，无法提取文本」）。
- **非 UTF-8 编码 CSV**（如 GBK）：旧实现产出乱码但「成功」，现在会显式报错，属于更诚实的行为。

## 原生模块打包配置（五处联动）

参照 `@node-rs/jieba` 先例，新增/调整以下五处，升级 anydoc 或新增同类原生模块时需保持一致：

| 文件                                                     | 内容                                                                                                                                                                                                                       |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/desktop/package.json`                              | dependencies 增加 `@firecrawl/anydoc`（主包 caret）；optionalDependencies 精确钉版 `@firecrawl/anydoc-darwin-arm64` / `-darwin-x64` / `-win32-x64-msvc`（`0.2.4`），保证 electron-builder 在 pnpm 布局下能收集到全平台变体 |
| `apps/desktop/vite.config.mts`                           | `runtimeDependencyExternals` 增加 `@firecrawl/anydoc`（native 模块不可打进 bundle），移除 `officeparser` / `mammoth`                                                                                                       |
| `apps/desktop/electron-builder.yml`                      | `asarUnpack` 增加 `node_modules/@firecrawl/anydoc/**/*` 与 `node_modules/@firecrawl/anydoc-*/**/*`                                                                                                                         |
| `apps/desktop/scripts/prune-packaged-native-modules.cjs` | win32 分支显式清理两个 darwin 变体；darwin 分支显式清理 win32 变体（darwin 双 arch 均保留，与 jieba 一致；token 兜底清扫自动覆盖遗漏）                                                                                     |
| `apps/desktop/scripts/verify-native-runtime.mjs`         | 新增 anydoc 冒烟检查：`toMarkdownBytes` 真实执行一次 CSV 转换并断言输出                                                                                                                                                    |

## 测试

新增两个测试文件（转换链路此前完全没有单测）：

- `apps/desktop/src-electron/main/modules/__tests__/markitdown-node.test.ts`：真实转换矩阵——用 adm-zip 在内存中构造最小合法 docx（含 styles.xml）与 EPUB（mimetype/container/OPF/spine），断言结构化输出（`# 标题`、章节内容、GFM 表格）；另覆盖纯文本/TSV 表格转义/HTML turndown/损坏文件/不支持的类型/空文件。
- `apps/desktop/src-electron/main/modules/__tests__/markitdown-node-errors.test.ts`：`vi.mock("@firecrawl/anydoc")` 覆盖 `encrypted` / `needsOcr` / `resourceLimit` / `missingPart` / `io` 错误码的中文映射与无码透传。

## 验证结果（2026-09-13）

- 单测：16/16 通过（10 + 6）。
- 类型检查：`pnpm check`（desktop `tsc --noEmit`）通过。
- 桌面端主进程全量测试（`vitest run src-electron`）：65 个文件中 62 通过，3 个失败（`project-vibe-learning-delete` / `diary-table` / `index-recovery-yield`）经 stash 对照确认为**存量问题**，与本次改动无关。
- 打包：`pnpm build` 全流程通过（tsc + vite + electron-builder + verify-native-runtime），产物中 `@firecrawl/anydoc: anydoc=ok`、`no foreign platform modules (115 packages checked)`，DMG/zip 正常产出。
- 独立 agent 两轮代码审查：第一轮后修复 P2（错误信息保留原始细节）；第二轮无阻塞或应修问题（仅剩不可达路径的理论边界）。

## 已知边界

- `.pot` 扩展名按 anydoc 归类为 PowerPoint 模板；gettext 翻译模板（纯文本）同名扩展会被当作 PPT 解析并报「格式无效」。实际冲突概率极低，暂不处理。
- `hosted` 错误码未映射中文：仅在 `ocr: 'hosted'` 模式下产生，本项目不使用该模式，未命中映射时透传原始 message。
- anydoc 要求 Node ≥ 20（Electron 43 内置 Node 22+，本地开发 Node 24，均满足）。

## 升级 anydoc 时的检查清单

1. 更新 `package.json` 主包版本与三个平台包钉版（保持一致），`pnpm install`。
2. 用 `node_modules/@firecrawl/anydoc/anydoc.d.ts` 核对 API 与 `ConvertErrorCode` 是否变化。
3. 跑 `pnpm --filter desktop exec vitest run src-electron/main/modules/__tests__/markitdown-node` 与 `pnpm check`。
4. `pnpm build` 确认 verify-native-runtime 冒烟通过。
