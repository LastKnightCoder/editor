import { Editor, Element, Node, Path, Point, Range, Text, Transforms } from "slate";

/**
 * 光标偏向：同一视觉位置可能对应多种「下一次输入的归属」——标记边界的左侧或右侧格式、
 * 行内元素的内侧或外侧、块边缘的有格式或无格式。每种归属称为一个槽位（slot），
 * 左右键在槽位间逐个切换，指示器显示当前槽位处于哪一侧。
 *
 * 槽位的两种表示：
 * - 真实落点：选区点落在归属的文本节点上。Chromium 的键入与输入法组合会把文本 offset 0
 *   处的输入挪到上游（左侧）文本，因此只有前面隔着不可编辑 spacer 的文本才能这样表示：
 *   行内元素自带 spacer；带标记的文本在光标停在其开头时由 LeafRenderer 渲染 spacer
 *   （见 hasCaretSpacer / getCaretSpacerTarget）；
 * - 待插入标记：归属侧是无标记文本时，选区点固定在左侧文本末尾，归属由 `editor.marks` 表达，
 *   slate-react 会在该处渲染无格式的零宽占位并把 DOM 光标放进去。
 */

/** 触屏端（Android 输入差分管线、iOS）不启用：没有方向键，且选区改写会干扰其输入恢复 */
export const CARET_AFFINITY_ENABLED =
  typeof navigator === "undefined" || !/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

/** 文本节点除正文外的全部属性（含 type 等结构字段），用作待插入标记 */
export type TextProps = Omit<Text, "text">;

export interface CaretSlot {
  /** 选区落点 */
  point: Point;
  /** 需要以待插入标记表达的归属；为空表示直接由落点决定 */
  pending?: TextProps;
  /** 本槽位输入会带上的文本属性（不含正文） */
  props: TextProps;
  /** 落点文本的父节点，用于区分行内元素内外 */
  parent: Path;
  /** 相对所在块的行内元素嵌套深度 */
  depth: number;
  /** 块边缘（或行内 void 旁）补出的无格式槽位 */
  virtual?: boolean;
}

export interface CaretSlots {
  slots: CaretSlot[];
  /** 等价位置串最左、最右的真实点：左右键越过本位置时从这里按字符移动 */
  start: Point;
  end: Point;
}

export type CaretAffinitySide = "left" | "middle" | "right";

/** 不参与标记比较的结构字段 */
const STRUCTURAL_KEYS = new Set(["text", "type"]);

export const textProps = (node: Text): TextProps => {
  const { text: _text, ...rest } = node;
  return rest;
};

const markEntries = (props: TextProps) =>
  Object.entries(props).filter(
    ([key, value]) => !STRUCTURAL_KEYS.has(key) && value !== undefined && value !== null
  );

const hasMarks = (props: TextProps) => markEntries(props).length > 0;

const stripMarks = (props: TextProps): TextProps =>
  Object.fromEntries(
    Object.entries(props).filter(([key]) => STRUCTURAL_KEYS.has(key))
  ) as TextProps;

/** 光标停在该文本开头时渲染不可编辑 spacer，offset 0 可直接承载输入 */
export const hasCaretSpacer = (node: Text): boolean =>
  CARET_AFFINITY_ENABLED && node.text.length > 0 && hasMarks(textProps(node));

const spacerTargetCache = new WeakMap<
  Editor,
  { selection: Range | null; marks: Editor["marks"]; children: Node[]; target: Text | null }
>();

/**
 * 当前需要渲染 spacer 的文本：光标折叠在它的开头且没有待插入标记。
 * spacer 只在这一处出现，不影响其余位置的 DOM 文本（查找、选区字数等）。各叶子以身份比较订阅，按选区缓存。
 */
export const getCaretSpacerTarget = (editor: Editor): Text | null => {
  const { selection, marks, children } = editor;
  const cached = spacerTargetCache.get(editor);
  if (
    cached &&
    cached.selection === selection &&
    cached.marks === marks &&
    cached.children === children
  ) {
    return cached.target;
  }
  let target: Text | null = null;
  if (
    !marks &&
    selection &&
    Range.isCollapsed(selection) &&
    selection.anchor.offset === 0 &&
    Node.has(editor, selection.anchor.path)
  ) {
    const node = Node.get(editor, selection.anchor.path);
    if (Text.isText(node) && hasCaretSpacer(node)) target = node;
  }
  spacerTargetCache.set(editor, { selection, marks, children, target });
  return target;
};

export const isSameMarks = (a: TextProps, b: TextProps): boolean => {
  const left = markEntries(a);
  const right = markEntries(b);
  return (
    left.length === right.length &&
    left.every(([key, value]) => (b as Record<string, unknown>)[key] === value)
  );
};

/** 块内文本序列；行内 void 元素作为屏障（null），其两侧不是同一视觉位置 */
type BlockItem = { path: Path; node: Text } | null;

