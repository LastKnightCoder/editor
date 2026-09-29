import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { compileAndExecuteCustomBlock, rerenderCustomBlockTheme } from "../renderTemplate";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("custom-block renderTemplate", () => {
  let cleanup: (() => void) | undefined;

  afterEach(async () => {
    if (cleanup) {
      await act(async () => {
        cleanup?.();
      });
    }
    cleanup = undefined;
    document.body.innerHTML = "";
  });

  // 全量串行执行时动态 import（@babel/standalone）较慢，放宽超时
  it("编译期间主题变化后，首次渲染应使用最新主题", { timeout: 20000 }, async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);

    let resolveTailwindRuntime: (value: string) => void = () => undefined;
    const tailwindRuntime = () =>
      new Promise<string>(resolve => {
        resolveTailwindRuntime = resolve;
      });

    const renderPromise = compileAndExecuteCustomBlock(
      `
const Component = () => {
  const { isDark, theme } = hooks.useTheme();
  return <div data-theme={theme}>{isDark ? "dark" : "light"}</div>;
};
`,
      false,
      container,
      {},
      { tailwindRuntime }
    );

    rerenderCustomBlockTheme(container, true);

    await act(async () => {
      resolveTailwindRuntime("");
      cleanup = await renderPromise;
    });

    expect(container.textContent).toBe("dark");
    expect(container.querySelector("[data-theme]")?.getAttribute("data-theme")).toBe("dark");
  });

  const renderTemplate = async (code: string) => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    await act(async () => {
      cleanup = await compileAndExecuteCustomBlock(code, false, container, {});
    });
    return container;
  };

  it("仍用 antd 的旧模板：错误收在本块内，说明怎么改", { timeout: 20000 }, async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const container = await renderTemplate(`
const Component = () => {
  const { Button } = antd;
  return <Button>旧模板</Button>;
};
`);
    expect(container.textContent).toContain("components.antd 已移除");
  });

  it("模板渲染期抛错：只在本块显示错误", { timeout: 20000 }, async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const container = await renderTemplate(`
const Component = () => {
  throw new Error("<b>炸了</b>");
};
`);
    expect(container.textContent).toContain("渲染错误");
    expect(container.textContent).toContain("<b>炸了</b>");
    expect(container.querySelector("b")).toBeNull();
  });

  it("不用 antd 的模板照常运行", { timeout: 20000 }, async () => {
    const container = await renderTemplate(`
const Component = () => <div className="p-2">新模板</div>;
`);
    expect(container.textContent).toBe("新模板");
  });
});
