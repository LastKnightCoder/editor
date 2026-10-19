import { describe, expect, it, vi } from "vitest";
import { IRuntimeStyleCompiler } from "@tau/shared/runtime-style";
import { createServiceRegistry } from "@tau/editor";
import type WebSocketClient from "../../utils/WebSocketClient";
import { createExtensionEditorServices } from "../editorRegistry";
import { getExtensionKit } from "../editorKit";

describe("浏览器扩展编译服务", () => {
  it("断连与重连复用 Kit，沿用 RPC 方法并传递样式语言", async () => {
    let connected = false;
    const sendRequest = vi.fn(async () => ".p-4 {}");
    const client = {
      get isConnected() {
        return connected;
      },
      sendRequest,
    } as unknown as WebSocketClient;
    const kit = getExtensionKit(client);
    const registry = createServiceRegistry(createExtensionEditorServices({ wsClient: client }));
    const style = registry.get(IRuntimeStyleCompiler);
    await expect(style.compile({ source: "HTML", language: "html" })).rejects.toThrow("未连接");
    connected = true;
    expect(getExtensionKit(client)).toBe(kit);
    expect(registry.get(IRuntimeStyleCompiler)).toBe(style);
    await style.compile({ source: '<div class="p-4" />', language: "html" });
    expect(sendRequest).toHaveBeenCalledWith("compiler.tailwindRuntime", {
      html: '<div class="p-4" />',
      extension: "html",
    });
    await style.compile({ source: "const Component = () => <div />;", language: "tsx" });
    expect(sendRequest).toHaveBeenLastCalledWith("compiler.tailwindRuntime", {
      html: "const Component = () => <div />;",
      extension: "tsx",
    });
    connected = false;
    expect(getExtensionKit(client)).toBe(kit);
  });
});
