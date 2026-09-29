import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

/**
 * 包入口必须能被 Node 以包名原生加载（type stripping，无构建步骤，无 DOM）：
 * Electron 主进程、脚本都这样用。相对导入漏写 .ts、用了 enum 等不可擦除语法，
 * 或意外依赖 DOM / 编辑器运行时，都会在这里失败。
 * --experimental-strip-types：Node < 23.6 需要显式开（22.6+ 支持），新版本默认开启、带上无害。
 */
describe("Node 原生加载 @tau/markdown", () => {
  it("以包名导入并完成一次往返", () => {
    // 框架不自带元素类型，处理器要显式给 codec；这里内联最小的 header / paragraph codec
    const script = `
      const m = await import("@tau/markdown");
      const md = m.createMarkdownProcessor({
        codecs: [
          {
            type: "header",
            serializer: { isBlock: true, toMarkdown: (el, children) => "#".repeat(el.level || 1) + " " + children },
          },
          { type: "paragraph", serializer: { isBlock: true, toMarkdown: (_el, children) => children } },
        ],
      });
      const value = md.importFromMarkdown("# 标题\\n\\n**粗体** 与 \`code\`");
      console.log(JSON.stringify([typeof document, value[0].type, md.getMarkdown(value).trim()]));
    `;
    const output = execFileSync(
      process.execPath,
      ["--experimental-strip-types", "--no-warnings", "--input-type=module", "-e", script],
      { cwd: import.meta.dirname, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
    );
    expect(JSON.parse(output.trim())).toEqual([
      "undefined",
      "header",
      "# 标题\n\n**粗体** 与 `code`",
    ]);
  });
});
