import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type RefCallback,
  type SyntheticEvent,
} from "react";
import { ChevronLeft, Copy, Keyboard, Redo2, Undo2, type LucideIcon } from "lucide-react";
import { IconButton, PortalScope, PortalToBody, UiProvider, cn, usePortalContainer } from "@tau/ui";
import { useEditorTheme, useNotifier, type EditorTextField } from "@tau/editor/api";
import ShikiOverlayEditor from "./overlay/ShikiOverlayEditor";
import { ErrorBar } from "./parts";
import type { PreviewError } from "./previewError";
import { shikiLanguageForMode } from "./sourceLanguage";

/** 预览区默认占页面高度的比例 */
const DEFAULT_PREVIEW_RATIO = 0.38;
/** 预览区最大比例：源码区至少留出约三成 */
const MAX_PREVIEW_RATIO = 0.7;
/** 拖到低于这个高度松手即收起预览 */
const COLLAPSE_HEIGHT = 40;

const stopPropagation = (event: SyntheticEvent) => event.stopPropagation();
/** 工具按钮按下不抢源码输入框的焦点（键盘保持弹起） */
const keepFocus = (event: PointerEvent) => event.preventDefault();

export interface SourceEditorPageProps {
  title: string;
  icon: LucideIcon;
  mode: string;
  /** 字段绑定：改动即时写入并进入字段撤销记录 */
  textBinding?: EditorTextField;
  /** 非绑定模式的源码与写回；externalRevision 变化表示源码被外部改写，页面以 value 为准重置 */
  value: string;
  externalRevision?: number;
  onChange?(value: string): void;
  readOnly: boolean;
  error: PreviewError | null;
  /** 预览区的挂载点：块把同一份预览 DOM 移进来，页面不另渲染预览 */
  previewSlotRef: RefCallback<HTMLDivElement>;
  onClose(): void;
}

