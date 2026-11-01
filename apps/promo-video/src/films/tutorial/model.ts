/**
 * 教程片的迷你编辑器：按真实编辑器的规则把一串按键 / 点按重放成文档快照。
 * - 块快捷（行首记号 + 空格）同 header / blockquote / list 扩展的 insertText 行为，只认容器外的纯段落首个文本；
 * - 回车快捷（`---` / ```语言 / `$$`）同 divide-line / code-block / math 扩展的 insertBreak；
 * - 行内输入规则同 packages/editor/src/core/kit/inputRules.ts 的 matchInputRule（CommonMark 左右侧规则、`_` 词边界），
 *   转换单独成一个撤销步，撤销回到原始符号；
 * - 斜杠菜单同 core/plugins/withSlashCommands + core/hotkeys/slashCommand + useBlockPanelStore：`/` 打开、后续输入过滤、
 *   空格 / Esc 关闭、退格删到只剩 `/` 时关闭、↑↓ 循环、→ 进子菜单、回车插入并删掉 `/查询`；
 * - 块：容器内最后一个空段落回车退出（exitContainerOnEmptyParagraph）、表格 Tab / 回车 / ↓ 导航（table/commands.ts）、
 *   插入时空段落被替换、否则插到后面（setOrInsertNode）。
 * 纯 TS、不依赖 React，音效导出脚本也读它。
 */
import { filterSlash, type SlashItem } from "../../app-kit/doc/slashItems.ts";

export type Mark = "bold" | "italic" | "boldItalic" | "strike" | "highlight" | "code";
export type Leaf = { kind: "text"; text: string; mark?: Mark; formedAt?: number } | { kind: "math"; tex: string; formedAt: number };
export type Container = "quote" | "bullet" | "numbered" | "check";
export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;
export type CalloutType = "tip" | "info" | "note" | "danger" | "warning";
export type EmbedKind = "video" | "audio" | "board" | "database";

/** formedAt：由记号 / 菜单转成这个块的时刻（成型动效用）；toggledAt：勾选的时刻 */
export type Paragraph = { kind: "paragraph"; leaves: Leaf[]; container?: Container; checked?: boolean; formedAt?: number; toggledAt?: number };
export type Heading = { kind: "heading"; level: HeadingLevel; leaves: Leaf[]; formedAt: number };
export type TextBlock = Paragraph | Heading;

export type Block =
  | Paragraph
  | Heading
  | { kind: "divider"; formedAt: number }
  | { kind: "code"; lang: string; code: string; editing: boolean; formedAt: number }
  | { kind: "math"; tex: string; editing: boolean; formedAt: number }
  /** 提示块 / 详情块 / 高亮块：段落容器；title 为空时显示默认标题 */
  | { kind: "box"; variant: "callout" | "detail" | "highlight"; callout?: CalloutType; title: string; open: boolean; toggledAt?: number; children: Paragraph[]; formedAt: number }
  | { kind: "tabs"; titles: string[]; active: number; panes: Paragraph[][]; switchedAt?: number; formedAt: number }
  | { kind: "table"; cells: string[][]; formedAt: number }
  | { kind: "mermaid"; source: string; editing: boolean; doneAt?: number; formedAt: number }
  | { kind: "embed"; embed: EmbedKind; formedAt: number };

/** 斜杠菜单：query 为 `/` 之后的文字，path 为高亮路径（子菜单里是两级） */
export type Panel = { query: string; path: number[]; at: number };
/** 光标在哪：正文（最后一块的末尾）、提示 / 详情块的标题、表格某格 */
export type Focus = { kind: "body" } | { kind: "title" } | { kind: "cell"; row: number; col: number };
export type Doc = { blocks: Block[]; focus: Focus; panel?: Panel };

const MARK_RULES: { delimiter: string; mark: Mark | "math"; wordBoundary?: boolean }[] = [
  { delimiter: "***", mark: "boldItalic" },
  { delimiter: "**", mark: "bold" },
  { delimiter: "__", mark: "bold", wordBoundary: true },
  { delimiter: "~~", mark: "strike" },
  { delimiter: "==", mark: "highlight" },
  { delimiter: "$$", mark: "math" },
  { delimiter: "*", mark: "italic" },
  { delimiter: "_", mark: "italic", wordBoundary: true },
  { delimiter: "`", mark: "code" },
  { delimiter: "$", mark: "math" },
];
const TRIGGERS = new Set(MARK_RULES.map(r => r.delimiter[r.delimiter.length - 1]));
const WORD_CHAR = /[\p{L}\p{N}]/u;
const SPACE = /\s/;

