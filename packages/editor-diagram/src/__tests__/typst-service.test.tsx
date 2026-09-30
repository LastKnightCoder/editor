import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import Typst from "../renderers/Typst";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("Typst 可选编译服务", () => {
  let root: Root;
  let host: HTMLDivElement;
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });
  const mount = async (props: React.ComponentProps<typeof Typst>) => {
    host = document.createElement("div");
    root = createRoot(host);
    await act(async () => root.render(<Typst {...props} />));
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 250));
    });
  };
  it("未注册时保留已有 HTML 缓存", async () => {
    await mount({ content: "= 内容", initialHtml: "<div>缓存</div>" });
    expect(host.textContent).toBe("缓存");
  });
  it("未注册且无缓存时显示不支持", async () => {
    await mount({ content: "= 内容" });
    expect(host.textContent).toContain("当前环境不支持 Typst 编译");
  });
  it("真实编译失败显示错误，不误用旧缓存", async () => {
    await mount({
      content: "= 新内容",
      initialHtml: "<div>旧缓存</div>",
      compiledFrom: "= 旧内容",
      compileTypst: async () => {
        throw new Error("语法错误");
      },
    });
    expect(host.textContent).toBe("语法错误");
  });
});
