import { expect, it } from "vitest";
import { createI18nRuntime, createLocaleStore } from "@tau/i18n";
import Board from "../../Board";
import type { BoardElement, ContextMenuContext, MindNodeElement } from "../../types";
import type { WhiteboardDocumentBinding } from "../../document";
import { MindPlugin } from "../MindPlugin";
import { CopyPastePlugin } from "../CopyPastePlugin";
import { MindUtil } from "../../utils/MindUtil";
import { buildMindRootElement } from "../../extensions/creators/mind";
import { bindWhiteboardI18n } from "../../i18n-runtime";
import { menuLabelReader } from "../../menu-i18n";

const viewport = { minX: 0, minY: 0, width: 800, height: 600, zoom: 1 };
const contextOf = (board: Board, targetElements: BoardElement[]): ContextMenuContext => ({
  board,
  clientX: 10,
  clientY: 10,
  viewPortPoint: { x: 10, y: 10 },
  selectedElements: targetElements,
  hitElements: targetElements,
  targetElements,
  isHitSelected: true,
});

function summaryFixture() {
  const source = createLocaleStore("zh-CN");
  const runtime = createI18nRuntime({ localeSource: source });
  const root = buildMindRootElement(10, 10, 13);
  root.children = MindUtil.nodesFromOutline(
    ["用户节点甲", "用户节点乙"].map(text => ({
      text: [{ type: "paragraph", children: [{ type: "formatted", text }] }],
      children: [],
    }))
  );
  const targets = root.children;
  const plugin = new MindPlugin();
  const board = new Board([root], viewport, { selectedElements: targets, selectArea: null }, [
    plugin,
  ]);
  bindWhiteboardI18n(board, runtime);
  const context = contextOf(board, targets);
  const action = plugin.getContextMenu(context).find(item => item.key === "mind-summary");
  if (!action) throw new Error("概要动作未生成");
  return { board, root, source, runtime, action, context, targets };
}

it("概要菜单换语只更新标签，实际生成的默认正文与原语言保持一致", () => {
  const baseline = summaryFixture();
  const translated = summaryFixture();
  try {
    baseline.action.onSelect(baseline.context);
    const summary = (baseline.board.children[0] as MindNodeElement).children.find(
      node => node.summaryRange
    );
    if (!summary) throw new Error("原语言概要未生成");
    const readLabel = menuLabelReader(translated.board, translated.action);
    const originalLabel = readLabel();
    const originalChildren = translated.board.children;
    for (const locale of ["zh-TW", "en-US"]) {
      translated.source.setLocale(locale);
      expect(translated.board.children).toBe(originalChildren);
      expect(translated.root.children).toBe(translated.targets);
    }
    expect(readLabel()).not.toBe(originalLabel);
    translated.action.onSelect(translated.context);
    const result = (translated.board.children[0] as MindNodeElement).children.find(
      node => node.summaryRange
    );
    if (!result) throw new Error("换语后概要未生成");
    expect(result.text).toEqual(summary.text);
    expect(result.summaryRange).toMatchObject({
      startId: translated.targets[0].id,
      endId: translated.targets[1].id,
    });
    expect(
      (translated.board.children[0] as MindNodeElement).children.slice(0, 2).map(node => node.text)
    ).toEqual(translated.targets.map(node => node.text));
  } finally {
    baseline.board.destroy();
    translated.board.destroy();
    baseline.runtime.dispose();
    translated.runtime.dispose();
  }
});

it("页面菜单打开后换语保留当时的空标题语义与页面ID，不重新读取页面或执行移动", () => {
  const source = createLocaleStore("zh-CN");
  const runtime = createI18nRuntime({ localeSource: source });
  const element = {
    id: "element",
    type: "geometry",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
  } as BoardElement;
  const plugin = new CopyPastePlugin();
  const board = new Board([element], viewport, { selectedElements: [element], selectArea: null }, [
    plugin,
  ]);
  bindWhiteboardI18n(board, runtime);
  let title = "",
    reads = 0,
    pageReads = 0;
  const moves: unknown[] = [];
  board.document = {
    pages: () => {
      pageReads++;
      return [
        {
          id: "stable-page",
          get title() {
            reads++;
            return title;
          },
        },
      ];
    },
    moveToPage: (ids: readonly string[], pageId: string) => {
      moves.push({ ids, pageId });
    },
  } as unknown as WhiteboardDocumentBinding;
  const context = contextOf(board, [element]);
  const action = plugin
    .getContextMenu(context)
    .find(item => item.key === "move-to-page")
    ?.children?.find(item => item.key === "move-page-stable-page");
  if (!action) throw new Error("移动页面动作未生成");
  const label = menuLabelReader(board, action);
  const originalLabel = label();
  title = "打开后到达的页面名称";
  try {
    for (const locale of ["zh-TW", "en-US"]) {
      source.setLocale(locale);
      expect(reads).toBe(1);
      expect(pageReads).toBe(1);
      expect(moves).toEqual([]);
      expect(board.children[0]).toBe(element);
    }
    expect(label()).not.toBe(originalLabel);
    expect(label()).not.toContain(title);
    action.onSelect(context);
    expect(moves).toEqual([{ ids: ["element"], pageId: "stable-page" }]);
  } finally {
    board.destroy();
    runtime.dispose();
  }
});
