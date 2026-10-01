import { defineElement, defineExtension, type ElementRenderProps } from "@tau/editor";
import { Z_INDEX } from "../../../router/zIndex";
import type { EditorKit, IConfigItem } from "@tau/editor";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useMemoizedFn } from "ahooks";
import { FileText } from "lucide-react";
import { Editor, Element, Transforms, type BaseSelection } from "slate";
import { ReactEditor, useSlate, useSlateSelection } from "slate-react";
import { getNavigator } from "../../../router";
import * as tauri from "../../../services/tauri";
import type { ContentDetailResponse } from "../../../types";
import { useMobileTheme } from "../../../hooks/useMobileTheme";
import { calculateContentLinkPopoverPosition } from "../contentLinkPosition";
import ContentLinkPickerSheet, { type ContentLinkPickerResult } from "./ContentLinkPickerSheet";
import { unwrapContentLink, wrapContentLink } from "./contentLinkTransforms";

type ContentLinkElement = {
  type: "content-link";
  contentId?: number;
  contentTitle?: string;
  contentType?: string;
  refId?: number;
  children: unknown[];
};

type PreviewEditorProps = {
  initValue: unknown;
  readonly?: boolean;
  kit?: EditorKit;
  theme?: "light" | "dark";
  className?: string;
};

/** 预览用编辑器与它的 content 场景 kit，一起懒加载（避免扩展模块绕回本文件） */
type PreviewRenderer = {
  Editor: ComponentType<PreviewEditorProps>;
  kit: EditorKit;
};

const EMPTY_EDITOR_CONTENT = [
  {
    type: "paragraph",
    children: [{ type: "formatted", text: "" }],
  },
];

let previewRendererCache: PreviewRenderer | null = null;
let previewRendererPromise: Promise<PreviewRenderer> | null = null;

function readText(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  if (typeof value === "number") {
    return String(value);
  }
  return fallback;
}

function readNumber(value: unknown, fallback = -1): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function normalizeTimestamp(value: number): number {
  return value > 0 && value < 1_000_000_000_000 ? value * 1000 : value;
}

function formatTimeLabel(value: number): string {
  if (!value) return "--";
  return new Date(normalizeTimestamp(value)).toLocaleString();
}

function normalizeEditorContent(content: unknown): unknown {
  if (!Array.isArray(content) || content.length === 0) {
    return EMPTY_EDITOR_CONTENT;
  }
  return content;
}

async function loadPreviewRenderer(): Promise<PreviewRenderer> {
  if (previewRendererCache) {
    return previewRendererCache;
  }
  if (previewRendererPromise) {
    return previewRendererPromise;
  }

  previewRendererPromise = Promise.all([
    import("@tau/editor"),
    import("../../../services/editorKit"),
  ])
    .then(([editorModule, kitModule]) => {
      const nextRenderer: PreviewRenderer = {
        Editor: editorModule.Editor as ComponentType<PreviewEditorProps>,
        kit: kitModule.getMobileContentKit(),
      };
      previewRendererCache = nextRenderer;
      return nextRenderer;
    })
    .finally(() => {
      previewRendererPromise = null;
    });

  return previewRendererPromise;
}

