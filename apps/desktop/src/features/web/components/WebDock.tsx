/**
 * 右栏网页：独立分区的 <webview>（不带应用 preload，主进程 web-dock-guest 强制沙箱与 http(s)），
 * 从打开到关闭始终是同一个实例，放大 / 收回只换外框尺寸，页内状态不丢。
 * 栏头：返回被盖住的视图、站内后退前进、标题与实际域名、在浏览器中打开、放大、关闭。
 */

import { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Globe,
  Lock,
  Maximize2,
  Minimize2,
  PanelRightClose,
  RotateCw,
  WifiOff,
} from "lucide-react";
import { Button, IconButton, cn, toast } from "@tau/ui";
import type { AssistViewProps } from "@/app/assistViews";
import { useAssistOwnerStore } from "@/app/assistOwner";
import { useShellStore } from "@/app/shellStore";
import { openExternal } from "@/commands";
import { on, off } from "@/electron";
import { useOverlayDismiss, usePage } from "@/page/PageProvider";
import { WEB_DOCK_ESCAPE, WEB_DOCK_PARTITION } from "../../../../shared/web-dock";
import { useWebDockStore } from "../openInDock";

interface DockWebviewElement extends HTMLWebViewElement {
  loadURL(url: string): Promise<void>;
  reload(): void;
  stop(): void;
  goBack(): void;
  goForward(): void;
  canGoBack(): boolean;
  canGoForward(): boolean;
  getWebContentsId(): number;
}

type WebviewEvent = Event & {
  url?: string;
  title?: string;
  isMainFrame?: boolean;
  errorCode?: number;
  errorDescription?: string;
  validatedURL?: string;
};

/** 导航被新导航顶掉（ERR_ABORTED）不算失败 */
const ERR_ABORTED = -3;

// React 只会把字符串形式的 Electron 自定义属性写进 DOM。
const popupAttribute: Record<string, string> = { allowpopups: "" };

