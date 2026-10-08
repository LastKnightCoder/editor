/**
 * 文档待办在编辑器里的样子与输入（勾选项首段）：
 * - `#项目` 与日期装饰为胶囊（暂态装饰，正文仍是纯文本，导出 / 移动端 / 协作看到原样文字）；
 * - 勾选项里输入 `#` 弹项目候选，回车 / Tab 补全完整项目名，没有可就地新建；
 * - 相对日期词（明天、周五…）后输入空格时改写成带年份的绝对日期，胶囊仍按相对说法显示；
 * - 点胶囊弹小菜单：改日期 / 换项目 / 移除。
 *
 * 项目列表与新建由宿主经 IDocTaskGroups 注入，扩展不依赖待办域；没注入时整个扩展不生效。
 */

import { Editor, Element, Range, Text, Transforms, type NodeEntry, type Path } from "slate";
import {
  defineExtension,
  type EditorCommand,
  type EditorHotkey,
  type ElementBehaviors,
} from "@tau/editor/api";
import type { ParagraphElement } from "@tau/editor";
import { docTaskTokenSpans, formatDocTaskDate, isAbsoluteDateHint } from "@/entity/doc-tasks";
import { extractDateTime } from "@/utils/quickDateTime";
import { docTaskGroupsOf } from "./service";
import {
  closeTagPicker,
  isTagPickerOpenFor,
  moveTagPickerActive,
  openTagPicker,
  selectTagPickerItem,
  useTagPickerStore,
} from "./store";
import { DocTaskTokenChip } from "./TokenChip";
import { DocTaskLayer } from "./DocTaskLayer";

export { IDocTaskGroups, type DocTaskGroupsService } from "./service";

/** 装饰带给叶子的属性 */
export interface DocTaskTokenLeaf {
  docTaskToken?: "group" | "date";
  docTaskGroupId?: number;
  docTaskDate?: string;
}

/** 勾选项的首段（直接子段落里的第一个） */
export function taskParagraphAbove(editor: Editor, at: Path): NodeEntry | undefined {
  const paragraph = Editor.above(editor, {
    at,
    match: n => Element.isElement(n) && n.type === "paragraph",
  });
  if (!paragraph || paragraph[1].at(-1) !== 0) return undefined;
  const parent = Editor.parent(editor, paragraph[1]);
  return Element.isElement(parent[0]) && parent[0].type === "check-list-item"
    ? paragraph
    : undefined;
}

function decorate(editor: Editor, [node, path]: NodeEntry): Range[] {
  if (!Text.isText(node) || !node.text) return [];
  const groups = docTaskGroupsOf(editor);
  if (!groups) return [];
  const paragraph = taskParagraphAbove(editor, path);
  if (!paragraph) return [];
  // 首段可能被格式拆成多个叶子：在整段文字上找，再截出落在本叶子里的部分
  let offset = 0;
  let own = -1;
  let fullText = "";
  for (const [leaf, leafPath] of Editor.nodes(editor, { at: paragraph[1], match: Text.isText })) {
    if (leafPath.join() === path.join()) own = offset;
    fullText += (leaf as Text).text;
    offset += (leaf as Text).text.length;
  }
  if (own < 0) return [];
  const ranges: Range[] = [];
  for (const span of docTaskTokenSpans(fullText, groups.list())) {
    const start = Math.max(span.start, own);
    const end = Math.min(span.end, own + node.text.length);
    if (start >= end) continue;
    ranges.push({
      anchor: { path, offset: start - own },
      focus: { path, offset: end - own },
      docTaskToken: span.kind,
      docTaskGroupId: span.groupId,
      docTaskDate: span.hint,
    } as Range);
  }
  return ranges;
}

/** 光标前这个词若整个是相对日期（明天、周五…），改写成带年份的绝对日期 */
export function absolutizeDateBeforeCursor(editor: Editor, now = new Date()): boolean {
  const { selection } = editor;
  if (!selection || !Range.isCollapsed(selection)) return false;
  const point = selection.anchor;
  const [leaf] = Editor.leaf(editor, point);
  const word = leaf.text.slice(0, point.offset).match(/(\S+)$/)?.[1];
  if (!word || isAbsoluteDateHint(word)) return false;
  const match = extractDateTime(word, now);
  if (match.date == null || match.hints.date !== word) return false;
  Transforms.insertText(editor, formatDocTaskDate(match.date), {
    at: { anchor: { ...point, offset: point.offset - word.length }, focus: point },
  });
  return true;
}

const paragraphBehaviors: ElementBehaviors<ParagraphElement> = {
  insertText(editor, [, path], text) {
    if (!docTaskGroupsOf(editor) || !taskParagraphAbove(editor, [...path, 0])) return false;
    if (text === "#" || text === "＃") {
      openTagPicker(editor);
      return false;
    }
    if (isTagPickerOpenFor(editor)) {
      if (/\s/.test(text)) closeTagPicker();
      else useTagPickerStore.setState(s => ({ query: s.query + text, activeIndex: 0 }));
      return false;
    }
    if (text === " ") absolutizeDateBeforeCursor(editor);
    return false;
  },
  deleteBackward(editor) {
    if (!isTagPickerOpenFor(editor)) return false;
    const { query } = useTagPickerStore.getState();
    if (!query) closeTagPicker();
    else useTagPickerStore.setState({ query: query.slice(0, -1), activeIndex: 0 });
    return false;
  },
};

const pickerCommand = (
  id: string,
  title: string,
  run: () => void,
  stop = false
): EditorCommand => ({
  id,
  title,
  run: (editor, ctx) => {
    if (!isTagPickerOpenFor(editor)) return;
    run();
    ctx.event?.preventDefault();
    if (stop) ctx.event?.stopPropagation();
  },
});

const commands: EditorCommand[] = [
  pickerCommand("host.doc-tasks.tag-dismiss", "关闭项目候选", closeTagPicker, true),
  pickerCommand("host.doc-tasks.tag-next", "项目候选下一项", () => moveTagPickerActive(true)),
  pickerCommand("host.doc-tasks.tag-prev", "项目候选上一项", () => moveTagPickerActive(false)),
  {
    id: "host.doc-tasks.tag-confirm",
    title: "确认项目候选",
    run: (editor, ctx) => {
      if (!isTagPickerOpenFor(editor)) return;
      const { items, activeIndex } = useTagPickerStore.getState();
      const item = items[activeIndex];
      if (!item) {
        closeTagPicker();
        return;
      }
      ctx.event?.preventDefault();
      ctx.event?.stopPropagation();
      void selectTagPickerItem(item);
    },
  },
];

const hotkeys: EditorHotkey[] = [
  { key: "escape", command: "host.doc-tasks.tag-dismiss" },
  { key: "ArrowDown", command: "host.doc-tasks.tag-next" },
  { key: "ArrowUp", command: "host.doc-tasks.tag-prev" },
  { key: ["enter", "tab"], command: "host.doc-tasks.tag-confirm" },
];

export const docTasksExtension = defineExtension({
  id: "host.doc-tasks",
  marks: [{ id: "host.doc-tasks.token", keys: ["docTaskToken"], render: DocTaskTokenChip }],
  decorations: [{ id: "host.doc-tasks.tokens", decorate }],
  behaviorsFor: { paragraph: paragraphBehaviors },
  commands,
  hotkeys,
  layers: [DocTaskLayer],
});

export default docTasksExtension;
