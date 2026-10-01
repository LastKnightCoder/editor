import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import CheckboxPlugin from "..";

describe("数据库复选框", () => {
  it.each(["input", "cell"])("点击 %s 只提交一次值变更", target => {
    const onChange = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
      act(() =>
        root.render(
          <CheckboxPlugin.Renderer
            value={false}
            column={{ id: "done", title: "完成", type: "checkbox" }}
            theme="light"
            readonly={false}
            onCellValueChange={onChange}
          />
        )
      );
      const element = container.querySelector<HTMLElement>(target === "input" ? "input" : "div");
      if (!element) throw new Error("未渲染复选框");
      act(() => element.click());
      expect(onChange).toHaveBeenCalledExactlyOnceWith(true);
    } finally {
      act(() => root.unmount());
      container.remove();
    }
  });

  it("只读时输入与单元格点击都不写入", () => {
    const onChange = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
      act(() =>
        root.render(
          <CheckboxPlugin.Renderer
            value={true}
            column={{ id: "done", title: "完成", type: "checkbox" }}
            theme="light"
            readonly
            onCellValueChange={onChange}
          />
        )
      );
      const input = container.querySelector<HTMLInputElement>("input");
      expect(input?.disabled).toBe(true);
      act(() => {
        input?.click();
        container.querySelector("div")?.click();
      });
      expect(onChange).not.toHaveBeenCalled();
    } finally {
      act(() => root.unmount());
      container.remove();
    }
  });
});
