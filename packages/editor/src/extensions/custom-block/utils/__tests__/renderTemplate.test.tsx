import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";

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

  // 全量串行执行时动态 import（antd/@babel/standalone）较慢，放宽超时
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
});
