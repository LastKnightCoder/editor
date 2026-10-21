import {
  Editor,
  Node,
  Path,
  Range,
  Text,
  Transforms,
  type Element,
  type PathRef,
  type Point,
  type RangeRef,
} from "slate";

import type {
  InlineInputRule,
  InputRule,
  MarkInputRule,
  RegisteredInputRule,
} from "../api/inputRules";
import type { ExtensionCircuitBreaker } from "./extensionGuard";
import { withNewUndoStep } from "../utils/undoStep";
import {
  CARET_AFFINITY_ENABLED,
  getCaretSlots,
  isSameMarks,
  selectCaretSlot,
  textProps,
  type TextProps,
} from "../utils/caretAffinity";

const WORD_CHAR = /[\p{L}\p{N}]/u;
const SPACE = /\s/;

export interface InputRuleMatch {
  readonly entry: RegisteredInputRule;
  /** 开头定界符在 before 里的下标 */
  readonly start: number;
}

/**
 * 在光标前的文字里找最近的一对合法定界符（参照 CommonMark 的左右侧规则）：
 * 内容非空、首尾不是空白也不是定界字符，定界符外侧不是同一字符或转义符。
 * `rules` 须按定界符长度降序，`***` 优先于 `**`、`*`。
 */
export function matchInputRule(
  rules: readonly RegisteredInputRule[],
  before: string,
  after: string | undefined
): InputRuleMatch | undefined {
  for (const entry of rules) {
    const { delimiter, wordBoundary } = entry.rule;
    if (!before.endsWith(delimiter)) continue;
    const char = delimiter[0];
    const close = before.length - delimiter.length;
    const last = before[close - 1];
    if (last === undefined || last === char || last === "\\" || SPACE.test(last)) continue;
    if (wordBoundary && after !== undefined && WORD_CHAR.test(after)) continue;
    const latest = close - delimiter.length - 1;
    for (
      let start = latest >= 0 ? before.lastIndexOf(delimiter, latest) : -1;
      start >= 0;
      start = start > 0 ? before.lastIndexOf(delimiter, start - 1) : -1
    ) {
      const first = before[start + delimiter.length];
      const outside = before[start - 1];
      if (first === char || SPACE.test(first)) continue;
      if (outside === char || outside === "\\") continue;
      if (wordBoundary && outside !== undefined && WORD_CHAR.test(outside)) continue;
      // 更远的开头只会跨过同一个换行
      if (before.slice(start + delimiter.length, close).includes("\n")) break;
      return { entry, start };
    }
  }
}

/** 光标停到新标记外侧：之后的输入沿用转换前的格式 */
const placeCaretOutside = (editor: Editor, point: Point, props: TextProps) => {
  if (CARET_AFFINITY_ENABLED) {
    const slot = getCaretSlots(editor, point)?.slots.find(item => isSameMarks(item.props, props));
    if (slot) {
      selectCaretSlot(editor, slot, false);
      return;
    }
  }
  Transforms.select(editor, point);
  editor.marks = { ...props };
};

const isInlineRule = (rule: InputRule): rule is InlineInputRule => rule.inline !== undefined;

interface MatchTarget {
  readonly path: Path;
  /** 光标位置，即收尾定界符之后 */
  readonly offset: number;
  readonly leaf: Text;
  readonly start: number;
}

const applyMarks = (editor: Editor, target: MatchTarget, rule: MarkInputRule) => {
  const { path, offset, leaf, start } = target;
  const size = rule.delimiter.length;
  let contentRef: RangeRef | undefined;
  withNewUndoStep(editor, () => {
    Editor.withoutNormalizing(editor, () => {
      Transforms.delete(editor, {
        at: { anchor: { path, offset: offset - size }, focus: { path, offset } },
      });
      Transforms.delete(editor, {
        at: { anchor: { path, offset: start }, focus: { path, offset: start + size } },
      });
      const content = {
        anchor: { path, offset: start },
        focus: { path, offset: offset - 2 * size },
      };
      contentRef = Editor.rangeRef(editor, content, { affinity: "inward" });
      Transforms.setNodes(editor, rule.marks, { at: content, match: Text.isText, split: true });
    });
  });
  // 规范化会合并相邻文本，落点在规范化之后再取
  const end = contentRef?.unref()?.focus;
  if (end) placeCaretOutside(editor, end, textProps(leaf));
};

