import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RuntimeStyleCompiler } from "@tau/shared/runtime-style";
import { useTailwindRuntimeCss } from "../hooks/useTailwindRuntimeCss";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const Probe = ({ source, compiler }: { source: string; compiler?: RuntimeStyleCompiler }) => (
  <output>{useTailwindRuntimeCss(source, "html", compiler)}</output>
);

describe("HTML 运行时样式", () => {
  let root: Root;
  let host: HTMLDivElement;
  afterEach(async () => {
    await act(async () => root?.unmount());
    host?.remove();
    host = undefined as unknown as HTMLDivElement;
  });
  const render = async (source: string, compiler?: RuntimeStyleCompiler) => {
    if (!host) {
      host = document.createElement("div");
      root = createRoot(host);
    }
    await act(async () => root.render(<Probe source={source} compiler={compiler} />));
  };

  it("向宿主传入 HTML 语言与去空白源码，缺服务和空输入降级为空 CSS", async () => {
    const compile = vi.fn(async () => ".p-4 { padding: 1rem; }");
    await render('  <div class="p-4">内容</div>  ', { compile });
    expect(compile).toHaveBeenCalledWith({
      source: '<div class="p-4">内容</div>',
      language: "html",
    });
    expect(host.textContent).toContain("padding");
    await render("内容");
    expect(host.textContent).toBe("");
    await render("  ", { compile });
    expect(compile).toHaveBeenCalledTimes(1);
  });

  it("编译失败回落空 CSS，旧请求的迟到结果不能覆盖新源码", async () => {
    let resolvePrevious: (css: string) => void = () => undefined;
    const compiler = {
      compile: vi.fn(
        () =>
          new Promise<string>(resolve => {
            resolvePrevious = resolve;
          })
      ),
    };
    await render("旧源码", compiler);
    await render("新源码", { compile: async () => "新 CSS" });
    await act(async () => resolvePrevious("旧 CSS"));
    expect(host.textContent).toBe("新 CSS");
    await render("失败源码", {
      compile: async () => {
        throw new Error("失败");
      },
    });
    expect(host.textContent).toBe("");
  });
});
