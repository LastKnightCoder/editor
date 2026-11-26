import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { YjsEditor } from "@slate-yjs/core";
import {
  Transforms,
  type Editor as SlateEditor,
  type Descendant,
  type Element,
  type Range,
} from "slate";
import { ReactEditor } from "slate-react";
import {
  Editor,
  type EditorDocument,
  type EditorKit,
  type EditorProps,
  type EditorRef,
} from "@tau/editor";
import { cn, ErrorBoundary } from "@tau/ui";
import { invoke, isElectron, off, on } from "@/electron";
import { estimatedBlockHeight, initialBlockCount, type MarkdownViewport } from "./markdownViewport";
import { createMarkdownClipboard } from "./markdownClipboard";
import { useMarkdownDragSelection } from "./useMarkdownDragSelection";

import { MarkdownBodyLabel } from "./MarkdownFileChrome";

function ViewportBlock({
  viewport,
  id,
  initiallyMounted,
  element,
  children,
}: {
  viewport: MarkdownViewport;
  id: string;
  initiallyMounted: boolean;
  element: Element;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const initial = useRef(initiallyMounted).current;
  const subscribe = useCallback(
    (listener: () => void) => viewport.subscribe(id, listener),
    [viewport, id]
  );
  const mounted = useSyncExternalStore(subscribe, () => viewport.isMounted(id, initial));
  useLayoutEffect(() => {
    if (ref.current) return viewport.register(id, ref.current, initial);
  }, [viewport, id, initial]);

  return (
    <div
      ref={ref}
      className="flow-root"
      data-markdown-viewport-block={mounted ? "mounted" : "spacer"}
      contentEditable={mounted ? undefined : false}
      aria-hidden={mounted ? undefined : true}
      style={mounted ? undefined : { height: viewport.height(id) ?? estimatedBlockHeight(element) }}
      onFocus={() => viewport.setFocus(id, true)}
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) viewport.setFocus(id, false);
      }}
    >
      {mounted ? children : null}
    </div>
  );
}

