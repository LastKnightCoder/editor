import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import useWeReadSessionBootstrap from "../useWeReadSessionBootstrap";
import useSettingStore from "@/stores/useSettingStore";

const { validateSessionMock, ensureModuleMock } = vi.hoisted(() => ({
  validateSessionMock: vi.fn(),
  ensureModuleMock: vi.fn(),
}));

vi.mock("@/services/weread", () => ({
  default: {
    validateSession: validateSessionMock,
  },
}));

vi.mock("@/commands/module-init", () => ({
  ensureModule: ensureModuleMock,
}));

const BootstrapHarness = () => {
  useWeReadSessionBootstrap();
  return null;
};

const enableWereadAutoValidation = () => {
  useSettingStore.setState(state => ({
    ...state,
    inited: true,
    setting: {
      ...state.setting,
      integration: {
        ...state.setting.integration,
        weread: {
          ...state.setting.integration.weread,
          apiKey: "wrk-test-key",
          connectionStatus: "unknown",
          lastValidatedAt: 0,
        },
      },
    },
  }));
};

describe("useWeReadSessionBootstrap", () => {
  const initialSetting = structuredClone(useSettingStore.getState().setting);
  const initialInited = useSettingStore.getState().inited;

  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  beforeEach(() => {
    vi.stubGlobal("electron", { windowRole: "main" });
    ensureModuleMock.mockResolvedValue(undefined);
    validateSessionMock.mockResolvedValue(true);
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    validateSessionMock.mockReset();
    ensureModuleMock.mockReset();
    if (root && container) {
      await act(async () => {
        root?.unmount();
      });
      container.remove();
    }
    root = null;
    container = null;
    useSettingStore.setState(state => ({
      ...state,
      inited: initialInited,
      setting: structuredClone(initialSetting),
    }));
  });

  const renderHarness = async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(<BootstrapHarness />);
    });
  };

  it("weread 模块初始化失败时不应触发会话校验", async () => {
    ensureModuleMock.mockRejectedValue(new Error("init failed"));
    enableWereadAutoValidation();

    await renderHarness();

    expect(validateSessionMock).not.toHaveBeenCalled();
  });

  it("辅助窗口不初始化模块或校验会话", async () => {
    vi.stubGlobal("electron", { windowRole: "utility" });
    enableWereadAutoValidation();
    await renderHarness();
    expect(ensureModuleMock).not.toHaveBeenCalled();
    expect(validateSessionMock).not.toHaveBeenCalled();
  });

  it("等待模块时卸载，不再发出校验请求", async () => {
    let ready!: () => void;
    ensureModuleMock.mockReturnValue(new Promise<void>(resolve => (ready = resolve)));
    enableWereadAutoValidation();
    await renderHarness();
    await act(async () => root?.unmount());
    root = null;
    await act(async () => ready());
    expect(validateSessionMock).not.toHaveBeenCalled();
  });

  it("weread 模块就绪后应触发一次会话校验", async () => {
    enableWereadAutoValidation();

    await renderHarness();

    expect(validateSessionMock).toHaveBeenCalledTimes(1);
  });

  it("不应因无关字段变化重复触发会话校验", async () => {
    enableWereadAutoValidation();

    await renderHarness();

    expect(validateSessionMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      useSettingStore.setState(state => ({
        ...state,
        setting: {
          ...state.setting,
          integration: {
            ...state.setting.integration,
            weread: {
              ...state.setting.integration.weread,
              statusReason: "仅更新提示信息",
            },
          },
        },
      }));
    });

    expect(validateSessionMock).toHaveBeenCalledTimes(1);
  });

  it("已有运行中的校验状态时不应再次触发会话校验", async () => {
    enableWereadAutoValidation();
    await act(async () => {
      useSettingStore.setState(state => ({
        ...state,
        setting: {
          ...state.setting,
          integration: {
            ...state.setting.integration,
            weread: {
              ...state.setting.integration.weread,
              connectionStatus: "checking",
            },
          },
        },
      }));
    });

    await renderHarness();

    expect(validateSessionMock).not.toHaveBeenCalled();
  });

  it("已有有效连接状态时不应再次触发会话校验", async () => {
    enableWereadAutoValidation();
    await act(async () => {
      useSettingStore.setState(state => ({
        ...state,
        setting: {
          ...state.setting,
          integration: {
            ...state.setting.integration,
            weread: {
              ...state.setting.integration.weread,
              connectionStatus: "valid",
              lastValidatedAt: 100,
            },
          },
        },
      }));
    });

    await renderHarness();

    expect(validateSessionMock).not.toHaveBeenCalled();
  });
});