/** 触屏源码页：上方实时预览（高度可拖动），下方原生输入框 + 高亮叠层 */
export function SourceEditorPage({
  title,
  icon: Icon,
  mode,
  textBinding,
  value,
  externalRevision = 0,
  onChange,
  readOnly,
  error,
  previewSlotRef,
  onClose,
}: SourceEditorPageProps) {
  const { isDark } = useEditorTheme();
  const notifier = useNotifier();
  const sectionRef = useRef<HTMLElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const codeRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState(value);
  const [ratio, setRatio] = useState(DEFAULT_PREVIEW_RATIO);
  const [dragging, setDragging] = useState(false);
  const [focused, setFocused] = useState(false);

  useEffect(() => setDraft(value), [externalRevision]); // eslint-disable-line react-hooks/exhaustive-deps

  const textarea = () => codeRef.current?.querySelector<HTMLTextAreaElement>("textarea") ?? null;

  // 布局阶段聚焦：从点按打开时仍在同一次用户手势内，iOS 才会弹出键盘
  useLayoutEffect(() => {
    if (readOnly) return;
    const input = textarea();
    input?.focus();
    input?.setSelectionRange(input.value.length, input.value.length);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const runHistory = (action: "undo" | "redo") => {
    try {
      textBinding?.[action]();
    } catch (cause) {
      notifier.error(cause instanceof Error ? cause.message : "撤销失败");
    }
  };

  const copySource = () => {
    const source = textarea()?.value ?? draft;
    void navigator.clipboard?.writeText(source).then(
      () => notifier.success("源码已复制"),
      () => notifier.error("复制失败")
    );
  };

  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    const section = sectionRef.current;
    const preview = previewRef.current;
    if (!section || !preview) return;
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const startY = event.clientY;
    const startHeight = preview.offsetHeight;
    const total = section.clientHeight || 1;
    let height = startHeight;
    setDragging(true);
    const move = (next: globalThis.PointerEvent) => {
      height = Math.max(
        0,
        Math.min(total * MAX_PREVIEW_RATIO, startHeight + next.clientY - startY)
      );
      setRatio(height / total);
    };
    const end = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
      setDragging(false);
      if (height < COLLAPSE_HEIGHT) setRatio(0);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  };

  return (
    <UiProvider className="contents">
      <PortalToBody container={usePortalContainer()}>
        <section
          ref={sectionRef}
          role="dialog"
          aria-modal="true"
          aria-label={`${title}源码`}
          data-source-editor-page=""
          data-pan-ignore-drag="true"
          data-kb-optout="true"
          // Portal 仍沿 React 树冒泡，源码页的输入、剪贴板与指针事件不能交给外层 Slate。
          onBeforeInput={stopPropagation}
          onInput={stopPropagation}
          onCompositionStart={stopPropagation}
          onCompositionUpdate={stopPropagation}
          onCompositionEnd={stopPropagation}
          onCopy={stopPropagation}
          onCut={stopPropagation}
          onPaste={stopPropagation}
          onFocus={event => {
            event.stopPropagation();
            if (event.target instanceof HTMLTextAreaElement) setFocused(true);
          }}
          onBlur={event => {
            event.stopPropagation();
            if (event.target instanceof HTMLTextAreaElement) setFocused(false);
          }}
          onClick={stopPropagation}
          onPointerDown={stopPropagation}
          onMouseDown={stopPropagation}
          onKeyDown={event => {
            event.stopPropagation();
            if (event.key === "Escape" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              onClose();
            }
          }}
          className="bg-page text-ink-1 fixed inset-x-0 top-0 z-[400] flex flex-col"
          style={{
            height: "var(--kb-viewport-height, 100dvh)",
            paddingTop: "env(safe-area-inset-top)",
          }}
        >
          <PortalScope>
            <header className="flex h-12 shrink-0 items-center gap-1 px-2">
              <IconButton aria-label="返回" className="size-10" onClick={onClose}>
                <ChevronLeft size={22} />
              </IconButton>
              <h2 className="text-tau-body flex flex-1 items-center justify-center gap-1.5 font-semibold">
                <Icon size={16} strokeWidth={1.9} />
                {title}
              </h2>
              {textBinding ? (
                <>
                  <IconButton
                    aria-label="撤销"
                    className="size-10"
                    disabled={readOnly}
                    onPointerDown={keepFocus}
                    onClick={() => runHistory("undo")}
                  >
                    <Undo2 size={19} />
                  </IconButton>
                  <IconButton
                    aria-label="重做"
                    className="size-10"
                    disabled={readOnly}
                    onPointerDown={keepFocus}
                    onClick={() => runHistory("redo")}
                  >
                    <Redo2 size={19} />
                  </IconButton>
                </>
              ) : (
                <span className="size-10" />
              )}
            </header>

            <div
              ref={previewRef}
              data-source-preview=""
              className={cn(
                "bg-surface rounded-tau-lg mx-3 shrink-0 overflow-auto",
                !dragging && "ease-tau-out transition-[height] duration-200",
                error?.stale && "opacity-40"
              )}
              style={{ height: `${ratio * 100}%` }}
            >
              <div
                ref={previewSlotRef}
                className="tau-editor-surface flex min-h-full flex-col justify-center p-3"
              />
            </div>

            <div
              role="separator"
              aria-orientation="horizontal"
              aria-label="调整预览高度"
              className="flex h-4 shrink-0 touch-none items-center justify-center"
              onPointerDown={startDrag}
            >
              <span className="bg-line-1 h-1 w-9 rounded-full" />
            </div>

            {error && (
              <div className="rounded-tau-md mx-3 mb-1.5 shrink-0 overflow-hidden" role="alert">
                <ErrorBar message={error.message} stale={error.stale} />
              </div>
            )}

            <div
              ref={codeRef}
              data-source-code=""
              className="text-tau-body-lg min-h-0 flex-1 overflow-y-auto"
              style={
                {
                  "--ed-code-pad-top": "0.25em",
                  "--ed-code-pad-right": "1em",
                  "--ed-code-pad-bottom": "2em",
                  "--ed-code-pad-left": "1em",
                } as CSSProperties
              }
            >
              <ShikiOverlayEditor
                className="ed-code-overlay"
                textBinding={textBinding}
                value={draft}
                language={shikiLanguageForMode(mode)}
                isDark={isDark}
                readOnly={readOnly}
                wrap
                lineNumbers
                onChange={next => {
                  setDraft(next);
                  onChange?.(next);
                }}
              />
            </div>

            {/* 键盘弹起时让出底栏；收起时给复制与回到输入 */}
            {!focused && (
              <div
                className="bg-surface border-line-1 flex h-[46px] shrink-0 items-center gap-1 border-t px-1"
                style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
              >
                <button
                  type="button"
                  className="text-ink-2 text-tau-sm rounded-tau-sm active:bg-press flex h-10 items-center gap-1.5 px-2.5 font-semibold"
                  onClick={copySource}
                >
                  <Copy size={16} />
                  复制源码
                </button>
                <span className="flex-1" />
                {!readOnly && (
                  <IconButton
                    aria-label="编辑源码"
                    className="size-10"
                    onClick={() => textarea()?.focus()}
                  >
                    <Keyboard size={18} />
                  </IconButton>
                )}
              </div>
            )}
          </PortalScope>
        </section>
      </PortalToBody>
    </UiProvider>
  );
}