const collectBlockItems = (editor: Editor, node: Node, path: Path, items: BlockItem[]) => {
  if (Text.isText(node)) {
    items.push({ path, node });
    return;
  }
  if (Element.isElement(node) && Editor.isVoid(editor, node)) {
    items.push(null);
    return;
  }
  if (Element.isElement(node)) {
    node.children.forEach((child, index) =>
      collectBlockItems(editor, child, path.concat(index), items)
    );
  }
};

interface RunPoint {
  path: Path;
  node: Text;
  offset: number;
}

/**
 * 计算折叠光标所在视觉位置的全部槽位（从左到右）。不在边界时只有一个槽位。
 * 光标不在可编辑文本上（void 内、块外）时返回 null。
 */
export const getCaretSlots = (editor: Editor, point: Point): CaretSlots | null => {
  const block = Editor.above(editor, {
    at: point.path,
    match: n => Element.isElement(n) && Editor.isBlock(editor, n),
  });
  if (!block) return null;
  const [blockNode, blockPath] = block;
  const items: BlockItem[] = [];
  blockNode.children.forEach((child, index) =>
    collectBlockItems(editor, child, blockPath.concat(index), items)
  );
  const index = items.findIndex(item => item !== null && Path.equals(item.path, point.path));
  const current = items[index];
  if (!current) return null;

  // 向两侧收集与光标同一视觉位置的点：穿过空文本，遇到有内容的文本或屏障即止
  const run: RunPoint[] = [{ ...current, offset: point.offset }];
  if (point.offset === 0) {
    for (let i = index - 1; i >= 0; i--) {
      const item = items[i];
      if (!item) break;
      run.unshift({ ...item, offset: item.node.text.length });
      if (item.node.text.length > 0) break;
    }
  }
  if (point.offset === current.node.text.length) {
    for (let i = index + 1; i < items.length; i++) {
      const item = items[i];
      if (!item) break;
      run.push({ ...item, offset: 0 });
      if (item.node.text.length > 0) break;
    }
  }

  const slots: CaretSlot[] = [];
  for (const entry of run) {
    const props = textProps(entry.node);
    const parent = Path.parent(entry.path);
    const depth = entry.path.length - blockPath.length - 1;
    const point = { path: entry.path, offset: entry.offset };
    const groupHead = slots.find(slot => Path.equals(slot.parent, parent));
    if (!groupHead) {
      slots.push({ point, props, parent, depth });
      continue;
    }
    if (slots.some(slot => Path.equals(slot.parent, parent) && isSameMarks(slot.props, props))) {
      continue;
    }
    // 同父文本：带 spacer 的文本用真实落点，否则挂在该父节点首个槽位的落点上
    slots.push(
      entry.offset === 0 && hasCaretSpacer(entry.node)
        ? { point, props, parent, depth }
        : { point: groupHead.point, pending: props, props, parent, depth }
    );
  }

  // 块边缘（或屏障旁）带格式时，补出「无格式」一侧，用于跳出段首/段尾的格式
  const first = slots[0];
  const lastSlot = slots[slots.length - 1];
  const leftEdge = run[0].offset === 0 && hasMarks(first.props);
  if (leftEdge) {
    const plain = stripMarks(first.props);
    slots.unshift({ ...first, pending: plain, props: plain, virtual: true });
  }
  const lastRun = run[run.length - 1];
  // 空文本两侧都是边缘，只补一次
  const rightEdge =
    !(leftEdge && lastSlot === first) && lastRun.offset === lastRun.node.text.length;
  if (rightEdge && hasMarks(lastSlot.props)) {
    const plain = stripMarks(lastSlot.props);
    slots.push({ ...lastSlot, pending: plain, props: plain, virtual: true });
  }

  return {
    slots,
    start: { path: run[0].path, offset: run[0].offset },
    end: { path: lastRun.path, offset: lastRun.offset },
  };
};

/**
 * 当前选区对应的槽位下标。用户自行切换了待插入标记（如 mod+b）、与任何槽位都不符时返回 -1。
 */
export const getCurrentSlotIndex = (editor: Editor, slots: readonly CaretSlot[]): number => {
  const { selection, marks } = editor;
  if (!selection || !Range.isCollapsed(selection)) return -1;
  const { anchor } = selection;
  if (marks) {
    return slots.findIndex(
      slot => slot.pending && Point.equals(slot.point, anchor) && isSameMarks(slot.pending, marks)
    );
  }
  const exact = slots.findIndex(slot => !slot.pending && Point.equals(slot.point, anchor));
  if (exact >= 0) return exact;
  // 落点不是规范点（如右侧文本 offset 0）时按所在文本的归属匹配
  const leaf = Node.leaf(editor, anchor.path);
  const parent = Path.parent(anchor.path);
  return slots.findIndex(
    slot => !slot.virtual && Path.equals(slot.parent, parent) && isSameMarks(slot.props, leaf)
  );
};

