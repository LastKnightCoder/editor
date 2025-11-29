import { useState, useRef, useEffect } from "react";
import {
  LoadingOutlined,
  ReloadOutlined,
  EditOutlined,
} from "@ant-design/icons";
import { App, Tooltip, Switch } from "antd";
import { useMemoizedFn, useLocalStorageState } from "ahooks";
import { Descendant } from "slate";
import Webview, { WebviewRef } from "@/components/Webview";
import Editor, { EditorRef } from "@/components/Editor";
import EditorOutline from "@/components/EditorOutline";
import EditTitleModal from "@/components/EditTitleModal";
import {
  getProjectItemById,
  openExternal,
  updateProjectItem,
  updateWebLink,
  queryContentLinkBySource,
  getWebClipById,
  getContentById,
} from "@/commands";
import { getContentHTML } from "@/utils";
import { defaultProjectItemEventBus } from "@/utils";
import { type ProjectItem, WebClip } from "@/types";
import useProjectWebLinkMeta from "@/hooks/useProjectWebLinkMeta";
import useThemeColors from "@/hooks/useThemeColors";
import useEditContent from "@/hooks/useEditContent";
import useWebClip from "@/hooks/useWebClip";
import useTabStore from "@/stores/useTabStore";
import { TabType } from "@/types/tab";
import { useProjectContext } from "../ProjectContext";
import {
  contentLinkExtension,
  fileAttachmentExtension,
  questionCardExtension,
  chatReferenceExtension,
} from "@/editor-extensions";
import useUploadResource from "@/hooks/useUploadResource";

const customExtensions = [
  contentLinkExtension,
  fileAttachmentExtension,
  questionCardExtension,
  chatReferenceExtension,
];

// Icons
const ClipIcon = () => (
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
    <polyline points="10 9 9 9 8 9" />
  </svg>
);

const SwitchViewIcon = () => (
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
);

const SplitViewIcon = () => (
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
);

const ExternalLinkIcon = () => (
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
);

const NewTabIcon = () => (
  <svg
    className="w-4 h-4"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <line x1="9" y1="3" x2="9" y2="21" />
  </svg>
);

interface WebViewProjectItemViewProps {
  projectItemId: number;
}

// 视图模式：单页网页、单页文档、双页分屏
type ViewMode = "webview" | "parsed" | "split";

const DEFAULT_CONTENT: Descendant[] = [
  {
    type: "paragraph",
    children: [{ type: "formatted", text: "" }],
  },
];

