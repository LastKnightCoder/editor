import { lazy, Suspense, useEffect, useRef, useState, type PropsWithChildren } from "react";
import type { Editor as CodeMirror } from "codemirror";
import { useReadOnly, useSlateStatic } from "slate-react";
import { Button, PortalScope, PortalToBody, usePortalContainer } from "@tau/ui";
import {
  IElementEditingPolicy,
  ElementMenu,
  OverlayBackDismiss,
  captureElementSubmission,
} from "@tau/editor/api";
import { PreviewErrorContext, type PreviewError } from "./previewError";
import type { IPreviewWithEditorProps } from "./PreviewWithEditor";

const SourceCodeEditor = lazy(() => import("./SourceCodeEditor"));

/** 源码草稿只在保存时提交，取消与系统返回不会写入正文。 */
export function TouchPreviewWithEditor({
  element,
  initValue,
  onChange,
  mode,
  title,
  children,
}: PropsWithChildren<IPreviewWithEditorProps>) {
  const editor = useSlateStatic();
  const inheritedPortal = usePortalContainer();
  const [portal, setPortal] = useState<HTMLDivElement | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const editorReadOnly = useReadOnly();
  const readOnly =
    editorReadOnly || editor.tryGetService(IElementEditingPolicy)?.canEdit(element.type) === false;
  const [draft, setDraft] = useState<{ initial: string; value: string } | null>(null);
  const [error, setError] = useState<PreviewError | null>(null);
  const source = useRef<CodeMirror | null>(null);
  const submission = useRef<ReturnType<typeof captureElementSubmission> | null>(null);
  const close = () => {
    submission.current?.dispose();
    submission.current = null;
    source.current = null;
    setMenu(null);
    setDraft(null);
  };
  useEffect(
    () => () => {
      submission.current?.dispose();
      submission.current = null;
    },
    []
  );
  useEffect(() => {
    if (readOnly) close();
  }, [readOnly]);
  const conflict = draft !== null && initValue !== draft.initial;
  return (
    <div contentEditable={false} data-source-presentation="touch">
      <PreviewErrorContext.Provider value={setError}>{children}</PreviewErrorContext.Provider>
      {error && <p role="alert">{error.message}</p>}
      {!readOnly && (
        <Button
          onClick={() => {
            submission.current?.dispose();
            submission.current = captureElementSubmission(editor, { element });
            setDraft({ initial: initValue, value: initValue });
          }}
        >
          编辑{title}源码
        </Button>
      )}
      {!readOnly && (
        <Button
          variant="ghost"
          onClick={event => {
            const rect = event.currentTarget.getBoundingClientRect();
            setMenu({ x: rect.left, y: rect.bottom });
          }}
        >
          块操作
        </Button>
      )}
      <PortalScope>
        {menu && <ElementMenu element={element} position={menu} onClose={() => setMenu(null)} />}
      </PortalScope>
      <div ref={setPortal} className="contents" />
      <OverlayBackDismiss open={draft !== null} onDismiss={close} />
      {draft && (
        <PortalToBody container={portal ?? inheritedPortal}>
          <section
            role="dialog"
            aria-modal="true"
            aria-label={`${title}源码`}
            className="bg-page fixed inset-x-0 top-0 z-[400] flex flex-col p-4"
            style={{
              height: "var(--kb-viewport-height, 100dvh)",
              paddingTop: "max(1rem, env(safe-area-inset-top))",
              paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
            }}
          >
            <PortalScope>
              <header className="flex items-center justify-between gap-3 pb-3">
                <Button onClick={close}>取消</Button>
                <h2>{title}源码</h2>
                <Button
                  variant="primary"
                  disabled={readOnly || conflict}
                  onClick={() => {
                    if (readOnly || conflict || !submission.current) return;
                    submission.current.commit(() => {
                      onChange(source.current?.getValue() ?? draft.value);
                      return undefined;
                    });
                    close();
                  }}
                >
                  保存
                </Button>
              </header>
              {conflict && <p role="alert">正文源码已变化，请取消后重新打开。</p>}
              <div
                className="min-h-0 flex-1 overflow-auto"
                onKeyDown={event => {
                  if (event.key === "Escape" && !event.nativeEvent.isComposing) {
                    event.stopPropagation();
                    close();
                  }
                }}
              >
                <Suspense fallback={<p>正在加载源码编辑器…</p>}>
                  <SourceCodeEditor
                    mode={mode}
                    readOnly={readOnly || conflict}
                    value={draft.initial}
                    editorDidMount={instance => {
                      source.current = instance;
                      instance.focus();
                    }}
                    editorWillUnmount={() => {
                      source.current = null;
                    }}
                    onChange={(_instance, _change, value) =>
                      setDraft(current => current && { ...current, value })
                    }
                  />
                </Suspense>
              </div>
            </PortalScope>
          </section>
        </PortalToBody>
      )}
    </div>
  );
}
