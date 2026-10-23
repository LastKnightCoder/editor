// 块菜单求值：转换交集与批量执行、「更多」分组（排除操作栏项、禁用项、危险项置底、插件分组）。
// 使用内核真实的菜单聚合器（resolveElementMenu），kit 只提供 menuSources。
import { createEditor, Node, Transforms, type Descendant, type Editor, type Path } from "slate";
import { withHistory } from "slate-history";
import { describe, expect, it, vi } from "vitest";
import type { EditorKit } from "@tau/editor";
import type { EditorMenuEntry } from "@tau/editor/api";

vi.mock("slate-react", async importOriginal => {
  const actual = await importOriginal<typeof import("slate-react")>();
  return {
    ...actual,
    ReactEditor: {
      ...actual.ReactEditor,
      // 菜单求值经 findPath 定位元素；测试不渲染，按顶层下标定位
      findPath: (editor: Editor, node: Node): Path => {
        const index = editor.children.indexOf(node as Descendant);
        if (index < 0) throw new Error("not found");
        return [index];
      },
    },
  };
});

import {
  applyTransformToBlocks,
  buildMoreMenuGroups,
  isBuiltinMenuOwner,
  resolveBlockMenu,
  resolveSharedTransforms,
} from "../blockMenu";

const transformMenu = (targets: Array<[string, string]>): EditorMenuEntry[] => [
  {
    id: "tau.transform",
    title: "转换成",
    group: "transform",
    mergeChildren: true,
    children: targets.map(([target, title]) => ({
      id: `to.${target}`,
      title,
      command: "test.transform",
      payload: { target },
    })),
  },
];

const menuSources = [
  {
    owner: "tau.menu-defaults",
    menu: [
      { id: "tau.block.move-up", title: "上移", command: "noop", group: "block", order: 10 },
      { id: "tau.block.move-down", title: "下移", command: "noop", group: "block", order: 20 },
      { id: "tau.block.cut", title: "剪切", command: "noop", group: "block", order: 30 },
      { id: "tau.block.copy", title: "复制", command: "noop", group: "block", order: 40 },
      {
        id: "tau.block.delete",
        title: "删除",
        command: "noop",
        group: "block",
        order: 90,
        danger: true,
      },
    ] satisfies EditorMenuEntry[],
  },
  {
    owner: "tau.paragraph",
    types: ["paragraph"],
    menu: transformMenu([
      ["header", "标题"],
      ["blockquote", "引用"],
    ]),
  },
  {
    owner: "tau.header",
    types: ["header"],
    menu: transformMenu([
      ["paragraph", "段落"],
      ["blockquote", "引用"],
    ]),
  },
  {
    owner: "tau.image",
    types: ["image"],
    menu: [
      { id: "tau.image.crop", title: "裁剪", command: "noop" },
      { id: "tau.image.locked", title: "不可用", command: "noop", disabled: () => true },
      {
        id: "tau.image.align",
        title: "对齐",
        children: [
          { id: "tau.image.align.left", title: "左对齐", command: "noop" },
          { id: "tau.image.align.off", title: "禁用子项", command: "noop", disabled: () => true },
        ],
      },
      { id: "tau.image.clear", title: "清除图片", command: "noop", danger: true },
    ] satisfies EditorMenuEntry[],
  },
  {
    owner: "acme.translate",
    menu: [{ id: "acme.translate.run", title: "翻译", command: "noop" }],
  },
];

const kit = { assembly: { menuSources } } as unknown as EditorKit;

const block = (type: string, text: string) =>
  ({ type, children: [{ type: "formatted", text }] }) as unknown as Descendant;

function createDoc(children: Descendant[]) {
  const editor = withHistory(createEditor());
  editor.children = children;
  const execute = vi.fn((id: string, payload: unknown, _element: unknown, path?: Path) => {
    if (id !== "test.transform" || !path) return false;
    Transforms.setNodes(editor, { type: (payload as { target: string }).target } as never, {
      at: path,
    });
    return true;
  });
  (editor as unknown as { commands: unknown }).commands = { execute };
  return { editor, execute };
}

const types = (editor: Editor) => editor.children.map(node => (node as { type: string }).type);
const keysOf = (items: Array<{ key: string }>) => items.map(item => item.key);

describe("isBuiltinMenuOwner", () => {
  it("tau.* / host.* / editor 与无来源为内置，其他为插件", () => {
    expect(isBuiltinMenuOwner("tau.image")).toBe(true);
    expect(isBuiltinMenuOwner("host.content-link")).toBe(true);
    expect(isBuiltinMenuOwner("editor")).toBe(true);
    expect(isBuiltinMenuOwner(undefined)).toBe(true);
    expect(isBuiltinMenuOwner("acme.translate")).toBe(false);
  });
});

describe("转换", () => {
  it("单选列出该块的转换子项；无转换项的块为空", () => {
    const { editor } = createDoc([block("paragraph", "A"), block("image", "")]);
    expect(keysOf(resolveSharedTransforms(kit, editor, [0]))).toEqual([
      "to.header",
      "to.blockquote",
    ]);
    expect(resolveSharedTransforms(kit, editor, [1])).toEqual([]);
  });

  it("多选取所有块转换项的交集，含无转换项的块时为空", () => {
    const { editor } = createDoc([
      block("paragraph", "A"),
      block("header", "B"),
      block("image", ""),
    ]);
    expect(keysOf(resolveSharedTransforms(kit, editor, [1, 0]))).toEqual(["to.blockquote"]);
    expect(resolveSharedTransforms(kit, editor, [0, 2])).toEqual([]);
  });

  it("批量执行同 key 转换为一个撤销步", () => {
    const { editor, execute } = createDoc([
      block("paragraph", "A"),
      block("paragraph", "B"),
      block("header", "C"),
    ]);
    applyTransformToBlocks(kit, editor, [2, 0], "to.blockquote");
    expect(types(editor)).toEqual(["blockquote", "paragraph", "blockquote"]);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(editor.history.undos).toHaveLength(1);
    editor.undo();
    expect(types(editor)).toEqual(["paragraph", "paragraph", "header"]);
  });
});

describe("更多", () => {
  it("排除操作栏已有项与禁用项；危险项单独成组；插件项单独成组", () => {
    const { editor } = createDoc([block("image", "")]);
    const groups = buildMoreMenuGroups(resolveBlockMenu(kit, editor, 0));
    expect(groups.builtin.map(keysOf)).toEqual([
      ["tau.image.crop", "tau.image.align"],
      ["tau.block.cut"],
    ]);
    expect(groups.builtin[0][1].children?.map(child => child.key)).toEqual([
      "tau.image.align.left",
    ]);
    expect(keysOf(groups.plugin)).toEqual(["acme.translate.run"]);
    expect(groups.plugin[0].owner).toBe("acme.translate");
    expect(keysOf(groups.danger)).toEqual(["tau.image.clear"]);
  });

  it("段落的转换项不进「更多」", () => {
    const { editor } = createDoc([block("paragraph", "A")]);
    const groups = buildMoreMenuGroups(resolveBlockMenu(kit, editor, 0));
    const all = [...groups.builtin.flat(), ...groups.plugin, ...groups.danger];
    expect(keysOf(all)).toEqual(["tau.block.cut", "acme.translate.run"]);
  });
});
