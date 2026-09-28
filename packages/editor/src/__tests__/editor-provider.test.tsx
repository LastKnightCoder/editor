import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import { EditorProvider, useEditorEnvironment } from "../contexts/EditorProvider";
import type IExtension from "../extensions/types";
import { createServiceRegistry } from "../services/registry";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("EditorProvider", () => {
  it("嵌套 Provider 只覆盖传入字段，其余环境继承外层", async () => {
    const parentRegistry = createServiceRegistry();
    const childRegistry = createServiceRegistry();
    const extension = { type: "test" } as IExtension;
    let environment: ReturnType<typeof useEditorEnvironment> | null = null;
    const Probe = () => {
      environment = useEditorEnvironment();
      return null;
    };

    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <EditorProvider registry={parentRegistry} extensions={[extension]}>
          <EditorProvider registry={childRegistry}>
            <Probe />
          </EditorProvider>
        </EditorProvider>
      );
    });

    // P4 验收：环境只剩 registry 与 extensions
    expect(environment).toEqual({ registry: childRegistry, extensions: [extension] });
    await act(async () => root.unmount());
  });
});
