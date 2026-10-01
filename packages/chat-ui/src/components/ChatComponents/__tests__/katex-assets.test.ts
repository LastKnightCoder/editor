// @vitest-environment node
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const vitestRequire = createRequire(require.resolve("vitest/package.json"));
const viteRequire = createRequire(vitestRequire.resolve("vite/package.json"));
const { build } = viteRequire("esbuild");

describe("聊天公式资源归属", () => {
  it("独立 Markdown 入口产出 KaTeX 样式及字体，不依赖编辑器数学块", async () => {
    const result = await build({
      entryPoints: [fileURLToPath(new URL("../../MarkdownRenderer/index.tsx", import.meta.url))],
      bundle: true,
      write: false,
      metafile: true,
      platform: "browser",
      format: "esm",
      packages: "external",
      outdir: "chat-assets-check",
      loader: { ".woff2": "file", ".woff": "file", ".ttf": "file" },
      plugins: [
        {
          name: "bundle-package-styles",
          setup(builder: {
            onResolve: (
              options: { filter: RegExp },
              callback: (args: { path: string; resolveDir: string }) => { path: string }
            ) => void;
          }) {
            builder.onResolve({ filter: /^[^./].*\.css$/ }, args => ({
              path: require.resolve(args.path, { paths: [args.resolveDir] }),
            }));
          },
        },
      ],
    });
    const files = result.outputFiles as Array<{ path: string; text: string }>;
    const css = files.find(file => file.path.endsWith(".css"))?.text ?? "";
    expect(css).toContain(".katex");
    expect(css).toContain("@font-face");
    expect(css).toContain("KaTeX_Main");
    expect(files.some(file => file.path.endsWith(".woff2"))).toBe(true);
    expect(Object.keys(result.metafile.inputs).some(path => path.includes("editor-math"))).toBe(
      false
    );
  });
});
