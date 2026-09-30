// antd 退场棘轮（docs/redesign/01-重构蓝图.md §3.6）：全仓默认禁止新增 antd / @ant-design import，
// 存量白名单文件豁免；白名单唯一事实源是 scripts/antd-whitelist.json，
// 由 scripts/antd-ratchet.mjs --check 守护只减不增（迁移一处收缩一处）。
// eslint-disable-next-line @typescript-eslint/no-var-requires -- CJS 配置只能 require 读 JSON
const antdWhitelist = require("./scripts/antd-whitelist.json");

// 白板插件隔离护栏：跨插件协作必须走能力协议（CapabilityService），
// 禁止引用其它插件的专属 Util 或对其元素类型做强转。
// 宿主插件与测试豁免（领域知识归属宿主自身）。
const whiteboardPluginIsolation = [
  {
    selector: "ImportSpecifier[imported.name='FrameUtil']",
    message: "FrameUtil 仅 FramePlugin 可引用；跨插件协作请走 CapabilityService 能力协议",
  },
  {
    selector: "ImportSpecifier[imported.name='MindUtil']",
    message: "MindUtil 仅 MindPlugin 可引用；跨插件协作请走 CapabilityService 能力协议",
  },
  {
    selector: "ImportSpecifier[imported.name='ColumnUtil']",
    message: "ColumnUtil 仅 ColumnPlugin 可引用；跨插件协作请走 CapabilityService 能力协议",
  },
  {
    selector: "TSAsExpression[typeAnnotation.typeName.name='FrameElement']",
    message: "禁止对 FrameElement 强转；容器行为请通过能力协议声明与查询",
  },
  {
    selector: "TSAsExpression[typeAnnotation.typeName.name='ColumnElement']",
    message: "禁止对 ColumnElement 强转；容器行为请通过能力协议声明与查询",
  },
  {
    selector: "TSAsExpression[typeAnnotation.typeName.name='MindNodeElement']",
    message: "禁止对 MindNodeElement 强转；思维导图行为请通过能力协议声明与查询",
  },
];

module.exports = {
  env: { browser: true, es2022: true, node: true },
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react-hooks/recommended",
    "prettier",
    "plugin:prettier/recommended",
  ],
  parser: "@typescript-eslint/parser",
  parserOptions: { ecmaVersion: "latest", sourceType: "module" },
  plugins: ["react-refresh", "prettier"],
  rules: {
    "react-refresh/only-export-components": "warn",
    "@typescript-eslint/ban-ts-comment": "off",
    "object-curly-spacing": ["warn", "always"],
    "prettier/prettier": [
      "warn",
      {
        semi: true,
        singleQuote: false,
        printWidth: 100,
        tabWidth: 2,
        trailingComma: "es5",
        useTabs: false,
        bracketSpacing: true,
        arrowParens: "avoid",
        endOfLine: "lf",
      },
    ],
    "no-useless-escape": "off",
    "no-constant-condition": "off",
    "@typescript-eslint/no-empty-function": "warn",
    // 主题唯一归属 @tau/themes（docs/editor-refactor ER-011），旧路径不许回流
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          { group: ["@tau/ui/theme", "@tau/ui/theme/*"], message: "主题从 @tau/themes 导入" },
          {
            group: ["antd", "antd/*", "@ant-design/*"],
            message:
              "antd 只减不增（蓝图 §3.6，存量白名单见 scripts/antd-whitelist.json）：新 UI 用 @tau/ui + Tailwind，图标用 lucide-react",
          },
        ],
      },
    ],
  },
  overrides: [
    // 存量白名单豁免 antd 禁令（该文件清单由 scripts/antd-ratchet.mjs 守护只减不增）；
    // override 会整体替换根配置的同名规则，主题禁令需在此重复保留。
    // 白名单清零后空数组是非法 files 配置，会让整个 eslint 崩溃（lint-staged 随之吞工作区），条件展开规避
    ...(antdWhitelist.length > 0
      ? [
          {
            files: antdWhitelist,
            rules: {
              "no-restricted-imports": [
                "error",
                {
                  patterns: [
                    {
                      group: ["@tau/ui/theme", "@tau/ui/theme/*"],
                      message: "主题从 @tau/themes 导入",
                    },
                  ],
                },
              ],
            },
          },
        ]
      : []),
    {
      files: [
        "apps/desktop/src/components/WhiteBoard/plugins/**/*.{ts,tsx}",
        "apps/desktop/src/components/WhiteBoard/interactions/**/*.ts",
      ],
      excludedFiles: [
        // 领域知识归属宿主自身；测试桩需要模拟具体容器
        "apps/desktop/src/components/WhiteBoard/plugins/FramePlugin.tsx",
        "apps/desktop/src/components/WhiteBoard/plugins/MindPlugin.tsx",
        "apps/desktop/src/components/WhiteBoard/plugins/ColumnPlugin.tsx",
        "apps/desktop/src/components/WhiteBoard/plugins/__tests__/**",
      ],
      rules: {
        "no-restricted-syntax": ["error", ...whiteboardPluginIsolation],
      },
    },
    {
      // @tau/markdown 是 headless 包（docs/editor-refactor 01 §8.3）：Electron 主进程在用，
      // 不许引 UI 与编辑器运行时；元素类型只能按文件深路径 import type
      files: ["packages/markdown/src/**/*.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            paths: [
              {
                name: "@tau/editor",
                message: "@tau/markdown 不依赖编辑器运行时，元素类型按文件深路径 import type",
              },
              {
                name: "@tau/editor/src",
                message: "@tau/markdown 不依赖编辑器运行时，元素类型按文件深路径 import type",
              },
            ],
            patterns: [
              { group: ["@tau/ui/theme", "@tau/ui/theme/*"], message: "主题从 @tau/themes 导入" },
              {
                group: [
                  "react",
                  "react-dom",
                  "react-dom/*",
                  "slate-react",
                  "slate-dom",
                  "slate-history",
                  "antd",
                  "antd/*",
                  "@tau/ui",
                  "@tau/ui/*",
                ],
                message: "@tau/markdown 是 headless 包，不能依赖 UI / DOM 库",
              },
            ],
          },
        ],
      },
    },
    {
      // 扩展的 markdown.ts 是 headless 代码（宿主把它与 @tau/markdown 一起合成 codec 列表，
      // Electron 主进程共用，01 §8.3）：不许引 React / UI / 编辑器运行时
      files: ["packages/editor/src/extensions/*/markdown.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              {
                group: [
                  "react",
                  "react-dom",
                  "react-dom/*",
                  "slate-react",
                  "slate-dom",
                  "slate-history",
                  "antd",
                  "antd/*",
                  "@tau/ui",
                  "@tau/ui/*",
                ],
                message: "扩展的 markdown.ts 是 headless 代码（主进程共用），不能依赖 UI / DOM 库",
              },
            ],
          },
        ],
      },
    },
  ],
};