/** 光标前文字里最近的一对合法定界符，返回规则与开头下标（逐行对照 matchInputRule） */
export function matchInline(before: string, after?: string) {
  for (const rule of MARK_RULES) {
    const { delimiter, wordBoundary } = rule;
    if (!before.endsWith(delimiter)) continue;
    const char = delimiter[0];
    const close = before.length - delimiter.length;
    const last = before[close - 1];
    if (last === undefined || last === char || last === "\\" || SPACE.test(last)) continue;
    if (wordBoundary && after !== undefined && WORD_CHAR.test(after)) continue;
    const latest = close - delimiter.length - 1;
    for (let start = latest >= 0 ? before.lastIndexOf(delimiter, latest) : -1; start >= 0; start = start > 0 ? before.lastIndexOf(delimiter, start - 1) : -1) {
      const first = before[start + delimiter.length];
      const outside = before[start - 1];
      if (first === char || SPACE.test(first)) continue;
      if (outside === char || outside === "\\") continue;
      if (wordBoundary && outside !== undefined && WORD_CHAR.test(outside)) continue;
      return { rule, start };
    }
  }
}

export const emptyParagraph = (container?: Container): Paragraph => ({ kind: "paragraph", leaves: [{ kind: "text", text: "" }], container, checked: container === "check" ? false : undefined });
export const emptyDoc = (): Doc => ({ blocks: [emptyParagraph()], focus: { kind: "body" } });

const lastBlock = (doc: Doc) => doc.blocks[doc.blocks.length - 1];
export const plainText = (leaves: Leaf[]) => leaves.map(l => (l.kind === "text" ? l.text : "")).join("");
const isEmptyParagraph = (p: TextBlock) => p.leaves.length === 1 && p.leaves[0].kind === "text" && p.leaves[0].text === "";

/** 正在输入的文本块：最后一块本身，或提示 / 详情 / 高亮块、标签页当前页里的最后一个段落 */
export function currentText(doc: Doc): TextBlock | undefined {
  const block = lastBlock(doc);
  if (block.kind === "paragraph" || block.kind === "heading") return block;
  if (block.kind === "box") return block.children[block.children.length - 1];
  if (block.kind === "tabs") {
    const pane = block.panes[block.active];
    return pane[pane.length - 1];
  }
}

/** 正在编辑的源码块（代码 / 公式 / 流程图） */
function currentSource(doc: Doc) {
  const block = lastBlock(doc);
  if ((block.kind === "code" || block.kind === "math" || block.kind === "mermaid") && block.editing) return block;
}

export const isEditingSource = (doc: Doc) => !!currentSource(doc);

export type Effect = { formed: boolean; undoPoint?: Doc };

function appendText(target: TextBlock, text: string) {
  let leaf = target.leaves[target.leaves.length - 1];
  if (leaf.kind !== "text" || leaf.mark) {
    leaf = { kind: "text", text: "" };
    target.leaves.push(leaf);
  }
  leaf.text += text;
  return leaf;
}

