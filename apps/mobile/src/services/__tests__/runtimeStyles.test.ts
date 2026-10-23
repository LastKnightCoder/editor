import { describe, expect, it, vi } from "vitest";
import { compileRuntimeStyles, extractStyleCandidates } from "../runtimeStyles/compile";
import utilities from "tailwindcss/utilities.css?raw";
import theme from "tailwindcss/theme.css?raw";

// Vitest 默认清空 CSS 导入，使用实际文件内容验证编译结果。
vi.mock("tailwindcss/theme.css?raw", async () => {
  const { readFileSync } = await import("node:fs");
  const { createRequire } = await import("node:module");
  return {
    default: readFileSync(createRequire(import.meta.url).resolve("tailwindcss/theme.css"), "utf8"),
  };
});
vi.mock("tailwindcss/utilities.css?raw", async () => {
  const { readFileSync } = await import("node:fs");
  const { createRequire } = await import("node:module");
  return {
    default: readFileSync(
      createRequire(import.meta.url).resolve("tailwindcss/utilities.css"),
      "utf8"
    ),
  };
});
vi.mock("@tau/themes/tailwind.css?raw", async () => {
  const { readFileSync } = await import("node:fs");
  const { createRequire } = await import("node:module");
  return {
    default: readFileSync(
      createRequire(import.meta.url).resolve("@tau/themes/tailwind.css"),
      "utf8"
    ),
  };
});

describe("移动运行时样式编译", () => {
  it("解析 HTML 与 TSX 静态类名，不执行源码", () => {
    expect(
      extractStyleCandidates({
        language: "html",
        source:
          '<script>throw Error("不应执行")</script><div class="p-4 text-ink-1"><template><span class="bg-accent-soft"/></template></div>',
      })
    ).toEqual(["p-4", "text-ink-1", "bg-accent-soft"]);
    expect(
      extractStyleCandidates({
        language: "tsx",
        source:
          'const cls = "p-4 hover:bg-accent-soft"; const Component = () => <div className={`${cls} text-ink-1 w-[137px]`}/>;',
      })
    ).toEqual(expect.arrayContaining(["p-4", "hover:bg-accent-soft", "text-ink-1", "w-[137px]"]));
  });
  it("生成主题语义类、响应式与任意值，无全局 preflight，不累积前一块样式", async () => {
    expect(utilities).toContain("@tailwind utilities");
    expect(theme).toContain("@theme");
    const css = await compileRuntimeStyles({
      language: "html",
      source: '<div class="p-4 bg-accent-soft text-ink-1 md:grid-cols-2 w-[137px]"/>',
    });
    expect(css).toContain("var(--tau-accent-soft)");
    expect(css).toContain("137px");
    expect(css).toContain("grid-template-columns");
    expect(css).not.toContain("box-sizing: border-box");
    const next = await compileRuntimeStyles({
      language: "tsx",
      source: 'const Component = () => <div className="flex"/>;',
    });
    expect(next).toContain("display: flex");
    expect(next).not.toContain("137px");
  });
  it("空样式不生成 CSS，超限或无效 TSX 明确失败", async () => {
    expect(await compileRuntimeStyles({ language: "html", source: "<div>无样式</div>" })).toBe("");
    await expect(compileRuntimeStyles({ language: "tsx", source: "const = <" })).rejects.toThrow();
    expect(() =>
      extractStyleCandidates({ language: "html", source: "x".repeat(1024 * 1024 + 1) })
    ).toThrow("1 MiB");
  });
});
