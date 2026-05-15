import { useState, useRef, useCallback } from "react";
import { LoadingOutlined, ReloadOutlined } from "@ant-design/icons";
import { App, Tooltip } from "antd";
import { Descendant } from "slate";
import { useMemoizedFn } from "ahooks";
import { Webview } from "@tau/shared";
import type { WebviewRef } from "@tau/shared";
import { convertFileSrc, getHomeDir } from "@/commands";
import {
  remoteResourceToLocal,
  getContentHTML,
  importFromMarkdown,
  createSmartExtractProvider,
  collectClipStream,
} from "@/utils";
import useGithubCdnUrl from "@/hooks/useGithubCdnUrl";
import useWebClip from "@/hooks/useWebClip";
import { Editor, EditorRef } from "@tau/editor/src";
import ResizablePanel from "@/components/ResizablePanel";
import { openExternal } from "@/commands";
import useDynamicExtensionsStore from "@/stores/useDynamicExtensionsStore";
import useThemeColors from "@/hooks/useThemeColors";
import type { UnifiedArticleItem } from "../../types";

type ViewMode = "webview" | "document" | "split";

const DEFAULT_CONTENT: Descendant[] = [
  { type: "paragraph", children: [{ type: "formatted", text: "" }] },
];

interface WebviewReaderProps {
  article: UnifiedArticleItem;
}

