import { describe, expect, it } from "vitest";
import { migrateTabsNode, migrateTabsToPanes } from "@tau/db-schema";
import type { ContentNode } from "./protocol";

const paragraph = (text: string): ContentNode => ({
  type: "paragraph",
  children: [{ type: "formatted", text }],
});

const paragraphWithText = (text: string): ContentNode => ({
  type: "paragraph",
  children: [{ type: "formatted", text }],
});

describe("migrateTabsToPanes", () => {
  it("原生形态：激活 Tab 实时内容（children）应覆盖快照", () => {
    const content: ContentNode[] = [
      {
        type: "tabs",
        activeKey: "b",
        tabsContent: [
          { key: "a", title: "Tab 1", content: [paragraph("a 快照")] },
          { key: "b", title: "Tab 2", content: [paragraph("b 旧快照")] },
        ],
        children: [paragraph("b 实时内容")],
      },
    ];
    const { content: migrated, changed } = migrateTabsToPanes(content);
    expect(changed).toBe(true);
    expect(migrated[0]).toMatchObject({
      type: "tabs",
      activeKey: "b",
      children: [
        { type: "tab-pane", tabKey: "a", title: "Tab 1", children: [paragraphWithText("a 快照")] },
        {
          type: "tab-pane",
          tabKey: "b",
          title: "Tab 2",
          children: [paragraphWithText("b 实时内容")],
        },
      ],
    });
    expect((migrated[0] as Record<string, unknown>).tabsContent).toBeUndefined();
  });

  it("协作投影形态：activeKey 为第一个、children 与第一个 Tab 快照一致时应正常迁移", () => {
    const content: ContentNode[] = [
      {
        type: "tabs",
        activeKey: "a",
        tabsContent: [
          { key: "a", title: "Tab 1", content: [paragraph("内容 A")] },
          { key: "b", title: "Tab 2", content: [paragraph("内容 B")] },
        ],
        children: [paragraph("内容 A")],
      },
    ];
    const { content: migrated } = migrateTabsToPanes(content);
    expect(migrated[0]).toMatchObject({
      activeKey: "a",
      children: [
        { type: "tab-pane", tabKey: "a", children: [paragraphWithText("内容 A")] },
        { type: "tab-pane", tabKey: "b", children: [paragraphWithText("内容 B")] },
      ],
    });
  });

  it("幂等：迁移后再跑不再变化", () => {
    const content: ContentNode[] = [
      {
        type: "tabs",
        activeKey: "a",
        tabsContent: [{ key: "a", title: "Tab 1", content: [paragraph("内容")] }],
        children: [paragraph("内容")],
      },
    ];
    const first = migrateTabsToPanes(content);
    const second = migrateTabsToPanes(first.content);
    expect(second.changed).toBe(false);
    expect(second.content).toEqual(first.content);
  });

  it("key 重复时应重新生成并保持顺序", () => {
    const node: ContentNode = {
      type: "tabs",
      activeKey: "dup",
      tabsContent: [
        { key: "dup", title: "T1", content: [paragraph("1")] },
        { key: "dup", title: "T2", content: [paragraph("2")] },
      ],
      children: [paragraph("1")],
    };
    const { node: migrated } = migrateTabsNode(node);
    const panes = migrated.children as ContentNode[];
    expect(panes).toHaveLength(2);
    const keys = panes.map(pane => pane.tabKey);
    expect(new Set(keys).size).toBe(2);
    expect(keys[0]).toBe("dup");
    expect(migrated.activeKey).toBe("dup");
  });

  it("key 缺失、title 非法、content 非数组时应修复", () => {
    const node: ContentNode = {
      type: "tabs",
      activeKey: undefined as unknown as string,
      tabsContent: [{ title: 123, content: "not-array" } as unknown as Record<string, unknown>],
      children: [],
    };
    const { node: migrated } = migrateTabsNode(node);
    const pane = (migrated.children as ContentNode[])[0];
    expect(typeof pane.tabKey).toBe("string");
    expect(pane.tabKey).toBe(migrated.activeKey);
    expect(pane.title).toBe("标签 1");
    expect(pane.children).toEqual([
      { type: "paragraph", children: [{ type: "formatted", text: "" }] },
    ]);
  });

  it("activeKey 失效但 children 有内容时应追加 New Tab", () => {
    const node: ContentNode = {
      type: "tabs",
      activeKey: "missing",
      tabsContent: [{ key: "a", title: "Tab 1", content: [paragraph("快照")] }],
      children: [paragraph("最新内容")],
    };
    const { node: migrated } = migrateTabsNode(node);
    const panes = migrated.children as ContentNode[];
    expect(panes).toHaveLength(2);
    expect(panes[1]).toMatchObject({ title: "New Tab", children: [paragraphWithText("最新内容")] });
    expect(migrated.activeKey).toBe("a");
  });

  it("tabsContent 为空时应退化为空段落", () => {
    const node: ContentNode = {
      type: "tabs",
      activeKey: "a",
      tabsContent: [],
      children: [],
    };
    const result = migrateTabsNode(node);
    expect(result.replacedBy).toEqual({
      type: "paragraph",
      children: [{ type: "formatted", text: "" }],
    });
  });

  it("children 为占位 formatted 时不应用其覆盖快照内容", () => {
    const node: ContentNode = {
      type: "tabs",
      activeKey: "a",
      tabsContent: [{ key: "a", title: "Tab 1", content: [paragraph("真实内容")] }],
      children: [{ type: "formatted", text: "" }],
    };
    const { node: migrated } = migrateTabsNode(node);
    expect((migrated.children as ContentNode[])[0].children).toEqual([
      paragraphWithText("真实内容"),
    ]);
  });

  it("嵌套 tabs 应递归迁移", () => {
    const content: ContentNode[] = [
      {
        type: "tabs",
        activeKey: "outer",
        tabsContent: [
          {
            key: "outer",
            title: "外层",
            content: [
              {
                type: "tabs",
                activeKey: "inner",
                tabsContent: [{ key: "inner", title: "内层", content: [paragraph("内层内容")] }],
                children: [paragraph("内层内容")],
              },
            ],
          },
        ],
        children: [
          {
            type: "tabs",
            activeKey: "inner",
            tabsContent: [{ key: "inner", title: "内层", content: [paragraph("内层内容")] }],
            children: [paragraph("内层内容")],
          },
        ],
      },
    ];
    const { content: migrated, changed } = migrateTabsToPanes(content);
    expect(changed).toBe(true);
    const outerPane = (migrated[0].children as ContentNode[])[0];
    const innerTabs = (outerPane.children as ContentNode[])[0];
    expect(innerTabs.type).toBe("tabs");
    expect((innerTabs.children as ContentNode[])[0].type).toBe("tab-pane");
  });

  it("新形态 activeKey 失效时应修正为第一个 pane", () => {
    const node: ContentNode = {
      type: "tabs",
      activeKey: "gone",
      children: [
        { type: "tab-pane", tabKey: "a", title: "A", children: [paragraph("a")] },
        { type: "tab-pane", tabKey: "b", title: "B", children: [paragraph("b")] },
      ],
    };
    const { node: migrated, changed } = migrateTabsNode(node);
    expect(changed).toBe(true);
    expect(migrated.activeKey).toBe("a");
  });

  it("新形态带 tabsContent 残留时应清理且不丢 pane 内容", () => {
    const node: ContentNode = {
      type: "tabs",
      activeKey: "a",
      tabsContent: [{ key: "a", title: "旧", content: [paragraph("旧数据")] }],
      children: [{ type: "tab-pane", tabKey: "a", title: "A", children: [paragraph("树内数据")] }],
    };
    const { node: migrated } = migrateTabsNode(node);
    expect((migrated as Record<string, unknown>).tabsContent).toBeUndefined();
    expect((migrated.children as ContentNode[])[0].children).toEqual([
      paragraphWithText("树内数据"),
    ]);
  });

  it("跨版本脏形态：activeKey 失效且 children 为空段落时不应追加空 New Tab", () => {
    const node: ContentNode = {
      type: "tabs",
      activeKey: "missing",
      tabsContent: [{ key: "a", title: "A", content: [paragraph("内容 A")] }],
      children: [paragraph("")],
    };
    const { node: migrated } = migrateTabsNode(node);
    const panes = (migrated.children as ContentNode[]).filter(child => child.type === "tab-pane");
    expect(panes).toHaveLength(1);
    expect(panes[0].title).toBe("A");
    expect(JSON.stringify(panes)).not.toContain("New Tab");
  });

  it("跨版本脏形态：children 为空段落时不得用它覆盖激活 Tab 的快照内容", () => {
    const node: ContentNode = {
      type: "tabs",
      activeKey: "a",
      tabsContent: [{ key: "a", title: "A", content: [paragraph("完好快照")] }],
      children: [paragraph("")],
    };
    const { node: migrated } = migrateTabsNode(node);
    expect(JSON.stringify(migrated.children)).toContain("完好快照");
  });

  it("跨版本脏形态：空壳 pane 不得吞掉 tabsContent 残留的真实内容", () => {
    const node: ContentNode = {
      type: "tabs",
      activeKey: "a",
      tabsContent: [
        { key: "a", title: "A", content: [paragraph("真实内容 A")] },
        { key: "b", title: "B", content: [paragraph("真实内容 B")] },
      ],
      children: [
        { type: "tab-pane", tabKey: "a", title: "A", children: [paragraph("")] },
        { type: "tab-pane", tabKey: "b", title: "B", children: [paragraph("")] },
      ],
    };
    const { node: migrated, changed } = migrateTabsNode(node);
    expect(changed).toBe(true);
    const panes = migrated.children as ContentNode[];
    expect(JSON.stringify(panes)).toContain("真实内容 A");
    expect(JSON.stringify(panes)).toContain("真实内容 B");
  });

  it("正常新形态不受脏形态防御影响：pane 有实质内容时仍以树内为权威", () => {
    const node: ContentNode = {
      type: "tabs",
      activeKey: "a",
      tabsContent: [{ key: "a", title: "旧", content: [paragraph("旧残留")] }],
      children: [
        { type: "tab-pane", tabKey: "a", title: "A", children: [paragraph("树内真实内容")] },
      ],
    };
    const { node: migrated } = migrateTabsNode(node);
    expect(JSON.stringify(migrated.children)).toContain("树内真实内容");
    expect(JSON.stringify(migrated.children)).not.toContain("旧残留");
  });

  it("不含 tabs 的内容应原样返回", () => {
    const content: ContentNode[] = [
      { type: "paragraph", children: [{ type: "formatted", text: "普通内容" }] },
    ];
    const result = migrateTabsToPanes(content);
    expect(result.changed).toBe(false);
    expect(result.content).toBe(content);
  });
});
