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
  // 仓库根即配置根：不向上合并仓库外的配置（worktree 放在别的仓库目录下时会撞插件）
  root: true,
  ignorePatterns: ["apps/blog/**"],
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
      files: ["packages/database/src/**/*.{ts,tsx}"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            paths: [
              {
                name: "@tau/shared",
                message: "Database 使用 type-only database-types 或 calendar-utils",
              },
            ],
            patterns: [
              {
                group: [
                  "@/*",
                  "**/apps/**",
                  "electron",
                  "electron-*",
                  "@tau/editor",
                  "@tau/editor-*",
                  "slate",
                  "slate-*",
                  "antd",
                  "antd/*",
                  "@ant-design/*",
                ],
                message: "Database 不依赖宿主、编辑器或原生能力",
              },
            ],
          },
        ],
      },
    },
    {
      files: [
        "packages/editor/src/extensions/webview/src/**/*.{ts,tsx}",
        "examples/editor-reminder/src/extension/**/*.{ts,tsx}",
        "packages/editor/src/extensions/diagram/src/**/*.{ts,tsx}",
        "packages/editor-source-view/src/**/*.{ts,tsx}",
        "packages/editor/src/extensions/code-block/src/**/*.{ts,tsx}",
        "packages/editor/src/extensions/math/src/**/*.{ts,tsx}",
        "packages/editor/src/extensions/emoji/src/**/*.{ts,tsx}",
        "packages/editor/src/extensions/media/src/**/*.{ts,tsx}",
        "packages/editor/src/extensions/blockquote/src/**/*.{ts,tsx}",
        "packages/editor/src/extensions/callout/src/**/*.{ts,tsx}",
        "packages/editor/src/extensions/detail/src/**/*.{ts,tsx}",
        "packages/editor/src/extensions/highlight-block/src/**/*.{ts,tsx}",
        "packages/editor/src/extensions/tabs/src/**/*.{ts,tsx}",
        "packages/editor/src/extensions/table/src/**/*.{ts,tsx}",
        "packages/editor/src/extensions/list/src/**/*.{ts,tsx}",
        "packages/editor/src/extensions/header/src/**/*.{ts,tsx}",
        "packages/editor/src/extensions/link/src/**/*.{ts,tsx}",
        "packages/editor/src/extensions/annotation/src/**/*.{ts,tsx}",
        "packages/editor/src/extensions/comment/src/**/*.{ts,tsx}",
        "packages/editor/src/extensions/kbd/src/**/*.{ts,tsx}",
        "packages/editor/src/extensions/divide-line/src/**/*.{ts,tsx}",
        "packages/editor/src/extensions/front-matter/src/**/*.{ts,tsx}",
        "packages/editor/src/extensions/text-formatting/src/**/*.{ts,tsx}",
        "packages/editor/src/extensions/underline/src/**/*.{ts,tsx}",
        "packages/editor/src/extensions/styled-text/src/**/*.{ts,tsx}",
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
        "packages/whiteboard/src/plugins/**/*.{ts,tsx}",
        "packages/whiteboard/src/interactions/**/*.ts",
      ],
      excludedFiles: [
        // 领域知识归属宿主自身；测试桩需要模拟具体容器
        "packages/whiteboard/src/plugins/FramePlugin.tsx",
        "packages/whiteboard/src/plugins/MindPlugin.tsx",
        "packages/whiteboard/src/plugins/ColumnPlugin.tsx",
        "packages/whiteboard/src/plugins/__tests__/**",
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
      // 通知分流守护（D-138）：渲染端业务通知一律走 appNotify（apps/desktop
      // features/notifications/notify.ts）。features/notifications 自身、showcase 样板间
      // 与测试（用 notify.dismiss 清场 / 断言装置）豁免。
      // 注意 override 整体覆盖根规则的 patterns，须原样保留。
      files: ["apps/desktop/src/**/*.{ts,tsx}"],
      excludedFiles: [
        "apps/desktop/src/features/notifications/**",
        "apps/desktop/src/showcase/**",
        "apps/desktop/src/**/__tests__/**",
      ],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            paths: [
              {
                name: "@tau/ui",
                importNames: ["notify"],
                message:
                  "业务通知走 appNotify（features/notifications/notify.ts），icon 传注册表键；详见 03 指南 §2.6",
              },
            ],
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
    },
    {
      // 通知分流守护（D-138）：主进程通知统一走 routeNotification（windows/），
      // 系统通知窗口已取代 Electron 原生通知。
      // 注意 override 整体覆盖根规则的 patterns，须原样保留。
      files: ["apps/desktop/src-electron/**/*.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            paths: [
              {
                name: "electron",
                importNames: ["Notification"],
                message:
                  "主进程通知统一走 routeNotification（windows/notification-router.ts），原生通知已由系统通知窗口接管（D-138）",
              },
            ],
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
    },
    {
      // 扩展的 markdown.ts 是 headless 代码（宿主把它与 @tau/markdown 一起合成 codec 列表，
      // Electron 主进程共用，01 §8.3）：不许引 React / UI / 编辑器运行时
      files: [
        "packages/editor/src/core/extensions/*/markdown.ts",
        "packages/editor/src/extensions/webview/markdown.ts",
        "examples/editor-reminder/src/extension/markdown.ts",
        "examples/editor-reminder/src/host/markdown.ts",
        "packages/editor/src/extensions/webview/src/markdown.ts",
        "packages/editor/src/extensions/diagram/markdown.ts",
        "packages/editor/src/extensions/diagram/src/**/markdown.ts",
        "packages/editor/src/extensions/code-block/markdown.ts",
        "packages/editor/src/extensions/code-block/src/**/markdown.ts",
        "packages/editor/src/extensions/math/markdown.ts",
        "packages/editor/src/extensions/math/src/markdown.ts",
        "packages/editor/src/extensions/emoji/markdown.ts",
        "packages/editor/src/extensions/emoji/src/markdown.ts",
        "packages/editor/src/extensions/media/markdown.ts",
        "packages/editor/src/extensions/media/src/**/markdown.ts",
        "packages/editor/src/extensions/blockquote/markdown.ts",
        "packages/editor/src/extensions/blockquote/src/markdown.ts",
        "packages/editor/src/extensions/callout/markdown.ts",
        "packages/editor/src/extensions/callout/src/markdown.ts",
        "packages/editor/src/extensions/detail/markdown.ts",
        "packages/editor/src/extensions/detail/src/markdown.ts",
        "packages/editor/src/extensions/highlight-block/markdown.ts",
        "packages/editor/src/extensions/highlight-block/src/markdown.ts",
        "packages/editor/src/extensions/table/markdown.ts",
        "packages/editor/src/extensions/table/src/markdown.ts",
        "packages/editor/src/extensions/list/markdown.ts",
        "packages/editor/src/extensions/list/src/extensions/*/markdown.ts",
        "packages/editor/src/extensions/header/markdown.ts",
        "packages/editor/src/extensions/header/src/markdown.ts",
        "packages/editor/src/extensions/link/markdown.ts",
        "packages/editor/src/extensions/link/src/markdown.ts",
        "packages/editor/src/extensions/annotation/markdown.ts",
        "packages/editor/src/extensions/annotation/src/markdown.ts",
        "packages/editor/src/extensions/kbd/markdown.ts",
        "packages/editor/src/extensions/kbd/src/markdown.ts",
        "packages/editor/src/extensions/divide-line/markdown.ts",
        "packages/editor/src/extensions/divide-line/src/markdown.ts",
        "packages/editor/src/extensions/front-matter/markdown.ts",
        "packages/editor/src/extensions/front-matter/src/markdown.ts",
        "packages/editor/src/extensions/text-formatting/markdown.ts",
        "packages/editor/src/extensions/text-formatting/src/markdown.ts",
        "packages/editor/src/extensions/underline/markdown.ts",
        "packages/editor/src/extensions/underline/src/markdown.ts",
        "packages/editor/src/extensions/styled-text/markdown.ts",
        "packages/editor/src/extensions/styled-text/src/markdown.ts",
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