export default function WebviewReader({ article }: WebviewReaderProps) {
  const { message } = App.useApp();
  const themeColors = useThemeColors();
  const dynamicExtensions = useDynamicExtensionsStore(
    (state) => state.extensions,
  );
  const webviewRef = useRef<WebviewRef>(null);
  const editorRef = useRef<EditorRef>(null);

  const [viewMode, setViewMode] = useState<ViewMode>("webview");
  const [parsedContent, setParsedContent] =
    useState<Descendant[]>(DEFAULT_CONTENT);
  const [isLocalClipping, setIsLocalClipping] = useState(false);
  const localClipAbortRef = useRef<AbortController | null>(null);

  const url = article.url!;

  const {
    isClipping,
    content: clipContent,
    startClip,
    cancelClip,
    reset: resetClipState,
  } = useWebClip({
    projectItemId: article.sourceId,
    onProgress: (_markdown, content) => {
      editorRef.current?.setEditorValue(content);
    },
    onComplete: async (_markdown, content) => {
      setParsedContent(content);
      message.success("网页转录完成");
    },
    onError: (error) => {
      message.error(`转录失败: ${error}`);
    },
  });

  const isAnyClipping = isClipping || isLocalClipping;

  const handleRefresh = useMemoizedFn(() => {
    webviewRef.current?.reload();
  });

  const handleOpenInBrowser = useMemoizedFn(() => {
    openExternal(url);
  });

  const cancelAnyClip = useMemoizedFn(async () => {
    if (isClipping) await cancelClip();
    if (isLocalClipping && localClipAbortRef.current) {
      localClipAbortRef.current.abort();
      localClipAbortRef.current = null;
      setIsLocalClipping(false);
    }
  });

  const doStartClip = useMemoizedFn(async () => {
    try {
      if (viewMode === "webview") setViewMode("document");
      const html = await webviewRef.current?.getHTML();
      if (!html) {
        message.error("获取网页内容失败");
        return;
      }
      const contentHTML = getContentHTML(html);
      void startClip(contentHTML, url, article.title || "", false);
    } catch (error) {
      console.error("Start clip error:", error);
      message.error("开始转录失败");
    }
  });

  const handleStartClip = useMemoizedFn(async () => {
    if (isAnyClipping) {
      await cancelAnyClip();
      return;
    }
    doStartClip();
  });

  const doStartLocalClip = useMemoizedFn(async () => {
    try {
      if (viewMode === "webview") setViewMode("document");
      resetClipState();
      setIsLocalClipping(true);

      const abortController = new AbortController();
      localClipAbortRef.current = abortController;

      const html = await webviewRef.current?.getHTML();
      if (!html) {
        message.error("获取网页内容失败");
        setIsLocalClipping(false);
        return;
      }

      const provider = createSmartExtractProvider();
      const markdown = await collectClipStream(
        provider.clip({
          html,
          url,
          title: article.title || "",
          options: { smartExtractClean: true, debug: false },
          signal: abortController.signal,
        }),
      );

      const parsed = importFromMarkdown(markdown, ["yaml"]);
      if (!parsed || parsed.length === 0) {
        throw new Error("解析结果为空");
      }

      setParsedContent(parsed);
      editorRef.current?.setEditorValue(parsed);
      message.success("网页剪藏完成");
    } catch (error) {
      if (error instanceof Error && error.message === "aborted") return;
      message.error(
        `剪藏失败: ${error instanceof Error ? error.message : "未知错误"}`,
      );
    } finally {
      localClipAbortRef.current = null;
      setIsLocalClipping(false);
    }
  });

  const handleStartLocalClip = useMemoizedFn(async () => {
    if (isAnyClipping) {
      await cancelAnyClip();
      return;
    }
    doStartLocalClip();
  });

  const handleToggleView = useCallback(() => {
    if (viewMode === "webview") {
      if (parsedContent !== DEFAULT_CONTENT) {
        setViewMode("document");
      }
    } else if (viewMode === "document") {
      setViewMode("webview");
    }
  }, [viewMode, parsedContent]);

  const handleToggleSplit = useCallback(() => {
    setViewMode(viewMode === "split" ? "webview" : "split");
  }, [viewMode]);

  const hasClipResult = parsedContent !== DEFAULT_CONTENT;
  const currentContent = isClipping ? clipContent : parsedContent;
  const showWebview = viewMode === "webview" || viewMode === "split";
  const showDocument = viewMode === "document" || viewMode === "split";

  const getActiveButtonClass = (isActive: boolean) => {
    if (!isActive) {
      return "bg-transparent text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800";
    }
    return themeColors.activeClass;
  };

  const renderDocumentView = () => (
    <div className="flex h-full w-full items-start justify-center overflow-y-auto px-4">
      <div className="relative min-w-0 max-w-[720px] flex-1 py-6">
        {isAnyClipping && (
          <div
            className={`mb-4 flex items-center gap-2 rounded-lg border ${themeColors.borderClass} px-4 py-3 text-sm ${themeColors.textClass}`}
          >
            <LoadingOutlined />
            <span>正在转录网页内容...</span>
          </div>
        )}
        <Editor
          key={`feed-${article.id}`}
          ref={editorRef}
          initValue={currentContent}
          readonly={isAnyClipping}
          extensions={dynamicExtensions}
        />
      </div>
    </div>
  );

  return (
    <div className="flex h-full w-full flex-col">
      {/* Toolbar */}
      <div
        className={`flex items-center justify-between border-b ${themeColors.borderClass} px-4 py-2`}
      >
        <h1 className="m-0 text-base font-semibold leading-snug truncate flex-1 min-w-0">
          {article.title}
        </h1>
        <div className="flex items-center gap-1 ml-2">
          {hasClipResult && (
            <Tooltip title={viewMode === "document" ? "查看网页" : "查看文档"}>
              <button
                className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border-none transition-all ${getActiveButtonClass(viewMode === "document")}`}
                onClick={handleToggleView}
              >
                <svg
                  className="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polyline points="17 1 21 5 17 9" />
                  <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                  <polyline points="7 23 3 19 7 15" />
                  <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                </svg>
              </button>
            </Tooltip>
          )}
          <Tooltip title={isAnyClipping ? "取消转录" : "LLM 转录"}>
            <button
              className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border-none transition-all ${getActiveButtonClass(isClipping)}`}
              onClick={handleStartClip}
            >
              {isClipping ? (
                <LoadingOutlined />
              ) : (
                <svg
                  className="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
              )}
            </button>
          </Tooltip>
          <Tooltip title={isAnyClipping ? "取消剪藏" : "剪藏网页"}>
            <button
              className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border-none transition-all ${getActiveButtonClass(isLocalClipping)}`}
              onClick={handleStartLocalClip}
            >
              {isLocalClipping ? (
                <LoadingOutlined />
              ) : (
                <svg
                  className="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                  <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                </svg>
              )}
            </button>
          </Tooltip>
          {hasClipResult && (
            <Tooltip title={viewMode === "split" ? "退出分屏" : "分屏"}>
              <button
                className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border-none transition-all ${getActiveButtonClass(viewMode === "split")}`}
                onClick={handleToggleSplit}
              >
                <svg
                  className="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <line x1="12" y1="3" x2="12" y2="21" />
                </svg>
              </button>
            </Tooltip>
          )}
          <Tooltip title="刷新网页">
            <button
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-all"
              onClick={handleRefresh}
            >
              <ReloadOutlined className="text-sm" />
            </button>
          </Tooltip>
          <Tooltip title="在浏览器中打开">
            <button
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-all"
              onClick={handleOpenInBrowser}
            >
              <svg
                className="w-4 h-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Content area */}
      <div className="relative flex-1 overflow-hidden">
        {viewMode === "split" ? (
          <ResizablePanel
            id={`feed-split-${article.id}`}
            className="h-full w-full"
            leftClassName={`h-full overflow-hidden border-r ${themeColors.borderClass}`}
            rightClassName="h-full overflow-hidden"
            minLeft={360}
            minRight={360}
            initialLeftRatio={0.5}
            left={
              <Webview
                ref={webviewRef}
                src={url}
                className="h-full w-full"
                allowPopups={false}
                convertFileSrc={convertFileSrc}
                getHomeDir={getHomeDir}
                remoteResourceToLocal={remoteResourceToLocal}
                useGithubCdnUrl={useGithubCdnUrl}
              />
            }
            right={renderDocumentView()}
          />
        ) : (
          <>
            <div
              className={`absolute inset-0 transition-opacity duration-200 ${
                showWebview && !showDocument
                  ? "opacity-100 z-10"
                  : "opacity-0 z-0 pointer-events-none"
              }`}
            >
              <Webview
                ref={webviewRef}
                src={url}
                className="h-full w-full"
                allowPopups={false}
                convertFileSrc={convertFileSrc}
                getHomeDir={getHomeDir}
                remoteResourceToLocal={remoteResourceToLocal}
                useGithubCdnUrl={useGithubCdnUrl}
              />
            </div>
            <div
              className={`absolute inset-0 transition-opacity duration-200 ${
                showDocument && !showWebview
                  ? "opacity-100 z-10"
                  : "opacity-0 z-0 pointer-events-none"
              }`}
            >
              {renderDocumentView()}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
