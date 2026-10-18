import React, { act, lazy, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import {
  getToolCallRenderer,
  registerOwnedToolCallRenderer,
  registerToolCallRenderer,
  unregisterToolCallRenderer,
  toolCallRendererRegistry,
} from "../../../../renderers";
import { ToolCallDisplay } from "../ToolCallDisplay";
import type { ToolCallExecutionState } from "@tau/shared/chat-renderers";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it("纯登记入口与真实展示共用实例，注销后恢复宿主默认渲染", async () => {
  const host = document.createElement("div");
  const root = createRoot(host);
  const toolName = "chat-registry-display-test";
  const execution: ToolCallExecutionState = {
    toolCallId: "test-call",
    toolName,
    input: "{}",
    status: "success",
    timestamp: 1,
  };
  const render = () =>
    root.render(
      <ToolCallDisplay
        executions={[{ ...execution }]}
        rendererContext={{ label: "宿主上下文" }}
        renderDefaultItem={() => <span>默认结果</span>}
      />
    );
  try {
    registerToolCallRenderer(toolName, ({ rendererContext, renderDefault }) => (
      <div>
        {String(rendererContext?.label)}
        {renderDefault()}
      </div>
    ));
    await act(async () => render());
    expect(host.textContent).toBe("宿主上下文默认结果");
    await act(async () => {
      unregisterToolCallRenderer(toolName);
      render();
    });
    expect(host.textContent).toBe("默认结果");
  } finally {
    await act(async () => {
      unregisterToolCallRenderer(toolName);
      root.unmount();
    });
  }
});

it("相同消息无需重新传入 props，动态登记和回收会刷新并卸载组件", async () => {
  const host = document.createElement("div");
  const root = createRoot(host);
  const cleanup = vi.fn();
  const toolName = "chat-dynamic-registration";
  const executions: ToolCallExecutionState[] = [
    {
      toolCallId: "dynamic-call",
      toolName,
      input: "{",
      status: "executing",
      timestamp: 1,
    },
  ];
  let registration: { dispose(): void } | undefined;
  try {
    await act(async () => {
      root.render(
        <ToolCallDisplay executions={executions} renderDefaultItem={() => <span>默认</span>} />
      );
    });
    expect(host.textContent).toBe("默认");
    await act(async () => {
      registration = registerOwnedToolCallRenderer(toolName, function Renderer(props) {
        useEffect(() => cleanup, []);
        return <span>{props.inputParseError ? "输入接收中" : "自定义"}</span>;
      });
    });
    expect(host.textContent).toBe("输入接收中");
    await act(async () => registration?.dispose());
    expect(host.textContent).toBe("默认");
    expect(cleanup).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => {
      registration?.dispose();
      root.unmount();
    });
  }
});

it("带归属的重复登记拒绝，旧句柄不能删除后来替换的渲染器", () => {
  const toolName = "chat-owned-registration";
  const registration = registerOwnedToolCallRenderer(toolName, () => null);
  try {
    expect(() => registerOwnedToolCallRenderer(toolName, () => null)).toThrow("已注册");
    const next = () => null;
    registerToolCallRenderer(toolName, next);
    registration.dispose();
    expect(getToolCallRenderer(toolName)).toBe(next);
  } finally {
    unregisterToolCallRenderer(toolName);
  }
});

it("同步订阅中发生替换时，归属句柄仍只属于原始登记", () => {
  const name = "chat-reentrant-registration";
  const next = () => null;
  const unsubscribe = toolCallRendererRegistry.subscribe(() => {
    if (getToolCallRenderer(name) !== next) registerToolCallRenderer(name, next);
  });
  try {
    const registration = registerOwnedToolCallRenderer(name, () => null);
    registration.dispose();
    expect(getToolCallRenderer(name)).toBe(next);
  } finally {
    unsubscribe();
    unregisterToolCallRenderer(name);
  }
});

