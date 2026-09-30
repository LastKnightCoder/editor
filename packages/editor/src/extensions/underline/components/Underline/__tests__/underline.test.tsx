// 下划线：四种线型都用统一行内色板里的用户选色（CSS 变量随明暗切换），不取主题色。
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import Underline from "..";
import { getUnderlineColor } from "../../../colors";
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
    expect(span.style.borderBottomColor).toBe("var(--ed-palette-red)");
    expect(span.className).toContain(`border-${lineType}`);
  });

  it("波浪线用 text-decoration 着色，且不画边框", () => {
    const span = render("green", "wavy");
    expect(span.style.textDecorationColor).toBe("var(--ed-palette-green)");
    expect(span.style.borderBottomColor).toBe("");
    expect(span.className).toContain("decoration-wavy");
  });

  it("default 与未知颜色跟随文字色", () => {
    expect(getUnderlineColor("default")).toBe("currentColor");
    expect(getUnderlineColor("nope")).toBe("currentColor");
    expect(getUnderlineColor(undefined)).toBe("currentColor");
  });
});
