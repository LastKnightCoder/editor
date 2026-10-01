/**
 * 沉浸写作（DECISIONS D-074）。进入即窗口全屏（退出还原）；版心按编辑器常规字号排版，
 * 整列 CSS zoom 按屏宽放大（layout.ts）；默认打字机滚动 + 段落聚焦，控制条上可分别关闭。
 * 控制条按鼠标位置显隐、一打字就收起；Esc 经 useOverlayDismiss 退出（编辑器自身浮层先关）；
 * 深浅色只作用于沉浸层。退出时回传选区，调用方据此恢复正文光标。
 */
import {
  memo,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type Ref,
} from "react";
import type { Descendant, Editor as SlateEditor, Range } from "slate";
import { Node as SlateNode, Text, Transforms } from "slate";
import { ReactEditor } from "slate-react";
import { useLatest, useMemoizedFn } from "ahooks";
import { Focus, Minimize2, Minus, Moon, Plus, Sun, TextCursorInput } from "lucide-react";
import { EditorThemeOverride, type EditorRef } from "@tau/editor";
import type { AnyExtension } from "@tau/editor";
import { cn, PortalScope } from "@tau/ui";
import ContentEditor from "@/components/ContentEditor";
import PortalToBody from "@/components/PortalToBody";
import { useFindOwner } from "@/components/GlobalFindBar/findOwner";
import { StageHud, StageHudButton, StageHudDivider, useStageTheme } from "@/components/Stage";
import { useFullScreenWhileMounted } from "@/hooks/useFullScreenWhileMounted";
import { useOverlayDismiss } from "@/page/PageProvider";
import { getContentLength } from "@/utils/helper";
import { columnWidth, fitZoom, stepAdjust } from "./layout";
import { useCaretFollow } from "./useCaretFollow";

export interface ImmersiveEditorExitPayload {
  selection: Range | null;
}

interface ImmersiveEditorModeProps {
  /** 实例特有扩展（如项目文档的卡片列表）；宿主通用扩展来自 kit，不必传 */
  extensions?: AnyExtension[];
  contentId?: number;
  initValue: Descendant[];
  initialSelection?: Range | null;
  onChange?: (content: Descendant[]) => void;
  onInit?: (editor: SlateEditor, content: Descendant[]) => void;
  onExit: (payload: ImmersiveEditorExitPayload) => void;
}

/** 鼠标进入屏幕底部这一带时显示控制条（屏幕像素） */
const HUD_ZONE = 140;
const HINT_MS = 3200;
const ENTER_MS = 420;

/** 段落聚焦的退后程度（编辑器 focusMode 读 --ed-focus-dim）：打字机开时更深，只开聚焦时轻一些 */
const FOCUS_DIM_TYPEWRITER = 0.26;
const FOCUS_DIM_SOFT = 0.42;

const ignoreFind = () => undefined;

/** 进入前记下的选区可能已不在当前文档里（协作文档异步加载、内容被他端改动） */
function isRangeInDocument(editor: SlateEditor, range: Range) {
  return [range.anchor, range.focus].every(point => {
    if (!SlateNode.has(editor, point.path)) return false;
    const node = SlateNode.get(editor, point.path);
    return Text.isText(node) && point.offset <= node.text.length;
  });
}

function cloneRange(selection: Range | null): Range | null {
  if (!selection) return null;
  return {
    anchor: { path: [...selection.anchor.path], offset: selection.anchor.offset },
    focus: { path: [...selection.focus.path], offset: selection.focus.offset },
  };
}

/** 视口上下渐隐：打字机模式收得更窄，把视线压向中部 */
function fadeMask(typewriter: boolean) {
  const image = typewriter
    ? "linear-gradient(to bottom, transparent 0, black 18%, black 78%, transparent 100%)"
    : "linear-gradient(to bottom, transparent 0, black 72px, black calc(100% - 72px), transparent 100%)";
  return { maskImage: image, WebkitMaskImage: image };
}

