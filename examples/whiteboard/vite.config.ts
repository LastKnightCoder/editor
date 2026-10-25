import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import { createThemeBootstrapScript } from "@tau/themes";
export default defineConfig({
  build: { target: ["chrome107", "edge107", "firefox104", "safari16"] },
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "whiteboard-browser-boundary",
      transformIndexHtml: () => [
        { tag: "script", children: createThemeBootstrapScript(), injectTo: "head-prepend" },
      ],
      generateBundle() {
        for (const id of this.getModuleIds()) {
          if (/\/apps\/desktop\/|(?:^|\/)electron(?:\/|$)|better-sqlite3/.test(id))
            this.error("独立示例引入宿主运行时：" + id);
        }
      },
    },
  ],
  resolve: {
    dedupe: ["react", "react-dom", "slate", "slate-react", "react-dnd", "react-dnd-html5-backend"],
  },
});
