import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { EditorThemeScope, useEditorTheme } from "../context";
import { createDomThemeService, createStaticThemeService } from "../ThemeService";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const root = () => document.documentElement;

afterEach(() => {
  delete root().dataset.mode;
  delete root().dataset.theme;
  root().classList.remove("dark");
  document.body.innerHTML = "";
});

describe("createDomThemeService", () => {
  it("明暗优先读 data-mode，其次 .dark 类，再兼容 data-theme=dark", () => {
    const service = createDomThemeService();
    expect(service.mode).toBe("light");

    root().classList.add("dark");
    expect(service.mode).toBe("dark");

    root().classList.remove("dark");
    root().dataset.theme = "dark";
    expect(service.mode).toBe("dark");

    root().dataset.theme = "paper";
    root().dataset.mode = "dark";
    expect(service.mode).toBe("dark");
    expect(service.themeKey).toBe("paper");

    root().dataset.mode = "light";
    root().classList.add("dark");
    expect(service.mode).toBe("light");
  });

  it("属性变化时通知订阅者，取消订阅后不再通知", () => {
    const service = createDomThemeService();
    let calls = 0;
    const stop = service.subscribe(() => calls++);

    root().dataset.mode = "dark";
    return new Promise<void>(resolve => {
      setTimeout(() => {
        expect(calls).toBeGreaterThan(0);
        const seen = calls;
        stop();
        root().dataset.mode = "light";
        setTimeout(() => {
          expect(calls).toBe(seen);
          resolve();
        }, 0);
      }, 0);
    });
  });

  it("token 先取 --ed-*，回落 --tau-*", () => {
    const style = document.createElement("style");
    style.textContent = ":root { --tau-ink-1: #111; --ed-code-bg: #222; }";
    document.head.append(style);
    const service = createDomThemeService();
    expect(service.token("ink-1")).toBe("#111");
    expect(service.token("code-bg")).toBe("#222");
    expect(service.token("nope")).toBe("");
    style.remove();
  });
});

describe("EditorThemeScope", () => {
  let reactRoot: Root | null = null;

  afterEach(async () => {
    if (reactRoot) await act(async () => reactRoot?.unmount());
    reactRoot = null;
  });

  const render = async (node: React.ReactNode) => {
    const container = document.createElement("div");
    document.body.append(container);
    reactRoot = createRoot(container);
    await act(async () => reactRoot?.render(node));
    return container;
  };

  function Probe() {
    const { mode, isDark, token } = useEditorTheme();
    return (
      <span data-mode={mode} data-dark={String(isDark)} data-token={token("ink-1") || "none"} />
    );
  }

  it("跟随服务的明暗；服务变化后重渲染", async () => {
    const container = await render(
      <EditorThemeScope service={createDomThemeService()}>{() => <Probe />}</EditorThemeScope>
    );
    expect(container.querySelector("span")?.dataset.mode).toBe("light");

    await act(async () => {
      root().dataset.mode = "dark";
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    expect(container.querySelector("span")?.dataset.dark).toBe("true");
  });

  it("显式 mode 覆盖服务，并把覆盖信息交给子树（用于补 data-theme/data-mode）", async () => {
    root().dataset.theme = "paper";
    root().dataset.mode = "light";
    const container = await render(
      <EditorThemeScope service={createDomThemeService()} mode="dark">
        {scope => (
          <div data-overridden={String(scope.overridden)} data-key={scope.themeKey}>
            <Probe />
          </div>
        )}
      </EditorThemeScope>
    );
    expect(container.querySelector("div")?.dataset.overridden).toBe("true");
    expect(container.querySelector("div")?.dataset.key).toBe("paper");
    expect(container.querySelector("span")?.dataset.mode).toBe("dark");
  });

  it("宿主注入的静态服务：明暗与 token 都来自服务", async () => {
    const container = await render(
      <EditorThemeScope service={createStaticThemeService("dark", { "ink-1": "#abc" })}>
        {() => <Probe />}
      </EditorThemeScope>
    );
    const span = container.querySelector("span");
    expect(span?.dataset.mode).toBe("dark");
    expect(span?.dataset.token).toBe("#abc");
  });
});
