import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AppearanceSetting from "../index";
import useSettingStore from "@/stores/useSettingStore";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const { getAllFontsMock } = vi.hoisted(() => ({
  getAllFontsMock: vi.fn(),
}));

vi.mock("@/commands", async () => {
  const actual =
    await vi.importActual<typeof import("@/commands")>("@/commands");
  return {
    ...actual,
    getAllFonts: getAllFontsMock,
  };
});

vi.mock("@/hooks/useThemeColors", () => ({
  default: () => ({
    cardBorderClass: "border-slate-200",
    badgeBgClass: "bg-blue-500",
    badgeTextClass: "text-white",
    gradientClass: "bg-linear-to-r from-blue-500 to-cyan-400",
    inputBgClass: "bg-slate-950",
    focusBorderClass: "border-slate-700",
    focusRingClass: "focus:ring-2 focus:ring-blue-500/30",
    textClass: "text-slate-200",
    secondaryTextClass: "text-slate-400",
    activeTextClass: "text-white",
    hoverClass: "hover:bg-slate-800",
    tagBgClass: "bg-slate-800",
    tagTextClass: "text-slate-300",
    buttonBg: "bg-slate-900",
    buttonTextClass: "text-white",
  }),
}));

describe("AppearanceSetting 字体选择器", () => {
  const initialSetting = structuredClone(useSettingStore.getState().setting);

  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  beforeEach(() => {
    getAllFontsMock.mockResolvedValue([
      "PingFang SC",
      "Songti SC",
      "Helvetica",
      "Georgia",
      "JetBrains Mono",
      "Fira Code",
    ]);

    useSettingStore.setState((state) => ({
      ...state,
      setting: {
        ...structuredClone(initialSetting),
        fontSetting: {
          chineseFont: "PingFang SC",
          englishFont: "Georgia",
          codeFont: "JetBrains Mono",
          fontSize: 16,
        },
      },
    }));

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    getAllFontsMock.mockReset();
    if (root && container) {
      await act(async () => {
        root?.unmount();
      });
      container.remove();
    }
    root = null;
    container = null;
    useSettingStore.setState((state) => ({
      ...state,
      setting: structuredClone(initialSetting),
    }));
    document.body.innerHTML = "";
  });

  it("收起态应展示当前字体名称和对应预览文案", async () => {
    await act(async () => {
      root?.render(<AppearanceSetting />);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(container?.textContent).toContain("春风又绿江南岸");
    expect(container?.textContent).toContain(
      "Sphinx of black quartz, judge my vow.",
    );
    expect(container?.textContent).toContain(
      "const preview = (font: string) => font;",
    );
  });

  it("展开英文字体面板后应支持搜索过滤并写回设置", async () => {
    await act(async () => {
      root?.render(<AppearanceSetting />);
    });

    await act(async () => {
      await Promise.resolve();
    });

    const englishTrigger = Array.from(
      container?.querySelectorAll("button") ?? [],
    ).find((button) => button.textContent?.includes("Georgia"));

    expect(englishTrigger).toBeTruthy();

    await act(async () => {
      englishTrigger?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });

    const searchInput = document.body.querySelector(
      'input[placeholder="搜索字体名称..."]',
    ) as HTMLInputElement | null;

    expect(searchInput).toBeTruthy();

    await act(async () => {
      if (searchInput) {
        const valueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          "value",
        )?.set;
        valueSetter?.call(searchInput, "helv");
        searchInput.dispatchEvent(new Event("input", { bubbles: true }));
        searchInput.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });

    expect(document.body.textContent).toContain("Helvetica");
    expect(document.body.textContent).not.toContain("Fira Code");

    const helveticaItem = Array.from(
      document.body.querySelectorAll("button"),
    ).find((button) => button.textContent?.includes("Helvetica"));

    expect(helveticaItem).toBeTruthy();

    await act(async () => {
      helveticaItem?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });

    expect(useSettingStore.getState().setting.fontSetting.englishFont).toBe(
      "Helvetica",
    );
  });

  it("浅色模式下字体面板应包含浅色主题样式", async () => {
    useSettingStore.setState((state) => ({
      ...state,
      setting: {
        ...state.setting,
        darkMode: false,
      },
    }));

    await act(async () => {
      root?.render(<AppearanceSetting />);
    });

    await act(async () => {
      await Promise.resolve();
    });

    const englishTrigger = Array.from(
      container?.querySelectorAll("button") ?? [],
    ).find((button) => button.textContent?.includes("Georgia"));

    expect(englishTrigger).toBeTruthy();

    await act(async () => {
      englishTrigger?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });

    const panel = document.body.querySelector(
      ".fixed",
    ) as HTMLDivElement | null;
    expect(panel).toBeTruthy();
    expect(panel?.className).toContain("bg-white/95");
    expect(panel?.className).toContain("dark:bg-zinc-900/96");
  });

  it("代码字体在底部空间不足时应向上展开", async () => {
    const originalInnerHeight = window.innerHeight;

    await act(async () => {
      root?.render(<AppearanceSetting />);
    });

    await act(async () => {
      await Promise.resolve();
    });

    const codeTrigger = Array.from(
      container?.querySelectorAll("button") ?? [],
    ).find((button) => button.textContent?.includes("JetBrains Mono"));

    expect(codeTrigger).toBeTruthy();

    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 720,
    });

    codeTrigger &&
      Object.defineProperty(codeTrigger, "getBoundingClientRect", {
        configurable: true,
        value: () => ({
          width: 520,
          height: 62,
          top: 500,
          bottom: 562,
          left: 48,
          right: 568,
          x: 48,
          y: 500,
          toJSON: () => ({}),
        }),
      });

    await act(async () => {
      codeTrigger?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });

    const codeSearchInput = document.body.querySelector(
      'input[placeholder="搜索代码字体..."]',
    ) as HTMLInputElement | null;
    expect(codeSearchInput).toBeTruthy();

    const panel = codeSearchInput?.closest(".fixed") as HTMLDivElement | null;
    expect(panel).toBeTruthy();
    expect(Number.parseFloat(panel?.style.top || "0")).toBeLessThan(500);

    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: originalInnerHeight,
    });
  });
});
