import type { Descendant, Editor, Node } from "slate";

export const CONTENT_FRAGMENT_MIME = "application/x-tau-content";
const CONTENT_FRAGMENT_ATTRIBUTE = "data-tau-content-fragment";

interface ContentFragmentTransfer {
  documentKey(): string;
  flushInputs(): void;
  serialize(nodes: readonly Node[]): string;
  prepare(fragment: string, signal?: AbortSignal): Promise<Descendant[] | undefined>;
  flushWrites?(): Promise<void> | undefined;
}

const transfers = new WeakMap<Editor, ContentFragmentTransfer>();

export function setContentFragmentTransfer(
  editor: Editor,
  transfer: ContentFragmentTransfer
): void {
  transfers.set(editor, transfer);
}

export const contentFragmentTransferOf = (editor: Editor) => transfers.get(editor);

export function attachContentFragment(element: HTMLElement, fragment: string): void {
  element.setAttribute(CONTENT_FRAGMENT_ATTRIBUTE, fragment);
}

export function readContentFragment(data: DataTransfer): string | undefined {
  const fragment = data.getData(CONTENT_FRAGMENT_MIME);
  if (fragment) return fragment;
  // ClipboardItem 写入的自定义类型在系统粘贴事件里可能只剩 HTML。
  const html = data.getData("text/html");
  if (!html.includes(CONTENT_FRAGMENT_ATTRIBUTE)) return undefined;
  const template = document.createElement("template");
  template.innerHTML = html;
  return (
    template.content
      .querySelector(`[${CONTENT_FRAGMENT_ATTRIBUTE}][data-slate-fragment]`)
      ?.getAttribute(CONTENT_FRAGMENT_ATTRIBUTE) ?? undefined
  );
}
