export const qualityCases = [];

function addCase(name, directory, source, rule, count = 1, filename) {
  qualityCases.push({
    name,
    file: `${directory}/${filename ?? `quality-${qualityCases.length}.tsx`}`,
    source,
    rule,
    count,
  });
}

function imports(name, directory, denied, allowed) {
  for (const dependency of denied) {
    const count = directory === "packages/markdown/src" && dependency === "@tau/ui/theme" ? 2 : 1;
    addCase(
      `${name}拒绝 ${dependency}`,
      directory,
      `import { value } from "${dependency}";`,
      "no-restricted-imports",
      count,
      `quality-${qualityCases.length}.ts`
    );
  }
  for (const dependency of allowed) {
    addCase(
      `${name}允许 ${dependency}`,
      directory,
      `import { value } from "${dependency}";`,
      "no-restricted-imports",
      0,
      `quality-${qualityCases.length}.ts`
    );
  }
}

addCase(
  "下划线变量仍需检查使用情况",
  "packages/ui/src",
  "const _unused = 1; export {};",
  "no-unused-vars"
);
addCase(
  "下划线参数仍需检查使用情况",
  "packages/ui/src",
  "export function identity(value, _unused) { return value; }",
  "no-unused-vars"
);
addCase(
  "未使用的 catch 参数保持豁免",
  "packages/ui/src",
  "try { run(); } catch (error) { recover(); }",
  "no-unused-vars",
  0
);

imports(
  "根边界",
  "packages/ui/src",
  ["@tau/editor/src", "@tau/editor/src/core/value", "@tau/ui/theme", "@tau/ui/theme/runtime"],
  ["@tau/editor", "@tau/editor/api", "@tau/themes", "@tau/themes/react"]
);
imports(
  "数据库",
  "packages/database/src",
  [
    "@tau/shared",
    "@/commands/card",
    "../../apps/desktop/src/app",
    "electron",
    "electron-log",
    "@tau/editor",
    "@tau/editor-source-view",
    "slate",
    "slate-react",
  ],
  ["@tau/shared/database-types", "@tau/shared/calendar-utils", "@tau/contracts"]
);

for (const directory of [
  "packages/editor/src/extensions/link/src",
  "examples/editor-reminder/src/extension",
  "packages/editor-source-view/src",
]) {
  imports(
    "编辑器扩展",
    directory,
    ["@tau/editor", "@tau/editor/toolbar", "../../editor/src/core/value"],
    ["@tau/editor/api", "@tau/editor/api/services", "@tau/editor/api/paragraph"]
  );
}
imports(
  "扩展测试豁免",
  "packages/editor/src/extensions/link/src/__tests__",
  [],
  ["@tau/editor", "@tau/editor/toolbar"]
);
imports(
  "扩展测试仍遵循根边界",
  "packages/editor/src/extensions/link/src/__tests__",
  ["@tau/editor/src/core/value"],
  []
);
imports(
  "Markdown 无界面边界",
  "packages/markdown/src",
  [
    "@tau/editor",
    "@tau/editor/src",
    "@tau/ui/theme",
    "react",
    "react-dom/client",
    "slate-react",
    "slate-dom",
    "slate-history",
    "@tau/ui",
    "@tau/ui/primitives",
  ],
  ["@tau/contracts", "@tau/shared/database-types"]
);

const whiteboardSource = [
  'import { FrameUtil, MindUtil, ColumnUtil } from "./utils";',
  "const frame = value as FrameElement;",
  "const column = value as ColumnElement;",
  "const mind = value as MindNodeElement;",
].join("\n");
addCase(
  "白板插件的六条隔离规则",
  "packages/whiteboard/src/plugins",
  whiteboardSource,
  "no-restricted-syntax",
  6
);
addCase(
  "白板交互同样禁止越界",
  "packages/whiteboard/src/interactions",
  whiteboardSource,
  "no-restricted-syntax",
  6,
  "quality.ts"
);
for (const filename of ["FramePlugin.tsx", "MindPlugin.tsx", "ColumnPlugin.tsx"]) {
  addCase(
    `宿主 ${filename} 豁免`,
    "packages/whiteboard/src/plugins",
    whiteboardSource,
    "no-restricted-syntax",
    0,
    filename
  );
}
addCase(
  "白板测试豁免",
  "packages/whiteboard/src/plugins/__tests__",
  whiteboardSource,
  "no-restricted-syntax",
  0
);
addCase(
  "白板类型断言保留选择器边界",
  "packages/whiteboard/src/plugins",
  "const frame = value as OtherElement;",
  "no-restricted-syntax",
  0
);

