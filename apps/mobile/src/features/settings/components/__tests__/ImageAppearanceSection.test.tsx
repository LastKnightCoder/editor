import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SettingCompat } from "../../../../types";
import { ImageAppearanceSection } from "../ImageAppearanceSection";
import { ThemeSection } from "../ThemeSection";
import { HighlightStyleSection } from "../HighlightStyleSection";
import { useThemeStore } from "@tau/themes/react";
import { getTheme } from "@tau/themes";
import { mobileLocaleSource } from "../../../../services/i18n";
import { settingsShellTranslator } from "../../shell.i18n";
import { themeDisplayName } from "../../appearance/i18n";

// vi.mock 工厂被提升到文件顶部，经 hoisted holder 中转各用例的 mock 上下文
const appContextHolder = vi.hoisted(() => ({
  current: null as unknown,
}));

vi.mock("../../../../app/AppContext", () => ({
  useAppContext: () => appContextHolder.current,
}));

const updateSettingMock = vi.fn();

function buildMockApp(setting: SettingCompat) {
  return {
    syncSettings: {
      safeSetting: setting,
      updateSetting: updateSettingMock,
    },
  };
}

function findRowByLabel(label: string): HTMLElement {
  const row = Array.from(document.querySelectorAll<HTMLElement>('[role="button"]')).find(item =>
    item.textContent?.includes(label)
  );
  if (!row) {
    throw new Error(`未找到选项行「${label}」`);
  }
  return row;
}

function baseSetting(): SettingCompat {
  return {
    database: { active: "data.db", databases: [] },
    imageBed: {
      active: "local",
      enableCompression: true,
      local: { path: "resources" },
      plugin: { id: "", configurations: {} },
    },
    sync: { active: "plugin", plugin: { id: "", configurations: {} } },
  } as SettingCompat;
}

async function renderSection(children = <ImageAppearanceSection />) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root: Root = createRoot(host);
  await act(async () => {
    root.render(children);
  });
  return { root, host };
}

describe("ImageAppearanceSection", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    updateSettingMock.mockReset();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("渲染圆角与阴影各四档选项，并标记当前选中项", async () => {
    appContextHolder.current = buildMockApp({
      ...baseSetting(),
      appearance: { image: { borderRadius: "md", shadow: "sm" } },
    } as SettingCompat);

    const { root, host } = await renderSection();

    for (const label of [
      "直角",
      "圆角 8",
      "圆角 12",
      "圆角 16",
      "无阴影",
      "卡片",
      "轻抬",
      "浮起",
    ]) {
      expect(() => findRowByLabel(label), `缺少选项「${label}」`).not.toThrow();
    }
    // 预览 icon 与 CheckBubble 都渲染 svg，选中态以 CheckBubble 的 bg-accent 容器区分
    expect(findRowByLabel("圆角 12").querySelector(".bg-accent")).not.toBeNull();
    expect(findRowByLabel("卡片").querySelector(".bg-accent")).not.toBeNull();
    expect(findRowByLabel("直角").querySelector(".bg-accent")).toBeNull();

    await act(async () => {
      root.unmount();
    });
    host.remove();
  });

  it("点选圆角 16时以 persist 写入 appearance.image.borderRadius", async () => {
    const setting = {
      ...baseSetting(),
      appearance: { image: { borderRadius: "none", shadow: "none" } },
    } as SettingCompat;
    appContextHolder.current = buildMockApp(setting);

    const { root, host } = await renderSection();

    await act(async () => {
      findRowByLabel("圆角 16").dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(updateSettingMock).toHaveBeenCalledTimes(1);
    const [updater, options] = updateSettingMock.mock.calls[0];
    expect(options).toEqual({ persist: true });
    const next = updater(setting) as SettingCompat;
    expect(next.appearance?.image?.borderRadius).toBe("lg");
    expect(next.appearance?.image?.shadow).toBe("none");

    await act(async () => {
      root.unmount();
    });
    host.remove();
  });

  it("旧版布尔 shadow（true）展示为轻抬", async () => {
    appContextHolder.current = buildMockApp({
      ...baseSetting(),
      appearance: { image: { borderRadius: "none", shadow: true } },
    } as SettingCompat);

    const { root, host } = await renderSection();

    expect(findRowByLabel("轻抬").querySelector(".bg-accent")).not.toBeNull();
    expect(findRowByLabel("无阴影").querySelector(".bg-accent")).toBeNull();

    await act(async () => {
      root.unmount();
    });
    host.remove();
  });
});

it("外观面板换语保留主题、档位、高亮与焦点，不写设置或主题偏好", async () => {
  updateSettingMock.mockReset();
  const originalLocale = mobileLocaleSource.getSnapshot();
  const originalTheme = useThemeStore.getState();
  const setting: SettingCompat = {
    ...baseSetting(),
    appearance: { image: { borderRadius: "md", shadow: "sm" }, highlight: { style: "grain" } },
  };
  appContextHolder.current = buildMockApp(setting);
  useThemeStore.setState({ theme: "mint", appearance: "dark", mode: "dark" });
  const persist = vi.spyOn(Storage.prototype, "setItem");
  const rawName = getTheme("mint")?.name ?? "";
  const { root, host } = await renderSection(
    <>
      <ThemeSection />
      <ImageAppearanceSection />
      <HighlightStyleSection />
    </>
  );
  const themed = () =>
    [...host.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")].find(
      button => button.textContent?.trim() === themeDisplayName("mint", rawName)
    );
  const theme = themed();
  if (!theme) throw new Error("所选主题未挂载");
  const radius = findRowByLabel(settingsShellTranslator.t("image.radius.md"));
  const highlight = findRowByLabel(settingsShellTranslator.t("highlight.grain"));
  theme.focus();
  try {
    for (const locale of ["zh-TW", "en-US"]) {
      await act(async () => mobileLocaleSource.setLocale(locale));
      expect(themed()).toBe(theme);
      expect(theme.getAttribute("aria-pressed")).toBe("true");
      expect(document.activeElement).toBe(theme);
      expect(findRowByLabel(settingsShellTranslator.t("image.radius.md"))).toBe(radius);
      expect(findRowByLabel(settingsShellTranslator.t("highlight.grain"))).toBe(highlight);
      expect(radius.querySelector('[role="img"]')).not.toBeNull();
      expect(highlight.querySelector('[role="img"]')).not.toBeNull();
      expect(useThemeStore.getState()).toMatchObject({
        theme: "mint",
        appearance: "dark",
        mode: "dark",
      });
      expect(getTheme("mint")?.name).toBe(rawName);
      for (const key of ["custom-key", "toString"])
        expect(themeDisplayName(key, "用户主题原名")).toBe("用户主题原名");
      expect(updateSettingMock).not.toHaveBeenCalled();
      expect(persist).not.toHaveBeenCalled();
    }
    await act(async () => findRowByLabel(settingsShellTranslator.t("image.radius.lg")).click());
    const [update, options] = updateSettingMock.mock.calls[0];
    expect(options).toEqual({ persist: true });
    expect(update(setting).appearance).toEqual({
      image: { borderRadius: "lg", shadow: "sm" },
      highlight: { style: "grain" },
    });
  } finally {
    await act(async () => {
      root.unmount();
      mobileLocaleSource.setLocale(originalLocale);
      useThemeStore.setState(originalTheme);
    });
    host.remove();
    persist.mockRestore();
  }
});
