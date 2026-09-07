import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

import { useEditorConfig } from "../contexts/EditorConfig";
import type { EditorConfig } from "../contexts/EditorConfig";
import { EditorProvider, useEditorEnvironment } from "../contexts/EditorProvider";
import type IExtension from "../extensions/types";
import { createServiceRegistry } from "../services/registry";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const createConfig = (mode: "light" | "dark"): EditorConfig =>
  ({
    theme: {
      mode,
      colors: {
        hoverClass: "",
        activeClass: "",
        hoverTextClass: "",
        borderClass: "",
        hoverBorderClass: "",
        focusBorderClass: "",
        textClass: "",
        secondaryTextClass: "",
        activeTextClass: "",
      },
    },
  }) as EditorConfig;

describe("EditorProvider config", () => {
  let container: HTMLDivElement;
  let root: Root;

  const mount = async (node: React.ReactNode) => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(node);
    });
  };

  const unmount = async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  };

  it("Provider 内首帧即可读到 config（无 effect 时序空窗）", async () => {
    const config = createConfig("dark");
    let firstRenderValue: EditorConfig | null | "unset" = "unset";
    const Probe = () => {
      // render 期读取，模拟 Mermaid/PlantUML 等首帧消费
      const currentConfig = useEditorConfig();
      if (firstRenderValue === "unset") {
        firstRenderValue = currentConfig;
      }
      return null;
    };
    await mount(
      <EditorProvider config={config}>
        <Probe />
      </EditorProvider>
    );
    expect(firstRenderValue).toBe(config);
    await unmount();
  });

  it("嵌套 Provider 取最近一层，外层读取不受内层影响", async () => {
    const outer = createConfig("light");
    const inner = createConfig("dark");
    let innerValue: EditorConfig | null = null;
    let outerValue: EditorConfig | null = null;
    const InnerProbe = () => {
      innerValue = useEditorConfig();
      return null;
    };
    const OuterProbe = () => {
      outerValue = useEditorConfig();
      return null;
    };
    await mount(
      <EditorProvider config={outer}>
        <EditorProvider config={inner}>
          <InnerProbe />
        </EditorProvider>
        <OuterProbe />
      </EditorProvider>
    );
    expect(outerValue).toBe(outer);
    expect(innerValue).toBe(inner);
    await unmount();
  });

  it("从 useEditorConfig 派生后回传嵌套 Provider 不会形成无限循环", async () => {
    const base = createConfig("light");
    const renderSpy = vi.fn();
    const Derived = () => {
      renderSpy();
      const current = useEditorConfig();
      const derived = { ...(current ?? base), openUrl: () => undefined };
      return (
        <EditorProvider config={current ? derived : null}>
          <div data-testid="derived" />
        </EditorProvider>
      );
    };
    // 若存在 setConfig 回写循环，renderSpy 会持续增长并触发
    // Maximum update depth；act 结束后断言渲染次数收敛
    await mount(
      <EditorProvider config={base}>
        <Derived />
      </EditorProvider>
    );
    expect(renderSpy.mock.calls.length).toBeLessThan(10);
    await unmount();
  });

  it("嵌套 Provider 只覆盖传入字段，其余环境继承外层", async () => {
    const config = createConfig("dark");
    const parentRegistry = createServiceRegistry();
    const childRegistry = createServiceRegistry();
    const extension = { type: "test" } as IExtension;
    let environment: ReturnType<typeof useEditorEnvironment> | null = null;
    const Probe = () => {
      environment = useEditorEnvironment();
      return null;
    };

    await mount(
      <EditorProvider registry={parentRegistry} config={config} extensions={[extension]}>
        <EditorProvider registry={childRegistry}>
          <Probe />
        </EditorProvider>
      </EditorProvider>
    );

    expect(environment).toEqual({
      registry: childRegistry,
      config,
      extensions: [extension],
    });
    await unmount();
  });
});
