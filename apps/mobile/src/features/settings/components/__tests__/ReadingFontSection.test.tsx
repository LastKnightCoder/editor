import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SettingCompat } from "../../../../types";

const invoke = vi.hoisted(() => vi.fn());
const appContextHolder = vi.hoisted(() => ({ current: null as unknown }));

vi.mock("@tauri-apps/api/core", () => ({
  invoke,
  Channel: class {
    onmessage: (message: unknown) => void = () => undefined;
  },
}));
vi.mock("../../../../app/AppContext", () => ({ useAppContext: () => appContextHolder.current }));
vi.mock("../../../../components/toast", () => ({ toast: { error: vi.fn(), warning: vi.fn() } }));
vi.mock("../../readingFont/runtime", () => ({
  loadReadingFontFaces: vi.fn(() => Promise.resolve([])),
  forgetReadingFontFaces: vi.fn(),
}));

import { ReadingFontSection } from "../ReadingFontSection";
import { useReadingFontDownload } from "../../readingFont/downloadStore";
import type { ReadingFontRelease } from "../../readingFont/api";

function release(id: string, version: string, size = 10 * 1024 * 1024): ReadingFontRelease {
  return {
    id,
    name: id,
    version,
    license: `${id}-${version}-LICENSE.txt`,
    files: [
      {
        style: "regular",
        weight: "400",
        file: `${id}-${version}-regular.woff2`,
        size,
        sha256: "a".repeat(64),
      },
    ],
  };
}

const updateSetting = vi.fn();
let installed: ReadingFontRelease[] = [];
let root: Root | null = null;

function mockCommands(overrides: Record<string, (args?: unknown) => unknown> = {}) {
  const commands: Record<string, (args?: unknown) => unknown> = {
    reading_font_installed: () => installed,
    reading_font_catalog: () => [
      release("lxgw-wenkai", "1.530"),
      release("noto-serif-sc", "2.003"),
    ],
    reading_font_remove: () => undefined,
    ...overrides,
  };
  invoke.mockImplementation(async (command: string, args?: unknown) => commands[command]?.(args));
}

async function render(readingFont?: string) {
  appContextHolder.current = {
    syncSettings: {
      safeSetting: { appearance: { readingFont } } as SettingCompat,
      updateSetting,
    },
  };
  const host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root?.render(
      <QueryClientProvider client={client}>
        <ReadingFontSection />
      </QueryClientProvider>
    );
  });
  // 两个 query 各自解析后才渲染出大小与安装状态
  for (let index = 0; index < 3; index++) {
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });
  }
}

function row(label: string): HTMLElement {
  // 下载中的行不可点，没有 role=button，按行容器查找
  const found = Array.from(document.querySelectorAll<HTMLElement>(".setting-row")).find(item =>
    item.textContent?.includes(label)
  );
  if (!found) throw new Error(`未找到选项行「${label}」`);
  return found;
}

function buttonIn(element: HTMLElement, text: string): HTMLButtonElement {
  const found = Array.from(element.querySelectorAll("button")).find(item =>
    item.textContent?.includes(text)
  );
  if (!found) throw new Error(`未找到按钮「${text}」`);
  return found;
}

const appliedSetting = () => {
  const updater = updateSetting.mock.calls.at(-1)?.[0] as (prev: SettingCompat) => SettingCompat;
  return updater({} as SettingCompat).appearance?.readingFont;
};

beforeEach(() => {
  invoke.mockReset();
  updateSetting.mockReset();
  installed = [];
  useReadingFontDownload.setState({ downloadingId: null, progress: null, error: null });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

describe("ReadingFontSection", () => {
  it("未下载的字体显示清单里的下载大小，系统默认显示为已选中", async () => {
    mockCommands();
    await render();
    expect(buttonIn(row("霞鹜文楷"), "下载").textContent).toBe("下载 10.0MB");
    expect(row("系统默认").querySelector('[aria-label="当前选中"]')).not.toBeNull();
  });

  it("下载完成后自动选中该字体并落盘", async () => {
    mockCommands({ reading_font_download: () => release("lxgw-wenkai", "1.530") });
    await render();
    await act(async () => buttonIn(row("霞鹜文楷"), "下载").click());
    expect(invoke).toHaveBeenCalledWith(
      "reading_font_download",
      expect.objectContaining({ id: "lxgw-wenkai" })
    );
    expect(updateSetting).toHaveBeenCalledWith(expect.any(Function), { persist: true });
    expect(appliedSetting()).toBe("lxgw-wenkai");
  });

  it("下载失败时在该行显示提示，不改设置", async () => {
    mockCommands({
      reading_font_download: () => Promise.reject("READING_FONT_NETWORK: offline"),
    });
    await render();
    await act(async () => buttonIn(row("思源宋体"), "下载").click());
    expect(row("思源宋体").textContent).toContain("网络连接失败");
    expect(updateSetting).not.toHaveBeenCalled();
  });

  it("下载中显示进度并可取消，其他字体的下载按钮不可点", async () => {
    mockCommands();
    await render();
    act(() =>
      useReadingFontDownload.setState({
        downloadingId: "lxgw-wenkai",
        progress: { received: 5, total: 10 },
      })
    );
    const cancel = buttonIn(row("霞鹜文楷"), "取消");
    expect(cancel.textContent).toBe("50% · 取消");
    expect(buttonIn(row("思源宋体"), "下载").disabled).toBe(true);
    await act(async () => cancel.click());
    expect(invoke).toHaveBeenCalledWith("reading_font_cancel_download");
  });

  it("已下载的字体点行即切换；未选中的可移除，选中的不能移除", async () => {
    installed = [release("lxgw-wenkai", "1.530"), release("noto-serif-sc", "2.003")];
    mockCommands();
    await render("lxgw-wenkai");
    expect(row("霞鹜文楷").querySelectorAll("button")).toHaveLength(0);

    await act(async () => row("思源宋体").click());
    expect(appliedSetting()).toBe("noto-serif-sc");

    await act(async () => buttonIn(row("思源宋体"), "移除").click());
    expect(invoke).toHaveBeenCalledWith("reading_font_remove", { id: "noto-serif-sc" });
  });

  it("线上有新版本时已下载未选中的字体显示更新", async () => {
    installed = [release("noto-serif-sc", "2.002")];
    mockCommands();
    await render();
    expect(buttonIn(row("思源宋体"), "更新").textContent).toBe("更新 10.0MB");
  });
});