function hostOf(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function WebDock({ open, onClose, covered }: AssistViewProps) {
  const request = useWebDockStore(s => s.request);
  const expanded = useShellStore(s => s.assistExpanded);
  const setExpanded = useShellStore(s => s.setAssistExpanded);
  const hideAssist = useShellStore(s => s.hideAssist);
  const webview = useRef<DockWebviewElement | null>(null);
  const ready = useRef(false);
  const guestId = useRef<number | null>(null);
  const [src] = useState(() => request?.url ?? "about:blank");
  const [url, setUrl] = useState(src);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<string | null>(null);
  const [history, setHistory] = useState({ back: false, forward: false });

  // 栏内再次打开链接：同一个网页实例换地址（首个地址由 src 装载）
  const loadedRequest = useRef(request?.id);
  useEffect(() => {
    if (!request || request.id === loadedRequest.current) return;
    loadedRequest.current = request.id;
    setUrl(request.url);
    setTitle("");
    setFailure(null);
    if (ready.current) void webview.current?.loadURL(request.url).catch(() => undefined);
    else webview.current?.setAttribute("src", request.url);
  }, [request]);

  useEffect(() => {
    const el = webview.current;
    if (!el) return;
    const syncHistory = () => setHistory({ back: el.canGoBack(), forward: el.canGoForward() });
    const listeners: [string, (event: WebviewEvent) => void][] = [
      [
        "did-attach",
        () => {
          guestId.current = el.getWebContentsId();
        },
      ],
      [
        "dom-ready",
        () => {
          ready.current = true;
          guestId.current = el.getWebContentsId();
        },
      ],
      [
        "did-start-loading",
        () => {
          setLoading(true);
          setFailure(null);
        },
      ],
      ["did-stop-loading", () => setLoading(false)],
      [
        "did-fail-load",
        event => {
          if (!event.isMainFrame || event.errorCode === ERR_ABORTED) return;
          setFailure(event.errorDescription || "网页没有响应");
          if (event.validatedURL) setUrl(event.validatedURL);
        },
      ],
      ["page-title-updated", event => setTitle(event.title ?? "")],
      [
        "did-navigate",
        event => {
          if (event.url) setUrl(event.url);
          syncHistory();
        },
      ],
      [
        "did-navigate-in-page",
        event => {
          if (event.isMainFrame !== false && event.url) setUrl(event.url);
          syncHistory();
        },
      ],
    ];
    for (const [name, listener] of listeners) el.addEventListener(name, listener as EventListener);
    return () => {
      for (const [name, listener] of listeners)
        el.removeEventListener(name, listener as EventListener);
    };
  }, []);

  useOverlayDismiss(() => setExpanded(false), open && expanded);
  const { dismissTopOverlay, state } = usePage();
  const pageKey = state.back.at(-1)?.key;
  const ownerInstance = useAssistOwnerStore(s => pageKey && s.owners[pageKey]?.instance);
  const returnLabel =
    ownerInstance && ownerInstance === request?.coveredPageChat ? "AI 对话" : covered?.label;
  useEffect(() => {
    if (!open) return;
    const onEscape = (_event: unknown, sourceId: number) => {
      if (sourceId === guestId.current) dismissTopOverlay();
    };
    on(WEB_DOCK_ESCAPE, onEscape);
    return () => off(WEB_DOCK_ESCAPE, onEscape);
  }, [open, dismissTopOverlay]);

  const host = hostOf(url);
  const secure = url.startsWith("https:");
  const openInBrowser = () => void openExternal(url).catch(() => toast.error("打开链接失败"));
  const retry = () => {
    setFailure(null);
    if (ready.current) void webview.current?.loadURL(url).catch(() => undefined);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-12 flex-none items-center gap-0.5 pr-2 pl-2">
        {returnLabel && (
          <Button
            variant="ghost"
            size="sm"
            icon={ChevronLeft}
            title={`关闭网页，回到${returnLabel}`}
            onClick={covered?.restore ?? onClose}
            className="mr-1 flex-none px-2"
          >
            {returnLabel}
          </Button>
        )}
        <IconButton
          title="网页后退"
          aria-label="网页后退"
          className="size-7"
          disabled={!history.back}
          onClick={() => webview.current?.goBack()}
        >
          <ChevronLeft size={16} strokeWidth={1.75} />
        </IconButton>
        <IconButton
          title="网页前进"
          aria-label="网页前进"
          className="size-7"
          disabled={!history.forward}
          onClick={() => webview.current?.goForward()}
        >
          <ChevronRight size={16} strokeWidth={1.75} />
        </IconButton>
        <div className="flex min-w-0 flex-1 flex-col px-1.5 leading-tight" title={url}>
          <span className="text-tau-sm text-ink-1 truncate font-medium">
            {title || (loading ? "正在打开…" : host)}
          </span>
          <span className="text-tau-tiny text-ink-3 flex min-w-0 items-center gap-1">
            {secure ? (
              <Lock size={10} strokeWidth={2} className="flex-none" />
            ) : (
              <Globe size={10} strokeWidth={2} className="flex-none" />
            )}
            <span className="truncate">{host}</span>
          </span>
        </div>
        <IconButton
          title="在浏览器中打开"
          aria-label="在浏览器中打开"
          className="size-7"
          onClick={openInBrowser}
        >
          <ExternalLink size={15} strokeWidth={1.75} />
        </IconButton>
        <IconButton
          title={expanded ? "收回右栏 (Esc)" : "放大"}
          aria-label={expanded ? "收回右栏" : "放大"}
          className="size-7"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? (
            <Minimize2 size={15} strokeWidth={1.75} />
          ) : (
            <Maximize2 size={15} strokeWidth={1.75} />
          )}
        </IconButton>
        <IconButton
          title={covered ? "收起右栏" : "关闭网页"}
          aria-label={covered ? "收起右栏" : "关闭网页"}
          className="size-7"
          onClick={covered ? hideAssist : onClose}
        >
          <PanelRightClose size={16} strokeWidth={1.75} />
        </IconButton>
      </div>
      <div className="rounded-tau-md relative mx-2 mb-2 min-h-0 flex-1 overflow-hidden">
        {loading && !failure && (
          <div className="absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden" aria-hidden>
            <i className="bg-accent animate-progress-flow absolute inset-y-0 block w-1/3 rounded-full" />
          </div>
        )}
        <webview
          ref={el => {
            webview.current = el as DockWebviewElement | null;
          }}
          src={src}
          partition={WEB_DOCK_PARTITION}
          {...popupAttribute}
          className={cn("h-full w-full", failure && "invisible")}
        />
        {failure && (
          <div
            role="alert"
            className="bg-surface text-ink-2 absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center"
          >
            <span className="bg-hover text-ink-3 rounded-tau-md mb-1 grid size-10 place-items-center">
              <WifiOff size={18} strokeWidth={1.75} />
            </span>
            <span className="text-tau-body text-ink-1 font-medium">无法打开 {host}</span>
            <span className="text-tau-meta">{failure}</span>
            <div className="mt-2 flex gap-2">
              <Button size="sm" icon={RotateCw} onClick={retry}>
                重试
              </Button>
              <Button size="sm" variant="ghost" icon={ExternalLink} onClick={openInBrowser}>
                在浏览器中打开
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
