import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { initTheme, toggleTheme } from "./index";

describe("blog/utils theme sync", () => {
  const matchMediaMock = vi.fn();

  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-mode");
    document.documentElement.classList.remove("dark");
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: matchMediaMock,
    });
  });

  afterEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-mode");
    document.documentElement.classList.remove("dark");
    matchMediaMock.mockReset();
  });

  it("initTheme 应同步 data-theme 与 dark 类", () => {
    window.localStorage.setItem("theme", "dark");
    matchMediaMock.mockReturnValue({ matches: false });

    initTheme();

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(document.documentElement.getAttribute("data-mode")).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("toggleTheme 切换到暗色时应同步 data-theme、dark 类和本地存储", () => {
    window.localStorage.setItem("theme", "light");
    matchMediaMock.mockReturnValue({ matches: false });

    toggleTheme();

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(document.documentElement.getAttribute("data-mode")).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(window.localStorage.getItem("theme")).toBe("dark");
  });

  it("toggleTheme 切换回亮色时应移除 dark 类", () => {
    window.localStorage.setItem("theme", "dark");
    document.documentElement.setAttribute("data-theme", "dark");
    document.documentElement.classList.add("dark");
    matchMediaMock.mockReturnValue({ matches: false });

    toggleTheme();

    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(document.documentElement.getAttribute("data-mode")).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(window.localStorage.getItem("theme")).toBe("light");
  });
});
