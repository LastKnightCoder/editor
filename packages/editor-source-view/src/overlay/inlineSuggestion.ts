import { useLayoutEffect, useMemo, useRef, useSyncExternalStore, type RefObject } from "react";
import { createInlineSuggestionController, type InlineSuggestionProvider } from "@tau/editor/api";
import type { EditorTextField } from "@tau/editor/api";

const emptyPreview = () => null;
const noSubscription = () => () => undefined;
const MAX_SOURCE_LENGTH = 32_768;

export function useSourceInlineSuggestion(
  inputRef: RefObject<HTMLTextAreaElement | null>,
  field: EditorTextField | null | undefined,
  provider: InlineSuggestionProvider | undefined,
  language: string
) {
  const composing = useRef(false);
  const controller = useMemo(() => {
    if (!field || !provider) return undefined;
    const current = () => {
      const input = inputRef.current;
      if (
        !input ||
        input.ownerDocument.activeElement !== input ||
        input.readOnly ||
        composing.current ||
        input.selectionStart !== input.selectionEnd
      )
        return null;
      const { value, revision } = field.getSnapshot();
      if (input.value !== value || value.length > MAX_SOURCE_LENGTH) return null;
      return { input, value, revision, offset: input.selectionStart };
    };
    return createInlineSuggestionController(
      {
        capture() {
          const position = current();
          if (!position) return null;
          const { value, revision, offset } = position;
          return {
            stamp: { revision, offset },
            context: {
              before: value.slice(Math.max(0, offset - 512), offset),
              after: value.slice(offset, offset + 512),
              language: (language || "text").slice(0, 40),
            },
          };
        },
        isCurrent(stamp) {
          const position = current();
          return position?.revision === stamp.revision && position.offset === stamp.offset;
        },
        tryInsert(stamp, text) {
          const position = current();
          if (!position || position.revision !== stamp.revision || position.offset !== stamp.offset)
            return false;
          try {
            field.edit(
              { offset: stamp.offset, remove: 0, text, revision: stamp.revision },
              { isolateUndo: true }
            );
          } catch {
            // 字段失效或权限收回后，让原有按键处理接管。
            return false;
          }
          const cursor = stamp.offset + text.length;
          position.input.setSelectionRange(cursor, cursor);
          return true;
        },
      },
      provider
    );
  }, [inputRef, field, provider, language]);

  useLayoutEffect(() => {
    if (!controller || !field) return;
    const stop = field.subscribe(controller.revalidate);
    const view = inputRef.current?.ownerDocument.defaultView;
    view?.addEventListener("blur", controller.clear);
    return () => {
      stop();
      view?.removeEventListener("blur", controller.clear);
      controller.clear();
      composing.current = false;
    };
  }, [controller, field, inputRef]);

  return {
    controller,
    preview: useSyncExternalStore(
      controller?.subscribe ?? noSubscription,
      controller?.getSnapshot ?? emptyPreview,
      emptyPreview
    ),
    composing,
  };
}

/** 高亮异步更新，只有高亮层与字段内容完全一致时才插入预览锚点。 */
export function codeWithSuggestionAnchor(
  html: string,
  value: string,
  offset: number
): string | null {
  const template = document.createElement("template");
  template.innerHTML = html;
  const code = template.content.querySelector("code");
  if (!code || code.textContent !== value) return null;
  const ghost = document.createElement("span");
  ghost.className = "code-block-inline-suggestion";
  const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text;
    if (remaining < text.length || (remaining === text.length && offset === value.length)) {
      const tail = text.splitText(remaining);
      tail.before(ghost);
      return template.innerHTML;
    }
    remaining -= text.length;
  }
  if (remaining !== 0) return null;
  code.append(ghost);
  return template.innerHTML;
}
