import { mobileLocaleSource } from "../../../../services/i18n";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SettingCompat } from "../../../../types";

const appContextHolder = vi.hoisted(() => ({ current: null as unknown }));

vi.mock("../../../../app/AppContext", () => ({
  useAppContext: () => appContextHolder.current,
}));

import { EditorOpenModeItem } from "../OverviewSection";

const updateSettingMock = vi.fn();

function mockApp(setting: Partial<SettingCompat>) {
  appContextHolder.current = {
    syncSettings: { safeSetting: setting, updateSetting: updateSettingMock },
  };
}

function findButton(text: string): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll("button")).find(item =>
    item.textContent?.includes(text)
  );
  if (!button) throw new Error(`未找到按钮「${text}」`);
  return button;
}

describe("EditorOpenModeItem", () => {
  let root: Root;
  let originalLocale: string;

  beforeEach(() => {
    originalLocale = mobileLocaleSource.getSnapshot();
    updateSettingMock.mockReset();
    const host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
      mobileLocaleSource.setLocale(originalLocale);
    });
    document.body.innerHTML = "";
  });

  async function renderItem() {
    await act(async () => {
      root.render(<EditorOpenModeItem />);
    });
  }

  it("缺省显示「阅读」，设置为 edit 时显示「编辑」", async () => {
    mockApp({});
    await renderItem();
    expect(findButton("打开文档时").textContent).toContain("阅读");

    mockApp({ editor: { openMode: "edit" } });
    await renderItem();
    expect(findButton("打开文档时").textContent).toContain("编辑");
  });

  it("选择「直接编辑」后以 persist 写入 editor.openMode", async () => {
    const setting = { appearance: { image: { borderRadius: "md" } } } as SettingCompat;
    mockApp(setting);
    await renderItem();

    await act(async () => {
      findButton("打开文档时").click();
    });
    const editOption = findButton("直接编辑");
    for (const locale of ["zh-TW", "en-US"]) {
      await act(async () => mobileLocaleSource.setLocale(locale));
      expect(editOption.isConnected).toBe(true);
      expect(updateSettingMock).not.toHaveBeenCalled();
    }
    await act(async () => editOption.click());

    expect(updateSettingMock).toHaveBeenCalledTimes(1);
    const [updater, options] = updateSettingMock.mock.calls[0];
    expect(options).toEqual({ persist: true });
    const next = updater(setting) as SettingCompat;
    expect(next.editor?.openMode).toBe("edit");
    expect(next.appearance).toBe(setting.appearance);
  });
});
