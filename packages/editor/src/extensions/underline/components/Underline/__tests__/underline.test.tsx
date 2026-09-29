// 下划线：四种线型都用用户选的颜色，不取主题色。
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import Underline from "..";
import { UNDERLINE_COLORS, getUnderlineColor } from "../../../colors";
import { wavyBackground } from "..";
import type { UnderlineElement } from "../../../../../types";

describe("Underline", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    root = null;
    container = null;
  });

  const render = (color: string, lineType: string) => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const element = {
      type: "underline",
      color,
      lineType,
      colorSelectOpen: false,
      children: [{ type: "formatted", text: "文字" }],
    } as unknown as UnderlineElement;
    act(() =>
      root!.render(
        <Underline
          attributes={{ "data-slate-node": "element", ref: () => {} } as never}
          element={element}
        >
          文字
        </Underline>
      )
    );
    return container.querySelector<HTMLElement>("[data-slate-node]")!;
  };

  it.each(["solid", "dashed", "dotted"])("%s 线的颜色是用户选色", lineType => {
    const span = render("red", lineType);
    expect(span.style.borderBottomColor).toBe(UNDERLINE_COLORS.red);
    expect(span.className).toContain(`border-${lineType}`);
  });

  // jsdom 的 CSS 解析器不认 url 里带单引号的 data URL，会丢掉 backgroundImage，
  // 所以波浪 SVG 的颜色直接断言生成函数；浏览器渲染已在 blog 预览实测
  it("波浪线用选色画 SVG，且不画边框", () => {
    expect(decodeURIComponent(wavyBackground(UNDERLINE_COLORS.green))).toContain(
      `stroke='${UNDERLINE_COLORS.green}'`
    );
    const span = render("green", "wavy");
    expect(span.style.borderBottomColor).toBe("");
    expect(span.className).not.toContain("border-b-2");
  });

  it("default 与未知颜色跟随文字色", () => {
    expect(getUnderlineColor("default")).toBe("currentColor");
    expect(getUnderlineColor("nope")).toBe("currentColor");
    expect(getUnderlineColor(undefined)).toBe("currentColor");
  });
});
