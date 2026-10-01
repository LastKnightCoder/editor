// antd 已全仓退出，不保留文件级豁免。

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
          {
            group: ["@tau/editor/src", "@tau/editor/src/*", "@tau/editor/src/**"],
            message:
              "编辑器使用公开根入口、api、markdown 或 toolbar；私有夹具仅供测试以仓库路径引用",
          },
          { group: ["@tau/ui/theme", "@tau/ui/theme/*"], message: "主题从 @tau/themes 导入" },
          {
            group: ["antd", "antd/*", "@ant-design/*"],
            message: "antd 已退役且无豁免：UI 用 @tau/ui + Tailwind，图标用 lucide-react",
          },
        ],
      },
    ],
  },
  overrides: [
    {
      files: [
        "editor-extensions/webview/src/**/*.{ts,tsx}",
        "examples/editor-reminder/src/extension/**/*.{ts,tsx}",
        "editor-extensions/custom-block/src/**/*.{ts,tsx}",
        "editor-extensions/diagram/src/**/*.{ts,tsx}",
        "editor-extensions/html/src/**/*.{ts,tsx}",
        "packages/editor-source-view/src/**/*.{ts,tsx}",
        "editor-extensions/code-block/src/**/*.{ts,tsx}",
        "editor-extensions/math/src/**/*.{ts,tsx}",
        "editor-extensions/emoji/src/**/*.{ts,tsx}",
        "editor-extensions/media/src/**/*.{ts,tsx}",
        "editor-extensions/blockquote/src/**/*.{ts,tsx}",
        "editor-extensions/callout/src/**/*.{ts,tsx}",
        "editor-extensions/detail/src/**/*.{ts,tsx}",
        "editor-extensions/highlight-block/src/**/*.{ts,tsx}",
        "editor-extensions/tabs/src/**/*.{ts,tsx}",
        "editor-extensions/table/src/**/*.{ts,tsx}",
        "editor-extensions/list/src/**/*.{ts,tsx}",
        "editor-extensions/header/src/**/*.{ts,tsx}",
        "editor-extensions/link/src/**/*.{ts,tsx}",
        "editor-extensions/annotation/src/**/*.{ts,tsx}",
        "editor-extensions/comment/src/**/*.{ts,tsx}",
        "editor-extensions/kbd/src/**/*.{ts,tsx}",
        "editor-extensions/divide-line/src/**/*.{ts,tsx}",
        "editor-extensions/front-matter/src/**/*.{ts,tsx}",
        "editor-extensions/text-formatting/src/**/*.{ts,tsx}",
        "editor-extensions/underline/src/**/*.{ts,tsx}",
        "editor-extensions/styled-text/src/**/*.{ts,tsx}",
      ],
      excludedFiles: ["**/__tests__/**"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            paths: [{ name: "@tau/editor", message: "扩展访问内核只能通过 @tau/editor/api" }],
            patterns: [
              {
                group: [
                  "@tau/editor/*",
                  "!@tau/editor/api",
                  "!@tau/editor/api/services",
                  "!@tau/editor/api/paragraph",
                ],
                message: "扩展访问内核只能通过 @tau/editor/api",
              },
              { group: ["**/editor/src/**"], message: "禁止相对路径深引内核实现" },
              { group: ["antd", "antd/*", "@ant-design/*"], message: "新 UI 使用 @tau/ui" },
            ],
          },
        ],
      },
    },
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
      // 不许引 UI 或编辑器；框架只消费自己的结构类型与文本契约
      files: ["packages/markdown/src/**/*.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            paths: [
              {
                name: "@tau/editor",
                message: "@tau/markdown 不依赖编辑器，使用框架结构类型",
              },
              {
                name: "@tau/editor/src",
                message: "@tau/markdown 不依赖编辑器，使用框架结构类型",
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
                  "@ant-design/*",
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
      files: [
        "packages/editor/src/extensions/*/markdown.ts",
        "editor-extensions/webview/markdown.ts",
        "examples/editor-reminder/src/extension/markdown.ts",
        "examples/editor-reminder/src/host/markdown.ts",
        "editor-extensions/webview/src/markdown.ts",
        "editor-extensions/custom-block/markdown.ts",
        "editor-extensions/custom-block/src/markdown.ts",
        "editor-extensions/diagram/markdown.ts",
        "editor-extensions/diagram/src/**/markdown.ts",
        "editor-extensions/html/markdown.ts",
        "editor-extensions/html/src/**/markdown.ts",
        "editor-extensions/code-block/markdown.ts",
        "editor-extensions/code-block/src/**/markdown.ts",
        "editor-extensions/math/markdown.ts",
        "editor-extensions/math/src/markdown.ts",
        "editor-extensions/emoji/markdown.ts",
        "editor-extensions/emoji/src/markdown.ts",
        "editor-extensions/media/markdown.ts",
        "editor-extensions/media/src/**/markdown.ts",
        "editor-extensions/blockquote/markdown.ts",
        "editor-extensions/blockquote/src/markdown.ts",
        "editor-extensions/callout/markdown.ts",
        "editor-extensions/callout/src/markdown.ts",
        "editor-extensions/detail/markdown.ts",
        "editor-extensions/detail/src/markdown.ts",
        "editor-extensions/highlight-block/markdown.ts",
        "editor-extensions/highlight-block/src/markdown.ts",
        "editor-extensions/table/markdown.ts",
        "editor-extensions/table/src/markdown.ts",
        "editor-extensions/list/markdown.ts",
        "editor-extensions/list/src/extensions/*/markdown.ts",
        "editor-extensions/header/markdown.ts",
        "editor-extensions/header/src/markdown.ts",
        "editor-extensions/link/markdown.ts",
        "editor-extensions/link/src/markdown.ts",
        "editor-extensions/annotation/markdown.ts",
        "editor-extensions/annotation/src/markdown.ts",
        "editor-extensions/kbd/markdown.ts",
        "editor-extensions/kbd/src/markdown.ts",
        "editor-extensions/divide-line/markdown.ts",
        "editor-extensions/divide-line/src/markdown.ts",
        "editor-extensions/front-matter/markdown.ts",
        "editor-extensions/front-matter/src/markdown.ts",
        "editor-extensions/text-formatting/markdown.ts",
        "editor-extensions/text-formatting/src/markdown.ts",
        "editor-extensions/underline/markdown.ts",
        "editor-extensions/underline/src/markdown.ts",
        "editor-extensions/styled-text/markdown.ts",
        "editor-extensions/styled-text/src/markdown.ts",
      ],
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
                  "@ant-design/*",
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
