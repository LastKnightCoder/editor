# ESLint / Prettier 迁移验证快照

## 范围

迁移基于提交 `b79fd77e058c5b1769d9068dc166a0311aa952e3`，分支 `codex/oxlint-oxfmt-migration`。原工作目录未提交的业务修改不包含在基线中。

根目录与 desktop 的直接 ESLint / Prettier 依赖已移除，根目录固定 Oxlint 1.89.0、oxlint-plugin-eslint 1.89.0、Oxfmt 0.74.0。根质量脚本、lint-staged、collaboration-server 与 collaboration 的命令已切换。独立插件子模块不在迁移范围内。

原根配置与宣传片子配置收口为 `.oxlintrc.json`、`.oxfmtrc.json`。保留格式选项、Tailwind 排序、宣传片 200 列与忽略路径，没有对基准源码执行全仓格式化。

## 测量方法

- 环境：Apple M3 Pro，macOS arm64，Node.js v24.21.0；Oxc 默认使用 12 个线程。
- 旧版本：ESLint 8.57.1、typescript-eslint 5.62.0、Prettier 3.9.6、prettier-plugin-tailwindcss 0.6.14。
- 文件集：`git ls-files -z` 中 apps、packages、examples 的 TS/TSX 文件，使用旧 ESLint 的 `isPathIgnored` 排除旧规则忽略项，共 5,637 个。
- 文件清单按 Git 顺序固定，参数累计超过 100,000 字节时切为下一批，共 4 批。两套工具使用完全相同的批次与源码。
- 每组先预热一次，再顺序运行三次；记录四批合计的墙钟耗时，取三次中位数。关闭工具缓存，不运行 fix/write；不包含依赖安装、pnpm 启动、应用构建与 Electron 封装。
- Lint 输出 JSON 到文件；格式检查输出也重定向到文件，避免终端渲染干扰。
- 格式检查沿用原忽略策略，排除了 4 个路径中含 `data/` 的源码文件，实际处理 5,633 个文件。
- 开发机有其他常驻进程，旧工具三次耗时波动较大；结果是本机快照，不是稳定的 CI 性能承诺。

计时使用 `performance.now()` 包围每轮四次 `spawnSync`，进程退出码 0/1 都记录，启动失败、信号终止或其他退出码视为测量失败。全量 lint 与格式检查本身有存量诊断，不能将这些非零退出码误读为迁移新增失败。

每一批执行的命令如下，文件参数始终来自同一清单：

```sh
# 旧检查链中的 lint，包含 prettier/prettier
eslint --format json <本批文件>

# 纯 lint 对照，排除已经交给格式化器的两条规则
eslint --format json --rule 'prettier/prettier: off' --rule 'object-curly-spacing: off' <本批文件>
oxlint --format json <本批文件>

# 格式检查
prettier --check <本批文件>
oxfmt --check <本批文件>
```

## 结果

| 检查     | 旧工具中位数 | 新工具中位数 |    提速 |
| -------- | -----------: | -----------: | ------: |
| 纯 lint  |    28.461 秒 |     2.446 秒 | 11.6 倍 |
| 格式检查 |    72.134 秒 |     1.433 秒 | 50.3 倍 |

旧配置包含格式规则的 ESLint 中位数为 87.888 秒；新配置必须把 Oxlint 与 Oxfmt 合起来比较，两项中位数之和为 3.879 秒。这个和不是额外测量的一条组合命令，也不代表写入模式的提交钩子耗时。

| 工具                 | 第一次 | 第二次 |  第三次 |
| -------------------- | -----: | -----: | ------: |
| ESLint，包含格式规则 | 67.252 | 87.888 | 120.717 |
| ESLint，纯 lint      | 44.569 | 28.461 |  27.242 |
| Oxlint               |  2.420 |  2.446 |   2.473 |
| Prettier             | 77.563 | 72.134 |  61.826 |
| Oxfmt                |  1.433 |  1.470 |   1.422 |

原始秒数、版本、退出码、源码校验摘要和诊断统计保存在同目录的 [基准数据](./2026-10-25-quality-tools-benchmark.json)。

## 规则兼容性

原配置的 7 组架构覆盖全部保留，包括导入限制、白板六条 AST 选择器、测试与宿主豁免、通知入口限制以及扩展 Markdown 无界面约束。

验证发现 Oxlint 原生 `no-restricted-imports` 没有拦住 `@/*` 对深层 `@/commands/card` 的引用。导入限制改用随 Oxlint 发布的 JavaScript 规则插件，保留旧匹配语义；白板 `no-restricted-syntax` 同样使用该插件。其余常规规则优先使用原生实现。`no-unused-vars` 显式配置选项，避免默认忽略下划线变量与参数而减少旧检查覆盖。

89 个规则用例先在旧 ESLint 下验证，再在 Oxlint 下验证，均通过；加上格式、忽略文件、子包配置发现测试，共 94 项通过。既有 ESLint 行内禁用注释在测试中保持有效。

两套 lint 实际扫描均为 5,637 个文件。全量错误数均为 7，文件、行号与规则逐项相同：

- styled-text 的 StyledText 组件：1 个编辑器扩展入口限制错误。
- underline 的 colors、HoveringItem、UnderlineSelect：共 4 个编辑器扩展入口限制错误。
- `packages/plugins/src/websocket-bridge.ts` 第 83、130 行：2 个 `Function` 类型限制错误。

这些是基线已有问题，本次未修改业务代码或关闭规则来消除它们。因此 `pnpm lint:all` 仍返回 1。

纯 lint 警告从 4,807 条变为 4,731 条，差异集中在原生规则与旧插件版本的实现：Fast Refresh 533 → 455，未使用变量 179 → 176，Hooks 依赖 85 → 90；其他有诊断的常规规则数量一致。迁移不宣称所有常规警告逐条等价。

## 格式差异

Prettier 报告 257 个文件未符合格式，Oxfmt 报告 773 个；其中 566 个仅被 Oxfmt 报告，50 个仅被 Prettier 报告。抽查差异包括 TypeScript 联合类型换行及 Tailwind 类名排序。既有格式基线与两个实现的输出存在差异，不能宣称迁移后全仓格式检查通过。

本次只格式化迁移配置、脚本和新增文档；5,637 个基准源码文件在迁移前后没有修改。后续触及业务文件时会按新格式器输出处理。

## 验证记录

- `pnpm test:quality`：94 项通过。
- `pnpm lint`、`pnpm format:check`：迁移变更文件通过。
- `pnpm check`：桌面 TypeScript 检查通过。
- 数据库、白板、插件进程三项边界检查通过。
- `pnpm check:docs`：通过；新 worktree 补齐了模板插件子模块，消除了因文件未检出导致的文档链接错误。
- `git diff --check`：通过。
- `pnpm lint:all`：保留上述 7 个基线错误，返回 1。

本次未修改应用运行代码，未执行应用构建或视觉验收。
