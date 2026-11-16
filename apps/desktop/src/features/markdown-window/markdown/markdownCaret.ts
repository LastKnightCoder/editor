import { Element, Text, type Descendant, type Path, type Point } from "slate";

interface Group {
  start: number;
  end: number;
  type: string;
  text?: string;
}

function logicalChildren(nodes: Descendant[]): Group[] {
  const groups: Group[] = [];
  for (let index = 0; index < nodes.length;) {
    const node = nodes[index];
    if (!Text.isText(node)) {
      groups.push({ start: index, end: index + 1, type: node.type });
      index++;
      continue;
    }
    const start = index;
    let text = "";
    while (Text.isText(nodes[index])) {
      text += (nodes[index] as Text).text;
      index++;
    }
    if (text) groups.push({ start, end: index, type: "text", text });
  }
  return groups;
}

function textEdge(node: Descendant, path: Path, end: boolean): Point | null {
  if (Text.isText(node)) return { path, offset: end ? node.text.length : 0 };
  const index = end ? node.children.length - 1 : 0;
  const child = node.children[index];
  return child ? textEdge(child, [...path, index], end) : null;
}

/** 源码导入和 Slate 规范化后的空落点与文本叶可能不同，按同级内容换算。 */
export function translateCaret(from: Descendant[], to: Descendant[], point: Point): Point | null {
  const path: Path = [];
  for (const index of point.path) {
    const original = from[index];
    if (!original) return null;
    const source = logicalChildren(from);
    const destination = logicalChildren(to);
    const sourceIndex = source.findIndex(group => index >= group.start && index < group.end);
    if (sourceIndex < 0) {
      if (source.length === 0 && Text.isText(to[index]))
        return { path: [...path, index], offset: 0 };
      const next = source.findIndex(group => group.start > index);
      const before = next !== 0;
      const peer = destination[next < 0 ? source.length - 1 : before ? next - 1 : next];
      if (!peer) return null;
      const edge = before ? peer.end - 1 : peer.start;
      return textEdge(to[edge], [...path, edge], before);
    }
    const fromGroup = source[sourceIndex];
    const toGroup = destination[sourceIndex];
    if (!toGroup || fromGroup.type !== toGroup.type || fromGroup.text !== toGroup.text) return null;
    if (Text.isText(original)) {
      let offset = point.offset;
      for (let previous = fromGroup.start; previous < index; previous++)
        offset += (from[previous] as Text).text.length;
      for (let leaf = toGroup.start; leaf < toGroup.end; leaf++) {
        const length = (to[leaf] as Text).text.length;
        if ((length && offset <= length) || leaf === toGroup.end - 1)
          return { path: [...path, leaf], offset: Math.min(offset, length) };
        offset -= length;
      }
      return null;
    }
    const target = to[toGroup.start];
    if (!Element.isElement(target)) return null;
    path.push(toGroup.start);
    from = original.children;
    to = target.children;
  }
  return { path, offset: point.offset };
}

export function scrollRichCaretIntoView(
  target: HTMLElement,
  container: HTMLElement | null,
  range?: globalThis.Range
) {
  for (let el = target.parentElement; el; el = el.parentElement) {
    const style = getComputedStyle(el);
    const scrollX = el.scrollWidth > el.clientWidth && /auto|scroll/.test(style.overflowX);
    const scrollY =
      el === container ||
      (el.scrollHeight > el.clientHeight && /auto|scroll/.test(style.overflowY));
    if (scrollX || scrollY) {
      const caret = range?.getBoundingClientRect?.();
      const rect = caret?.height ? caret : target.getBoundingClientRect();
      const bounds = el.getBoundingClientRect();
      const margin = el === container ? Math.min(128, el.clientHeight / 4) : 12;
      const top = bounds.top + el.clientTop + margin;
      const bottom = bounds.top + el.clientTop + el.clientHeight - margin;
      const left = bounds.left + el.clientLeft + 12;
      const right = bounds.left + el.clientLeft + el.clientWidth - 12;
      if (scrollY) {
        if (el === container && (rect.top < top || rect.bottom > bottom))
          el.scrollTop += (rect.top + rect.bottom - top - bottom) / 2;
        else if (rect.top < top) el.scrollTop += rect.top - top;
        else if (rect.bottom > bottom) el.scrollTop += rect.bottom - bottom;
      }
      if (scrollX) {
        if (rect.left < left) el.scrollLeft += rect.left - left;
        else if (rect.right > right) el.scrollLeft += rect.right - right;
      }
    }
    if (el === container) break;
  }
}

export function getCodeCaretRange(input: HTMLTextAreaElement): globalThis.Range | undefined {
  const measure = input.closest(".ed-code-overlay")?.querySelector("pre.code-block-shiki-measure");
  const text = measure?.firstChild;
  if (!(text instanceof globalThis.Text) || input.selectionStart > text.length) return;
  const range = input.ownerDocument.createRange();
  range.setStart(text, input.selectionStart);
  range.collapse(true);
  return range;
}
