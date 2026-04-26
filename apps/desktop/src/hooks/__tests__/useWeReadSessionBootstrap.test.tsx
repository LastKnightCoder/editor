import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import useWeReadSessionBootstrap from "../useWeReadSessionBootstrap";
import useSettingStore from "@/stores/useSettingStore";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const { validateSessionMock, moduleStoreState } = vi.hoisted(() => ({
  validateSessionMock: vi.fn(),
  moduleStoreState: {
    moduleStates: {
      weread: {
        status: "ready",
      },
    },
  },
}));

vi.mock("@/services/weread", () => ({
  default: {
    validateSession: validateSessionMock,
  },
}));

vi.mock("@/stores/useModuleStore", () => ({
  ModuleStatus: {
    READY: "ready",
  },
  useModuleStore: (selector: (state: typeof moduleStoreState) => unknown) =>
    selector(moduleStoreState),
}));

const BootstrapHarness = () => {
  useWeReadSessionBootstrap();
  return null;
};

describe("useWeReadSessionBootstrap", () => {
  const initialSetting = structuredClone(useSettingStore.getState().setting);
  const initialInited = useSettingStore.getState().inited;

  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(async () => {
    validateSessionMock.mockReset();
    moduleStoreState.moduleStates.weread.status = "ready";
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
      inited: initialInited,
      setting: structuredClone(initialSetting),
    }));
  });

  it("weread 模块未就绪时不应触发会话校验", async () => {
    validateSessionMock.mockResolvedValue(true);
    moduleStoreState.moduleStates.weread.status = "initializing";
    useSettingStore.setState((state) => ({
      ...state,
      inited: true,
      setting: {
        ...state.setting,
        integration: {
          ...state.setting.integration,
          weread: {
            ...state.setting.integration.weread,
            cookies: [{ name: "wr_vid", value: "vid-1" }],
          },
        },
      },
    }));

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<BootstrapHarness />);
    });

    expect(validateSessionMock).not.toHaveBeenCalled();
  });

  it("weread 模块就绪后应触发一次会话校验", async () => {
    validateSessionMock.mockResolvedValue(true);
    moduleStoreState.moduleStates.weread.status = "initializing";
    useSettingStore.setState((state) => ({
      ...state,
      inited: true,
      setting: {
        ...state.setting,
        integration: {
          ...state.setting.integration,
          weread: {
            ...state.setting.integration.weread,
            cookies: [{ name: "wr_vid", value: "vid-1" }],
          },
        },
      },
    }));

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<BootstrapHarness />);
    });

    expect(validateSessionMock).not.toHaveBeenCalled();

    moduleStoreState.moduleStates.weread.status = "ready";

    await act(async () => {
      root?.render(<BootstrapHarness />);
    });

    expect(validateSessionMock).toHaveBeenCalledTimes(1);
  });

  it("不应因 lastCookieTime 变化重复触发会话校验", async () => {
    validateSessionMock.mockResolvedValue(true);
    useSettingStore.setState((state) => ({
      ...state,
      inited: true,
      setting: {
        ...state.setting,
        integration: {
          ...state.setting.integration,
          weread: {
            ...state.setting.integration.weread,
            cookies: [{ name: "wr_vid", value: "vid-1" }],
            lastCookieTime: 100,
          },
        },
      },
    }));

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<BootstrapHarness />);
    });

    expect(validateSessionMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      useSettingStore.setState((state) => ({
        ...state,
        setting: {
          ...state.setting,
          integration: {
            ...state.setting.integration,
            weread: {
              ...state.setting.integration.weread,
              lastCookieTime: 200,
            },
          },
        },
      }));
    });

    expect(validateSessionMock).toHaveBeenCalledTimes(1);
  });
});
