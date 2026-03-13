import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import WeReadSetting from "../WeReadSetting";
import useSettingStore from "@/stores/useSettingStore";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const { validateSessionMock } = vi.hoisted(() => ({
  validateSessionMock: vi.fn(),
}));

vi.mock("@/hooks/useThemeColors", () => ({
  default: () => ({
    cardBgClass: "bg-white",
    cardBorderClass: "border-slate-200",
    inputBgClass: "bg-slate-100",
    textClass: "text-slate-700",
    secondaryTextClass: "text-slate-500",
    activeTextClass: "text-slate-900",
    hoverClass: "hover:bg-slate-100",
    tagBgClass: "bg-slate-100",
    tagTextClass: "text-slate-700",
    buttonBg: "bg-blue-500",
    buttonTextClass: "text-white",
  }),
}));

vi.mock("motion/react", () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

vi.mock("@/services/weread", () => ({
  default: {
    validateSession: validateSessionMock,
    loginWithQRCode: vi.fn(),
    loginWithCookieString: vi.fn(),
    logout: vi.fn(),
  },
}));

describe("WeReadSetting", () => {
  const initialSetting = structuredClone(useSettingStore.getState().setting);

  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(async () => {
    validateSessionMock.mockReset();
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
  });

  it("挂载时不应主动触发会话校验", async () => {
    useSettingStore.setState((state) => ({
      ...state,
      setting: {
        ...state.setting,
        integration: {
          ...state.setting.integration,
          weread: {
            ...state.setting.integration.weread,
            cookies: [{ name: "wr_vid", value: "vid-1" }],
            sessionStatus: "unknown",
          },
        },
      },
    }));

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<WeReadSetting />);
    });

    expect(validateSessionMock).not.toHaveBeenCalled();
  });
});