/**
 * 光标落到边界时的默认槽位：优先行内元素外侧、其次不含非包含标记（行内代码等）、
 * 再次真实文本；仍并列时取左侧，即沿用前文格式。
 */
export const pickDefaultSlotIndex = (
  slots: readonly CaretSlot[],
  nonInclusiveKeys: ReadonlySet<string>
): number => {
  const score = (slot: CaretSlot) => [
    slot.depth,
    markEntries(slot.props).filter(([key]) => nonInclusiveKeys.has(key)).length,
    slot.virtual ? 1 : 0,
  ];
  let best = 0;
  let bestScore = score(slots[0]);
  for (let i = 1; i < slots.length; i++) {
    const current = score(slots[i]);
    const index = current.findIndex((value, k) => value !== bestScore[k]);
    if (index >= 0 && current[index] < bestScore[index]) {
      best = i;
      bestScore = current;
    }
  }
  return best;
};

/** 光标偏向的意图标记：期间发生的选区变化来自偏向命令本身，不做默认归位 */
const CARET_INTENT = new WeakSet<Editor>();

export const isCaretIntent = (editor: Editor) => CARET_INTENT.has(editor);

export const selectCaretSlot = (editor: Editor, slot: CaretSlot, notify = true) => {
  const { selection } = editor;
  if (!selection || !Range.isCollapsed(selection) || !Point.equals(selection.anchor, slot.point)) {
    CARET_INTENT.add(editor);
    try {
      Transforms.select(editor, slot.point);
    } finally {
      CARET_INTENT.delete(editor);
    }
  }
  editor.marks = slot.pending ? { ...slot.pending } : null;
  if (notify) editor.onChange();
};

/**
 * 把落在非规范点上的光标换成它所代表槽位的规范表示，归属不变。
 * 编辑（如退格删掉格式内首字）后选区随文档变换，可能停在浏览器无法正确承载输入的点上。
 */
export const canonicalizeCaret = (editor: Editor): void => {
  const { selection, marks } = editor;
  if (marks || !selection || !Range.isCollapsed(selection)) return;
  const info = getCaretSlots(editor, selection.anchor);
  if (!info || info.slots.length < 2) return;
  const slot = info.slots[getCurrentSlotIndex(editor, info.slots)];
  if (slot && (slot.pending || !Point.equals(slot.point, selection.anchor))) {
    selectCaretSlot(editor, slot, false);
  }
};

/** 当前光标偏向；不在边界或用户自定了待插入标记时返回 null */
export const getCaretAffinity = (editor: Editor): CaretAffinitySide | null => {
  const { selection } = editor;
  if (!selection || !Range.isCollapsed(selection)) return null;
  const info = getCaretSlots(editor, selection.anchor);
  if (!info || info.slots.length < 2) return null;
  const index = getCurrentSlotIndex(editor, info.slots);
  if (index < 0) return null;
  if (index === 0) return "left";
  return index === info.slots.length - 1 ? "right" : "middle";
};

const segmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;

const nextGraphemeLength = (text: string, offset: number) => {
  if (!segmenter) return 1;
  for (const { segment } of segmenter.segment(text.slice(offset))) return segment.length;
  return 1;
};

const previousGraphemeLength = (text: string, offset: number) => {
  if (!segmenter) return 1;
  let length = 1;
  for (const { segment } of segmenter.segment(text.slice(0, offset))) length = segment.length;
  return length;
};

/**
 * 左右键的两步移动：在边界处先逐个切换槽位，到达最外侧槽位后才按字符移动；
 * 移动后落到边界时停在来向一侧的槽位。返回 false 表示交给浏览器原生移动
 * （跨块、越过行内 void、或前后都不涉及边界）。
 */
export const moveCaret = (editor: Editor, reverse: boolean): boolean => {
  const { selection } = editor;
  if (!selection || !Range.isCollapsed(selection)) return false;
  const info = getCaretSlots(editor, selection.anchor);
  if (!info) return false;
  const { slots } = info;
  const index = getCurrentSlotIndex(editor, slots);
  if (slots.length > 1 && index >= 0) {
    const next = reverse ? index - 1 : index + 1;
    if (next >= 0 && next < slots.length) {
      selectCaretSlot(editor, slots[next]);
      return true;
    }
  }

  const from = reverse ? info.start : info.end;
  const text = Node.leaf(editor, from.path).text;
  if (reverse ? from.offset <= 0 : from.offset >= text.length) return false;
  const target: Point = {
    path: from.path,
    offset: reverse
      ? from.offset - previousGraphemeLength(text, from.offset)
      : from.offset + nextGraphemeLength(text, from.offset),
  };
  const targetInfo = getCaretSlots(editor, target);
  if (!targetInfo) return false;
  if (slots.length < 2 && targetInfo.slots.length < 2) return false;
  const arrival = reverse ? targetInfo.slots[targetInfo.slots.length - 1] : targetInfo.slots[0];
  selectCaretSlot(editor, arrival);
  return true;
};