const applyInline = (editor: Editor, target: MatchTarget, rule: InlineInputRule) => {
  const { path, offset, leaf, start } = target;
  const size = rule.delimiter.length;
  const element = {
    ...rule.inline.create(leaf.text.slice(start + size, offset - size)),
    type: rule.inline.type,
    children: [{ type: "formatted", text: "" }],
  } as unknown as Element;
  let elementRef: PathRef | undefined;
  withNewUndoStep(editor, () => {
    Editor.withoutNormalizing(editor, () => {
      Transforms.delete(editor, {
        at: { anchor: { path, offset: start }, focus: { path, offset } },
      });
      Transforms.insertNodes(editor, element, { at: { path, offset: start }, select: false });
      const inserted = editor.operations.findLast(op => op.type === "insert_node");
      if (inserted?.type === "insert_node") elementRef = Editor.pathRef(editor, inserted.path);
    });
  });
  // 规范化保证行内元素后面有文本，光标落在它开头；之后的输入沿用转换前的格式
  const at = elementRef?.unref();
  if (!at) return;
  const next = Path.next(at);
  if (!Node.has(editor, next)) return;
  const following = Node.get(editor, next);
  if (!Text.isText(following)) return;
  Transforms.select(editor, { path: next, offset: 0 });
  const props = textProps(leaf);
  if (!isSameMarks(textProps(following), props)) editor.marks = { ...props };
};

/**
 * 行内输入规则的分发：先照常插入文字，再看光标前是否凑成一对定界符。
 * 只认本次输入落在当前文本里的情形（带待插入标记的输入会新建文本，不跨文本匹配）；
 * 出错按规则所属扩展计入熔断，已插入的文字保留。
 */
export function withInputRules(
  editor: Editor,
  rules: readonly RegisteredInputRule[],
  breaker: ExtensionCircuitBreaker
): Editor {
  if (rules.length === 0) return editor;
  const sorted = [...rules].sort((a, b) => b.rule.delimiter.length - a.rule.delimiter.length);
  const triggers = new Set(sorted.map(({ rule }) => rule.delimiter.at(-1)));
  const { insertText } = editor;

  editor.insertText = (text, options) => {
    const operationCount = editor.operations.length;
    insertText(text, options);
    if (options?.at || !triggers.has(text.at(-1))) return;
    const op = editor.operations[editor.operations.length - 1];
    const { selection } = editor;
    if (
      editor.operations.length === operationCount ||
      op?.type !== "insert_text" ||
      op.text !== text ||
      !selection ||
      !Range.isCollapsed(selection) ||
      !Path.equals(op.path, selection.anchor.path)
    )
      return;
    const { path, offset } = selection.anchor;
    const leaf = Node.get(editor, path);
    if (!Text.isText(leaf)) return;
    const record = leaf as unknown as Record<string, unknown>;
    const active = sorted.filter(
      ({ owner, rule }) =>
        !breaker.isDisabled(owner) &&
        !rule.excludeMarks?.some(key => record[key]) &&
        // 已经是同样格式时保留原文，转换没有可见效果
        !(rule.marks && Object.entries(rule.marks).every(([key, value]) => record[key] === value))
    );
    const match = matchInputRule(active, leaf.text.slice(0, offset), leaf.text[offset]);
    if (!match) return;
    try {
      const target = { path, offset, leaf, start: match.start };
      const { rule } = match.entry;
      if (isInlineRule(rule)) applyInline(editor, target, rule);
      else applyMarks(editor, target, rule);
    } catch (error) {
      breaker.record(match.entry.owner, "behavior", error);
    }
  };

  return editor;
}
