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
      name: "database-web-boundary",
      transformIndexHtml: () => [
        { tag: "script", children: createThemeBootstrapScript(), injectTo: "head-prepend" },
      ],
      generateBundle() {
        for (const id of this.getModuleIds()) {
          if (
            /\/apps\/desktop\/|ContentEditor|(?:^|\/)electron(?:\/|$)|better-sqlite3|\/slate(?:-|\/)|\/packages\/shared\/src\/index/.test(
              id
            )
          ) {
            this.error("Web 示例引入了宿主运行时：" + id);
          }
        }
      },
      writeBundle(_options, bundle) {
        const css = Object.values(bundle)
          .filter(asset => asset.type === "asset" && asset.fileName.endsWith(".css"))
          .map(asset => (asset.type === "asset" ? String(asset.source) : ""))
          .join("\n");
        for (const rule of [
          "container:row-detail/inline-size",
          "aspect-ratio:4/3",
          "height:240px",
          "scrollbar-width:none",
        ]) {
          if (!css.includes(rule)) this.error("Database 样式未生成：" + rule);
        }
      },
    },
  ],
  resolve: { dedupe: ["react", "react-dom", "react-dnd", "react-dnd-html5-backend"] },
});
