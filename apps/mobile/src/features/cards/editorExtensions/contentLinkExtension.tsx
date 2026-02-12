import { Base, createInlineElementPlugin } from "@tau/editor/src";
import type { IExtension } from "@tau/editor/src";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useMemoizedFn } from "ahooks";
import {
  useNavigationActions,
  useTopOverlayKey,
} from "../../../navigation/hooks";
import * as tauri from "../../../services/tauri";
import type { ContentDetailResponse } from "../../../types";
import { useMobileTheme } from "../../../hooks/useMobileTheme";
import { calculateContentLinkPopoverPosition } from "../contentLinkPosition";

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
  extensions?: IExtension[];
  theme?: "light" | "dark";
};

type PreviewRenderer = {
  Editor: ComponentType<PreviewEditorProps>;
  extensions: IExtension[];
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
    import("@tau/editor/src"),
    import("./index"),
  ])
    .then(([editorModule, extensionModule]) => {
      const nextRenderer: PreviewRenderer = {
        Editor: editorModule.Editor as ComponentType<PreviewEditorProps>,
        extensions: extensionModule.mobileCardPreviewExtensions,
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
        <div className="h-4 w-28 animate-pulse rounded bg-gray-100 dark:bg-neutral-800" />
        <div className="h-3 w-full animate-pulse rounded bg-gray-100 dark:bg-neutral-800" />
        <div className="h-3 w-4/5 animate-pulse rounded bg-gray-100 dark:bg-neutral-800" />
      </div>
    );
  }
  if (props.errorText) {
    return (
      <div className="p-3">
        <p className="text-xs text-red-500 dark:text-red-400">
          {props.errorText}
        </p>
      </div>
    );
  }

  if (!props.detail) {
    return (
      <div className="p-3">
        <p className="text-xs text-gray-400 dark:text-neutral-500">
          无可预览内容
        </p>
      </div>
    );
  }

  if (!props.renderer) {
    return (
      <div className="space-y-2 p-3">
        <div className="h-4 w-28 animate-pulse rounded bg-gray-100 dark:bg-neutral-800" />
        <div className="h-3 w-full animate-pulse rounded bg-gray-100 dark:bg-neutral-800" />
        <div className="h-3 w-4/5 animate-pulse rounded bg-gray-100 dark:bg-neutral-800" />
      </div>
    );
  }

  const PreviewEditor = props.renderer.Editor;

  return (
    <div
      className="max-h-[min(70dvh,420px)] space-y-2 overflow-y-auto p-3 overscroll-y-contain touch-pan-y"
      style={{ WebkitOverflowScrolling: "touch" }}
    >
      <div className="flex items-center gap-2 text-[11px] text-gray-400 dark:text-neutral-500">
        <span>{formatTimeLabel(props.detail.updateTime)}</span>
        <span>·</span>
        <span>{props.detail.count} 字</span>
      </div>
      {props.detail.card?.tags && props.detail.card.tags.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {props.detail.card.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600 dark:bg-neutral-800 dark:text-neutral-400"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}
      <div className="rounded-lg bg-gray-50/70 px-2 py-2 dark:bg-neutral-900">
        <PreviewEditor
          key={`${props.detail.contentId}-${props.detail.updateTime}`}
          initValue={normalizeEditorContent(props.detail.content)}
          readonly
          theme={theme}
          extensions={props.renderer.extensions}
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
  const { navigate } = useNavigationActions();
  const topOverlayKey = useTopOverlayKey();

  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const requestSeqRef = useRef(0);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [previewDetail, setPreviewDetail] =
    useState<ContentDetailResponse | null>(null);
  const [previewRenderer, setPreviewRenderer] =
    useState<PreviewRenderer | null>(previewRendererCache);
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0 });

  const title = readText(props.element.contentTitle, "内容引用");
  const contentType = readText(props.element.contentType, "content");
  const refId = readNumber(props.element.refId, -1);
  const contentId = readNumber(props.element.contentId, -1);

  const navigateToDetail = useMemoizedFn(() => {
    if (contentId <= 0) return;
    setPreviewOpen(false);
    navigate(
      "screen.contentDetail",
      {
        contentId,
        contentTitle: title,
        contentType,
        refId: refId > 0 ? refId : undefined,
      },
      topOverlayKey === "overlay.cardPreview"
        ? { dismissOverlays: ["overlay.cardPreview"] }
        : undefined,
    );
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
          top: panelPos.top,
          left: panelPos.left,
        }}
        data-allow-touchmove="true"
        className="fixed z-70 w-[min(92vw,360px)] rounded-xl border border-gray-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-950"
        onClick={(event) => {
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
      document.body,
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
        className="mx-0.5 inline-flex cursor-pointer items-center rounded-[2px] border-b-[3px] border-double border-emerald-500/80 px-0.5 text-emerald-700 transition-colors active:opacity-80 dark:border-emerald-400/80 dark:text-emerald-400"
        onClick={(event) => {
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

export class MobileContentLinkExtension extends Base implements IExtension {
  type = "content-link";

  override getPlugins() {
    return [createInlineElementPlugin("content-link")];
  }

  render(props: any): ReactElement {
    const { attributes, children, element } = props;
    return (
      <InteractiveContentLink
        attributes={attributes}
        element={element as unknown as ContentLinkElement}
      >
        {children}
      </InteractiveContentLink>
    );
  }
}
