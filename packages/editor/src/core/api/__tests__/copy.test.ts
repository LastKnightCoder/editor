import { createEditor, Editor, Node, Transforms, type Descendant } from "slate";
import { describe, expect, it, vi } from "vitest";
import { defineExtension } from "../extension";
import type { CopyContext, ElementCopy } from "../copy";
import { createEditorKit } from "../../kit/EditorKit";
import { createCircuitBreaker, CIRCUIT_BREAKER_THRESHOLD } from "../../kit/extensionGuard";
import { withNormalizedCopy } from "../../plugins/withNormalizedCopy";

const paragraph = (text: string): Descendant => ({
  type: "paragraph",
  children: [{ type: "formatted", text }],
});
const block = (type: string, children: Descendant[], fields = {}): Descendant =>
  ({ type, children, ...fields }) as Descendant;

const extension = (type: string, copy?: ElementCopy, id = type) =>
  defineExtension({
    id,
    elements: [{ type, kind: "block", render: () => null, copy }],
  });

const setup = (content: Descendant[], extensions: ReturnType<typeof extension>[]) => {
  const editor = createEditor();
  editor.children = content;
  Transforms.select(editor, Editor.range(editor, []));
  const report = vi.fn();
  const breaker = createCircuitBreaker(() => ({ report }));
  const kit = createEditorKit({ extensions });
  const install = () => withNormalizedCopy(editor, kit.assembly.copyPolicies, breaker);
  return { editor, report, breaker, kit, install };
};

describe("复制贡献的对应关系与保留边界", () => {
  it("没有复制贡献时不包装 getFragment", () => {
    const { editor, install } = setup([paragraph("内容")], []);
    const original = editor.getFragment;
    install();
    expect(editor.getFragment).toBe(original);
  });

  it("未知外层是保留边界，不调用已知后代的策略", () => {
    const inner = vi.fn(() => "unwrap" as const);
    const content = [block("unknown", [block("inner", [paragraph("内容")])])];
    const { editor, install } = setup(content, [extension("inner", inner)]);
    const raw = editor.getFragment();
    install();
    expect(editor.getFragment()).toEqual(raw);
    expect(inner).not.toHaveBeenCalled();
  });

  it("显式保留外层允许先处理子节点，祖先信息不随解包改变", () => {
    const visits: string[] = [];
    const inner: ElementCopy = context => {
      visits.push("inner");
      expect(context.ancestorTypes).toEqual(["outer"]);
      expect(Object.isFrozen(context.ancestorTypes)).toBe(true);
      return "unwrap";
    };
    const outer: ElementCopy = context => {
      visits.push("outer");
      expect(context.element.children.map(child => child.type)).toEqual(["paragraph"]);
      expect(context.ancestorTypes).toEqual([]);
      return "keep";
    };
    const { editor, install } = setup(
      [block("outer", [block("inner", [paragraph("内容")])])],
      [extension("inner", inner), extension("outer", outer)]
    );
    install();
    expect(editor.getFragment()).toEqual([block("outer", [paragraph("内容")])]);
    expect(visits).toEqual(["inner", "outer"]);
  });

  it.each([false, true])("相邻同型节点按原路径裁剪，反向选区=%s", reverse => {
    const contexts: CopyContext[] = [];
    const policy: ElementCopy = context => {
      contexts.push(context);
      return "unwrap";
    };
    const content = [block("item", [paragraph("alpha")]), block("item", [paragraph("beta")])];
    const { editor, install } = setup(content, [extension("item", policy)]);
    const start = { path: [0, 0, 0], offset: 2 };
    const end = { path: [1, 0, 0], offset: 2 };
    Transforms.select(editor, { anchor: reverse ? end : start, focus: reverse ? start : end });
    install();
    expect(editor.getFragment()).toEqual([paragraph("pha"), paragraph("be")]);
    expect(contexts.map(context => context.fullySelected)).toEqual([false, false]);
    expect(editor.children).toBe(content);
    expect(Node.string(editor)).toBe("alphabeta");
  });

  it("选区末端 offset=0 保留 Slate 的空片段，不错配相邻节点", () => {
    const seen: boolean[] = [];
    const { editor, install } = setup(
      [block("item", [paragraph("first")]), block("item", [paragraph("second")])],
      [
        extension("item", context => {
          seen.push(context.fullySelected);
          return "unwrap";
        }),
      ]
    );
    Transforms.select(editor, {
      anchor: { path: [0, 0, 0], offset: 0 },
      focus: { path: [1, 0, 0], offset: 0 },
    });
    install();
    expect(editor.getFragment()).toEqual([paragraph("first"), paragraph("")]);
    expect(seen).toEqual([true, false]);
  });

  it("策略输入冻结且与原文档隔离，返回结果仍可编辑", () => {
    const content = [
      block("item", [paragraph("内容")], { checked: false, metadata: { tags: ["a"] } }),
    ];
    const { editor, install } = setup(content, [
      extension("item", context => {
        expect(Object.isFrozen(context)).toBe(true);
        expect(Object.isFrozen(context.element.children[0])).toBe(true);
        const metadata = (context.element as unknown as { metadata: { tags: string[] } }).metadata;
        expect(Object.isFrozen(metadata.tags)).toBe(true);
        return "keep";
      }),
    ]);
    install();
    const result = editor.getFragment();
    expect(result).toEqual(content);
    expect(Object.isFrozen(result[0])).toBe(false);
    expect(Object.isFrozen(content[0])).toBe(false);
    (result[0] as unknown as { checked: boolean }).checked = true;
    expect((content[0] as unknown as { checked: boolean }).checked).toBe(false);
  });

  it("上游返回相同类型和数量但内容不同的片段时，不猜测映射", () => {
    const policy = vi.fn(() => "unwrap" as const);
    const { editor, install, report } = setup(
      [block("item", [paragraph("原文")])],
      [extension("item", policy)]
    );
    const rewritten = [block("item", [paragraph("上游结果")])];
    editor.getFragment = () => rewritten;
    install();
    expect(editor.getFragment()).toBe(rewritten);
    expect(policy).not.toHaveBeenCalled();
    expect(report).not.toHaveBeenCalled();
  });

  it("不能冻结的数据元信息整体保留，不暴露给策略修改", () => {
    const policy = vi.fn(() => "unwrap" as const);
    const content = [block("item", [paragraph("内容")], { metadata: new Date(0) })];
    const { editor, install, report } = setup(content, [extension("item", policy)]);
    const raw = editor.getFragment();
    editor.getFragment = () => raw;
    install();
    expect(editor.getFragment()).toBe(raw);
    expect(policy).not.toHaveBeenCalled();
    expect(report).not.toHaveBeenCalled();
  });

  it.each(["selection", "document"])("上游修改 %s 时保留其结果，不继续套领域规则", change => {
    const policy = vi.fn(() => "unwrap" as const);
    const { editor, install } = setup(
      [block("item", [paragraph("内容")])],
      [extension("item", policy)]
    );
    const raw = editor.getFragment();
    editor.getFragment = () => {
      if (change === "selection") Transforms.collapse(editor, { edge: "end" });
      else Transforms.insertNodes(editor, paragraph("新增"), { at: [1] });
      return raw;
    };
    install();
    expect(editor.getFragment()).toBe(raw);
    expect(policy).not.toHaveBeenCalled();
  });

  it("无选区、折叠选区和空片段不调用策略", () => {
    const policy = vi.fn(() => "unwrap" as const);
    const { editor, install } = setup(
      [block("item", [paragraph("内容")])],
      [extension("item", policy)]
    );
    install();
    Transforms.collapse(editor, { edge: "end" });
    editor.getFragment();
    editor.selection = null;
    expect(editor.getFragment()).toEqual([]);
    expect(policy).not.toHaveBeenCalled();
  });
});

