import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import Webview from ".";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("Webview", () => {
  let container: HTMLDivElement;
  let root: Root;

  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
  });

  it("协作资源只经作用域解析，拒绝读取时不退回原始标识", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(
        <Webview src="tau-collab-local:asset" remoteResourceToLocal={async () => "/allowed.html"} />
      );
    });
    expect(container.querySelector("iframe")?.getAttribute("src")).toBe("/allowed.html");
    await act(async () => {
      root.render(
        <Webview
          src="tau-collab-local:denied"
          remoteResourceToLocal={async () => {
            throw new Error("拒绝");
          }}
        />
      );
    });
    expect(container.querySelector("iframe")?.getAttribute("src") ?? "").not.toContain(
      "tau-collab"
    );
  });
  it("非 Electron 环境使用 iframe 渲染远程网页", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(<Webview src="https://example.com/page" />);
    });

    const iframe = container.querySelector("iframe");
    expect(iframe).not.toBeNull();
    expect(iframe?.src).toBe("https://example.com/page");
  });
});