function useViewportWidth() {
  const [width, setWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return width;
}

function formatElapsed(ms: number) {
  const seconds = Math.floor(ms / 1000);
  const mm = String(Math.floor(seconds / 60) % 60).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  return seconds >= 3600 ? `${Math.floor(seconds / 3600)}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** 字数 · 本次净增 · 用时；自带计时，不让秒级刷新波及编辑器 */
function SessionStats({
  count,
  base,
  startedAt,
}: {
  count: number;
  base: number;
  startedAt: number;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const added = count - base;
  return (
    <span className="text-ink-1 px-2.5 tabular-nums">
      {count.toLocaleString()} 字
      <span className={cn("ml-1.5", added > 0 ? "text-ok" : "text-ink-3")}>
        {added >= 0 ? `+${added}` : added}
      </span>
      <span className="text-ink-3 ml-1.5">{formatElapsed(now - startedAt)}</span>
    </span>
  );
}

interface SurfaceProps {
  editorRef: Ref<EditorRef>;
  contentId?: number;
  extensions?: AnyExtension[];
  initValue: Descendant[];
  onChange?(content: Descendant[]): void;
  onInit(editor: SlateEditor, content: Descendant[]): void;
  focusMode: boolean;
}

/** 编辑器单独 memo：控制条、字数等状态变化不重渲染正文 */
const Surface = memo(function Surface({
  editorRef,
  contentId,
  extensions,
  initValue,
  onChange,
  onInit,
  focusMode,
}: SurfaceProps) {
  return (
    <ContentEditor
      ref={editorRef}
      contentId={contentId}
      extensions={extensions}
      initValue={initValue}
      onChange={onChange}
      onInit={onInit}
      readonly={false}
      focusMode={focusMode}
    />
  );
});

export default function ImmersiveEditorMode({
  extensions,
  contentId,
  initValue,
  initialSelection,
  onChange,
  onInit,
  onExit,
}: ImmersiveEditorModeProps) {
  const editorRef = useRef<EditorRef>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null);
  const [column, setColumn] = useState<HTMLDivElement | null>(null);
  // 编辑器只认首次内容，之后以它自己的状态为准
  const [initialValue] = useState(initValue);
  const [base] = useState(() => getContentLength(initValue));
  const [startedAt] = useState(() => Date.now());
  const [count, setCount] = useState(base);

  const [typewriter, setTypewriter] = useState(true);
  const [focusMode, setFocusMode] = useState(true);
  const [adjust, setAdjust] = useState(1);
  const [typing, setTyping] = useState(false);
  const [nearBottom, setNearBottom] = useState(false);
  const [hudHovered, setHudHovered] = useState(false);
  const [hint, setHint] = useState(true);

  const stageTheme = useStageTheme();
  useFullScreenWhileMounted();
  const viewportWidth = useViewportWidth();
  const zoom = fitZoom(viewportWidth) * adjust;
  const follow = useCaretFollow(viewport, column, typewriter ? "typewriter" : "comfort");
  // onInit 可能早于视口 / 版心 callback ref 引起的重渲染（此时 follow 闭包里还是 null），须读最新的
  const followRef = useLatest(follow);

  const handleExit = useMemoizedFn(() => {
    onExit({ selection: cloneRange(editorRef.current?.getEditor().selection ?? null) });
  });
  useOverlayDismiss(handleExit);
  // 沉浸期间 Ctrl/⌘+F 不对被遮住的页面生效
  useFindOwner(ignoreFind, true);

  const handleChange = useMemoizedFn((content: Descendant[]) => {
    onChange?.(content);
    setCount(getContentLength(content));
  });

  // 编辑器就绪后恢复进入前的光标并对齐视线（协作文档异步加载，不能按固定延时猜）；
  // 没有可用的进入选区时落到文末，接着写
  const handleInit = useMemoizedFn((editor: SlateEditor, content: Descendant[]) => {
    onInit?.(editor, content);
    requestAnimationFrame(() => {
      try {
        if (initialSelection && isRangeInDocument(editor, initialSelection)) {
          Transforms.select(editor, initialSelection);
          ReactEditor.focus(editor as ReactEditor);
        } else {
          editorRef.current?.focus();
        }
      } catch (error) {
        console.warn("恢复沉浸模式光标失败:", error);
        editorRef.current?.focus();
      }
      requestAnimationFrame(() => followRef.current(true));
    });
  });

  // 切换打字机（上下留白随之变化）或缩放后，立即把光标拉回原来的视线位置
  useLayoutEffect(() => {
    follow(true);
  }, [typewriter, zoom, follow]);

  useEffect(() => {
    const root = rootRef.current;
    if (root && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const easing = getComputedStyle(document.documentElement).getPropertyValue("--ease-tau-out");
      root.animate(
        [
          { opacity: 0, transform: "scale(0.985)" },
          { opacity: 1, transform: "none" },
        ],
        {
          duration: ENTER_MS,
          easing: easing.trim() || "ease-out",
        }
      );
    }
    const timer = window.setTimeout(() => setHint(false), HINT_MS);
    return () => window.clearTimeout(timer);
  }, []);

  // 一开始输入就收起控制条与指针，鼠标一动再恢复
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.key === "Escape") return;
      if (column?.contains(e.target as Node)) setTyping(true);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [column]);

  const onMouseMove = (e: React.MouseEvent) => {
    setTyping(false);
    setNearBottom(e.clientY > window.innerHeight - HUD_ZONE);
  };

  const hudVisible = !typing && (hint || nearBottom || hudHovered);

  return (
    <PortalToBody>
      <div
        ref={rootRef}
        role="dialog"
        aria-label="沉浸写作"
        {...stageTheme.rootProps}
        className={cn(
          "app-region-no-drag bg-surface text-ink-1 fixed inset-0 z-[95] overflow-hidden",
          typing && "cursor-none"
        )}
        onMouseMove={onMouseMove}
        onMouseLeave={() => setNearBottom(false)}
      >
        <PortalScope>
          <EditorThemeOverride mode={stageTheme.mode}>
            <div
              ref={setViewport}
              className="absolute inset-0 overflow-y-auto overflow-x-hidden"
              style={fadeMask(typewriter)}
            >
              {/* 留白在 zoom 之外：上下各留大半屏，首行与末行也能停在视线高度 */}
              <div className={typewriter ? "pb-[55vh] pt-[45vh]" : "pb-[50vh] pt-[16vh]"}>
                <div
                  ref={setColumn}
                  className="text-(length:--font-size) mx-auto"
                  style={
                    {
                      width: columnWidth(viewportWidth, zoom),
                      zoom,
                      "--ed-focus-dim": typewriter ? FOCUS_DIM_TYPEWRITER : FOCUS_DIM_SOFT,
                    } as CSSProperties
                  }
                >
                  <Surface
                    editorRef={editorRef}
                    contentId={contentId}
                    extensions={extensions}
                    initValue={initialValue}
                    onChange={handleChange}
                    onInit={handleInit}
                    focusMode={focusMode}
                  />
                </div>
              </div>
            </div>

            <span
              className={cn(
                "text-tau-micro text-ink-3 ease-tau-out pointer-events-none absolute bottom-[26px] right-[30px] tabular-nums transition-opacity duration-500",
                hudVisible ? "opacity-0" : typing ? "opacity-40" : "opacity-100"
              )}
            >
              {count.toLocaleString()} 字
            </span>

            <StageHud
              visible={hudVisible}
              onMouseEnter={() => setHudHovered(true)}
              onMouseLeave={() => setHudHovered(false)}
              // 点控制条不抢编辑器焦点，光标留在原处
              onMouseDown={e => e.preventDefault()}
            >
              <SessionStats count={count} base={base} startedAt={startedAt} />
              <StageHudDivider />
              <StageHudButton label="缩小" onClick={() => setAdjust(a => stepAdjust(a, -1))}>
                <Minus className="size-4" strokeWidth={1.75} />
              </StageHudButton>
              <button
                type="button"
                title="恢复自适应大小"
                onClick={() => setAdjust(1)}
                className="text-ink-1 hover:bg-hover h-8 min-w-12 rounded-full px-1.5 tabular-nums"
              >
                {Math.round(zoom * 100)}%
              </button>
              <StageHudButton label="放大" onClick={() => setAdjust(a => stepAdjust(a, 1))}>
                <Plus className="size-4" strokeWidth={1.75} />
              </StageHudButton>
              <StageHudDivider />
              <StageHudButton
                label="打字机滚动"
                active={typewriter}
                onClick={() => setTypewriter(on => !on)}
              >
                <TextCursorInput className="size-4" strokeWidth={1.75} />
              </StageHudButton>
              <StageHudButton
                label="聚焦当前段落"
                active={focusMode}
                onClick={() => setFocusMode(on => !on)}
              >
                <Focus className="size-4" strokeWidth={1.75} />
              </StageHudButton>
              <StageHudButton
                label={stageTheme.mode === "dark" ? "浅色画面" : "深色画面"}
                onClick={stageTheme.toggle}
              >
                {stageTheme.mode === "dark" ? (
                  <Sun className="size-4" strokeWidth={1.75} />
                ) : (
                  <Moon className="size-4" strokeWidth={1.75} />
                )}
              </StageHudButton>
              <StageHudDivider />
              <StageHudButton label="退出沉浸" shortcut="Esc" onClick={handleExit}>
                <Minimize2 className="size-4" strokeWidth={1.75} />
              </StageHudButton>
            </StageHud>
          </EditorThemeOverride>
        </PortalScope>
      </div>
    </PortalToBody>
  );
}