export function MarkdownViewportSurface({
  kit,
  document,
  content,
  editorRef,
  scrollEl,
  suspended,
  viewport,
  onReadyChange,
}: {
  kit: EditorKit;
  document: EditorDocument;
  content: readonly Descendant[];
  editorRef: RefObject<EditorRef | null>;
  scrollEl: HTMLElement | null;
  suspended: boolean;
  viewport: MarkdownViewport;
  onReadyChange(ready: boolean): void;
}) {
  const bodyLabelId = useId();
  const [firstCount] = useState(() => initialBlockCount(content, scrollEl?.clientHeight ?? 800));
  const [editor, setEditor] = useState<SlateEditor | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [accessible, setAccessible] = useState(false);
  const accessibilityCaret = useRef<{
    editor: SlateEditor;
    selection: Range;
    root: HTMLElement;
  } | null>(null);
  const [needsEarlyObserver, setNeedsEarlyObserver] = useState(false);
  useMarkdownDragSelection(editor, scrollEl, viewport, ready && !suspended);
  useEffect(() => {
    if (!isElectron) return;
    let current = true;
    let eventReceived = false;
    const apply = (enabled: boolean) => {
      const currentEditor = editorRef.current?.getEditor();
      if (currentEditor) {
        try {
          const root = ReactEditor.toDOMNode(currentEditor, currentEditor);
          if (root.ownerDocument.activeElement === root) {
            const native = root.ownerDocument.getSelection();
            const selection =
              (native?.anchorNode &&
                ReactEditor.toSlateRange(currentEditor, native, {
                  exactMatch: false,
                  suppressThrow: true,
                })) ||
              currentEditor.selection;
            if (selection) accessibilityCaret.current = { editor: currentEditor, selection, root };
          }
        } catch {
          // 源码视图可能正在替换有焦点的 DOM。
        }
      }
      viewport.setFullDocument(enabled);
      setAccessible(enabled);
    };
    const update = (_event: unknown, enabled: boolean) => {
      eventReceived = true;
      apply(enabled);
    };
    on("markdown-window:accessibility-changed", update);
    void invoke<boolean>("markdown-window:accessibility")
      .then(enabled => {
        if (current && !eventReceived) apply(enabled);
      })
      .catch(() => {
        if (current && !eventReceived) apply(true);
      });
    return () => {
      current = false;
      off("markdown-window:accessibility-changed", update);
    };
  }, [viewport, editorRef]);

  useLayoutEffect(() => {
    const pending = accessibilityCaret.current;
    accessibilityCaret.current = null;
    if (!pending || pending.editor !== editor || suspended) return;
    const frame = requestAnimationFrame(() => {
      const { root, selection } = pending;
      const { activeElement, body } = root.ownerDocument;
      if (!root.isConnected || (activeElement !== root && activeElement !== body)) return;
      try {
        Transforms.select(editor, selection);
        if (activeElement !== root) ReactEditor.focus(editor);
        const [anchor, anchorOffset] = ReactEditor.toDOMPoint(editor, selection.anchor);
        const [focus, focusOffset] = ReactEditor.toDOMPoint(editor, selection.focus);
        root.ownerDocument
          .getSelection()
          ?.setBaseAndExtent(anchor, anchorOffset, focus, focusOffset);
      } catch {
        // 文件可能已替换，交还给当前编辑会话决定光标。
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [accessible, editor, suspended]);
  const extensions = useMemo(() => [createMarkdownClipboard(viewport, kit)], [kit, viewport]);

  useEffect(() => {
    if (!scrollEl || suspended) return;
    if (needsEarlyObserver) return viewport.observe(scrollEl);
    if (!ready) return;
    let stop: (() => void) | undefined;
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        stop = viewport.observe(scrollEl);
      });
    });
    return () => {
      cancelAnimationFrame(frame);
      stop?.();
    };
  }, [viewport, scrollEl, suspended, ready, needsEarlyObserver]);

  useLayoutEffect(() => {
    if (!editor || ready || failed) return;
    let frame = 0;
    const check = () => {
      const first = editor.children[0];
      if (first && YjsEditor.isYjsEditor(editor) && YjsEditor.connected(editor)) {
        try {
          if (ReactEditor.toDOMNode(editor, first).isConnected) {
            const root = ReactEditor.toDOMNode(editor, editor);
            const spacer = root.querySelector('[data-markdown-viewport-block="spacer"]');
            if (
              !spacer ||
              !scrollEl ||
              suspended ||
              spacer.getBoundingClientRect().top >= scrollEl.getBoundingClientRect().bottom
            ) {
              setReady(true);
              return;
            }
            setNeedsEarlyObserver(true);
          }
        } catch {
          // 文档已绑定，等真实首块的 DOM 提交。
        }
      }
      frame = requestAnimationFrame(check);
    };
    check();
    return () => cancelAnimationFrame(frame);
  }, [editor, ready, failed, scrollEl, suspended]);

  useLayoutEffect(() => onReadyChange(ready || failed), [ready, failed, onReadyChange]);

  const renderTopLevelBlock = useCallback<NonNullable<EditorProps["renderTopLevelBlock"]>>(
    ({ editor, element, index, children }) => (
      <ViewportBlock
        viewport={viewport}
        id={ReactEditor.findKey(editor, element).id}
        element={element}
        initiallyMounted={index < firstCount}
      >
        {children}
      </ViewportBlock>
    ),
    [viewport, firstCount]
  );

  const onKeyDownCapture = (event: KeyboardEvent<HTMLDivElement>) => {
    if (
      !editor ||
      !(event.target instanceof HTMLElement) ||
      !event.target.matches('[data-slate-editor="true"]')
    )
      return;
    const mod = event.metaKey || event.ctrlKey;
    const last = editor.children.length - 1;
    if (mod && event.key.toLowerCase() === "a") {
      viewport.prepare(editor, [0, last]);
    } else if (
      (event.metaKey && ["ArrowUp", "ArrowDown"].includes(event.key)) ||
      (event.ctrlKey && ["Home", "End"].includes(event.key))
    ) {
      viewport.prepare(editor, [event.key === "ArrowUp" || event.key === "Home" ? 0 : last]);
    } else if (
      event.key.startsWith("Arrow") ||
      event.key === "Backspace" ||
      event.key === "Delete"
    ) {
      const index = editor.selection?.focus.path[0];
      if (index !== undefined) viewport.prepare(editor, [index - 1, index + 1]);
    }
  };

  return (
    <div
      data-markdown-full-editor={ready ? "ready" : "preparing"}
      data-markdown-viewport="true"
      className={cn(accessible && "[&_[data-slate-chunk]]:[content-visibility:visible]!")}
      aria-busy={!ready && !failed}
      onKeyDownCapture={onKeyDownCapture}
    >
      <MarkdownBodyLabel id={bodyLabelId} />
      <ErrorBoundary onError={() => setFailed(true)}>
        <div className={cn(!ready && "invisible")} inert={ready ? undefined : true}>
          <Editor
            kit={kit}
            extensions={extensions}
            ref={editorRef}
            document={document}
            readonly={suspended}
            ariaLabelledBy={bodyLabelId}
            onInit={setEditor}
            renderTopLevelBlock={renderTopLevelBlock}
            onSelectionChange={() => {
              if (editor) viewport.updateSelection(editor);
            }}
          />
        </div>
      </ErrorBoundary>
    </div>
  );
}
