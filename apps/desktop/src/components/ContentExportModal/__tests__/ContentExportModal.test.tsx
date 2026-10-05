import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useThemeStore } from "@tau/themes/react";
import ContentExportModal from "..";

const mocks = vi.hoisted(() => ({
  capture: vi.fn(async () => new Blob(["png"], { type: "image/png" })),
  download: vi.fn(),
  clipboardWrite: vi.fn(async () => {}),
  overrides: [] as { mode?: string; themeKey?: string }[],
}));

vi.mock("@tau/editor", () => ({
  Editor: () => <div data-testid="editor">正文</div>,
  EditorThemeOverride: ({
    mode,
    themeKey,
    children,
  }: {
    mode?: string;
    themeKey?: string;
    children: ReactNode;
  }) => {
    mocks.overrides.push({ mode, themeKey });
    return children;
  },
}));
vi.mock("@/services/editorKit", () => ({ getContentKit: () => ({}) }));
vi.mock("@/utils/snapdom-export", () => ({ captureBlobWithSnapdom: mocks.capture }));
vi.mock("@/utils/download", () => ({ downloadBlob: mocks.download }));
vi.mock("@tau/ui", async () => {
  const actual = await vi.importActual<typeof import("@tau/ui")>("@tau/ui");
  return { ...actual, toast: { success: vi.fn(), error: vi.fn() } };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLDivElement;

const image = () => document.querySelector<HTMLElement>("[data-theme][data-mode][style]")!;
const button = (name: string) =>
  [...document.querySelectorAll<HTMLButtonElement>("button")].find(b =>
    b.textContent?.includes(name)
  )!;
const switchOf = (label: string) =>
  [...document.querySelectorAll("label")]
    .find(l => l.textContent?.startsWith(label))!
    .querySelector<HTMLButtonElement>('[role="switch"]')!;

async function render(title?: string) {
  await act(async () => {
    root.render(<ContentExportModal open onClose={() => {}} content={[]} title={title} />);
  });
  // Dialog 进场走 rAF
  await act(async () => new Promise(resolve => setTimeout(resolve, 20)));
}

beforeEach(() => {
  localStorage.clear();
  mocks.overrides = [];
  vi.clearAllMocks();
  useThemeStore.setState({ theme: "ocean", mode: "dark" });
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { write: mocks.clipboardWrite },
  });
  vi.stubGlobal(
    "ClipboardItem",
    class {
      constructor(public items: Record<string, Blob>) {}
    }
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("ContentExportModal", () => {
  it("默认跟随应用主题族与明暗，编辑器同步覆盖", async () => {
    await render("间隔重复");
    expect(image().dataset.theme).toBe("ocean");
    expect(image().dataset.mode).toBe("dark");
    expect(mocks.overrides.at(-1)).toEqual({ mode: "dark", themeKey: "ocean" });
    expect(image().textContent).toContain("间隔重复");
  });

  it("选样式与深色开关会记住，下次打开沿用", async () => {
    await render("间隔重复");
    await act(async () => button("樱花").click());
    await act(async () => switchOf("深色").click());
    expect(image().dataset.theme).toBe("sakura");
    expect(image().dataset.mode).toBe("light");

    await act(async () => root.unmount());
    root = createRoot(host);
    await render("间隔重复");
    expect(image().dataset.theme).toBe("sakura");
    expect(image().dataset.mode).toBe("light");
  });

  it("没有标题时不显示标题开关；关掉署名后图里不再有 Tau", async () => {
    await render();
    expect(switchOf("署名")).toBeTruthy();
    expect([...document.querySelectorAll("label")].some(l => l.textContent === "标题")).toBe(false);
    expect(image().textContent).toContain("Tau");
    await act(async () => switchOf("署名").click());
    expect(image().textContent).not.toContain("Tau");
  });

  it("保存用标题命名，复制写入剪贴板", async () => {
    await render("间隔重复");
    await act(async () => button("保存图片").click());
    expect(mocks.capture).toHaveBeenCalledWith(image(), expect.objectContaining({ type: "png" }));
    expect(mocks.download).toHaveBeenCalledWith(expect.any(Blob), "间隔重复.png");

    await act(async () => button("复制").click());
    expect(mocks.clipboardWrite).toHaveBeenCalledTimes(1);
  });
});
