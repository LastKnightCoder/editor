import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
  type SyntheticEvent,
} from "react";
import type { Editor as CodeMirror } from "codemirror";
import { useReadOnly, useSlateStatic } from "slate-react";
import { Button, PortalScope, PortalToBody, UiProvider, usePortalContainer } from "@tau/ui";
import {
  IElementEditingPolicy,
  ElementMenu,
  OverlayBackDismiss,
  captureElementSubmission,
} from "@tau/editor/api";
import { PreviewErrorContext, type PreviewError } from "./previewError";
import type { IPreviewWithEditorProps } from "./PreviewWithEditor";

const SourceCodeEditor = lazy(() => import("./SourceCodeEditor"));
const stopInputPropagation = (event: SyntheticEvent) => event.stopPropagation();

function SourcePortal({ children }: PropsWithChildren) {
  return <PortalToBody container={usePortalContainer()}>{children}</PortalToBody>;
}

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
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const editorReadOnly = useReadOnly();
  const readOnly =
    editorReadOnly || editor.tryGetService(IElementEditingPolicy)?.canEdit(element.type) === false;
  const [draft, setDraft] = useState<{ initial: string; value: string } | null>(null);
  const [error, setError] = useState<PreviewError | null>(null);
  const source = useRef<CodeMirror | null>(null);
  const submission = useRef<ReturnType<typeof captureElementSubmission> | null>(null);
  const close = useCallback(() => {
    submission.current?.dispose();
    submission.current = null;
    source.current = null;
    setMenu(null);
    setDraft(null);
  }, []);
  useEffect(() => close, [close]);
  useEffect(() => {
    if (readOnly) close();
  }, [readOnly, close]);
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
      <OverlayBackDismiss open={draft !== null} onDismiss={close} />
      {draft && (
        <UiProvider className="contents">
          <SourcePortal>
            <section
              role="dialog"
              aria-modal="true"
              aria-label={`${title}源码`}
              data-pan-ignore-drag="true"
              onBeforeInput={stopInputPropagation}
              onInput={stopInputPropagation}
              onCompositionStart={stopInputPropagation}
              onCompositionUpdate={stopInputPropagation}
              onCompositionEnd={stopInputPropagation}
              onCopy={stopInputPropagation}
              onCut={stopInputPropagation}
              onPaste={stopInputPropagation}
              onFocus={stopInputPropagation}
              onBlur={stopInputPropagation}
              onClick={stopInputPropagation}
              onPointerDown={stopInputPropagation}
              onMouseDown={stopInputPropagation}
              onKeyDown={event => {
                // Portal 仍沿 React 树冒泡，源码按键不能交给外层 Slate 热键。
                event.stopPropagation();
                if (event.key === "Escape" && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  close();
                }
              }}
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
                <div className="min-h-0 flex-1 overflow-auto">
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
          </SourcePortal>
        </UiProvider>
      )}
    </div>
  );
}
