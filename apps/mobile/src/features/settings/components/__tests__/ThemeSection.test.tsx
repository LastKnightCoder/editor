import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listThemes } from "@tau/themes";
import { initThemeRuntime, useThemeStore } from "@tau/themes/react";
import { ThemeSection } from "../ThemeSection";

describe("ThemeSection", () => {
  let host: HTMLDivElement;
  let root: Root;
  let disposeTheme: () => void;

  const clickButton = async (label: string) => {
    const button = Array.from(document.querySelectorAll("button")).find(
      item => item.textContent === label
    ) as HTMLButtonElement;
    await act(async () => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
  };

  beforeEach(async () => {
    localStorage.clear();
    disposeTheme = initThemeRuntime();
    act(() => {
      useThemeStore.getState().setTheme("paper");
      useThemeStore.getState().setAppearance("light");
    });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root.render(<ThemeSection />);
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    disposeTheme();
  });

  it("展示三档明暗与全部主题族（与桌面同一注册表）", () => {
    const texts = Array.from(document.querySelectorAll("button")).map(item => item.textContent);
    for (const label of ["跟随系统", "浅色", "深色", ...listThemes().map(t => t.name)]) {
      expect(texts, `缺少选项「${label}」`).toContain(label);
    }
  });

  it("切到深色：主题族不变，html 挂 data-mode=dark 与 dark 类", async () => {
    await clickButton("深色");

    expect(useThemeStore.getState()).toMatchObject({ theme: "paper", appearance: "dark" });
    const html = document.documentElement;
    expect(html.dataset.theme).toBe("paper");
    expect(html.dataset.mode).toBe("dark");
    expect(html.classList.contains("dark")).toBe(true);
  });

  it("切换主题族：保留明暗偏好", async () => {
    const mint = listThemes().find(t => t.key === "mint")!;
    await clickButton(mint.name);

    expect(useThemeStore.getState()).toMatchObject({ theme: "mint", appearance: "light" });
    expect(document.documentElement.dataset.theme).toBe("mint");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});