/** 键入一段文字（单个字符，或输入法上屏的一组字）；返回是否发生了转换，以及转换前的快照（撤销用） */
export function typeChar(doc: Doc, text: string, at: number): Effect {
  const block = lastBlock(doc);
  if (doc.focus.kind === "title" && block.kind === "box") {
    block.title += text;
    return { formed: false };
  }
  if (doc.focus.kind === "cell" && block.kind === "table") {
    block.cells[doc.focus.row][doc.focus.col] += text;
    return { formed: false };
  }
  const source = currentSource(doc);
  if (source) {
    if (source.kind === "code") source.code += text;
    else if (source.kind === "math") source.tex += text;
    else source.source += text;
    return { formed: false };
  }
  const target = currentText(doc);
  if (!target) return { formed: false };

  // 斜杠菜单：`/` 打开，后续输入写进查询，空格关闭（字照常进正文）
  if (doc.panel) {
    if (text === " ") doc.panel = undefined;
    else doc.panel = { ...doc.panel, query: doc.panel.query + text, path: [0] };
  } else if (text === "/") {
    doc.panel = { query: "", path: [0], at };
  }

  // 块快捷：容器外的纯段落、只有一个文本、光标前恰好是记号
  if (text === " " && target === block && block.kind === "paragraph" && !block.container && block.leaves.length === 1 && block.leaves[0].kind === "text" && !block.leaves[0].mark) {
    const raw = block.leaves[0].text;
    const heading = raw.match(/^#{1,6}$/);
    let next: Block | undefined;
    if (heading) next = { kind: "heading", level: heading[0].length as HeadingLevel, leaves: [{ kind: "text", text: "" }], formedAt: at };
    else if (raw === ">") next = { ...emptyParagraph("quote"), formedAt: at };
    else if (["-", "*", "+"].includes(raw)) next = { ...emptyParagraph("bullet"), formedAt: at };
    else if (/^\d+\.$/.test(raw)) next = { ...emptyParagraph("numbered"), formedAt: at };
    if (next) {
      doc.blocks[doc.blocks.length - 1] = next;
      return { formed: true };
    }
  }

  const leaf = appendText(target, text);
  if (!TRIGGERS.has(text) || leaf.kind !== "text") return { formed: false };
  const match = matchInline(leaf.text);
  if (!match) return { formed: false };
  const undoPoint = structuredClone(doc);
  const { rule, start } = match;
  const size = rule.delimiter.length;
  const prefix = leaf.text.slice(0, start);
  const content = leaf.text.slice(start + size, leaf.text.length - size);
  const replaced: Leaf[] = [];
  if (prefix) replaced.push({ kind: "text", text: prefix });
  replaced.push(rule.mark === "math" ? { kind: "math", tex: content, formedAt: at } : { kind: "text", text: content, mark: rule.mark, formedAt: at });
  replaced.push({ kind: "text", text: "" });
  target.leaves.splice(target.leaves.length - 1, 1, ...replaced);
  return { formed: true, undoPoint };
}

/** 退格：删掉正文最后一个字；斜杠菜单里删查询，删到只剩 `/` 时关闭 */
export function pressBackspace(doc: Doc) {
  const target = currentText(doc);
  const leaf = target?.leaves[target.leaves.length - 1];
  if (leaf?.kind === "text") leaf.text = [...leaf.text].slice(0, -1).join("");
  if (doc.panel) doc.panel = doc.panel.query ? { ...doc.panel, query: [...doc.panel.query].slice(0, -1).join(""), path: [0] } : undefined;
}

/** 当前菜单层级的条目（搜索时是过滤后的叶子，子菜单里是父条目的 children） */
export function panelLevels(panel: Panel) {
  const top = filterSlash(panel.query);
  const parent = panel.path.length > 1 ? top[panel.path[0]] : undefined;
  return { top, items: parent?.children ?? top, parent };
}

export function pressArrow(doc: Doc, direction: "up" | "down" | "left" | "right") {
  const panel = doc.panel;
  if (panel) {
    const { items } = panelLevels(panel);
    const depth = panel.path.length - 1;
    if (direction === "up" || direction === "down") {
      const path = [...panel.path];
      path[depth] = (path[depth] + (direction === "down" ? 1 : -1) + items.length) % items.length;
      doc.panel = { ...panel, path };
    } else if (direction === "right" && items[panel.path[depth]]?.children) {
      doc.panel = { ...panel, path: [...panel.path, 0] };
    } else if (direction === "left" && depth > 0) {
      doc.panel = { ...panel, path: panel.path.slice(0, -1) };
    }
    return;
  }
  if (direction !== "down") return;
  const block = lastBlock(doc);
  // ↓：在代码 / 公式源码末尾跳出、在表格最后一行跳出；后面没有块时补一个空段落（PreviewWithEditor 的 leaveSource、table 的 moveDown）
  if ((block.kind === "code" || block.kind === "math") && block.editing) {
    block.editing = false;
    doc.blocks.push(emptyParagraph());
  } else if (doc.focus.kind === "cell" && block.kind === "table") {
    if (doc.focus.row < block.cells.length - 1) doc.focus = { ...doc.focus, row: doc.focus.row + 1 };
    else {
      doc.focus = { kind: "body" };
      doc.blocks.push(emptyParagraph());
    }
  }
}

/** Tab：表格里到下一格，最后一格新增一行 */
export function pressTab(doc: Doc) {
  const block = lastBlock(doc);
  if (doc.focus.kind !== "cell" || block.kind !== "table") return;
  const { row, col } = doc.focus;
  const cols = block.cells[0].length;
  if (col < cols - 1) doc.focus = { kind: "cell", row, col: col + 1 };
  else {
    if (row === block.cells.length - 1) block.cells.push(Array(cols).fill(""));
    doc.focus = { kind: "cell", row: row + 1, col: 0 };
  }
}

export const pressEscape = (doc: Doc) => {
  doc.panel = undefined;
};

/** 回车：菜单里确认 / 进子菜单；表格到下一行；源码里换行（保持缩进）；整段是 `---` / ```语言 / `$$` 时转换；容器里最后一个空段落退出 */
export function pressEnter(doc: Doc, at: number): Effect {
  const block = lastBlock(doc);
  if (doc.panel) {
    const { items } = panelLevels(doc.panel);
    const item = items[doc.panel.path[doc.panel.path.length - 1]];
    if (item?.children) {
      doc.panel = { ...doc.panel, path: [...doc.panel.path, 0] };
      return { formed: false };
    }
    return { formed: item ? selectSlash(doc, item, at) : false };
  }
  if (doc.focus.kind === "cell" && block.kind === "table") {
    if (doc.focus.row === block.cells.length - 1) block.cells.push(Array(block.cells[0].length).fill(""));
    doc.focus = { ...doc.focus, row: doc.focus.row + 1 };
    return { formed: false };
  }
  const source = currentSource(doc);
  if (source) {
    const text = source.kind === "code" ? source.code : source.kind === "math" ? source.tex : source.source;
    const indent = text.split("\n").at(-1)?.match(/^\s*/)?.[0] ?? "";
    if (source.kind === "code") source.code += "\n" + indent;
    else if (source.kind === "math") source.tex += "\n" + indent;
    else source.source += "\n" + indent;
    return { formed: false };
  }
  if (block.kind === "paragraph" && !block.container && block.leaves.length === 1 && block.leaves[0].kind === "text" && !block.leaves[0].mark) {
    const text = block.leaves[0].text;
    if (text === "---") {
      doc.blocks.splice(doc.blocks.length - 1, 1, { kind: "divider", formedAt: at }, emptyParagraph());
      return { formed: true };
    }
    if (text.startsWith("```")) {
      doc.blocks[doc.blocks.length - 1] = { kind: "code", lang: text.slice(3).trim() || "javascript", code: "", editing: true, formedAt: at };
      return { formed: true };
    }
    if (text === "$$") {
      doc.blocks[doc.blocks.length - 1] = { kind: "math", tex: "", editing: true, formedAt: at };
      return { formed: true };
    }
  }
  if (block.kind === "box" || block.kind === "tabs") {
    const children = block.kind === "box" ? block.children : block.panes[block.active];
    const last = children[children.length - 1];
    if (isEmptyParagraph(last) && !last.container) {
      // 最后一个空段落回车：跳出容器（只剩它一个时整段移出）
      if (children.length > 1) children.pop();
      else children.splice(0, 1, emptyParagraph());
      doc.blocks.push(emptyParagraph());
      return { formed: false };
    }
    if (last.container && isEmptyParagraph(last)) last.container = undefined;
    else children.push(emptyParagraph(last.container));
    return { formed: false };
  }
  if (block.kind === "paragraph" && block.container && isEmptyParagraph(block)) {
    block.container = undefined;
    block.checked = undefined;
    return { formed: false };
  }
  doc.blocks.push(emptyParagraph(block.kind === "paragraph" ? block.container : undefined));
  return { formed: false };
}

const CALLOUTS: Record<string, CalloutType> = { 提示: "tip", 信息: "info", 笔记: "note", 危险: "danger", 警告: "warning" };

/** 在菜单里选中一项：删掉 `/查询`，按条目插入（空段落被替换，否则插到后面），返回是否插了东西 */
function selectSlash(doc: Doc, item: SlashItem, at: number): boolean {
  const target = currentText(doc);
  const leaf = target?.leaves[target.leaves.length - 1];
  if (leaf?.kind === "text" && doc.panel) leaf.text = [...leaf.text].slice(0, -(1 + [...doc.panel.query].length)).join("");
  doc.panel = undefined;
  const block = lastBlock(doc);
  const top = block.kind === "paragraph" && target === block && !block.container;
  const place = (next: Block) => {
    if (top && isEmptyParagraph(block)) doc.blocks[doc.blocks.length - 1] = next;
    else doc.blocks.push(next);
  };
  const heading = item.title.match(/^标题(\d)$/);
  if (heading && target) {
    Object.assign(target, { kind: "heading", level: Number(heading[1]) as HeadingLevel, formedAt: at, container: undefined });
    return true;
  }
  const containers: Record<string, Container> = { 无序列表: "bullet", 有序列表: "numbered", 任务列表: "check", 引用块: "quote" };
  const container = containers[item.title];
  if (container && target?.kind === "paragraph") {
    Object.assign(target, { container, checked: container === "check" ? false : undefined, formedAt: at });
    return true;
  }
  const box = (variant: "callout" | "detail" | "highlight", callout?: CalloutType): Block => ({ kind: "box", variant, callout, title: "", open: true, children: [emptyParagraph()], formedAt: at });
  if (item.title === "表格") {
    place({ kind: "table", cells: [0, 1, 2].map(() => ["", "", ""]), formedAt: at });
    doc.focus = { kind: "cell", row: 0, col: 0 };
  } else if (item.title === "标签页") place({ kind: "tabs", titles: ["Tab 1"], active: 0, panes: [[emptyParagraph()]], formedAt: at });
  else if (item.title === "详情块") place(box("detail"));
  else if (item.title === "高亮块") place(box("highlight"));
  else if (CALLOUTS[item.title]) place(box("callout", CALLOUTS[item.title]));
  else if (item.title === "流程图") place({ kind: "mermaid", source: "", editing: true, formedAt: at });
  else if (item.title === "分割线") {
    place({ kind: "divider", formedAt: at });
    doc.blocks.push(emptyParagraph());
  } else if (item.title === "代码块") place({ kind: "code", lang: "javascript", code: "", editing: true, formedAt: at });
  else if (item.title === "数学公式") place({ kind: "math", tex: "", editing: true, formedAt: at });
  else return false;
  return true;
}

/** 点按的目标：check(第几项) / tab-add / tab(第几页) / detail-title / detail-body / detail-arrow / mermaid-done */
export type ClickTarget = { target: "check" | "tab" | "tab-add" | "detail-title" | "detail-body" | "detail-arrow" | "mermaid-done"; item?: number };

/** 点一下：改文档，返回画面里被点的元素（data-hit，渲染层按它量坐标） */
export function click(doc: Doc, { target, item = 0 }: ClickTarget, at: number): string {
  const lastOf = (kind: Block["kind"]) => doc.blocks.findLastIndex(b => b.kind === kind);
  if (target === "check") {
    const end = doc.blocks.findLastIndex(b => b.kind === "paragraph" && b.container === "check");
    let start = end;
    while (start > 0 && (doc.blocks[start - 1] as Paragraph).container === "check") start--;
    const p = doc.blocks[start + item] as Paragraph;
    p.checked = !p.checked;
    p.toggledAt = at;
    return `check:${start + item}`;
  }
  if (target === "tab" || target === "tab-add") {
    const index = lastOf("tabs");
    const tabs = doc.blocks[index] as Extract<Block, { kind: "tabs" }>;
    if (target === "tab-add") {
      tabs.titles.push("Tab" + (tabs.titles.length + 1));
      tabs.panes.push([emptyParagraph()]);
      tabs.active = tabs.titles.length - 1;
    } else tabs.active = item;
    tabs.switchedAt = at;
    return target === "tab-add" ? `tab-add:${index}` : `tab:${index}:${item}`;
  }
  if (target === "mermaid-done") {
    const index = lastOf("mermaid");
    const block = doc.blocks[index] as Extract<Block, { kind: "mermaid" }>;
    block.editing = false;
    block.doneAt = at;
    return `mermaid-done:${index}`;
  }
  const index = doc.blocks.findLastIndex(b => b.kind === "box" && b.variant === "detail");
  const detail = doc.blocks[index] as Extract<Block, { kind: "box" }>;
  if (target === "detail-title") doc.focus = { kind: "title" };
  else if (target === "detail-body") doc.focus = { kind: "body" };
  else {
    detail.open = !detail.open;
    detail.toggledAt = at;
  }
  return `${target}:${index}`;
}

/** 文末追加一个嵌入块（视频 / 音频 / 白板 / 数据库视图的成品样子） */
export function appendEmbed(doc: Doc, embed: EmbedKind, at: number) {
  const block = lastBlock(doc);
  const next: Block = { kind: "embed", embed, formedAt: at };
  if (block.kind === "paragraph" && !block.container && isEmptyParagraph(block)) doc.blocks[doc.blocks.length - 1] = next;
  else doc.blocks.push(next);
}

/**
 * 光标所在的「行」，与渲染层的 data-anchor 一一对应，镜头在相邻两行之间缓动：
 * 块序号 + 子位置（代码 / 公式的行号、提示块里第几段、表格第几行、标签页第几页第几段）。
 */
export function caretAnchor(doc: Doc) {
  const index = doc.blocks.length - 1;
  const block = doc.blocks[index];
  if (doc.focus.kind === "title") return `${index}:title`;
  if (doc.focus.kind === "cell") return `${index}:r${doc.focus.row}`;
  switch (block.kind) {
    case "code":
      return `${index}:${block.code.split("\n").length - 1}`;
    case "math":
      return `${index}:${block.tex.split("\n").length - 1}`;
    case "mermaid":
      return block.editing ? `${index}:${block.source.split("\n").length - 1}` : `${index}:0`;
    case "box":
      return `${index}:c${block.children.length - 1}`;
    case "tabs":
      return `${index}:p${block.active}:${block.panes[block.active].length - 1}`;
    default:
      return `${index}:0`;
  }
}
