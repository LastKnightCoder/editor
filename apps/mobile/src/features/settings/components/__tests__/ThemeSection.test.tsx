import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ThemeSection } from "../ThemeSection";
import { useThemeStore } from "../../../../theme/themeStore";

describe("ThemeSection", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    document.documentElement.dataset.theme = "apricot";
    document.documentElement.classList.remove("dark");
    act(() => {
      useThemeStore.setState({ mode: "apricot", resolved: "apricot" });
    });
  });

  afterEach(() => {
    document.body.innerHTML = "";
    document.documentElement.dataset.theme = "apricot";
    document.documentElement.classList.remove("dark");
  });

  it("展示杏子/玄夜/薄荷/海盐/跟随系统五个选项", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root: Root = createRoot(host);

    await act(async () => {
      root.render(<ThemeSection />);
    });

    const buttonTexts = Array.from(document.querySelectorAll("button")).map(
      item => item.textContent
    );
    for (const label of ["杏子", "玄夜", "薄荷", "海盐", "跟随系统"]) {
      expect(
        buttonTexts.some(text => text?.includes(label)),
        `缺少主题「${label}」`
      ).toBe(true);
    }

    await act(async () => {
      root.unmount();
    });
    host.remove();
  });

  it("切换到玄夜时应用 data-theme 与 dark 类", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root: Root = createRoot(host);

    await act(async () => {
      root.render(<ThemeSection />);
    });

    const midnightButton = Array.from(document.querySelectorAll("button")).find(item =>
      item.textContent?.includes("玄夜")
    ) as HTMLButtonElement;

    await act(async () => {
      midnightButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(useThemeStore.getState().mode).toBe("midnight");
    expect(document.documentElement.dataset.theme).toBe("midnight");
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    await act(async () => {
      root.unmount();
    });
    host.remove();
  });

  it("切换到薄荷（浅色主题）时不挂 dark 类", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root: Root = createRoot(host);

    await act(async () => {
      root.render(<ThemeSection />);
    });

    const mintButton = Array.from(document.querySelectorAll("button")).find(item =>
      item.textContent?.includes("薄荷")
    ) as HTMLButtonElement;

    await act(async () => {
      mintButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(useThemeStore.getState().mode).toBe("mint");
    expect(document.documentElement.dataset.theme).toBe("mint");
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    await act(async () => {
      root.unmount();
    });
    host.remove();
  });
});
