import { useLayoutEffect, useMemo, useSyncExternalStore } from "react";
import type { CompositionEvent, KeyboardEvent } from "react";
import type { Editor, NodeEntry } from "slate";
import { ReactEditor } from "slate-react";
import { submissionScopeSignal } from "../kit/submissionScope";
import { createInlineSuggestionController, type InlineSuggestionProvider } from "./controller";
import { createSlateSuggestionPort, decorateInlineSuggestion } from "./slateAdapter";

function isPlainKey(event: KeyboardEvent<HTMLDivElement>, key: string) {
  return (
    event.key === key &&
    event.target === event.currentTarget &&
    !event.defaultPrevented &&
    !event.nativeEvent.isComposing &&
    event.keyCode !== 229 &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey
  );
}

function bindSuggestion(editor: Editor, provider: InlineSuggestionProvider) {
  const controller = createInlineSuggestionController(createSlateSuggestionPort(editor), provider);
  let input: string | null = null;
  let expires: ReturnType<typeof setTimeout> | undefined;

  const clearInput = () => {
    input = null;
    clearTimeout(expires);
  };
  const clear = () => {
    clearInput();
    controller.clear();
  };

  const armInput = (text: string | null) => {
    clear();
    if (!text) return;
    input = text;
    expires = setTimeout(clearInput, 0);
  };

  return {
    getSnapshot: controller.getSnapshot,
    subscribe: controller.subscribe,
    revalidate: controller.revalidate,
    clear,
    onBeforeInput(event: InputEvent) {
      const typed =
        !event.isComposing &&
        (event.inputType === "insertText" || event.inputType === "insertFromComposition");
      armInput(typed ? event.data : null);
    },
    onCompositionEnd(event: CompositionEvent<HTMLDivElement>) {
      if (event.target === event.currentTarget) armInput(event.data);
    },
    acceptTab(event: KeyboardEvent<HTMLDivElement>) {
      if (isPlainKey(event, "Tab") && controller.accept()) event.preventDefault();
    },
    observeInsertText() {
      const insert = editor.insertText;
      let active = true;
      const observe: typeof insert = (text, options) => {
        const fromInput = text === input && !options?.at;
        if (fromInput) clearInput();
        // 远端投影使用 apply，不会消费本地 beforeinput 记号。
        const before = editor.children;
        const scope = submissionScopeSignal(editor);
        insert(text, options);
        const after = editor.children;
        if (fromInput && before !== after) {
          queueMicrotask(() => {
            if (active && editor.children === after && submissionScopeSignal(editor) === scope)
              controller.userInput();
          });
        }
      };
      editor.insertText = observe;
      const cancel = () => clear();
      const view = ReactEditor.toDOMNode(editor, editor).ownerDocument.defaultView;
      view?.addEventListener("blur", cancel);
      return () => {
        active = false;
        clear();
        view?.removeEventListener("blur", cancel);
        if (editor.insertText === observe) editor.insertText = insert;
      };
    },
    deferEscape(event: KeyboardEvent<HTMLDivElement>) {
      if (!isPlainKey(event, "Escape")) return false;
      controller.revalidate();
      const current = controller.getSnapshot();
      if (!current) return false;
      const native = event.nativeEvent;
      // 等宿主浮层处理同一个 Esc；未被消费时只关闭当时这条建议。
      setTimeout(() => {
        if (!native.defaultPrevented && !native.cancelBubble) controller.dismiss(current);
      }, 0);
      return true;
    },
  };
}

const noPreview = () => null;
const noSubscription = () => () => undefined;

export function useInlineSuggestion(editor: Editor, provider?: InlineSuggestionProvider) {
  const binding = useMemo(() => provider && bindSuggestion(editor, provider), [editor, provider]);
  const preview = useSyncExternalStore(
    binding?.subscribe ?? noSubscription,
    binding?.getSnapshot ?? noPreview,
    noPreview
  );

  useLayoutEffect(() => binding?.observeInsertText(), [binding]);

  return {
    binding,
    preview,
    decorate: useMemo(
      () => preview && ((entry: NodeEntry) => decorateInlineSuggestion(preview.stamp, entry)),
      [preview]
    ),
  };
}
