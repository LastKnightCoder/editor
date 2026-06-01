import { describe, expect, it } from "vitest";

import { scopeRuntimeTailwindCss } from "../publish-tailwind-scope";

describe("publish-tailwind-scope", () => {
  it("应保留 Tailwind 主题变量并将工具类限制在编辑器容器内", () => {
    const scoped = scopeRuntimeTailwindCss(`
@layer theme {
  :root, :host {
    --color-red-500: oklch(63.7% 0.237 25.331);
  }
}
@layer utilities {
  .text-red-500 {
    color: var(--color-red-500);
  }
}
`);

    expect(scoped).toContain("@layer theme");
    expect(scoped).toContain(
      '[data-slate-editor="true"] {\n    --color-red-500',
    );
    expect(scoped).toContain('[data-slate-editor="true"] .text-red-500');
    expect(scoped).not.toContain('[data-slate-editor="true"] { @layer theme');
  });

  it("不应破坏 Tailwind dark 变体里的嵌套选择器", () => {
    const scoped = scopeRuntimeTailwindCss(`
@layer utilities {
  .dark\\:bg-zinc-900 {
    .dark & {
      background-color: var(--color-zinc-900);
    }
  }
}
`);

    expect(scoped).toContain('[data-slate-editor="true"] .dark\\:bg-zinc-900');
    expect(scoped).toContain(".dark &");
    expect(scoped).not.toContain('[data-slate-editor="true"] .dark &');
  });
});
