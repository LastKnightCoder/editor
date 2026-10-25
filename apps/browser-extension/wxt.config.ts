import { defineConfig } from "wxt";
import path from "node:path";
import { createRequire } from "node:module";
import { readdirSync } from "node:fs";
import tailwindcss from "@tailwindcss/vite";

const KATEX_FONTS = path.join(
  path.dirname(createRequire(import.meta.url).resolve("katex/package.json")),
  "dist/fonts"
);
const KATEX_CSS = "katex/dist/katex.min.css";

/** 消息渲染（@tau/chat-ui）顺带引入的 KaTeX 样式由内容脚本自己注入（字体走扩展资源），构建里置空 */
const dropKatexCssImport = {
  name: "tau-drop-katex-css",
  enforce: "pre" as const,
  resolveId: (id: string) => (id === KATEX_CSS ? "\0tau-empty-css" : null),
  load: (id: string) => (id === "\0tau-empty-css" ? "" : null),
};

/**
 * Chrome 只认严格 UTF-8 的内容脚本：Unicode 非字符（U+FDD0–U+FDEF、U+xFFFE/U+xFFFF）原样出现会拒绝加载
 * （KaTeX 的正则里有字面量 U+FFFF）。产物里把它们改写成 \u 转义，字符串与正则语义不变。
 */
const NONCHARACTER = /[\uFDD0-\uFDEF\uFFFE\uFFFF]/g;
const escapeNoncharacters = {
  name: "tau-escape-noncharacters",
  // 在压缩之后改写：压缩器会把 \u 转义还原成字面字符
  generateBundle: (_options: unknown, bundle: Record<string, { type: string; code?: string }>) => {
    for (const chunk of Object.values(bundle)) {
      if (chunk.type !== "chunk" || !chunk.code) continue;
      chunk.code = chunk.code.replace(
        NONCHARACTER,
        char => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`
      );
    }
  },
};

export default defineConfig({
  srcDir: "src",
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "Tau 伴读",
    description: "在网页里高亮、批注、记笔记，并用 Tau 里的模型对网页提问",
    version: "0.1.0",
    permissions: ["storage"],
    host_permissions: ["<all_urls>"],
    action: { default_title: "Tau 伴读" },
    // 公式字体：@font-face 只在页面文档里生效，从扩展资源加载
    web_accessible_resources: [
      { resources: ["katex/fonts/*.woff2"], matches: ["http://*/*", "https://*/*"] },
      // 页面笔记页嵌在伴读面板里（跨源 iframe：网页读不到其中的草稿）
      { resources: ["note.html"], matches: ["http://*/*", "https://*/*"] },
    ],
    commands: {
      "toggle-companion": {
        suggested_key: { default: "Alt+J" },
        description: "打开 / 关闭伴读面板",
      },
    },
    icons: {
      "16": "icon/16.png",
      "32": "icon/32.png",
      "48": "icon/48.png",
      "128": "icon/128.png",
    },
  },
  hooks: {
    "build:publicAssets": (_wxt, assets) => {
      for (const file of readdirSync(KATEX_FONTS).filter(name => name.endsWith(".woff2")))
        assets.push({
          absoluteSrc: path.join(KATEX_FONTS, file),
          relativeDest: `katex/fonts/${file}`,
        });
    },
  },
  vite: () => ({
    plugins: [dropKatexCssImport, escapeNoncharacters, tailwindcss() as never],
    resolve: {
      dedupe: ["react", "react-dom"],
      alias: [
        { find: "@", replacement: path.resolve(__dirname, "src") },
        // 只带常用语言的高亮器（见 src/content/prism-light.ts）
        {
          find: /^react-syntax-highlighter\/dist\/esm\/prism$/,
          replacement: path.resolve(__dirname, "src/content/prism-light.ts"),
        },
      ],
    },
  }),
});
