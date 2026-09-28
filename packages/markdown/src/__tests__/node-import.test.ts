import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

/**
 * 包入口必须能被 Node 以包名原生加载（type stripping，无构建步骤，无 DOM）：
 * Electron 主进程、脚本都这样用。相对导入漏写 .ts、用了 enum 等不可擦除语法，
 * 或意外依赖 DOM / 编辑器运行时，都会在这里失败。
 */
describe("Node 原生加载 @tau/markdown", () => {
  it("以包名导入并完成一次往返", () => {
    const script = `
      const m = await import("@tau/markdown");
      const value = m.importFromMarkdown("# 标题\\n\\n**粗体** 与 \`code\`");
      console.log(JSON.stringify([typeof document, value[0].type, m.getMarkdown(value).trim()]));
    `;
    const output = execFileSync(
      process.execPath,
      ["--no-warnings", "--input-type=module", "-e", script],
      { cwd: import.meta.dirname, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
    );
    expect(JSON.parse(output.trim())).toEqual([
      "undefined",
      "header",
      "# 标题\n\n**粗体** 与 `code`",
    ]);
  });
});
