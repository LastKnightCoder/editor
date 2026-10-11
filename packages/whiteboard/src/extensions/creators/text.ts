import { v4 as uuid } from "uuid";
import type { CreateBuildContext, ElementCreateSpec, WhiteboardAPI } from "../api";
import type { Operation, Selection } from "../../types";
import type { RichTextElement } from "../../plugins/RichTextPlugin";
import { RichTextUtil } from "../../utils/TextStyleStore";
import {
  createEmptyRichTextContent,
  createRichTextContentId,
} from "../../utils/RichTextContentUtil";
import type { TextExtensionOptions } from "../text";

/** 旧 insertRichText 的默认尺寸（画布单位） */
export const RICHTEXT_CREATE_DEFAULT_SIZE = [180, 72] as const;

/**
 * 旧 insertRichText 的元素构造（纯函数，双击创建与创建手势共用）：
 * content 先建后插（见 createRichTextContentId），contentId 建不出来时为 undefined，
 * 元素仍返回，聚焦时由 RichText 兜底补建。
 */
export async function buildRichTextElement(
  x: number,
  y: number,
  text: TextExtensionOptions,
  board: Pick<WhiteboardAPI, "captureSubmission" | "readonly" | "isDestroyed">
): Promise<RichTextElement> {
  const content = createEmptyRichTextContent();
  return {
    id: uuid(),
    type: "richtext",
    x,
    y,
    width: RICHTEXT_CREATE_DEFAULT_SIZE[0],
    height: RICHTEXT_CREATE_DEFAULT_SIZE[1],
    maxWidth: 300,
    maxHeight: 1000,
    readonly: false,
    resized: false,
    content,
    contentId: await createRichTextContentId(content, board, text),
    autoFocus: true,
    ...RichTextUtil.load(),
  };
}

/** 创建时清空选区的操作（与插入同属一个撤销步，复刻旧 onClick 的创建前清空） */
export function clearSelectionOperation(selection: Selection): Operation {
  return {
    type: "set_selection",
    properties: selection,
    newProperties: { selectArea: null, selectedElements: [] },
  };
}

/**
 * richtext 创建规格：click 手势，按下点为元素左上角（旧 insertRichText 的锚点规则，
 * build 用 ctx.start 而非居中的 ctx.rect）；构造为异步（先建正文 content），
 * 完成后由内核守门提交，等待期间忽略新的创建手势。
 */
export const textCreateSpec = (text: TextExtensionOptions): ElementCreateSpec => ({
  gesture: "click",
  defaultSize: RICHTEXT_CREATE_DEFAULT_SIZE,
  after: "none",
  cursor: "text",
  hint: () => ["点击放置文本"],
  build: async (ctx: CreateBuildContext) => {
    const element = await buildRichTextElement(ctx.start.x, ctx.start.y, text, ctx.api);
    return { element, operations: [clearSelectionOperation(ctx.api.selection)] };
  },
});
