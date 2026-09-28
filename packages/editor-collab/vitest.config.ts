import { defineConfig } from "vitest/config";
import path from "path";

// 渲染真实编辑器的测试要用 @tau/editor 的整套依赖（react-dnd、codemirror 等）与测试 setup
const editorRoot = path.resolve(__dirname, "../editor");

export default defineConfig({
  root: __dirname,
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/test-setup.ts"],
    server: { deps: { inline: [/@tau\/editor/] } },
  },
  resolve: {
    alias: {
      "@tau/shared": path.resolve(__dirname, "../shared"),
      "./tikzjax.js": path.resolve(__dirname, "../../apps/desktop/src/test-mocks/tikzjax.ts"),
    },
  },
  plugins: [
    {
      name: "resolve-from-editor",
      enforce: "pre",
      async resolveId(source, importer, options) {
        if (source.startsWith(".") || source.startsWith("/") || source.startsWith("\0"))
          return null;
        const own = await this.resolve(source, importer, { ...options, skipSelf: true });
        if (own) return own;
        return this.resolve(source, path.join(editorRoot, "src/index.ts"), {
          ...options,
          skipSelf: true,
        });
      },
    },
  ],
});
