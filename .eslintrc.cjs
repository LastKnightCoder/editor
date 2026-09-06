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
  },
  overrides: [
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
  ],
};
