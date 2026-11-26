import { expect, it } from "vitest";
import { createI18nRuntime, createLocaleStore } from "@tau/i18n";
import Board from "../../Board";
import type { BoardElement, ContextMenuContext } from "../../types";
import { RichTextPlugin, type RichTextElement } from "../RichTextPlugin";
import { HandwritePlugin } from "../HandwritePlugin";
import { embeddedTextOptions } from "../../extensions/text";
import { bindWhiteboardI18n } from "../../i18n-runtime";
import { menuLabelReader } from "../../menu-i18n";

const viewport = { minX: 0, minY: 0, width: 800, height: 600, zoom: 1 };
const contextOf = (board: Board): ContextMenuContext => ({
  board,
  clientX: 10,
  clientY: 10,
  viewPortPoint: { x: 10, y: 10 },
  selectedElements: board.children,
  hitElements: board.children,
  targetElements: board.children,
  isHitSelected: true,
});

it("独立内容菜单换语保留原命令目标和正文，动作仍发送原始创建模式", () => {
  const source = createLocaleStore("zh-CN");
  const runtime = createI18nRuntime({ localeSource: source });
  const content: RichTextElement["content"] = [
    { type: "paragraph", children: [{ type: "formatted", text: "用户正文" }] },
  ];
  const element: RichTextElement = {
    id: "r",
    type: "richtext",
    name: "用户名称",
    content,
    x: 10,
    y: 10,
    width: 180,
    height: 72,
    maxWidth: 300,
    maxHeight: 1000,
    resized: false,
  };
  const plugin = new RichTextPlugin({ ...embeddedTextOptions, create: async () => 7 });
  const board = new Board([element], viewport, { selectedElements: [element], selectArea: null }, [
    plugin,
  ]);
  bindWhiteboardI18n(board, runtime);
  const context = contextOf(board);
  const root = plugin.getContextMenu(context).find(item => item.key === "richtext-create-as-r");
  const action = root?.children?.find(item => item.key === "richtext-create-as-card-r");
  if (!root || !action) throw new Error("独立内容菜单未生成");
  const label = menuLabelReader(board, root);
  const originalLabel = label();
  const dispatched: unknown[] = [];
  board.on("tau.richtext.create-as", payload => dispatched.push(payload));
  try {
    for (const locale of ["zh-TW", "en-US"]) {
      source.setLocale(locale);
      expect(board.children[0]).toBe(element);
      expect(element.content).toBe(content);
      expect(dispatched).toEqual([]);
    }
    expect(label()).not.toBe(originalLabel);
    action.onSelect(context);
    expect(dispatched).toEqual([{ elementId: "r", mode: "card" }]);
    expect(element.content).toEqual([
      { type: "paragraph", children: [{ type: "formatted", text: "用户正文" }] },
    ]);
    expect(element.name).toBe("用户名称");
  } finally {
    board.destroy();
    runtime.dispose();
  }
});

it("手写菜单换语不提前合并，确认后只改变原分组数据并保持可撤销", () => {
  const source = createLocaleStore("zh-CN");
  const runtime = createI18nRuntime({ localeSource: source });
  const elements = ["a", "b"].map((id, index) => ({
    id,
    type: "handwrite",
    name: "用户笔迹" + id,
    x: index * 20,
    y: 10,
    width: 10,
    height: 10,
    points: [],
    outline: [],
    style: {},
  })) as BoardElement[];
  const plugin = new HandwritePlugin();
  const board = new Board(elements, viewport, { selectedElements: elements, selectArea: null }, [
    plugin,
  ]);
  bindWhiteboardI18n(board, runtime);
  const context = contextOf(board);
  const action = plugin.getContextMenu(context).find(item => item.key === "handwrite-merge-group");
  if (!action) throw new Error("手写合并动作未生成");
  const label = menuLabelReader(board, action);
  const originalLabel = label();
  try {
    for (const locale of ["zh-TW", "en-US"]) {
      source.setLocale(locale);
      expect(board.children).toBe(elements);
      expect(board.children.map(element => element.groupId)).toEqual([undefined, undefined]);
    }
    expect(label()).not.toBe(originalLabel);
    action.onSelect(context);
    const group = board.children[0].groupId;
    expect(typeof group).toBe("string");
    expect(group).not.toBe("");
    expect(board.children[1].groupId).toBe(group);
    expect(board.children.map(element => [element.id, element.name])).toEqual([
      ["a", "用户笔迹a"],
      ["b", "用户笔迹b"],
    ]);
    board.undo();
    expect(board.children.map(element => element.groupId)).toEqual([undefined, undefined]);
  } finally {
    board.destroy();
    runtime.dispose();
  }
});
