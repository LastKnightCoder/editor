import { describe, expect, it } from "vitest";
import type { BoardElement } from "../../../../types";
import { elementLabel } from "../typeMeta";

const para = (text: string) => [{ type: "paragraph", children: [{ text }] }];
const el = (props: Partial<BoardElement> & { type: string }): BoardElement =>
  ({ id: props.type, ...props }) as BoardElement;

describe("elementLabel", () => {
  it("未命名的文本取内容首段，空内容退回类型名", () => {
    expect(elementLabel(el({ type: "richtext", content: para("  缩放点积\n注意力 ") }))).toBe(
      "缩放点积 注意力"
    );
    expect(elementLabel(el({ type: "richtext", content: para("") }))).toBe("文本");
  });

  it("手动命名优先；创建时的默认名让位给内容", () => {
    expect(elementLabel(el({ type: "richtext", name: "公式", content: para("QKV") }))).toBe("公式");
    const geo = el({
      type: "geometry",
      name: "矩形",
      geometryType: "rectangle",
      text: { content: para("Q") },
    });
    expect(elementLabel(geo)).toBe("Q");
    expect(
      elementLabel(el({ type: "geometry", geometryType: "circle", text: { content: para("") } }))
    ).toBe("圆形");
    expect(elementLabel(el({ type: "handwrite", name: "手写" }))).toBe("手写");
  });

  it("箭头显示「起点 → 终点」", () => {
    const q = el({
      type: "geometry",
      id: "q",
      geometryType: "rectangle",
      text: { content: para("Q") },
    });
    const arrow = el({ type: "arrow", source: { bindId: "q" }, target: {} });
    expect(elementLabel(arrow, id => (id === "q" ? q : null))).toBe("Q → ·");
    expect(elementLabel(el({ type: "arrow", source: {}, target: {} }))).toBe("箭头");
  });

  it("超长截断", () => {
    const label = elementLabel(el({ type: "richtext", content: para("字".repeat(60)) }));
    expect(label).toHaveLength(41);
    expect(label.endsWith("…")).toBe(true);
  });
});
