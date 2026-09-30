import { defineConfig } from "wxt";
import path from "path";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  srcDir: "src",
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "Tau",
    description: "Tau 浏览器助手 - 网页笔记与 AI 助手",
    version: "0.1.0",
    permissions: ["storage", "sidePanel", "tabs", "scripting", "activeTab"],
    host_permissions: ["<all_urls>"],
    icons: {
      "16": "icon/16.png",
      "32": "icon/32.png",
      "48": "icon/48.png",
      "128": "icon/128.png",
    },
  },
  vite: () => ({
    plugins: [tailwindcss() as any],
    resolve: {
      dedupe: [
        "react",
        "react-dom",
        "slate",
        "slate-react",
        "react-dnd",
        "react-dnd-html5-backend",
      ],
      alias: {
        "@": path.resolve(__dirname, "src"),
      },
    },
    css: {
      preprocessorOptions: {
        less: {
          javascriptEnabled: true,
        },
      },
    },
  }),
});