addCase(
  "渲染端通知导入",
  "apps/desktop/src/features/cards",
  'import { notify } from "@tau/ui";',
  "no-restricted-imports"
);
addCase(
  "渲染端通知别名导入",
  "apps/desktop/src/features/cards",
  'import { notify as toast } from "@tau/ui";',
  "no-restricted-imports"
);
addCase(
  "渲染端其他 UI 导入",
  "apps/desktop/src/features/cards",
  'import { Panel } from "@tau/ui";',
  "no-restricted-imports",
  0
);
for (const directory of [
  "apps/desktop/src/features/notifications",
  "apps/desktop/src/showcase",
  "apps/desktop/src/features/cards/__tests__",
]) {
  addCase(
    "通知实现与测试豁免",
    directory,
    'import { notify } from "@tau/ui";',
    "no-restricted-imports",
    0
  );
  imports("通知豁免仍遵循根边界", directory, ["@tau/editor/src/core/value"], []);
}
addCase(
  "主进程原生通知",
  "apps/desktop/src-electron/main",
  'import { Notification } from "electron";',
  "no-restricted-imports",
  1,
  "notification.ts"
);
addCase(
  "主进程其他 Electron 能力",
  "apps/desktop/src-electron/main",
  'import { BrowserWindow } from "electron";',
  "no-restricted-imports",
  0,
  "window.ts"
);
imports(
  "主进程保留根边界",
  "apps/desktop/src-electron/main",
  ["@tau/ui/theme", "@tau/editor/src/core/value"],
  []
);

for (const directory of [
  "packages/editor/src/core/extensions/link",
  "packages/editor/src/extensions/diagram/src/nested",
  "packages/editor/src/extensions/list/src/extensions/item",
  "examples/editor-reminder/src/host",
]) {
  addCase(
    "扩展 Markdown 无界面边界",
    directory,
    'import React from "react"; import { Panel } from "@tau/ui";',
    "no-restricted-imports",
    2,
    "markdown.ts"
  );
}
addCase(
  "禁止类型导入私有入口",
  "packages/ui/src",
  'import type { Value } from "@tau/editor/src/core";',
  "no-restricted-imports"
);
addCase(
  "禁止重导出私有入口",
  "packages/ui/src",
  'export { value } from "@tau/editor/src/core";',
  "no-restricted-imports"
);

addCase(
  "React Hooks 调用顺序",
  "packages/ui/src",
  "function Component({ active }) { if (active) useEffect(() => {}, []); return null; }",
  "rules-of-hooks"
);
addCase(
  "React Hooks 依赖",
  "packages/ui/src",
  "function Component({ value }) { useEffect(() => { console.log(value); }, []); return null; }",
  "exhaustive-deps"
);
addCase(
  "保留 Hooks 行级豁免",
  "packages/ui/src",
  "function Component({ value }) {\n// eslint-disable-next-line react-hooks/exhaustive-deps\nuseEffect(() => { console.log(value); }, []); return null; }",
  "exhaustive-deps",
  0
);
addCase(
  "保留 TypeScript 行级豁免",
  "packages/ui/src",
  "// eslint-disable-next-line @typescript-eslint/no-explicit-any\nexport const value: any = null;",
  "no-explicit-any",
  0
);
addCase(
  "显式 any 仍有警告",
  "packages/ui/src",
  "export const value: any = null;",
  "no-explicit-any"
);
addCase(
  "Fast Refresh 混合导出",
  "packages/ui/src",
  "export const value = 1; export function Component() { return <div />; }",
  "only-export-components"
);
addCase(
  "保留 Fast Refresh 文件级豁免",
  "packages/ui/src",
  "/* eslint-disable react-refresh/only-export-components */\nexport const value = 1; export function Component() { return <div />; }",
  "only-export-components",
  0
);
