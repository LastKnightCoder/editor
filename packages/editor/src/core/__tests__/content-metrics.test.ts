import { describe, expect, it } from "vitest";
import { createContentMetrics } from "@tau/db-schema/content-metrics";
import { editorMetricRules } from "../../../content-metrics";
const getContentLength = createContentMetrics(editorMetricRules).count;
import wordCases from "../../../../db-schema/fixtures/editor-word-count.json";

describe("getContentLength", () => {
  it.each(wordCases)("跨端字数：$text", ({ text, count }) => {
    expect(getContentLength([{ type: "formatted", text }])).toBe(count);
  });
  it("统计 formatted 文本字数（中英文混排）", () => {
    expect(getContentLength([{ type: "formatted", text: "你好 world" }])).toBeGreaterThan(0);
  });

  it("代码块与公式计入字数", () => {
    const length = getContentLength([
      { type: "code-block", code: "const a = 1" },
      { type: "inline-math", tex: "E=mc^2" },
    ]);
    expect(length).toBeGreaterThan(0);
  });

  it("旧 tabs 形态只补算非激活 Tab 的内容", () => {
    const length = getContentLength([
      {
        type: "tabs",
        activeKey: "a",
        tabsContent: [
          { key: "a", content: [{ type: "formatted", text: "激活内容" }] },
          { key: "b", content: [{ type: "formatted", text: "后台内容" }] },
        ],
        children: [],
      } as never,
    ]);
    // 激活 Tab 的内容由 children 树覆盖（此例为空），只应统计到后台 Tab
    expect(length).toBe(getContentLength([{ type: "formatted", text: "后台内容" }]));
  });

  it("空内容为 0", () => {
    expect(getContentLength([])).toBe(0);
    expect(getContentLength([{ type: "paragraph", children: [] }])).toBe(0);
  });
});

it("新版代码步骤、PlantUML 与嵌套表格都进入同一口径", () => {
  const content = [
    {
      type: "code-block",
      children: [
        { type: "code-step", code: "你好", children: [{ text: "" }] },
        { type: "code-step", code: "世界", children: [{ text: "" }] },
      ],
    },
    { type: "plantuml", content: "图表", children: [{ text: "" }] },
    {
      type: "table",
      children: [
        { type: "table-row", children: [{ type: "table-cell", children: [{ text: "正文" }] }] },
      ],
    },
  ];
  expect(getContentLength(content)).toBe(8);
});

it("折叠列表补算隐藏子树，展开后不重复统计旧快照", () => {
  const visible = { type: "paragraph", children: [{ text: "当前" }] };
  const hidden = { type: "paragraph", children: [{ text: "隐藏" }] };
  const snapshot = { type: "paragraph", children: [{ text: "过时" }] };
  expect(
    getContentLength([
      { type: "list-item", isFold: true, children: [visible], allContent: [snapshot, hidden] },
    ])
  ).toBe(4);
  expect(
    getContentLength([
      {
        type: "list-item",
        isFold: false,
        children: [visible, hidden],
        allContent: [snapshot, hidden],
      },
    ])
  ).toBe(4);
});

it("插件字段可跨进程序列化，实例隔离且快照不能被外部修改", () => {
  const rules = [{ type: "quiz", textFields: ["question", "answers[].text"] }];
  const first = createContentMetrics(JSON.parse(JSON.stringify(rules)));
  const second = createContentMetrics();
  const node = {
    type: "quiz",
    question: "天空是什么颜色",
    answers: [{ text: "蓝色" }],
    internalId: "不计入",
  };
  expect(first.count([node])).toBe(9);
  expect(second.count([node])).toBe(0);
  rules[0].textFields.push("internalId");
  expect(first.count([node])).toBe(9);
  first.setRules([]);
  expect(first.revision).toBe(1);
  expect(first.count([node])).toBe(0);
});

it("非法或重复规则不能替换已生效的快照", () => {
  const metrics = createContentMetrics([{ type: "source", textFields: ["source"] }]);
  for (const rules of [
    [{ type: "source", textFields: ["__proto__.secret"] }],
    [{ type: "source", textFields: ["children[].text"] }],
    [
      { type: "source", textFields: [] },
      { type: "source", textFields: [] },
    ],
  ])
    expect(() => metrics.setRules(rules)).toThrow();
  expect(metrics.count([{ type: "source", source: "正文" }])).toBe(2);
  expect(metrics.revision).toBe(0);
});
