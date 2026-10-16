# 批量导入 / 导出（迁入 · 迁出）

跨会话入口。交互方案与 mockups 见 [mockups.html](./mockups.html)，裁决见 `apps/desktop/docs/redesign/DECISIONS.md` D-140，代码约定见 03 指南「内容导入导出与资源搬运」。

## 定位

低频、一次性、批量写库 / 批量产出文件。不占常驻视觉位：命令面板 + 设置 › 数据 ›「导入与导出」为主入口，页面内只扩充已有的「导入」按钮与 ⋯ 菜单；所有入口汇入同一套流程。

## 进度

| 阶段 | 内容                                                                                                                                                                                            | 状态                 |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| P1   | 导出：本机资源打包进 `assets/` + 相对路径；项目 Markdown 包内文档互链改相对 .md；PDF 内联本机图片；既有 Markdown 导入解析相对路径并经资源存储入库；全部调用点收口到 `services/content-transfer` | 已完成（2026-10-16） |
| P2   | 文件夹 / 压缩包导入向导：来源与去向 → 干跑扫描预览（缺失资源、未解析链接；同名不判冲突，并存）→ 先建全部文档再回填链接 → 报告 + 按批次撤销；卡片 / 文章「导入」改下拉、拖入文件夹直达           | 已完成（2026-10-16） |
| P3   | 来源方言：Obsidian（`[[ ]]`、`![[ ]]`、附件目录）→ Notion（id 文件名、CSV 数据库）→ Logseq                                                                                                      | 已完成（2026-10-16） |
| P4   | 导出范围扩到文章标签 / 卡片 / 全部，`[[标题]]` 方言输出                                                                                                                                         | 已完成（2026-10-16） |

## 关键实现位置

- `apps/desktop/src/utils/content-transfer/assets.ts` —— 资源字段清单（新增带资源的块类型在此登记）、字节读取、PDF 内联
- `apps/desktop/src/utils/content-transfer/bundle.ts` —— 导出包：资源收集、相对路径、content-link 改写、ZIP
- `apps/desktop/src/utils/content-transfer/import.ts` —— 导入：相对路径解析 + 上传到当前资源存储
- `apps/desktop/src/services/content-transfer.ts` —— 单篇导出 / Markdown 文件导入的统一入口（保存对话框、toast）
- `apps/desktop/src/utils/batch-export/index.ts` —— 项目整体导出（PDF / EPUB / 合并 Markdown / Markdown 包）
- `apps/desktop/src/services/markdown-export.ts` + `features/transfer/MarkdownExportDialog.tsx` —— 导出为 Markdown（项目 / 文章 / 卡片 / 全部，D-143），壳层承载 `MarkdownExportHost` + `app/transferStore.ts`
- `apps/desktop/src/utils/content-transfer/source.ts` —— 批量导入来源（文件夹 / .zip 统一为相对路径读取）
- `apps/desktop/src/utils/content-transfer/batch-import.ts` —— 扫描成计划（只读）+ 三遍执行（资源 → 文档 → 回填互链）
- `apps/desktop/src/services/batch-import.ts` + `stores/useImportHistoryStore.ts` —— 宿主接线、导入记录与整批撤销（D-141）
- `apps/desktop/src/features/transfer/ImportWizard.tsx` / `useImportDrop.tsx` —— 向导与页面拖入
- `apps/desktop/src/utils/content-transfer/dialects.ts` / `csv.ts` —— 来源方言（Obsidian / Notion / Logseq）与 CSV 解析（D-142）

## 已知边界

- 单篇与合并导出里的 `content-link` 降为标题文本（没有独立文件可链）；只有项目 Markdown 包内的项目文档互链能保留。
- 远程资源（图床 URL）默认不下载，「导出为 Markdown」里可开启「同时下载远程图片」；单篇导出与项目整体导出不下载。
- 日记暂不导出；文章 / 卡片多标签时只按第一个标签放文件夹，其余标签写进 frontmatter。
- 单文件导入（「导入 › Markdown 文件…」）不回填互链；批量导入只回填本批之内的 .md 链接。
- 批量导入撤销不删除已上传的资源文件；导入记录只存在本机。
- 方言降级：Logseq `((块引用))` 移除、`![[笔记]]` 嵌入降为链接、Obsidian 嵌入尺寸忽略；Notion CSV 列一律文本，表格行与行页面不关联；Notion 分卷大导出需先解压外层。
- 拖入只取第一个文件 / 文件夹；拖入单个 .md 只提示，单文件请用「导入 › Markdown 文件…」。
