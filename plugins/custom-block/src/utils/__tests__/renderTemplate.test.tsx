import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  compileAndExecuteCustomBlock,
  rerenderCustomBlockTheme,
  type CustomBlockTheme,
} from "../renderTemplate";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const createTheme = (isDark: boolean): CustomBlockTheme => ({
  isDark,
  token: word => `${isDark ? "dark" : "light"}:${word}`,
});

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
  const { isDark, color } = useTokens();
  return <div data-color={color("accent")}>{isDark ? "dark" : "light"}</div>;
};
`,
      createTheme(false),
      container,
      { compile: tailwindRuntime }
    );

    rerenderCustomBlockTheme(container, createTheme(true));

    await act(async () => {
      resolveTailwindRuntime("");
      cleanup = await renderPromise;
    });

    expect(container.textContent).toBe("dark");
    expect(container.querySelector("[data-color]")?.getAttribute("data-color")).toBe("dark:accent");
  });

  const renderTemplate = async (code: string) => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    await act(async () => {
      cleanup = await compileAndExecuteCustomBlock(code, createTheme(false), container);
    });
    return container;
  };

  it("使用已移除绑定（antd）的模板：错误收在本块内", { timeout: 20000 }, async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const container = await renderTemplate(`
const Component = () => {
  const { Button } = antd;
  return <Button>旧模板</Button>;
};
`);
    expect(container.textContent).toContain("渲染错误");
    expect(container.textContent).toContain("antd is not defined");
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

  it("普通模板照常运行", { timeout: 20000 }, async () => {
    const container = await renderTemplate(`
const Component = () => <div className="p-2">新模板</div>;
`);
    expect(container.textContent).toBe("新模板");
  });

  it(
    "元素重挂载（新容器、同模板）：复用编译缓存，直接渲染且主题正确",
    { timeout: 20000 },
    async () => {
      const code = `
const Component = () => {
  const { color } = useTokens();
  return <div data-color={color("accent")}>缓存复用</div>;
};
`;
      const first = await renderTemplate(code);
      expect(first.textContent).toBe("缓存复用");

      // 卸载首块后，模拟元素重挂载：全新容器 + 同模板（视口剔除进出的场景）
      await act(async () => {
        cleanup?.();
      });
      cleanup = undefined;

      const remounted = document.createElement("div");
      document.body.appendChild(remounted);
      await act(async () => {
        cleanup = await compileAndExecuteCustomBlock(code, createTheme(true), remounted);
      });
      expect(remounted.textContent).toBe("缓存复用");
      expect(remounted.querySelector("[data-color]")?.getAttribute("data-color")).toBe(
        "dark:accent"
      );
    }
  );

  it(
    "模板可用 ui 子集、icons 与 toast，主题切换后 useTokens 取色随之刷新",
    { timeout: 20000 },
    async () => {
      const container = await renderTemplate(`
const Component = () => {
  const { color } = useTokens();
  return (
    <div>
      <ui.Button variant="secondary" icon={icons.Copy} onClick={() => toast.success("已复制")}>
        复制
      </ui.Button>
      <ui.Tooltip content="说明">
        <span data-tooltip-anchor>悬停</span>
      </ui.Tooltip>
      <span data-color={color("ink-2")} />
    </div>
  );
};
`);
      expect(container.querySelector("button")?.textContent).toBe("复制");
      expect(container.querySelector("button svg")).not.toBeNull();
      expect(container.querySelector("[data-tooltip-anchor]")?.textContent).toBe("悬停");
      expect(container.querySelector("[data-color]")?.getAttribute("data-color")).toBe(
        "light:ink-2"
      );

      await act(async () => {
        rerenderCustomBlockTheme(container, createTheme(true));
      });
      expect(container.querySelector("[data-color]")?.getAttribute("data-color")).toBe(
        "dark:ink-2"
      );
    }
  );
});
