import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SettingCompat } from "../../../../types";
import { ImageAppearanceSection } from "../ImageAppearanceSection";

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
      active: "github",
      compressImages: true,
      github: { repo: "", branch: "", pathPrefix: "" },
      aliOSS: { bucket: "", region: "", pathPrefix: "" },
      local: { path: "resources" },
      s3: { bucket: "", region: "", pathPrefix: "" },
      webdav: { pathPrefix: "" },
    },
    sync: {
      active: "aliOSS",
      webdav: { pathPrefix: "" },
      aliOSS: { bucket: "", region: "", path: "/" },
      s3: { bucket: "", region: "", pathPrefix: "" },
      github: { repo: "", branch: "", pathPrefix: "" },
    },
    integration: {
      github: { token: "", user: { name: "", email: "" } },
      s3: { accessKeyId: "", secretAccessKey: "", endpoint: "", urlStyle: "path" },
      webdav: { url: "", username: "", password: "" },
      aliOSS: { accessKeyId: "", accessKeySecret: "" },
    },
  } as SettingCompat;
}

async function renderSection() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root: Root = createRoot(host);
  await act(async () => {
    root.render(<ImageAppearanceSection />);
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