const WebViewProjectItemView = (props: WebViewProjectItemViewProps) => {
  const { projectItemId } = props;
  const [projectItem, setProjectItem] = useState<ProjectItem | null>(null);
  const webviewRef = useRef<WebviewRef>(null);
  const editorRef = useRef<EditorRef>(null);
  const projectItemEventBus = defaultProjectItemEventBus.createEditor();
  const { message, modal } = App.useApp();
  const themeColors = useThemeColors();
  useProjectContext(); // Keep context active
  const openInNewTab = useTabStore((state) => state.openInNewTab);

  // 视图模式
  const [viewMode, setViewMode] = useState<ViewMode>("webview");

  // 翻译为中文开关
  const [translateToChinese, setTranslateToChinese] =
    useLocalStorageState<boolean>("web-clip-translate-to-chinese", {
      defaultValue: false,
    });

  // 已保存的解析结果
  const [savedWebClip, setSavedWebClip] = useState<WebClip | null>(null);
  const [parsedContent, setParsedContent] =
    useState<Descendant[]>(DEFAULT_CONTENT);

  // 编辑标题弹窗
  const [editTitleModalOpen, setEditTitleModalOpen] = useState(false);

  const uploadResource = useUploadResource();

  useEffect(() => {
    getProjectItemById(projectItemId).then((item) => {
      if (item) {
        setProjectItem(item);
      }
    });
  }, [projectItemId]);

  const meta = useProjectWebLinkMeta(projectItem);
  const [title, setTitle] = useState(meta.title);
  const [currentUrl, setCurrentUrl] = useState(meta.url);

  useEffect(() => {
    setTitle(meta.title);
  }, [meta.title]);

  useEffect(() => {
    setCurrentUrl(meta.url);
  }, [meta.url]);

  // 查询已有的解析结果
  useEffect(() => {
    const loadExistingWebClip = async () => {
      console.log(
        "[WebClip] Loading existing web clip for projectItemId:",
        projectItemId,
      );
      try {
        const links = await queryContentLinkBySource({
          sourceId: projectItemId,
          sourceType: "project_item",
          targetType: "web_clip",
        });
        console.log("[WebClip] Found content links:", links);

        if (links.length > 0) {
          const webClip = await getWebClipById(links[0].targetId);
          console.log("[WebClip] Found web clip:", webClip);
          if (webClip) {
            setSavedWebClip(webClip);
            // 加载解析内容
            const content = await getContentById(webClip.contentId);
            console.log("[WebClip] Loaded content:", content);
            if (content && content.content) {
              console.log(
                "[WebClip] Setting parsed content, length:",
                content.content.length,
              );
              setParsedContent(content.content);
              // 如果当前是解析视图，需要更新 Editor（非受控组件）
              setTimeout(() => {
                console.log("[WebClip] Setting editor value after load");
                editorRef.current?.setEditorValue(content.content);
              }, 200);
            }
          }
        }
      } catch (error) {
        console.error("[WebClip] Load existing web clip error:", error);
      }
    };

    loadExistingWebClip();
  }, [projectItemId]);

  // 使用 useEditContent hook 管理解析内容的编辑
  const { throttleHandleEditorContentChange } = useEditContent(
    savedWebClip?.contentId,
    (content) => {
      console.log(
        "[WebClip] useEditContent callback, content length:",
        content.length,
      );
      editorRef.current?.setEditorValue(content);
      setParsedContent(content);
    },
  );

  // 使用 useWebClip hook 管理解析流程
  const {
    isClipping,
    content: clipContent,
    error: clipError,
    startClip,
    cancelClip,
  } = useWebClip({
    projectItemId,
    onProgress: (_markdown, content) => {
      // 实时更新编辑器内容
      editorRef.current?.setEditorValue(content);
    },
    onComplete: async (_markdown, content, webClipId, contentId) => {
      console.log(
        "[WebClip] onComplete, webClipId:",
        webClipId,
        "contentId:",
        contentId,
        "content length:",
        content.length,
      );

      // Electron 侧已经保存了数据，前端只需更新状态
      setParsedContent(content);

      // 如果 Electron 返回了 webClipId，重新加载 webClip 信息
      if (webClipId) {
        const updatedWebClip = await getWebClipById(webClipId);
        if (updatedWebClip) {
          console.log("[WebClip] Loaded updated webClip:", updatedWebClip);
          setSavedWebClip(updatedWebClip);
        }
      }

      message.success("网页解析完成");
    },
    onError: (error) => {
      message.error(`解析失败: ${error}`);
    },
  });

  // 当视图模式变化时，如果是解析视图，确保 Editor 内容正确
  useEffect(() => {
    if (viewMode === "parsed" || viewMode === "split") {
      const content = isClipping ? clipContent : parsedContent;
      console.log(
        "[WebClip] View mode changed to:",
        viewMode,
        "content length:",
        content.length,
      );
      // 延迟设置，等待 Editor 组件挂载
      const timer = setTimeout(() => {
        console.log("[WebClip] Setting editor value after view mode change");
        editorRef.current?.setEditorValue(content);
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [viewMode, parsedContent, clipContent, isClipping]);

  // 执行解析
  const doStartClip = useMemoizedFn(async () => {
    if (!currentUrl) {
      message.error("无法获取网页 URL");
      return;
    }

    try {
      // 切换到解析视图或分屏视图
      if (viewMode === "webview") {
        setViewMode("parsed");
      }

      // 获取 HTML 内容
      const html = await webviewRef.current?.getHTML();
      if (!html) {
        message.error("获取网页内容失败");
        if (viewMode !== "split") {
          setViewMode("webview");
        }
        return;
      }

      const contentHTML = getContentHTML(html);

      // 开始流式解析
      await startClip(contentHTML, currentUrl, title || "", translateToChinese);
    } catch (error) {
      console.error("Start clip error:", error);
      message.error("开始解析失败");
      if (viewMode !== "split") {
        setViewMode("webview");
      }
    }
  });

  // 开始解析（带确认）
  const handleStartClip = useMemoizedFn(async () => {
    if (isClipping) {
      cancelClip();
      return;
    }

    // 如果已存在解析文档，需要确认
    if (savedWebClip) {
      modal.confirm({
        title: "重新解析网页",
        content: "已存在解析文档，重新解析将覆盖现有内容。确定要继续吗？",
        okText: "确定",
        cancelText: "取消",
        onOk: doStartClip,
      });
    } else {
      doStartClip();
    }
  });

  // 切换视图（单页模式切换）
  const handleToggleView = useMemoizedFn(() => {
    const newViewMode = viewMode === "webview" ? "parsed" : "webview";
    console.log("[WebClip] Toggle view from", viewMode, "to", newViewMode);
    setViewMode(newViewMode);

    // 切换到 parsed 视图时，手动设置 Editor 内容（因为 Editor 是非受控组件）
    if (newViewMode === "parsed") {
      setTimeout(() => {
        const content = isClipping ? clipContent : parsedContent;
        console.log(
          "[WebClip] Setting editor value on toggle, content length:",
          content.length,
        );
        editorRef.current?.setEditorValue(content);
      }, 200);
    }
  });

  // 切换分屏视图
  const handleToggleSplit = useMemoizedFn(() => {
    const newViewMode = viewMode === "split" ? "webview" : "split";
    console.log("[WebClip] Toggle split from", viewMode, "to", newViewMode);
    setViewMode(newViewMode);

    // 切换到 split 视图时，手动设置 Editor 内容
    if (newViewMode === "split") {
      setTimeout(() => {
        const content = isClipping ? clipContent : parsedContent;
        console.log(
          "[WebClip] Setting editor value on split, content length:",
          content.length,
        );
        editorRef.current?.setEditorValue(content);
      }, 200);
    }
  });

  // 刷新网页
  const handleRefresh = useMemoizedFn(() => {
    webviewRef.current?.reload();
  });

  // 浏览器打开
  const handleOpenInBrowser = useMemoizedFn(() => {
    if (currentUrl) {
      openExternal(currentUrl);
    }
  });

  // 新 Tab 打开 - 参考 LinkPlugin/Renderer.tsx
  const handleOpenInNewTab = useMemoizedFn(() => {
    if (!currentUrl) return;
    openInNewTab(TabType.WebView, { url: currentUrl });
  });

  // 编辑标题
  const handleEditTitle = useMemoizedFn(() => {
    setEditTitleModalOpen(true);
  });

  // 确认编辑标题
  const handleConfirmEditTitle = useMemoizedFn(
    async (result: { title: string }) => {
      const trimmed = result.title.trim();
      if (!trimmed || trimmed === title) {
        setEditTitleModalOpen(false);
        return;
      }

      const latestProjectItem = await getProjectItemById(projectItemId);
      if (!latestProjectItem) {
        setEditTitleModalOpen(false);
        return;
      }

      const updatedProjectItem = await updateProjectItem({
        ...latestProjectItem,
        title: trimmed,
      });
      if (!updatedProjectItem) {
        setEditTitleModalOpen(false);
        return;
      }

      setProjectItem(updatedProjectItem);
      setTitle(trimmed);

      if (meta.linkId) {
        updateWebLink({
          id: meta.linkId,
          title: trimmed,
        }).catch((err) =>
          console.error("Failed to update web link title:", err),
        );
      }

      projectItemEventBus.publishProjectItemEvent(
        "project-item:updated",
        updatedProjectItem,
      );

      setEditTitleModalOpen(false);
      message.success("标题已更新");
    },
  );

  // 处理编辑器内容变化
  const handleEditorChange = useMemoizedFn((content: Descendant[]) => {
    if (savedWebClip && !isClipping) {
      throttleHandleEditorContentChange(content);
      setParsedContent(content);
    }
  });

  // 点击大纲标题跳转
  const onClickHeader = useMemoizedFn((index: number) => {
    editorRef.current?.scrollHeaderIntoView(index);
  });

  // 是否有解析结果
  const hasClipResult = savedWebClip !== null;

  // 当前显示的内容
  const currentContent = isClipping ? clipContent : parsedContent;

  // 是否显示 webview
  const showWebview = viewMode === "webview" || viewMode === "split";
  // 是否显示解析文档
  const showParsed = viewMode === "parsed" || viewMode === "split";

  // 获取主题色的 active 样式
  const getActiveButtonClass = (
    isActive: boolean,
    color: "green" | "purple",
  ) => {
    if (!isActive) {
      return "bg-transparent text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800";
    }
    // 使用主题色
    if (color === "green") {
      return `${themeColors.activeClass}`;
    }
    if (color === "purple") {
      return `${themeColors.activeClass}`;
    }
    return themeColors.activeClass;
  };

  if (!currentUrl) return null;

  // 渲染文档编辑器区域
  const renderDocumentView = () => (
    <div className="@container/web-clip-editor flex h-full w-full justify-center gap-8 overflow-y-auto border-[20px] border-transparent box-border">
      <div className="relative min-w-0 max-w-[720px] flex-1">
        {isClipping && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
            <LoadingOutlined />
            <span>正在解析网页内容，请稍候...</span>
          </div>
        )}
        {clipError && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
            {clipError}
          </div>
        )}
        <Editor
          key={`${projectItemId}-parsed`}
          ref={editorRef}
          initValue={currentContent}
          onChange={handleEditorChange}
          readonly={isClipping}
          uploadResource={uploadResource}
          extensions={customExtensions}
        />
      </div>
      <EditorOutline
        className="hidden @[1100px]/web-clip-editor:block flex-none self-start"
        content={currentContent}
        show={true}
        onClickHeader={onClickHeader}
      />
    </div>
  );

  return (
    <div className="flex h-full w-full flex-col">
      {/* Header */}
      <div
        className={`flex items-center justify-between border-b ${themeColors.borderClass} px-4 py-2.5`}
      >
        {/* 标题区域 - 点击编辑 icon 弹窗编辑 */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <h1 className="m-0 text-lg font-semibold leading-snug truncate">
            {title}
          </h1>
          <Tooltip title="编辑标题" mouseEnterDelay={0.5}>
            <button
              className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-300 transition-all"
              onClick={handleEditTitle}
            >
              <EditOutlined className="text-sm" />
            </button>
          </Tooltip>
        </div>

        {/* Right side icons */}
        <div className="flex items-center gap-1 ml-2">
          {/* 翻译为中文开关 - 仅在未解析时显示 */}
          {!isClipping && (
            <Tooltip title="解析时翻译为中文" mouseEnterDelay={0.5}>
              <div
                className={`flex items-center gap-1.5 px-2 py-1 rounded-lg ${themeColors.hoverClass} transition-all`}
              >
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  中文
                </span>
                <Switch
                  size="small"
                  checked={translateToChinese}
                  onChange={setTranslateToChinese}
                />
              </div>
            </Tooltip>
          )}

          {/* 切换视图 - 仅当有解析结果且非分屏模式时显示 */}
          {hasClipResult && viewMode !== "split" && (
            <Tooltip
              title={viewMode === "webview" ? "查看解析文档" : "查看原网页"}
              mouseEnterDelay={0.5}
            >
              <button
                className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border-none transition-all ${getActiveButtonClass(viewMode === "parsed", "green")}`}
                onClick={handleToggleView}
              >
                <SwitchViewIcon />
              </button>
            </Tooltip>
          )}

          {/* 解析网页 */}
          <Tooltip
            title={
              isClipping ? "取消解析" : hasClipResult ? "重新解析" : "解析网页"
            }
            mouseEnterDelay={0.5}
          >
            <button
              className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border-none transition-all ${
                isClipping
                  ? "bg-blue-100 dark:bg-blue-900/30 text-blue-500"
                  : "bg-transparent text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
              }`}
              onClick={handleStartClip}
            >
              {isClipping ? <LoadingOutlined /> : <ClipIcon />}
            </button>
          </Tooltip>

          {/* 分屏视图 - 仅当有解析结果时显示 */}
          {hasClipResult && (
            <Tooltip
              title={viewMode === "split" ? "退出分屏" : "分屏视图"}
              mouseEnterDelay={0.5}
            >
              <button
                className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border-none transition-all ${getActiveButtonClass(viewMode === "split", "purple")}`}
                onClick={handleToggleSplit}
              >
                <SplitViewIcon />
              </button>
            </Tooltip>
          )}

          {/* 刷新网页 */}
          <Tooltip title="刷新网页" mouseEnterDelay={0.5}>
            <button
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all"
              onClick={handleRefresh}
            >
              <ReloadOutlined />
            </button>
          </Tooltip>

          {/* 浏览器打开 */}
          <Tooltip title="在浏览器中打开" mouseEnterDelay={0.5}>
            <button
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all"
              onClick={handleOpenInBrowser}
            >
              <ExternalLinkIcon />
            </button>
          </Tooltip>

          {/* 新 Tab 打开 */}
          <Tooltip title="在新标签页打开" mouseEnterDelay={0.5}>
            <button
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all"
              onClick={handleOpenInNewTab}
            >
              <NewTabIcon />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Content area */}
      <div className="relative flex-1 overflow-hidden">
        {viewMode === "split" ? (
          /* 分屏视图 */
          <div className="flex h-full w-full">
            {/* 左侧 Webview */}
            <div className={`flex-1 border-r ${themeColors.borderClass}`}>
              <Webview
                ref={webviewRef}
                src={currentUrl}
                sourceType={meta.sourceType}
                className="h-full w-full"
                allowPopups={false}
                onError={(err) => console.error("加载失败:", err)}
              />
            </div>
            {/* 右侧文档 */}
            <div className="flex-1">{renderDocumentView()}</div>
          </div>
        ) : (
          /* 单页视图 */
          <>
            {/* Webview */}
            <div
              className={`absolute inset-0 transition-opacity duration-200 ${
                showWebview && !showParsed
                  ? "opacity-100 z-10"
                  : "opacity-0 z-0 pointer-events-none"
              }`}
            >
              <Webview
                ref={webviewRef}
                src={currentUrl}
                sourceType={meta.sourceType}
                className="h-full w-full"
                allowPopups={false}
                onError={(err) => console.error("加载失败:", err)}
              />
            </div>

            {/* Parsed document view */}
            <div
              className={`absolute inset-0 transition-opacity duration-200 ${
                showParsed && !showWebview
                  ? "opacity-100 z-10"
                  : "opacity-0 z-0 pointer-events-none"
              }`}
            >
              {renderDocumentView()}
            </div>
          </>
        )}
      </div>

      {/* 编辑标题弹窗 */}
      <EditTitleModal
        open={editTitleModalOpen}
        onCancel={() => setEditTitleModalOpen(false)}
        onConfirm={handleConfirmEditTitle}
        initialTitle={title}
        modalTitle="编辑网页标题"
        modalDescription="修改当前网页的显示标题"
        placeholder="请输入标题"
      />
    </div>
  );
};

export default WebViewProjectItemView;
