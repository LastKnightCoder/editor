// P8：菜单贡献点求值器——when 过滤、disabled 灰显、分组排序与分隔线、同 id 覆盖、命令执行与错误隔离（01 §5.4）。
import { describe, expect, it, vi } from "vitest";
import { createEditor, type Editor, type Element } from "slate";

import { resolveBlockMenuItems } from "../resolveMenu";
import type { EditorMenuContribution } from "../../api/menu";

// 菜单解析允许未知领域，夹具只在输入边界声明其元素形状。
const element = (type: string): Element =>
  ({ type, children: [{ type: "formatted", text: "" }] }) as unknown as Element;

const ctxOf = (element: Element, editor: Editor = createEditor()) => ({
  editor,
  element,
  path: [0] as [number],
});

const source = (owner: string, menu: EditorMenuContribution) => ({ owner, menu });

describe("resolveBlockMenuItems", () => {
  it("when 为 false 的条目连同子树不出现；只剩空子菜单的父条目也消失", () => {
    const items = resolveBlockMenuItems(
      [
        source("ext.a", [
          {
            id: "a.visible",
            title: "可见",
            command: "a.visible",
          },
          {
            id: "a.hidden",
            title: "隐藏",
            command: "a.hidden",
            when: () => false,
            children: [{ id: "a.hidden.child", title: "子", command: "a.hidden.child" }],
          },
          {
            id: "a.empty-parent",
            title: "空父",
            children: [{ id: "a.filtered", title: "被过滤", command: "x", when: () => false }],
          },
        ]),
      ],
      ctxOf(element("paragraph"))
    );

    expect(items.map(item => item.key)).toEqual(["a.visible"]);
  });

  it("disabled 求值为灰显，动态标题在打开时解析", () => {
    const items = resolveBlockMenuItems(
      [
        source("ext.a", [
          {
            id: "a.toggle",
            title: ctx => (ctx.element.type === "callout" ? "收起" : "展开"),
            command: "a.toggle",
            disabled: () => true,
          },
        ]),
      ],
      ctxOf(element("callout"))
    );

    expect(items[0].label).toBe("收起");
    expect(items[0].disabled).toBe(true);
  });

  it("按组排序（actions → transform → block → 未知组）并在组边界标记分隔线", () => {
    const items = resolveBlockMenuItems(
      [
        source("ext.defaults", [
          { id: "block.delete", title: "删除", command: "x", group: "block" },
          {
            id: "transform",
            title: "转换成",
            group: "transform",
            children: [{ id: "transform.paragraph", title: "段落", command: "x" }],
          },
        ]),
        source("ext.a", [
          { id: "a.custom-group", title: "自定义组", command: "x", group: "z-custom" },
          { id: "a.action", title: "特有", command: "x" },
        ]),
      ],
      ctxOf(element("paragraph"))
    );

    expect(items.map(item => item.key)).toEqual([
      "a.action",
      "transform",
      "block.delete",
      "a.custom-group",
    ]);
    // 首项无分隔线，之后每组首项标记
    expect(items.map(item => item.separator ?? false)).toEqual([false, true, true, true]);
  });

  it("组内按 order 排，同 order 保持声明顺序", () => {
    const items = resolveBlockMenuItems(
      [
        source("ext.a", [
          { id: "a.second", title: "第二", command: "x", group: "block", order: 20 },
          { id: "a.first", title: "第一", command: "x", group: "block", order: 10 },
          { id: "a.zero", title: "无序号", command: "x", group: "block" },
        ]),
      ],
      ctxOf(element("paragraph"))
    );

    expect(items.map(item => item.key)).toEqual(["a.first", "a.second", "a.zero"]);
  });

  it("同 id 的顶层条目后声明覆盖先声明（扩展覆盖内核默认）", () => {
    const items = resolveBlockMenuItems(
      [
        source("tau.menu-defaults", [
          { id: "tau.block.delete", title: "删除", command: "tau.block.delete", group: "block" },
        ]),
        source("ext.webview", [
          { id: "tau.block.delete", title: "删除", command: "tau.webview.delete", group: "block" },
        ]),
      ],
      ctxOf(element("webview"))
    );

    expect(items).toHaveLength(1);
    expect(items[0].onSelect).toBeDefined();
    // 命令在执行时才解析，条目层只保证数量与顺序收敛
    expect(items.map(item => item.key)).toEqual(["tau.block.delete"]);
  });

  it("条目点击经 editor.commands.execute 携带 payload 与目标元素", () => {
    const editor = createEditor();
    const execute = vi.fn();
    editor.commands = { execute };
    const target = element("callout");

    const items = resolveBlockMenuItems(
      [source("ext.a", [{ id: "a.set", title: "设置", command: "tau.a.set", payload: { x: 1 } }])],
      { editor, element: target, path: [0] as [number] }
    );

    items[0].onSelect?.();
    expect(execute).toHaveBeenCalledWith("tau.a.set", { x: 1 }, target, [0]);
  });

  it("单个扩展的声明求值抛错只丢它自己的条目", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const items = resolveBlockMenuItems(
      [
        source("ext.bad", () => {
          throw new Error("boom");
        }),
        source("ext.good", [{ id: "good.action", title: "好的", command: "x" }]),
      ],
      ctxOf(element("paragraph"))
    );

    expect(items.map(item => item.key)).toEqual(["good.action"]);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("ext.bad"), expect.anything());
    error.mockRestore();
  });

  it("when / disabled 谓词抛错按保守值处理（不出现 / 灰显）", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const items = resolveBlockMenuItems(
      [
        source("ext.a", [
          {
            id: "a.risky",
            title: "有风险",
            command: "x",
            when: () => {
              throw new Error("when boom");
            },
          },
          {
            id: "a.gated",
            title: "灰显",
            command: "x",
            disabled: () => {
              throw new Error("disabled boom");
            },
          },
        ]),
      ],
      ctxOf(element("paragraph"))
    );

    expect(items.map(item => item.key)).toEqual(["a.gated"]);
    expect(items[0].disabled).toBe(true);
    error.mockRestore();
  });

  it("带元素类型的扩展条目只出现在自己的类型上；无类型的扩展为全局条目", () => {
    const entries: EditorMenuContribution = [
      { id: "callout.set-type", title: "修改类型", command: "x" },
    ];

    // 段落菜单：callout 的特有条目不出现，默认菜单（全局）照常
    const paragraphItems = resolveBlockMenuItems(
      [
        { owner: "tau.callout", menu: entries, types: ["callout"] },
        {
          owner: "tau.menu-defaults",
          menu: [{ id: "tau.block.delete", title: "删除", command: "x", group: "block" }],
        },
      ],
      ctxOf(element("paragraph"))
    );
    expect(paragraphItems.map(item => item.key)).toEqual(["tau.block.delete"]);

    // callout 菜单：特有条目出现
    const calloutItems = resolveBlockMenuItems(
      [{ owner: "tau.callout", menu: entries, types: ["callout"] }],
      ctxOf(element("callout"))
    );
    expect(calloutItems.map(item => item.key)).toEqual(["callout.set-type"]);
  });

  it("extras 追加在末尾（extraMenuItemsBuilder 的过渡位置）", () => {
    const items = resolveBlockMenuItems(
      [source("ext.a", [{ id: "a.action", title: "特有", command: "x" }])],
      ctxOf(element("paragraph")),
      [{ key: "host.extra", label: "宿主补充" }]
    );

    expect(items.map(item => item.key)).toEqual(["a.action", "host.extra"]);
  });

  it("显式合并同名顶层子菜单，子项按 order 排序且重复 id 后者覆盖", () => {
    const items = resolveBlockMenuItems(
      [
        source("first", [
          {
            id: "shared",
            title: "组合",
            mergeChildren: true,
            children: [
              { id: "late", title: "后", command: "old", order: 20 },
              { id: "hidden", title: "隐藏", command: "x", when: () => false },
            ],
          },
        ]),
        source("second", [
          {
            id: "shared",
            title: "组合",
            mergeChildren: true,
            children: [
              { id: "first", title: "前", command: "first", order: 10 },
              { id: "late", title: "新版", command: "new", order: 20 },
            ],
          },
        ]),
      ],
      ctxOf(element("paragraph"))
    );
    expect(items).toHaveLength(1);
    expect(items[0].children?.map(item => [item.key, item.label])).toEqual([
      ["first", "前"],
      ["late", "新版"],
    ]);
  });

  it("未声明合并的覆盖项保留原语义，异常来源不影响其他来源的共享菜单", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const shared = source("first", [
        {
          id: "shared",
          title: "组合",
          mergeChildren: true,
          children: [{ id: "old", title: "旧", command: "old" }],
        },
      ]);
      const replacement = source("second", [
        {
          id: "shared",
          title: "覆盖",
          children: [{ id: "new", title: "新", command: "new" }],
        },
      ]);
      const items = resolveBlockMenuItems([shared, replacement], ctxOf(element("paragraph")));
      expect(items[0].children?.map(item => item.key)).toEqual(["new"]);
      const broken = source("broken", [
        {
          id: "shared",
          title: () => {
            throw new Error("标题失败");
          },
          mergeChildren: true,
          children: [{ id: "bad", title: "坏", command: "bad" }],
        },
      ]);
      const kept = resolveBlockMenuItems([shared, broken], ctxOf(element("paragraph")));
      expect(kept[0].children?.map(item => item.key)).toEqual(["old"]);
      const brokenChild = source("child", [
        {
          id: "shared",
          title: "组合",
          mergeChildren: true,
          children: [
            {
              id: "bad",
              title: () => {
                throw new Error("子项失败");
              },
              command: "bad",
            },
            { id: "good", title: "保留", command: "good" },
          ],
        },
      ]);
      expect(
        resolveBlockMenuItems([shared, brokenChild], ctxOf(element("paragraph")))[0].children?.map(
          item => item.key
        )
      ).toEqual(["old", "good"]);
      expect(error).toHaveBeenCalled();
    } finally {
      error.mockRestore();
    }
  });
});
