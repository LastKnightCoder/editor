/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { createThemeBootstrapScript, resolveThemePreference, themeRuntimeConfig } from "../index";
import { createThemeRuntime } from "../react";

afterEach(() => {
  localStorage.clear();
});

describe("主题运行时", () => {
  it("首帧与运行时使用同一主题解析规则，初始化前不读取偏好", () => {
    const element = document.createElement("div");
    let reads = 0;
    const runtime = createThemeRuntime({
      root: () => element,
      storage: () => ({
        getItem: key => {
          reads++;
          return key === "tau-theme" ? "paper" : "dark";
        },
        setItem: () => {},
      }),
      media: () => null,
    });
    expect(reads).toBe(0);
    const stop = runtime.init();
    expect(reads).toBe(2);
    expect(element.dataset.theme).toBe("paper");
    expect(element.dataset.mode).toBe("dark");
    expect(element.classList.contains("dark")).toBe(true);
    stop();
    localStorage.setItem("tau-theme", "paper");
    localStorage.setItem("tau-appearance", "dark");
    new Function(createThemeBootstrapScript())();
    const expected = resolveThemePreference("paper", "dark", false, themeRuntimeConfig());
    expect(document.documentElement.dataset.theme).toBe(expected.theme);
    expect(document.documentElement.dataset.mode).toBe(expected.mode);
  });
  it("旧版带明暗的主题 key 拆成 主题族 + 明暗偏好并写回", () => {
    const config = themeRuntimeConfig();
    expect(resolveThemePreference("cocoa", null, false, config)).toEqual({
      theme: "paper",
      appearance: "dark",
      mode: "dark",
    });
    expect(resolveThemePreference("system", null, true, config)).toEqual({
      theme: "paper",
      appearance: "system",
      mode: "dark",
    });
    expect(resolveThemePreference("nope", "bogus", false, config)).toEqual({
      theme: "paper",
      appearance: "light",
      mode: "light",
    });
    localStorage.setItem("tau-theme", "cream");
    const runtime = createThemeRuntime({
      root: () => document.createElement("div"),
      media: () => null,
    });
    const stop = runtime.init();
    expect(localStorage.getItem("tau-theme")).toBe("paper");
    expect(localStorage.getItem("tau-appearance")).toBe("light");
    stop();
  });
  it("明暗偏好与主题族正交：切明暗不动主题族，跟随系统随系统变化", () => {
    const element = document.createElement("div");
    const listeners = new Set<() => void>();
    const query = {
      matches: false,
      addEventListener: (_: string, fn: () => void) => listeners.add(fn),
      removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
    } as unknown as MediaQueryList;
    const runtime = createThemeRuntime({ root: () => element, media: () => query });
    const stop = runtime.init();
    const store = runtime.useThemeStore;
    store.getState().setAppearance("system");
    expect(element.dataset.mode).toBe("light");
    Object.assign(query, { matches: true });
    listeners.forEach(fn => fn());
    expect(store.getState()).toMatchObject({ theme: "paper", appearance: "system", mode: "dark" });
    expect(element.dataset.mode).toBe("dark");
    expect(element.dataset.theme).toBe("paper");
    expect(localStorage.getItem("tau-appearance")).toBe("system");
    expect(() => store.getState().setTheme("cocoa")).toThrow();
    stop();
  });
  it("forceMode 固定明暗，主题族仍取用户偏好", () => {
    const element = document.createElement("div");
    localStorage.setItem("tau-theme", "paper");
    localStorage.setItem("tau-appearance", "light");
    const runtime = createThemeRuntime({ root: () => element, media: () => null });
    const stop = runtime.init({ forceMode: "dark" });
    expect(element.dataset.mode).toBe("dark");
    expect(runtime.useThemeStore.getState()).toMatchObject({ appearance: "light", mode: "dark" });
    runtime.useThemeStore.getState().setAppearance("light");
    expect(element.dataset.mode).toBe("dark");
    stop();
  });
});
