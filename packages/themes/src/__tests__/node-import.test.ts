import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { listThemes } from "../index.ts";

/**
 * 根入口必须能被 Node 以包名原生加载（type stripping，无构建步骤）：
 * vite 配置、Electron 主进程、脚本都这样用。相对导入漏写 .ts、用了 enum 等不可擦除语法，
 * 或根入口意外依赖 DOM，都会在这里失败。
 */
describe("Node 原生加载 @tau/themes", () => {
  it("以包名导入根入口并生成首帧脚本", () => {
    const output = execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        'const m = await import("@tau/themes"); console.log(m.listThemes().length, m.createThemeBootstrapScript().length > 0);',
      ],
      { cwd: import.meta.dirname, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
    );
    // 主题数以包内注册表为准对账，不写死数字（新增/删除主题不需要改这里）
    expect(output.trim()).toBe(`${listThemes().length} true`);
  });
});
