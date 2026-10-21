import { describe, expect, it } from "vitest";
import { CONTENT_INPUT_LIMITS, assertContentNodes, readContentInput } from "../content-input";

const paragraph = (text: string) => ({ type: "paragraph", children: [{ text }] });

describe("正文输入", () => {
  it("必须且只能提供一种形式", () => {
    expect(() => readContentInput({}, { allowEmpty: true })).toThrow("只能提供");
    expect(() =>
      readContentInput({ markdown: "a", nodes: [paragraph("a")] }, { allowEmpty: true })
    ).toThrow("只能提供");
    expect(() => readContentInput({ html: "<p>" }, { allowEmpty: true })).toThrow("只能提供");
    expect(() => readContentInput("a", { allowEmpty: true })).toThrow("正文输入无效");
    expect(readContentInput({ markdown: "a", nodes: undefined }, { allowEmpty: false })).toEqual({
      markdown: "a",
    });
  });

  it("空正文按 allowEmpty 处理；copyOf 不视为空", () => {
    expect(readContentInput({ markdown: "" }, { allowEmpty: true })).toEqual({ markdown: "" });
    expect(() => readContentInput({ markdown: " \n" }, { allowEmpty: false })).toThrow("不能为空");
    expect(() => readContentInput({ nodes: [] }, { allowEmpty: false })).toThrow("不能为空");
    expect(readContentInput({ copyOf: "7:100" }, { allowEmpty: false })).toEqual({
      copyOf: "7:100",
    });
    expect(() => readContentInput({ copyOf: "" }, { allowEmpty: true })).toThrow("copyOf");
  });

  it("节点被复制，之后修改传入对象不影响结果", () => {
    const nodes = [paragraph("原文")];
    const input = readContentInput({ nodes }, { allowEmpty: false });
    nodes[0].children[0].text = "改了";
    expect(input).toEqual({ nodes: [paragraph("原文")] });
    expect(() =>
      readContentInput(
        { nodes: [{ type: "p", children: [{ text: "", at: new Date() }] }] },
        {
          allowEmpty: true,
        }
      )
    ).toThrow("有限 JSON");
  });

  it("结构校验报出路径，未知类型与自定义字段原样保留", () => {
    const unknown = [
      { type: "uninstalled-plugin-node", source: "x", children: [{ text: "" }] },
      { type: "paragraph", children: [{ type: "link", url: "u", children: [{ text: "链" }] }] },
    ];
    expect(() => assertContentNodes(unknown)).not.toThrow();
    expect(() => assertContentNodes({})).toThrow("必须是数组");
    expect(() => assertContentNodes([{ text: "顶层文本" }])).toThrow("路径 0）：顶层必须是元素");
    expect(() => assertContentNodes([{ type: "paragraph", children: [] }])).toThrow(
      "路径 0）：元素的 children 必须是非空数组"
    );
    expect(() => assertContentNodes([{ children: [{ text: "" }] }])).toThrow("元素缺少 type");
    expect(() => assertContentNodes([{ type: "paragraph", children: [{ text: 1 }] }])).toThrow(
      "路径 0.0）：text 必须是字符串"
    );
    expect(() =>
      assertContentNodes([{ type: "paragraph", children: [{ text: "", children: [] }] }])
    ).toThrow("文本节点不能有 children");
  });

  it("限制嵌套层级与大小", () => {
    let node: Record<string, unknown> = { text: "" };
    for (let level = 0; level <= CONTENT_INPUT_LIMITS.depth; level++)
      node = { type: "block", children: [node] };
    expect(() => assertContentNodes([node])).toThrow("嵌套过深");
    const big = "a".repeat(CONTENT_INPUT_LIMITS.nodes);
    expect(() => readContentInput({ nodes: [paragraph(big)] }, { allowEmpty: true })).toThrow(
      "正文节点过大"
    );
    expect(() =>
      readContentInput(
        { markdown: "a".repeat(CONTENT_INPUT_LIMITS.markdown + 1) },
        {
          allowEmpty: true,
        }
      )
    ).toThrow("markdown 无效");
  });
});
