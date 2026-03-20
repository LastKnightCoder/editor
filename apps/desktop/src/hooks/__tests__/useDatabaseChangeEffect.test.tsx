import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDatabaseChangeEffect } from "../useDatabaseChangeEffect";
import useSettingStore from "@/stores/useSettingStore";
import useGlobalStateStore from "@/stores/useGlobalStateStore";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const HookHarness = ({ onChange }: { onChange: () => void }) => {
  useDatabaseChangeEffect(onChange);
  return null;
};

describe("useDatabaseChangeEffect", () => {
  const initialSetting = structuredClone(useSettingStore.getState().setting);
  const initialDatabaseStatus = {
    ...useGlobalStateStore.getState().databaseStatus,
  };

  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(async () => {
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
    useGlobalStateStore.setState((state) => ({
      ...state,
      databaseStatus: { ...initialDatabaseStatus },
    }));
  });

  it("数据库首次进入 ready 时触发回调", async () => {
    const callback = vi.fn();

    useSettingStore.setState((state) => ({
      ...state,
      setting: {
        ...state.setting,
        database: {
          ...state.setting.database,
          active: "data.db",
        },
      },
    }));
    useGlobalStateStore.setState((state) => ({
      ...state,
      databaseStatus: {
        ...state.databaseStatus,
        "data.db": "connecting",
      },
    }));

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<HookHarness onChange={callback} />);
    });

    expect(callback).not.toHaveBeenCalled();

    await act(async () => {
      useGlobalStateStore.setState((state) => ({
        ...state,
        databaseStatus: {
          ...state.databaseStatus,
          "data.db": "ready",
        },
      }));
    });

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("数据库重连完成后会再次触发回调", async () => {
    const callback = vi.fn();

    useSettingStore.setState((state) => ({
      ...state,
      setting: {
        ...state.setting,
        database: {
          ...state.setting.database,
          active: "data.db",
        },
      },
    }));
    useGlobalStateStore.setState((state) => ({
      ...state,
      databaseStatus: {
        ...state.databaseStatus,
        "data.db": "ready",
      },
    }));

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<HookHarness onChange={callback} />);
    });

    expect(callback).toHaveBeenCalledTimes(1);

    await act(async () => {
      useGlobalStateStore.setState((state) => ({
        ...state,
        databaseStatus: {
          ...state.databaseStatus,
          "data.db": "reconnecting",
        },
      }));
    });

    expect(callback).toHaveBeenCalledTimes(1);

    await act(async () => {
      useGlobalStateStore.setState((state) => ({
        ...state,
        databaseStatus: {
          ...state.databaseStatus,
          "data.db": "ready",
        },
      }));
    });

    expect(callback).toHaveBeenCalledTimes(2);
  });
});
