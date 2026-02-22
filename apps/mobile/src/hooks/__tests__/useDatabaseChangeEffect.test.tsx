import { act } from "react";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type DatabaseChangeEvent,
  emitDatabaseChange,
  useDatabaseChangeEffect,
} from "../useDatabaseChangeEffect";

type ListenerProps = {
  onEvent: (event: DatabaseChangeEvent) => void | Promise<void>;
};

function TestListener(props: ListenerProps) {
  useDatabaseChangeEffect(props.onEvent);
  return null;
}

type RenderController = {
  render: (node: ReactNode) => Promise<void>;
  cleanup: () => Promise<void>;
};

function createRenderController(): RenderController {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root: Root = createRoot(host);

  return {
    render: async (node) => {
      await act(async () => {
        root.render(node);
      });
      await act(async () => {
        await Promise.resolve();
      });
    },
    cleanup: async () => {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    },
  };
}

describe("hooks/useDatabaseChangeEffect", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("应注册并接收数据库变更事件", async () => {
    const controller = createRenderController();
    const onEvent = vi.fn();
    await controller.render(<TestListener onEvent={onEvent} />);

    const event = {
      reason: "switch" as const,
      databaseName: "data.db",
      timestamp: Date.now(),
    };
    const results = await emitDatabaseChange(event);

    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe("fulfilled");
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith(event);

    await controller.cleanup();
  });

  it("多监听器都应收到事件", async () => {
    const controller = createRenderController();
    const first = vi.fn();
    const second = vi.fn();
    await controller.render(
      <>
        <TestListener onEvent={first} />
        <TestListener onEvent={second} />
      </>,
    );

    const event = {
      reason: "syncDownload" as const,
      databaseName: "data.db",
      localVersion: 2,
      remoteVersion: 3,
      timestamp: Date.now(),
    };
    const results = await emitDatabaseChange(event);

    expect(results).toHaveLength(2);
    expect(results.every((item) => item.status === "fulfilled")).toBe(true);
    expect(first).toHaveBeenCalledWith(event);
    expect(second).toHaveBeenCalledWith(event);

    await controller.cleanup();
  });

  it("单个监听器异常不应阻断其他监听器", async () => {
    const controller = createRenderController();
    const failed = vi.fn(() => {
      throw new Error("listener failed");
    });
    const success = vi.fn();
    await controller.render(
      <>
        <TestListener onEvent={failed} />
        <TestListener onEvent={success} />
      </>,
    );

    const results = await emitDatabaseChange({
      reason: "syncDownload",
      databaseName: "data.db",
      timestamp: Date.now(),
    });

    expect(results).toHaveLength(2);
    expect(results[0]?.status).toBe("rejected");
    expect(results[1]?.status).toBe("fulfilled");
    expect(success).toHaveBeenCalledTimes(1);

    await controller.cleanup();
  });

  it("监听器卸载后不应继续收到事件", async () => {
    const controller = createRenderController();
    const onEvent = vi.fn();
    await controller.render(<TestListener onEvent={onEvent} />);
    await emitDatabaseChange({
      reason: "switch",
      databaseName: "data.db",
      timestamp: Date.now(),
    });
    expect(onEvent).toHaveBeenCalledTimes(1);

    await controller.render(null);
    await emitDatabaseChange({
      reason: "switch",
      databaseName: "data.db",
      timestamp: Date.now(),
    });
    expect(onEvent).toHaveBeenCalledTimes(1);

    await controller.cleanup();
  });
});