function ContentLinkPreviewCard(props: {
  loading: boolean;
  errorText: string;
  detail: ContentDetailResponse | null;
  renderer: PreviewRenderer | null;
}) {
  const { theme } = useMobileTheme();
  if (props.loading) {
    return (
      <div className="space-y-2 p-3">
        <div className="bg-input h-4 w-28 animate-pulse rounded" />
        <div className="bg-input h-3 w-full animate-pulse rounded" />
        <div className="bg-input h-3 w-4/5 animate-pulse rounded" />
      </div>
    );
  }
  if (props.errorText) {
    return (
      <div className="p-3">
        <p className="text-danger text-xs">{props.errorText}</p>
      </div>
    );
  }

  if (!props.detail) {
    return (
      <div className="p-3">
        <p className="text-ink-3 text-xs">无可预览内容</p>
      </div>
    );
  }

  if (!props.renderer) {
    return (
      <div className="space-y-2 p-3">
        <div className="bg-input h-4 w-28 animate-pulse rounded" />
        <div className="bg-input h-3 w-full animate-pulse rounded" />
        <div className="bg-input h-3 w-4/5 animate-pulse rounded" />
      </div>
    );
  }

  const PreviewEditor = props.renderer.Editor;

  return (
    <div
      className="max-h-[min(70dvh,420px)] touch-pan-y space-y-2 overflow-y-auto overscroll-y-contain p-3"
      style={{ WebkitOverflowScrolling: "touch" }}
    >
      <div className="text-ink-3 flex items-center gap-2 text-[11px]">
        <span>{formatTimeLabel(props.detail.updateTime)}</span>
        <span>·</span>
        <span>{props.detail.count} 字</span>
      </div>
      {props.detail.card?.tags && props.detail.card.tags.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {props.detail.card.tags.slice(0, 3).map(tag => (
            <span
              key={tag}
              className="bg-input text-ink-2 rounded-full px-2 py-0.5 text-[10px] font-medium"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}
      <div className="bg-input/70 rounded-xl px-2 py-2">
        <PreviewEditor
          key={`${props.detail.contentId}-${props.detail.updateTime}`}
          initValue={normalizeEditorContent(props.detail.content)}
          readonly
          theme={theme}
          kit={props.renderer.kit}
          className="mobile-card-editor-content"
        />
      </div>
    </div>
  );
}

function InteractiveContentLink(props: {
  attributes: any;
  element: ContentLinkElement;
  children: ReactNode;
}) {
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const requestSeqRef = useRef(0);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [previewDetail, setPreviewDetail] = useState<ContentDetailResponse | null>(null);
  const [previewRenderer, setPreviewRenderer] = useState<PreviewRenderer | null>(
    previewRendererCache
  );
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0 });

  const title = readText(props.element.contentTitle, "内容引用");
  const contentType = readText(props.element.contentType, "content");
  const refId = readNumber(props.element.refId, -1);
  const contentId = readNumber(props.element.contentId, -1);

  const navigateToDetail = useMemoizedFn(() => {
    if (contentId <= 0) return;
    setPreviewOpen(false);
    // 从预览浮层下钻时，浮层由 router 按 createdAt 规则自动隐藏/恢复
    getNavigator().push("contentDetail", {
      contentId,
      contentTitle: title,
      contentType,
      refId: refId > 0 ? refId : undefined,
    });
  });

  const refreshPanelPosition = useMemoizedFn(() => {
    if (!anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const panelRect = panelRef.current?.getBoundingClientRect();
    const next = calculateContentLinkPopoverPosition({
      anchorRect: rect,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      popoverWidth: panelRect?.width ?? 300,
      popoverHeight: panelRect?.height ?? 180,
    });
    setPanelPos({
      top: next.top,
      left: next.left,
    });
  });

  const loadPreview = useMemoizedFn(async () => {
    if (contentId <= 0) {
      setPreviewError("该引用缺少 contentId");
      return;
    }
    const requestSeq = ++requestSeqRef.current;
    setPreviewLoading(true);
    setPreviewError("");
    try {
      const [detailResult, rendererResult] = await Promise.allSettled([
        tauri.getContentDetail(contentId),
        loadPreviewRenderer(),
      ]);
      if (requestSeqRef.current !== requestSeq) return;
      if (detailResult.status === "fulfilled") {
        setPreviewDetail(detailResult.value);
      } else {
        setPreviewDetail(null);
        setPreviewError("内容预览加载失败");
      }

      if (rendererResult.status === "fulfilled") {
        setPreviewRenderer(rendererResult.value);
      } else {
        setPreviewError("预览渲染器加载失败");
      }
    } catch {
      if (requestSeqRef.current !== requestSeq) return;
      setPreviewError("内容预览加载失败");
      setPreviewDetail(null);
    } finally {
      if (requestSeqRef.current === requestSeq) {
        setPreviewLoading(false);
      }
      refreshPanelPosition();
    }
  });

  useEffect(() => {
    if (!previewOpen) return;
    refreshPanelPosition();

    const handleOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (anchorRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setPreviewOpen(false);
    };
    const handleViewportChange = () => {
      refreshPanelPosition();
    };

    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [previewOpen, refreshPanelPosition]);

  const previewPanel = useMemo(() => {
    if (!previewOpen || typeof document === "undefined") return null;
    return createPortal(
      <div
        ref={panelRef}
        style={{
          zIndex: Z_INDEX.POPOVER,
          top: panelPos.top,
          left: panelPos.left,
        }}
        data-allow-touchmove="true"
        className="card fixed w-[min(92vw,360px)]"
        onClick={event => {
          event.stopPropagation();
        }}
      >
        <ContentLinkPreviewCard
          loading={previewLoading}
          errorText={previewError}
          detail={previewDetail}
          renderer={previewRenderer}
        />
      </div>,
      document.body
    );
  }, [
    panelPos.left,
    panelPos.top,
    previewDetail,
    previewError,
    previewLoading,
    previewOpen,
    previewRenderer,
  ]);

  return (
    <>
      <span
        {...props.attributes}
        ref={anchorRef}
        contentEditable={false}
        className="border-sage/80 text-sage mx-0.5 inline-flex cursor-pointer items-center rounded-[2px] border-b-[3px] border-double px-0.5 transition-colors active:opacity-80"
        onClick={event => {
          event.preventDefault();
          event.stopPropagation();
          if (!previewOpen) {
            setPreviewOpen(true);
            void loadPreview();
            return;
          }
          navigateToDetail();
        }}
      >
        {props.children}
      </span>
      {previewPanel}
    </>
  );
}

function MobileContentLinkHoveringItem() {
  const editor = useSlate();
  const selection = useSlateSelection();
  const selectionRef = useRef<BaseSelection | null>(null);
  const [openPicker, setOpenPicker] = useState(false);

  const isActive = useMemo(() => {
    if (!selection) {
      return false;
    }
    const [contentLink] = Editor.nodes(editor, {
      match: node =>
        !Editor.isEditor(node) &&
        Element.isElement(node) &&
        (node as { type?: string }).type === "content-link",
    });
    return !!contentLink;
  }, [editor, selection]);

  const handleClick = useMemoizedFn((event: ReactMouseEvent) => {
    try {
      if (isActive) {
        unwrapContentLink(editor);
        return;
      }
      selectionRef.current = editor.selection;
      setOpenPicker(true);
    } finally {
      event.preventDefault();
      event.stopPropagation();
      ReactEditor.focus(editor);
      Transforms.collapse(editor, { edge: "end" });
    }
  });

  const handleClosePicker = useMemoizedFn(() => {
    setOpenPicker(false);
    if (selectionRef.current) {
      Transforms.select(editor, selectionRef.current);
    }
    ReactEditor.focus(editor);
    selectionRef.current = null;
  });

  const handleSelectContent = useMemoizedFn((result: ContentLinkPickerResult) => {
    if (selectionRef.current) {
      Transforms.select(editor, selectionRef.current);
    }
    wrapContentLink(editor, {
      contentId: result.contentId,
      contentType: result.contentType,
      contentTitle: result.contentTitle,
      refId: result.refId,
      displayText: result.displayText,
    });
    setOpenPicker(false);
    ReactEditor.focus(editor);
    Transforms.collapse(editor, { edge: "end" });
    selectionRef.current = null;
  });

  return (
    <>
      <div
        title="关联内容"
        className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg transition-all duration-200 ${
          isActive ? "ed-toolbar-item is-active" : "ed-toolbar-item"
        }`}
        onClick={handleClick}
      >
        <FileText size={16} strokeWidth={2.5} />
      </div>
      <ContentLinkPickerSheet
        open={openPicker}
        onClose={handleClosePicker}
        onSelect={handleSelectContent}
      />
    </>
  );
}

const hoveringBarConfigs: IConfigItem[] = [
  {
    id: "content-link",
    compactGroup: "more" as const,
    order: 7,
    element: MobileContentLinkHoveringItem,
  },
];

export const mobileContentLinkExtension = defineExtension({
  id: "host.content-link",
  elements: [
    defineElement({
      type: "content-link",
      kind: "inline",
      render: ({ attributes, children, element }: ElementRenderProps) => (
        <InteractiveContentLink
          attributes={attributes}
          element={element as unknown as ContentLinkElement}
        >
          {children}
        </InteractiveContentLink>
      ),
    }),
  ],
  toolbar: hoveringBarConfigs,
});
