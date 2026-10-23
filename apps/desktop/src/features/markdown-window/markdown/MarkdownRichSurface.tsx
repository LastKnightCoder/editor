import {
  startTransition,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { type Descendant, type Editor as SlateEditor } from "slate";
import { ReactEditor } from "slate-react";
import { Editor, type EditorDocument, type EditorKit, type EditorRef } from "@tau/editor";
import { cn, ErrorBoundary } from "@tau/ui";
import { firstScreenContent, isolatePreviewContent, needsFirstScreen } from "./firstScreen";

export interface RichSurfaceState {
  prepared: boolean;
  preview: boolean;
}
interface ReadingAnchor {
  index: number;
  top: number;
}

function readingAnchor(
  editor: SlateEditor | undefined,
  scrollEl: HTMLElement | null
): ReadingAnchor | null {
  if (!editor || !scrollEl) return null;
  const edge = scrollEl.getBoundingClientRect().top + scrollEl.clientTop;
  for (let index = 0; index < editor.children.length; index++) {
    try {
      const rect = ReactEditor.toDOMNode(editor, editor.children[index]).getBoundingClientRect();
      if (rect.bottom >= edge) return { index, top: rect.top };
    } catch {
      return null;
    }
  }
  return null;
}

export function MarkdownRichSurface({
  kit,
  document: editorDocument,
  content,
  editorRef,
  scrollEl,
  suspended,
  onStateChange,
}: {
  kit: EditorKit;
  document: EditorDocument;
  content: readonly Descendant[];
  editorRef: RefObject<EditorRef | null>;
  scrollEl: HTMLElement | null;
  suspended: boolean;
  onStateChange(state: RichSurfaceState): void;
}) {
  const previewId = useId();
  const previewScope = `preview-${previewId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const [deferred] = useState(
    () => needsFirstScreen(content) && firstScreenContent(content).length > 0
  );
  const [mountRich, setMountRich] = useState(!deferred);
  const [prepared, setPrepared] = useState(!deferred);
  const [handedOff, setHandedOff] = useState(!deferred);
  const [anchorRestored, setAnchorRestored] = useState(!deferred);
  const [boundEditor, setBoundEditor] = useState<SlateEditor | null>(null);
  const previewRef = useRef<EditorRef>(null);
  const previewRoot = useRef<HTMLDivElement>(null);
  const anchor = useRef<ReadingAnchor | null>(null);
  const pointerDown = useRef(false);
  const preview = useMemo(
    () =>
      handedOff
        ? []
        : isolatePreviewContent(firstScreenContent(content), previewScope, type =>
            kit.assembly.hasElement(type)
          ),
    [content, handedOff, previewScope, kit.assembly]
  );
  const revision = useMemo(() => JSON.stringify(preview), [preview]);
  const onInit = useCallback((editor: SlateEditor) => setBoundEditor(editor), []);
  const onError = useCallback(() => setPrepared(true), []);

  useEffect(
    () => onStateChange({ prepared, preview: !handedOff }),
    [prepared, handedOff, onStateChange]
  );

  useEffect(() => {
    if (mountRich) return;
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => startTransition(() => setMountRich(true)));
    });
    return () => cancelAnimationFrame(frame);
  }, [mountRich]);

  useEffect(() => {
    if (prepared || !boundEditor) return;
    let frame = 0,
      settled = 0;
    const check = () => {
      const first = boundEditor.children[0],
        last = boundEditor.children.at(-1);
      try {
        if (
          !first ||
          !last ||
          boundEditor.children.length < content.length ||
          !ReactEditor.toDOMNode(boundEditor, first).isConnected ||
          !ReactEditor.toDOMNode(boundEditor, last).isConnected
        )
          settled = 0;
        else settled++;
      } catch {
        settled = 0;
      }
      if (settled >= 2) setPrepared(true);
      else frame = requestAnimationFrame(check);
    };
    frame = requestAnimationFrame(check);
    return () => cancelAnimationFrame(frame);
  }, [prepared, boundEditor, content.length]);

  useEffect(() => {
    if (handedOff) return;
    const down = () => {
      pointerDown.current = true;
    };
    const up = () => {
      pointerDown.current = false;
    };
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", up, true);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", up, true);
    };
  }, [handedOff]);

  useEffect(() => {
    if (!prepared || handedOff || suspended) return;
    let frame = 0;
    const attempt = () => {
      frame = 0;
      const root = previewRoot.current,
        selection = window.getSelection();
      const selecting =
        selection &&
        !selection.isCollapsed &&
        (root?.contains(selection.anchorNode) || root?.contains(selection.focusNode));
      if (pointerDown.current || selecting || root?.contains(document.activeElement)) return;
      anchor.current = readingAnchor(previewRef.current?.getEditor(), scrollEl);
      setHandedOff(true);
    };
    const request = () => {
      if (!frame) frame = requestAnimationFrame(attempt);
    };
    const down = () => {
      pointerDown.current = true;
    };
    const up = () => {
      pointerDown.current = false;
      request();
    };
    request();
    document.addEventListener("selectionchange", request);
    document.addEventListener("focusin", request);
    document.addEventListener("focusout", request);
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", up, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("selectionchange", request);
      document.removeEventListener("focusin", request);
      document.removeEventListener("focusout", request);
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", up, true);
    };
  }, [prepared, handedOff, suspended, scrollEl]);

  useLayoutEffect(() => {
    if (!handedOff || anchorRestored) return;
    const saved = anchor.current;
    anchor.current = null;
    const editor = editorRef.current?.getEditor(),
      node = saved && editor?.children[saved.index];
    if (editor && node && saved && scrollEl)
      try {
        const difference =
          ReactEditor.toDOMNode(editor, node).getBoundingClientRect().top - saved.top;
        if (Number.isFinite(difference)) scrollEl.scrollTop += difference;
      } catch {
        /* 未知块没有锚点时保持当前滚动位置。 */
      }
    const frame = requestAnimationFrame(() => setAnchorRestored(true));
    return () => cancelAnimationFrame(frame);
  }, [handedOff, anchorRestored, scrollEl, editorRef]);

  return (
    <div
      className={cn("relative", !anchorRestored && "[overflow-anchor:none]")}
      aria-busy={!handedOff}
    >
      <div
        ref={previewRoot}
        className={cn(handedOff && "hidden")}
        data-markdown-first-screen={!handedOff ? "true" : undefined}
      >
        {!handedOff && (
          <ErrorBoundary
            fallback={<div className="text-tau-meta text-ink-3 py-3">正在准备正文…</div>}
          >
            <Editor key={revision} kit={kit} ref={previewRef} initValue={preview} readonly />
          </ErrorBoundary>
        )}
      </div>
      <div
        data-markdown-full-editor={handedOff ? "ready" : "preparing"}
        data-markdown-prepared={prepared ? "true" : undefined}
        inert={!handedOff ? true : undefined}
        aria-hidden={!handedOff ? true : undefined}
        className={cn(!handedOff && "invisible absolute inset-x-0 top-0 h-0 overflow-hidden")}
      >
        {mountRich && (
          <ErrorBoundary onError={onError}>
            <Editor
              kit={kit}
              ref={editorRef}
              document={editorDocument}
              readonly={suspended}
              onInit={onInit}
            />
          </ErrorBoundary>
        )}
      </div>
    </div>
  );
}
