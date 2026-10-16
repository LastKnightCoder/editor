# 批量导入 / 导出（迁入 · 迁出）

跨会话入口。交互方案与 mockups 见 [mockups.html](./mockups.html)，裁决见 `apps/desktop/docs/redesign/DECISIONS.md` D-140，代码约定见 03 指南「内容导入导出与资源搬运」。

## 定位

低频、一次性、批量写库 / 批量产出文件。不占常驻视觉位：命令面板 + 设置 › 数据 ›「导入与导出」为主入口，页面内只扩充已有的「导入」按钮与 ⋯ 菜单；所有入口汇入同一套流程。

## 进度

| 阶段 | 内容                                                                                                                                                                                            | 状态                 |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| P1   | 导出：本机资源打包进 `assets/` + 相对路径；项目 Markdown 包内文档互链改相对 .md；PDF 内联本机图片；既有 Markdown 导入解析相对路径并经资源存储入库；全部调用点收口到 `services/content-transfer` | 已完成（2026-10-16） |
| P2   | 文件夹 / 压缩包导入向导：来源与去向 → 干跑扫描预览（缺失资源、未解析链接、同名冲突）→ 先建全部文档再回填链接 → 报告 + 按批次撤销；卡片 / 文章「导入」改下拉、拖入文件夹直达                     | 待做                 |
| P3   | 来源方言：Obsidian（`[[ ]]`、`![[ ]]`、附件目录）→ Notion（id 文件名、CSV 数据库）→ Logseq                                                                                                      | 待做                 |
| P4   | 导出范围扩到文章标签 / 卡片 / 全部，`[[标题]]` 方言输出                                                                                                                                         | 待做                 |

## 关键实现位置

- `apps/desktop/src/utils/content-transfer/assets.ts` —— 资源字段清单（新增带资源的块类型在此登记）、字节读取、PDF 内联
- `apps/desktop/src/utils/content-transfer/bundle.ts` —— 导出包：资源收集、相对路径、content-link 改写、ZIP
- `apps/desktop/src/utils/content-transfer/import.ts` —— 导入：相对路径解析 + 上传到当前资源存储
- `apps/desktop/src/services/content-transfer.ts` —— 单篇导出 / Markdown 文件导入的统一入口（保存对话框、toast）
- `apps/desktop/src/utils/batch-export/index.ts` —— 项目整体导出（PDF / EPUB / 合并 Markdown / Markdown 包）
- `apps/desktop/src/features/transfer/ProjectExportHost.tsx` + `app/transferStore.ts` —— 命令面板与设置入口的壳层承载

## 已知边界

- 单篇与合并导出里的 `content-link` 降为标题文本（没有独立文件可链）；只有项目 Markdown 包内的项目文档互链能保留。
- 远程资源（图床 URL）导出时不下载，保持原地址；P4 再考虑「同时下载远程图片」开关。
- 导入暂不识别文档之间的互链（`[x](other.md)` 仍是普通链接），P2 的两遍写入负责回填。
