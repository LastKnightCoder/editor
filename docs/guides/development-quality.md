# 代码检查与格式化

## 准备

在仓库根目录运行 `pnpm install --frozen-lockfile`。Oxlint、Oxfmt 与规则插件的版本由根 package.json 和锁文件固定；Node.js 需满足工具要求（20.19+ 的 20.x，或 22.12+）。

编辑器使用 Oxc 扩展并启用 Oxlint 与 Oxfmt，关闭同一工作区的 ESLint、Prettier 保存动作，避免重复检查和格式化。

## 日常检查

```sh
pnpm lint
pnpm format
pnpm format:check
```

默认处理相对 HEAD 的变更文件和未跟踪文件，也可以在命令后显式传入文件路径。`format` 先执行安全 lint 修复，再格式化；lint 错误会阻止后续格式化。只需调整格式时，使用 `pnpm exec oxfmt --write <文件>`。

```sh
pnpm lint:all
pnpm test:quality
pnpm check:database-boundaries
pnpm check:whiteboard-boundaries
pnpm check:plugin-process-boundaries
pnpm check:docs
```

`lint:all` 检查 apps、packages、examples 中 Git 可见的 TS/TSX 文件；不把独立插件子模块纳入宿主检查。长文件列表自动分批，退出码汇总所有批次。`test:quality` 必须通过；架构边界脚本仍须按变更范围执行。

提交钩子通过 lint-staged 对暂存文件执行 `oxlint --fix` 与 `oxfmt --write`，然后执行既有数据库、白板和文档检查。

## 修改规则

在根 `.oxlintrc.json` 修改规则与目录覆盖；规则分组默认关闭，新增规则必须显式启用。导入边界、白板 AST 选择器使用 `oxlint-plugin-eslint` 的 `eslint-js/no-restricted-imports` 与 `eslint-js/no-restricted-syntax`，保留路径匹配、排除目录及自定义消息。

修改边界时同步补充 `scripts/__tests__/fixtures/quality-cases.mjs` 的禁止、允许和豁免用例，再运行 `pnpm test:quality`。已有 ESLint 行内禁用注释仍由 Oxlint 识别；新增注释优先使用 Oxlint 规则名。

格式配置统一放在根 `.oxfmtrc.json`。仓库默认 100 列，宣传片目录使用 200 列；保留 Tailwind 类名排序，关闭导入排序与 package.json 字段排序。修改格式参数后运行 `pnpm test:quality`，再对本次文件执行 `pnpm format:check`。

发布快照、Markdown 往返夹具、构建输出、vendor、data 和锁文件按配置排除。检查忽略规则时必须确认这些文件的原始字节不变。

## 类型检查

工作区的 `typescript` 固定为原生 TypeScript 7.0.2，继续使用 `tsc`、`pnpm check` 和各包已有的检查命令。浏览器扩展首次检出后先运行 `pnpm --filter browser-extension exec wxt prepare`，再运行 `pnpm --filter browser-extension exec tsc --noEmit`。

需要 `createSourceFile`、`createProgram`、`transpileModule` 或声明文件生成 API 的脚本，显式从 `@typescript/typescript6` 导入，并在所属包声明开发依赖；不要从 `typescript` 根入口调用旧编译器 API。独立作者验证工程使用其自身锁文件中的工具版本。

修改编译器或对应脚本后，执行三项边界检查、`node --test scripts/__tests__/database-boundaries.test.mjs`、SDK 的 API 支持矩阵与声明打包验证。需要生成 JS 的包应显式配置 `rootDir`；环境全局类型在 tsconfig 的 `types` 中列出。CSS 副作用导入使用对应环境声明，不关闭 `noUncheckedSideEffectImports` 来绕过诊断。

## 性能验证

1. 固定同一提交、文件清单、Node.js 版本及运行机器。
2. 旧、新工具使用相同文件批次，不启用缓存、不执行写入。
3. 分别预热一次，再顺序执行三次，记录全部耗时与中位数。
4. 分开记录纯 lint、格式化和完整检查链；不能把包含格式化的 ESLint 耗时全部归因于 lint 引擎。
5. 核对实际扫描文件数、退出码、诊断与架构回归用例；失败或提前退出的命令不能当作成功提速。
