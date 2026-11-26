import { treeMessages } from "../../../../tree-i18n";
import { standaloneWhiteboardI18n } from "../../../../locale-runtime";
import { createI18nRuntime, createLocaleStore } from "@tau/i18n";
import { describe, expect, it } from "vitest";
import type { BoardElement } from "../../../../types";
import { elementLabel } from "../typeMeta";

const { t } = standaloneWhiteboardI18n.get(treeMessages);

const para = (text: string) => [{ type: "paragraph", children: [{ text }] }];
const el = (props: Partial<BoardElement> & { type: string }): BoardElement =>
  ({ id: props.type, ...props }) as BoardElement;

describe("elementLabel", () => {
  it("未命名的文本取内容首段，空内容退回类型名", () => {
    expect(elementLabel(el({ type: "richtext", content: para("  缩放点积\n注意力 ") }), t)).toBe(
      "缩放点积 注意力"
    );
    expect(elementLabel(el({ type: "richtext", content: para("") }), t)).toBe("文本");
  });

  it("手动命名优先；创建时的默认名让位给内容", () => {
    expect(elementLabel(el({ type: "richtext", name: "公式", content: para("QKV") }), t)).toBe(
      "公式"
    );
    const geo = el({
      type: "geometry",
      name: "矩形",
      geometryType: "rectangle",
      text: { content: para("Q") },
    });
    expect(elementLabel(geo, t)).toBe("Q");
    expect(
      elementLabel(el({ type: "geometry", geometryType: "circle", text: { content: para("") } }), t)
    ).toBe("圆形");
    expect(elementLabel(el({ type: "handwrite", name: "手写" }), t)).toBe("手写");
  });

  it("箭头显示「起点 → 终点」", () => {
    const q = el({
      type: "geometry",
      id: "q",
      geometryType: "rectangle",
      text: { content: para("Q") },
    });
    const arrow = el({ type: "arrow", source: { bindId: "q" }, target: {} });
    expect(elementLabel(arrow, t, id => (id === "q" ? q : null))).toBe("Q → ·");
    expect(elementLabel(el({ type: "arrow", source: {}, target: {} }), t)).toBe("箭头");
  });

  it("超长截断", () => {
    const label = elementLabel(el({ type: "richtext", content: para("字".repeat(60)) }), t);
    expect(label).toHaveLength(41);
    expect(label.endsWith("…")).toBe(true);
  });
});

it("语言变化只翻译类型兜底，原默认名识别与插件命名语义保持", () => {
  const source = createLocaleStore("zh-CN");
  const runtime = createI18nRuntime({ localeSource: source });
  const { t } = runtime.get(treeMessages);
  const defaultNamed = el({
    type: "geometry",
    name: "矩形",
    geometryType: "rectangle",
    text: { content: para("用户正文") },
  });
  const blank = el({
    type: "geometry",
    name: "圆形",
    geometryType: "circle",
    text: { content: para("") },
  });
  const manual = el({ type: "richtext", name: "用户命名", content: para("正文") });
  const first = elementLabel(blank, t);
  try {
    for (const locale of ["zh-TW", "en-US"]) {
      source.setLocale(locale);
      expect(elementLabel(defaultNamed, t)).toBe("用户正文");
      expect(elementLabel(manual, t)).toBe("用户命名");
      expect(blank.name).toBe("圆形");
      expect(defaultNamed.name).toBe("矩形");
    }
    expect(elementLabel(blank, t)).not.toBe(first);
  } finally {
    runtime.dispose();
  }
});