it("元数据不能跨工具选择带归属的渲染器，也不能替换该工具自己的归属渲染器", async () => {
  const host = document.createElement("div");
  const root = createRoot(host);
  const name = "owned-tool";
  const legacy = "legacy-renderer";
  const registration = registerOwnedToolCallRenderer(name, () => <span>本工具组件</span>);
  registerToolCallRenderer(legacy, () => <span>内置组件</span>);
  const render = async (toolName: string, rendererKey: string) =>
    act(async () => {
      root.render(
        <ToolCallDisplay
          executions={[
            {
              toolCallId: "isolation",
              toolName,
              input: "{}",
              status: "success",
              timestamp: 1,
              metadata: { render: { rendererKey } },
            },
          ]}
          renderDefaultItem={() => <span>默认</span>}
        />
      );
    });
  try {
    await render("another-tool", name);
    expect(host.textContent).toBe("默认");
    await render(name, legacy);
    expect(host.textContent).toBe("本工具组件");
  } finally {
    await act(async () => {
      registration.dispose();
      unregisterToolCallRenderer(legacy);
      root.unmount();
    });
  }
});

it("异常订阅者不能中断登记和回收，也不影响其他订阅者", () => {
  const name = "chat-observer-failure";
  const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const unsubscribeError = toolCallRendererRegistry.subscribe(() => {
    throw new Error("订阅者故障");
  });
  const listener = vi.fn();
  const unsubscribe = toolCallRendererRegistry.subscribe(listener);
  try {
    const handle = registerOwnedToolCallRenderer(name, () => null);
    expect(listener).toHaveBeenCalledTimes(1);
    handle.dispose();
    expect(getToolCallRenderer(name)).toBeUndefined();
    expect(listener).toHaveBeenCalledTimes(2);
  } finally {
    unsubscribeError();
    unsubscribe();
    unregisterToolCallRenderer(name);
    log.mockRestore();
  }
});

it("延迟组件只在工具行内显示默认回退，加载完成后展示组件", async () => {
  const host = document.createElement("div");
  const root = createRoot(host);
  let resolve!: (value: { default: () => React.ReactNode }) => void;
  const component = lazy(
    () =>
      new Promise<{ default: () => React.ReactNode }>(done => {
        resolve = done;
      })
  );
  const name = "chat-lazy-registration";
  const registration = registerOwnedToolCallRenderer(name, component);
  try {
    await act(async () => {
      root.render(
        <ToolCallDisplay
          executions={[
            { toolCallId: "lazy", toolName: name, status: "success", input: "{}", timestamp: 1 },
          ]}
          renderDefaultItem={() => <span>默认</span>}
        />
      );
    });
    expect(host.textContent).toBe("默认");
    await act(async () => resolve({ default: () => <span>已加载</span> }));
    expect(host.textContent).toBe("已加载");
  } finally {
    await act(async () => {
      registration.dispose();
      root.unmount();
    });
  }
});

it("渲染崩溃后替换登记会重置错误边界，无关登记不会重挂当前组件", async () => {
  const host = document.createElement("div");
  const root = createRoot(host);
  const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const mount = vi.fn();
  const toolName = "chat-error-recovery";
  const other = "chat-unrelated-registration";
  try {
    registerToolCallRenderer(toolName, () => {
      throw new Error("组件故障");
    });
    await act(async () => {
      root.render(
        <ToolCallDisplay
          executions={[
            { toolCallId: "error-call", toolName, input: "{}", status: "success", timestamp: 1 },
          ]}
          renderDefaultItem={() => <span>默认</span>}
        />
      );
    });
    expect(host.textContent).toContain("默认");
    await act(async () => {
      registerToolCallRenderer(toolName, function Fixed() {
        useEffect(() => {
          mount();
        }, []);
        return <span>已恢复</span>;
      });
    });
    expect(host.textContent).toBe("已恢复");
    await act(async () => registerToolCallRenderer(other, () => null));
    expect(mount).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => {
      unregisterToolCallRenderer(toolName);
      unregisterToolCallRenderer(other);
      root.unmount();
    });
    log.mockRestore();
  }
});
