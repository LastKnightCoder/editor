import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { initThemeRuntime, useThemeStore } from "@tau/themes/react";
import useTheme from "../useTheme";
import useSyncFont from "../useSyncFont";
import useSettingStore from "@/stores/useSettingStore";

describe("应用主题与字体归属", () => {
  it("跟随系统时读取解析后的明暗，系统变化后同步更新", () => {
    const listeners = new Set<() => void>();
    const media = {
      matches: false,
      addEventListener: (_event: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_event: string, listener: () => void) => listeners.delete(listener),
    };
    vi.stubGlobal("matchMedia", () => media);
    const previous = useThemeStore.getState();
    const stop = initThemeRuntime();
    useThemeStore.getState().setAppearance("system");
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    function Probe() {
      return <output>{JSON.stringify(useTheme())}</output>;
    }
    try {
      act(() => root.render(<Probe />));
      expect(JSON.parse(container.textContent ?? "{}")).toEqual({ theme: "light", isDark: false });
      act(() => {
        media.matches = true;
        listeners.forEach(listener => listener());
      });
      expect(useThemeStore.getState().appearance).toBe("system");
      expect(JSON.parse(container.textContent ?? "{}")).toEqual({ theme: "dark", isDark: true });
      act(() => useThemeStore.getState().setTheme("mint"));
      expect(JSON.parse(container.textContent ?? "{}")).toEqual({ theme: "dark", isDark: true });
    } finally {
      act(() => root.unmount());
      container.remove();
      stop();
      useThemeStore.setState(previous);
      localStorage.clear();
      vi.unstubAllGlobals();
    }
  });

  it("字体只由根 hook 写入，清除旧 body 覆盖后继续跟随设置", () => {
    const previous = useSettingStore.getState().setting.fontSetting;
    const rootStyle = document.documentElement.getAttribute("style");
    document.body.style.setProperty("--font", "旧字体");
    document.body.style.setProperty("--font-size", "99px");
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    function Probe() {
      useSyncFont();
      return null;
    }
    try {
      act(() => root.render(<Probe />));
      expect(document.body.style.getPropertyValue("--font")).toBe("");
      expect(document.body.style.getPropertyValue("--font-size")).toBe("");
      act(() =>
        useSettingStore
          .getState()
          .onFontSettingChange({ ...previous, englishFont: "测试字体", fontSize: 20 })
      );
      expect(document.documentElement.style.getPropertyValue("--font")).toContain("测试字体");
      expect(document.documentElement.style.getPropertyValue("--font-size")).toBe("20px");
      expect(document.body.style.getPropertyValue("--font")).toBe("");
    } finally {
      act(() => root.unmount());
      container.remove();
      useSettingStore.getState().onFontSettingChange(previous);
      if (rootStyle === null) document.documentElement.removeAttribute("style");
      else document.documentElement.setAttribute("style", rootStyle);
    }
  });
});