describe("复制失败整体回退与装配覆盖", () => {
  it.each([
    [
      "抛错",
      () => {
        throw new Error("失败");
      },
    ],
    ["非法返回", () => "delete"],
    ["异步成功", () => Promise.resolve("keep")],
    ["异步拒绝", () => Promise.reject(new Error("异步失败"))],
    [
      "修改快照",
      (context: CopyContext) => {
        (context.element.children[0] as unknown as { text: string }).text = "污染";
        return "keep";
      },
    ],
  ] as const)("%s 时不保留前面已完成的解包", async (_name, invalid) => {
    const content = [block("good", [paragraph("第一块")]), block("bad", [paragraph("第二块")])];
    const { editor, report, install } = setup(content, [
      extension("good", () => "unwrap"),
      extension("bad", invalid as ElementCopy),
    ]);
    const raw = editor.getFragment();
    editor.getFragment = () => raw;
    install();
    expect(editor.getFragment()).toBe(raw);
    await Promise.resolve();
    expect(report).toHaveBeenCalledTimes(1);
    expect(report.mock.calls[0][0]).toMatchObject({ extension: "bad", phase: "copy" });
    expect(editor.children).toBe(content);
    expect(Node.string(editor)).toBe("第一块第二块");
  });

  it("每次失败只计一次，同 owner 熔断后整个片段保留", () => {
    const fail = vi.fn(() => {
      throw new Error("失败");
    });
    const parent = vi.fn(() => "unwrap" as const);
    const { editor, install, report } = setup(
      [block("parent", [block("bad", [paragraph("a")]), block("bad", [paragraph("b")])])],
      [extension("parent", parent), extension("bad", fail)]
    );
    const raw = editor.getFragment();
    install();
    for (let count = 0; count < CIRCUIT_BREAKER_THRESHOLD + 1; count++) {
      expect(editor.getFragment()).toEqual(raw);
    }
    expect(report).toHaveBeenCalledTimes(CIRCUIT_BREAKER_THRESHOLD);
    expect(fail).toHaveBeenCalledTimes(CIRCUIT_BREAKER_THRESHOLD);
    expect(parent).not.toHaveBeenCalled();
  });

  it("部分覆盖多元素扩展时，没有 copy 的新声明清除旧策略", () => {
    const first = defineExtension({
      id: "first",
      elements: [
        { type: "item", kind: "block", render: () => null, copy: () => "unwrap" },
        { type: "other", kind: "block", render: () => null, copy: () => "keep" },
      ],
    });
    const base = createEditorKit({ extensions: [first] });
    const derived = base.extend({
      extensions: [extension("item", undefined, "replacement")],
      override: true,
    });
    expect(derived.assembly.copyPolicies.has("item")).toBe(false);
    expect(derived.assembly.copyPolicies.get("other")?.owner).toBe("first");
    expect(base.assembly.copyPolicies.get("item")?.owner).toBe("first");
  });

  it("覆盖策略的 owner 跟随生效元素，inline/void 不参与复制决策", () => {
    const base = createEditorKit({ extensions: [extension("item", () => "unwrap", "first")] });
    const derived = base.extend({
      extensions: [extension("item", () => "keep", "replacement")],
      override: true,
    });
    expect(derived.assembly.copyPolicies.get("item")?.owner).toBe("replacement");
    const ignored = createEditorKit({
      extensions: [
        defineExtension({
          id: "ignored",
          elements: [
            { type: "inline", kind: "inline", render: () => null, copy: () => "unwrap" },
            { type: "void", kind: "block", isVoid: true, render: () => null, copy: () => "unwrap" },
          ],
        }),
      ],
    });
    expect(ignored.assembly.copyPolicies.size).toBe(0);
  });
});
