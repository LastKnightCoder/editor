import { useState, useRef, useEffect } from "react";
import {
  LoadingOutlined,
  ReloadOutlined,
  EditOutlined,
  MoreOutlined,
  DeleteOutlined,
  FormOutlined,
  BookOutlined,
  SoundOutlined,
} from "@ant-design/icons";
import { App, Tooltip, Dropdown } from "antd";
import type { MenuProps } from "antd";
import { useMemoizedFn } from "ahooks";
import { Descendant, Path, Transforms } from "slate";
import { Webview } from "@tau/shared";
import type { WebviewRef } from "@tau/shared";
import {
  convertFileSrc,
  getHomeDir,
  createWebClip,
  updateWebClip,
  createContentLink,
} from "@/commands";
import {
  remoteResourceToLocal,
  getContentHTML,
  getContentLength,
  importFromMarkdown,
  createFullPageProvider,
  createSmartExtractProvider,
  collectClipStream,
  defaultProjectItemEventBus,
} from "@/utils";
import useGithubCdnUrl from "@/hooks/useGithubCdnUrl";
import { EditorRef } from "@tau/editor/src";
import Editor from "@/components/ContentEditor";
import EditorOutline from "@/components/EditorOutline";
import EditorComment from "@/components/EditorComment";
import EditTitleModal from "@/components/EditTitleModal";
import ResizablePanel from "@/components/ResizablePanel";
import {
  getProjectItemById,
  openExternal,
  updateProjectItem,
  updateWebLink,
  queryContentLinkBySource,
  getWebClipById,
  getContentById,
  createContent,
  updateContent,
  createWebNote,
  updateWebNote,
  deleteWebNote,
  listWebNotesByProjectItemId,
  getWebViewPreference,
  setWebViewPreference,
} from "@/commands";
import { type ProjectItem, WebClip, WebNote } from "@/types";
import useProjectWebLinkMeta from "@/hooks/useProjectWebLinkMeta";
import useThemeColors from "@/hooks/useThemeColors";
import useEditContent from "@/hooks/useEditContent";
import useWebClip from "@/hooks/useWebClip";
import usePodcastAttachment from "@/hooks/usePodcastAttachment";
import { attachPodcastToProjectItem, detachPodcastFromProjectItem } from "@/commands/podcast";
import PodcastGenerationModal from "@/components/PodcastGenerationModal";
import useTabStore from "@/stores/useTabStore";
import useDynamicExtensionsStore from "@/stores/useDynamicExtensionsStore";
import { TabType } from "@/types/tab";
import { useProjectContext } from "../ProjectContext";
import { ReactEditor } from "slate-react";
import type { CommentElement, CustomEditor } from "@tau/editor/src";
import contextMenuStyles from "@/components/WhiteBoard/index.module.less";

// Icons
const ClipIcon = () => (
  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </svg>
);

const SwitchViewIcon = () => (
  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="17 1 21 5 17 9" />
    <path d="M3 11V9a4 4 0 0 1 4-4h14" />
    <polyline points="7 23 3 19 7 15" />
    <path d="M21 13v2a4 4 0 0 1-4 4H3" />
  </svg>
);

const SplitViewIcon = () => (
  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <line x1="12" y1="3" x2="12" y2="21" />
  </svg>
);

const ExternalLinkIcon = () => (
  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

const NewTabIcon = () => (
  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <line x1="9" y1="3" x2="9" y2="21" />
  </svg>
);

const OutlineMenuIcon = () => (
  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="6" cy="6" r="1.5" />
    <circle cx="6" cy="12" r="1.5" />
    <circle cx="6" cy="18" r="1.5" />
    <line x1="10" y1="6" x2="19" y2="6" />
    <line x1="10" y1="12" x2="19" y2="12" />
    <line x1="10" y1="18" x2="19" y2="18" />
  </svg>
);

const CommentSidebarIcon = () => (
  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H12a8.5 8.5 0 0 1-8.5-8.5v-5A3.5 3.5 0 0 1 7 3h10a4 4 0 0 1 4 4z" />
    <path d="M8 11h8" />
    <path d="M8 7h8" />
    <polyline points="8 15 8 19 12 17" />
  </svg>
);

interface WebViewProjectItemViewProps {
  projectItemId: number;
}

// 视图模式：单页网页、单页文档、双页分屏
type ViewMode = "webview" | "document" | "split";

const DEFAULT_CONTENT: Descendant[] = [
  {
    type: "paragraph",
    children: [{ type: "formatted", text: "" }],
  },
];
const createEmptyEditorContent = (): Descendant[] =>
  JSON.parse(JSON.stringify(DEFAULT_CONTENT)) as Descendant[];

const WebViewProjectItemView = (props: WebViewProjectItemViewProps) => {
  const { projectItemId } = props;
  const dynamicExtensions = useDynamicExtensionsStore(state => state.extensions);
  const [projectItem, setProjectItem] = useState<ProjectItem | null>(null);
  const webviewRef = useRef<WebviewRef>(null);
  const editorRef = useRef<EditorRef>(null);
  const slateEditorRef = useRef<CustomEditor | null>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const projectItemEventBus = defaultProjectItemEventBus.createEditor();
  const { message, modal } = App.useApp();
  const themeColors = useThemeColors();
  useProjectContext(); // Keep context active
  const openInNewTab = useTabStore(state => state.openInNewTab);

  // 视图模式
  const [viewMode, setViewMode] = useState<ViewMode>("webview");

  // 已保存的解析结果
  const [savedWebClip, setSavedWebClip] = useState<WebClip | null>(null);
  const [parsedContent, setParsedContent] = useState<Descendant[]>(DEFAULT_CONTENT);
  const [isLocalClipping, setIsLocalClipping] = useState(false);
  const [localClipError, setLocalClipError] = useState<string | null>(null);
  const localClipAbortRef = useRef<AbortController | null>(null);
  const [clipMenuOpen, setClipMenuOpen] = useState(false);
  const clipMenuCloseTimerRef = useRef<number | null>(null);

  // 编辑标题弹窗
  const [editTitleModalOpen, setEditTitleModalOpen] = useState(false);
  const [creatingDocument, setCreatingDocument] = useState(false);
  const [notes, setNotes] = useState<WebNote[]>([]);
  const [noteContents, setNoteContents] = useState<Record<number, Descendant[]>>({});
  const [activeDocumentSource, setActiveDocumentSource] = useState<"parsed" | "note">("parsed");
  const [activeNoteId, setActiveNoteId] = useState<number | null>(null);
  const [preferredNoteContentId, setPreferredNoteContentId] = useState<number | null>(null);
  const [renamingNote, setRenamingNote] = useState<WebNote | null>(null);

  const [sidebarMode, setSidebarMode] = useState<"outline" | "comments" | null>("outline");

  useEffect(() => {
    getProjectItemById(projectItemId).then(item => {
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

  const loadNoteContent = useMemoizedFn(async (note: WebNote) => {
    try {
      const content = await getContentById(note.contentId);
      if (!content || !content.content) return;
      setNoteContents(prev => ({
        ...prev,
        [note.contentId]: content.content,
      }));
      if (
        activeDocumentSource === "note" &&
        activeNoteId === note.id &&
        (viewMode === "document" || viewMode === "split")
      ) {
        editorRef.current?.setEditorValue(content.content);
      }
    } catch (error) {
      console.error("Failed to load note content:", error);
      message.error("加载笔记内容失败");
    }
  });

  useEffect(() => {
    let cancelled = false;
    const loadNotesAndPreference = async () => {
      try {
        const [noteList, preference] = await Promise.all([
          listWebNotesByProjectItemId(projectItemId),
          getWebViewPreference(projectItemId),
        ]);
        if (cancelled) return;
        const firstNote = noteList[0] ? [noteList[0]] : [];
        setNotes(firstNote);
        const firstId = firstNote[0]?.id ?? null;
        setActiveNoteId(firstId);
        if (firstNote[0]) {
          loadNoteContent(firstNote[0]);
        }
        setPreferredNoteContentId(preference?.preferredContentId ?? null);
      } catch (error) {
        console.error("Failed to load notes for project item:", error);
      }
    };
    loadNotesAndPreference();
    return () => {
      cancelled = true;
    };
  }, [projectItemId, loadNoteContent]);

  useEffect(() => {
    if (notes.length === 0) {
      if (activeNoteId !== null) {
        setActiveNoteId(null);
      }
      return;
    }
    const exists = notes.find(note => note.id === activeNoteId);
    if (!exists) {
      setActiveNoteId(notes[0].id);
    }
  }, [notes, activeNoteId]);

  const persistPreferredNote = useMemoizedFn(async (contentId: number | null) => {
    try {
      await setWebViewPreference({
        projectItemId,
        preferredContentId: contentId,
      });
      setPreferredNoteContentId(contentId);
    } catch (error) {
      console.error("Failed to save web view preference:", error);
    }
  });

  useEffect(() => {
    const note = notes[0] ?? null;
    if (preferredNoteContentId && note) {
      if (note.contentId === preferredNoteContentId) {
        setActiveDocumentSource("note");
        setActiveNoteId(note.id);
        loadNoteContent(note);
      } else {
        void persistPreferredNote(null);
      }
    }
    if (preferredNoteContentId && !note) {
      void persistPreferredNote(null);
    }
  }, [preferredNoteContentId, notes, loadNoteContent, persistPreferredNote]);

  // 查询已有的解析结果
  useEffect(() => {
    const loadExistingWebClip = async () => {
      console.log("[WebClip] Loading existing web clip for projectItemId:", projectItemId);
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
              console.log("[WebClip] Setting parsed content, length:", content.content.length);
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
  const { throttleHandleEditorContentChange } = useEditContent(savedWebClip?.contentId, content => {
    console.log("[WebClip] useEditContent callback, content length:", content.length);
    editorRef.current?.setEditorValue(content);
    setParsedContent(content);
  });

  // 使用 useWebClip hook 管理解析流程
  const {
    isClipping,
    content: clipContent,
    error: clipError,
    startClip,
    cancelClip,
    reset: resetClipState,
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
        content.length
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
    onError: error => {
      message.error(`解析失败: ${error}`);
    },
  });

  const isAnyClipping = isClipping || isLocalClipping;
  // 编辑器接入的 content：笔记视图用笔记的 contentId，网页剪辑在保存前没有 contentId。
  const editorContentId =
    activeDocumentSource === "note"
      ? notes.find(note => note.id === activeNoteId)?.contentId
      : isAnyClipping
        ? undefined
        : savedWebClip?.contentId;
  const currentClipError = localClipError || clipError;

  const cancelLocalClip = useMemoizedFn(() => {
    if (localClipAbortRef.current) {
      localClipAbortRef.current.abort();
      localClipAbortRef.current = null;
    }
    setIsLocalClipping(false);
  });

  const cancelAnyClip = useMemoizedFn(async () => {
    if (isClipping) {
      await cancelClip();
    }
    if (isLocalClipping) {
      cancelLocalClip();
    }
  });

  const clearClipMenuCloseTimer = useMemoizedFn(() => {
    if (clipMenuCloseTimerRef.current) {
      window.clearTimeout(clipMenuCloseTimerRef.current);
      clipMenuCloseTimerRef.current = null;
    }
  });

  const openClipMenu = useMemoizedFn(() => {
    clearClipMenuCloseTimer();
    setClipMenuOpen(true);
  });

  const scheduleCloseClipMenu = useMemoizedFn(() => {
    clearClipMenuCloseTimer();
    clipMenuCloseTimerRef.current = window.setTimeout(() => {
      setClipMenuOpen(false);
      clipMenuCloseTimerRef.current = null;
    }, 180);
  });

  const closeClipMenu = useMemoizedFn(() => {
    clearClipMenuCloseTimer();
    setClipMenuOpen(false);
  });

  useEffect(() => {
    return () => {
      clearClipMenuCloseTimer();
    };
  }, [clearClipMenuCloseTimer]);

  // 播客生成
  const { podcastModalOpen, openPodcastModal, closePodcastModal, handlePodcastSuccess } =
    usePodcastAttachment({
      hostId: projectItemId,
      currentPodcast: projectItem?.podcast,
      attachPodcast: attachPodcastToProjectItem,
      detachPodcast: detachPodcastFromProjectItem,
      reloadHost: getProjectItemById,
      onHostReloaded: setProjectItem,
      message,
      messages: {
        created: "播客已添加到文档",
      },
    });

  // 当视图模式变化时，如果是解析视图，确保 Editor 内容正确
  useEffect(() => {
    if (viewMode === "document" || viewMode === "split") {
      const activeNote =
        activeDocumentSource === "note" ? notes.find(note => note.id === activeNoteId) : null;
      const content =
        activeDocumentSource === "note" && activeNote
          ? (noteContents[activeNote.contentId] ?? createEmptyEditorContent())
          : isClipping
            ? clipContent
            : parsedContent;
      const timer = setTimeout(() => {
        editorRef.current?.setEditorValue(content);
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [
    viewMode,
    parsedContent,
    clipContent,
    isClipping,
    activeDocumentSource,
    activeNoteId,
    noteContents,
    notes,
  ]);

  const saveLocalClipResult = useMemoizedFn(async (content: Descendant[]) => {
    if (!currentUrl) {
      throw new Error("无法获取网页 URL");
    }

    const links = await queryContentLinkBySource({
      sourceId: projectItemId,
      sourceType: "project_item",
      targetType: "web_clip",
    });

    if (links.length > 0) {
      const existingWebClip = await getWebClipById(links[0].targetId);
      if (existingWebClip) {
        const previous = await getContentById(existingWebClip.contentId);
        await updateContent(existingWebClip.contentId, content, previous?.revision);
        const updatedWebClip = await updateWebClip({
          id: existingWebClip.id,
          url: currentUrl || existingWebClip.url,
          title: title || existingWebClip.title,
        });
        setSavedWebClip(updatedWebClip);
        return updatedWebClip;
      }
    }

    const contentId = await createContent(content, getContentLength(content));
    if (!contentId) {
      throw new Error("创建内容失败");
    }

    const createdWebClip = await createWebClip({
      contentId,
      url: currentUrl,
      title: title || "解析文档",
    });
    await createContentLink({
      sourceId: projectItemId,
      sourceType: "project_item",
      targetId: createdWebClip.id,
      targetType: "web_clip",
    });
    setSavedWebClip(createdWebClip);
    return createdWebClip;
  });

  const doStartLocalClip = useMemoizedFn(async (mode: "smart" | "full") => {
    if (!currentUrl) {
      message.error("无法获取网页 URL");
      return;
    }

    try {
      if (viewMode === "webview") {
        setViewMode("document");
      }
      setActiveDocumentSource("parsed");
      void persistPreferredNote(null);

      resetClipState();
      setLocalClipError(null);
      setIsLocalClipping(true);

      const abortController = new AbortController();
      localClipAbortRef.current = abortController;

      const html = await webviewRef.current?.getHTML();
      if (!html) {
        message.error("获取网页内容失败");
        if (viewMode !== "split") {
          setViewMode("webview");
        }
        return;
      }

      const provider = mode === "smart" ? createSmartExtractProvider() : createFullPageProvider();

      const markdown = await collectClipStream(
        provider.clip({
          html,
          url: currentUrl,
          title: title || "",
          options: {
            smartExtractClean: true,
            debug: true,
          },
          signal: abortController.signal,
        })
      );

      const parsed = importFromMarkdown(markdown, ["yaml"]);
      if (!parsed || parsed.length === 0) {
        throw new Error("解析结果为空");
      }

      await saveLocalClipResult(parsed);
      setParsedContent(parsed);
      editorRef.current?.setEditorValue(parsed);
      message.success("网页解析完成");
    } catch (error) {
      if (error instanceof Error && error.message === "aborted") {
        return;
      }
      const errorMessage = error instanceof Error ? error.message : "解析失败";
      setLocalClipError(errorMessage);
      message.error(`解析失败: ${errorMessage}`);
      if (viewMode !== "split") {
        setViewMode("webview");
      }
    } finally {
      localClipAbortRef.current = null;
      setIsLocalClipping(false);
    }
  });

  const handleStartLocalClip = useMemoizedFn(async (mode: "smart" | "full") => {
    if (isAnyClipping) {
      await cancelAnyClip();
      return;
    }

    if (savedWebClip) {
      modal.confirm({
        title: "重新解析网页",
        content: "已存在解析文档，重新解析将覆盖现有内容。确定要继续吗？",
        okText: "确定",
        cancelText: "取消",
        onOk: () => doStartLocalClip(mode),
      });
      return;
    }

    doStartLocalClip(mode);
  });

  // 执行解析
  const doStartClip = useMemoizedFn(async () => {
    if (!currentUrl) {
      message.error("无法获取网页 URL");
      return;
    }

    try {
      // 切换到解析视图或分屏视图
      if (viewMode === "webview") {
        setViewMode("document");
      }
      setActiveDocumentSource("parsed");
      void persistPreferredNote(null);
      setLocalClipError(null);

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
      void startClip(contentHTML, currentUrl, title || "", false);
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
    if (isAnyClipping) {
      await cancelAnyClip();
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

  const createNote = useMemoizedFn(async () => {
    if (creatingDocument) return notes[0] ?? null;
    if (notes.length > 0) {
      return notes[0];
    }
    const emptyContent = createEmptyEditorContent();
    setCreatingDocument(true);
    try {
      const contentId = await createContent(emptyContent, getContentLength(emptyContent));
      if (!contentId) {
        throw new Error("failed-to-create-content");
      }
      const defaultTitle = `笔记 ${notes.length + 1}`;
      const note = await createWebNote({
        projectItemId,
        contentId,
        title: defaultTitle,
      });
      setNotes([note]);
      setNoteContents(prev => ({
        ...prev,
        [note.contentId]: emptyContent,
      }));
      setActiveNoteId(note.id);
      await persistPreferredNote(note.contentId);
      message.success("已创建新笔记");
      return note;
    } catch (error) {
      console.error("Failed to create note:", error);
      message.error("创建笔记失败，请重试");
      return null;
    } finally {
      setCreatingDocument(false);
    }
  });

  const ensureNoteAvailable = useMemoizedFn(async () => {
    let note: WebNote | null = notes[0] ?? null;
    if (!note) {
      note = await createNote();
    }
    if (note) {
      setActiveNoteId(note.id);
      loadNoteContent(note);
    }
    return note;
  });

  const setParsedEditorContent = useMemoizedFn(() => {
    const content = isClipping ? clipContent : parsedContent;
    editorRef.current?.setEditorValue(content);
  });

  const setNoteEditorContent = useMemoizedFn((target?: WebNote | null) => {
    const note = target ?? notes[0] ?? null;
    if (!note) return;
    const content = noteContents[note.contentId] ?? createEmptyEditorContent();
    editorRef.current?.setEditorValue(content);
  });

  const handleToggleParsedDocument = useMemoizedFn(() => {
    if (!hasClipResult) return;
    if (viewMode === "split") {
      setActiveDocumentSource("parsed");
      void persistPreferredNote(null);
      setParsedEditorContent();
      return;
    }
    if (viewMode === "document" && activeDocumentSource === "parsed") {
      setViewMode("webview");
      return;
    }
    setActiveDocumentSource("parsed");
    void persistPreferredNote(null);
    setViewMode("document");
    setParsedEditorContent();
  });

  const handleToggleNoteDocument = useMemoizedFn(async () => {
    const note = await ensureNoteAvailable();
    if (!note) return;
    if (viewMode === "split") {
      setActiveDocumentSource("note");
      void persistPreferredNote(note.contentId);
      setNoteEditorContent(note);
      return;
    }
    if (viewMode === "document" && activeDocumentSource === "note") {
      setViewMode("webview");
      return;
    }
    setActiveDocumentSource("note");
    void persistPreferredNote(note.contentId);
    setViewMode("document");
    setNoteEditorContent(note);
  });

  const handleDeleteNote = useMemoizedFn(async (noteId: number) => {
    const note = notes.find(item => item.id === noteId);
    if (!note) return;
    try {
      await deleteWebNote(noteId);
      const remainingNotes = notes.filter(item => item.id !== noteId);
      setNotes(remainingNotes);
      setNoteContents(prev => {
        const next = { ...prev };
        delete next[note.contentId];
        return next;
      });
      if (preferredNoteContentId === note.contentId) {
        await persistPreferredNote(null);
      }
      if (activeNoteId === noteId) {
        if (remainingNotes.length > 0) {
          const fallback = remainingNotes[0];
          setActiveDocumentSource("note");
          setActiveNoteId(fallback.id);
          loadNoteContent(fallback);
          await persistPreferredNote(fallback.contentId);
        } else {
          setActiveNoteId(null);
          await persistPreferredNote(null);
          if (viewMode === "split") {
            if (hasClipResult) {
              setActiveDocumentSource("parsed");
            }
          } else if (viewMode === "document" && activeDocumentSource === "note") {
            if (hasClipResult) {
              setActiveDocumentSource("parsed");
            } else {
              setViewMode("webview");
            }
          }
        }
      }
      message.success("笔记已删除");
    } catch (error) {
      console.error("Failed to delete note:", error);
      message.error("删除笔记失败，请重试");
    }
  });

  const handleOpenRenameNote = useMemoizedFn((targetNote?: WebNote) => {
    const note = targetNote ?? notes.find(item => item.id === activeNoteId || 0);
    if (note) {
      setRenamingNote(note);
    }
  });

  const handleConfirmRenameNote = useMemoizedFn(async (result: { title: string }) => {
    const note = renamingNote;
    if (!note) {
      setRenamingNote(null);
      return;
    }
    const trimmed = result.title.trim();
    if (!trimmed || trimmed === note.title) {
      setRenamingNote(null);
      return;
    }
    try {
      const updated = await updateWebNote({
        id: note.id,
        title: trimmed,
      });
      setNotes(prev => prev.map(item => (item.id === updated.id ? updated : item)));
      message.success("笔记标题已更新");
    } catch (error) {
      console.error("Failed to rename note:", error);
      message.error("重命名笔记失败，请重试");
    } finally {
      setRenamingNote(null);
    }
  });

  // legacy dropdown removed

  // 切换分屏视图
  const handleToggleSplit = useMemoizedFn(async () => {
    if (viewMode === "split") {
      setViewMode("webview");
      return;
    }
    let nextSource = activeDocumentSource;
    if (nextSource === "note") {
      const note = await ensureNoteAvailable();
      if (!note) {
        if (hasClipResult) {
          nextSource = "parsed";
        } else {
          message.warning("暂无可显示的文档");
          return;
        }
      } else {
        loadNoteContent(note);
        await persistPreferredNote(note.contentId);
        setNoteEditorContent(note);
      }
    }
    if (nextSource === "parsed" && !hasClipResult) {
      const note = await createNote();
      if (note) {
        nextSource = "note";
        loadNoteContent(note);
        await persistPreferredNote(note.contentId);
        setNoteEditorContent(note);
      } else {
        message.warning("暂无可显示的文档");
        return;
      }
    }
    if (nextSource === "parsed") {
      setParsedEditorContent();
    }
    setActiveDocumentSource(nextSource);
    setViewMode("split");
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
  const handleConfirmEditTitle = useMemoizedFn(async (result: { title: string }) => {
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
      }).catch(err => console.error("Failed to update web link title:", err));
    }

    projectItemEventBus.publishProjectItemEvent("project-item:updated", updatedProjectItem);

    setEditTitleModalOpen(false);
    message.success("标题已更新");
  });

  // 处理编辑器内容变化
  const handleEditorChange = useMemoizedFn((content: Descendant[]) => {
    if (activeDocumentSource === "note") {
      const note = notes.find(n => n.id === activeNoteId);
      if (!note) return;
      setNoteContents(prev => ({
        ...prev,
        [note.contentId]: content,
      }));
      return;
    }
    if (savedWebClip && !isAnyClipping) {
      throttleHandleEditorContentChange(content);
      setParsedContent(content);
    }
  });

  // 点击大纲标题跳转
  const onClickHeader = useMemoizedFn((index: number) => {
    editorRef.current?.scrollHeaderIntoView(index);
  });

  const handleSidebarCommentClick = useMemoizedFn((_element: CommentElement, path: Path) => {
    const slateEditor = slateEditorRef.current;
    if (!slateEditor) return;
    try {
      Transforms.setNodes(slateEditor, { openEdit: true }, { at: path });
      ReactEditor.focus(slateEditor);
    } catch (error) {
      console.error("Failed to open comment popover:", error);
    }
  });

  // 处理播客生成
  const handleGeneratePodcast = useMemoizedFn(() => {
    // 检查是否有转录文档
    if (!hasClipResult || parsedContent.length === 0) {
      message.warning("请先转录网页内容后再生成播客");
      return;
    }

    openPodcastModal();
  });

  const moreMenuItems: MenuProps["items"] = [
    {
      key: "refresh",
      label: (
        <div className="flex items-center gap-2">
          <ReloadOutlined />
          <span>刷新网页</span>
        </div>
      ),
    },
    {
      key: "browser",
      label: (
        <div className="flex items-center gap-2">
          <ExternalLinkIcon />
          <span>在浏览器中打开</span>
        </div>
      ),
    },
    {
      key: "new-tab",
      label: (
        <div className="flex items-center gap-2">
          <NewTabIcon />
          <span>在新标签页打开</span>
        </div>
      ),
    },
  ];

  if (notes.length > 0) {
    moreMenuItems.push(
      { type: "divider" },
      {
        key: "note-rename",
        label: (
          <div className="flex items-center gap-2">
            <FormOutlined />
            <span>重命名笔记</span>
          </div>
        ),
      },
      {
        key: "note-delete",
        label: (
          <div className="flex items-center gap-2 text-red-500">
            <DeleteOutlined />
            <span>删除笔记</span>
          </div>
        ),
      }
    );
  }

  // 添加播客生成菜单项
  moreMenuItems.push(
    { type: "divider" },
    {
      key: "generate-podcast",
      label: (
        <div className="flex items-center gap-2">
          <SoundOutlined />
          <span>{projectItem?.podcast ? "编辑播客" : "生成播客"}</span>
        </div>
      ),
    }
  );

  const handleMoreMenuClick = useMemoizedFn<NonNullable<MenuProps["onClick"]>>(({ key }) => {
    if (key === "refresh") {
      handleRefresh();
    } else if (key === "browser") {
      handleOpenInBrowser();
    } else if (key === "new-tab") {
      handleOpenInNewTab();
    } else if (key === "note-rename" && notes[0]) {
      handleOpenRenameNote(notes[0]);
    } else if (key === "note-delete" && notes[0]) {
      modal.confirm({
        title: "删除笔记",
        content: "删除后无法恢复，确定删除这篇笔记吗？",
        okText: "删除",
        okButtonProps: { danger: true },
        cancelText: "取消",
        onOk: () => handleDeleteNote(notes[0].id),
      });
    } else if (key === "generate-podcast") {
      handleGeneratePodcast();
    }
  });

  // 是否有解析结果
  const hasClipResult = savedWebClip !== null;

  // 当前显示的内容
  const activeNote =
    activeNoteId !== null
      ? (notes.find(note => note.id === activeNoteId) ?? notes[0] ?? null)
      : (notes[0] ?? null);
  const currentContent =
    activeDocumentSource === "note" && activeNote
      ? (noteContents[activeNote.contentId] ?? createEmptyEditorContent())
      : isClipping
        ? clipContent
        : parsedContent;

  // 是否显示 webview
  const showWebview = viewMode === "webview" || viewMode === "split";
  // 是否显示文档
  const showDocument = viewMode === "document" || viewMode === "split";

  // 获取主题色的 active 样式
  const getActiveButtonClass = (isActive: boolean, color: "green" | "purple") => {
    if (!isActive) {
      return "bg-transparent text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800";
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

  const getClipMenuItemClass = (disabled: boolean) =>
    `${contextMenuStyles.contextMenuItemButton} ${
      disabled ? contextMenuStyles.contextMenuItemDisabled : ""
    }`;

  const hasAnyDocument = hasClipResult || notes.length > 0;
  const showDocumentSidebar = hasAnyDocument && (viewMode === "document" || viewMode === "split");
  const docButtonActive =
    (viewMode === "document" && activeDocumentSource === "parsed") ||
    (viewMode === "split" && activeDocumentSource === "parsed");
  const noteButtonActive =
    (viewMode === "document" && activeDocumentSource === "note") ||
    (viewMode === "split" && activeDocumentSource === "note");
  const docTooltip =
    viewMode === "split" ? "在分屏中显示解析文档" : docButtonActive ? "查看网页" : "查看解析文档";
  const noteTooltip =
    notes.length > 0
      ? viewMode === "split"
        ? "在分屏中显示笔记"
        : noteButtonActive
          ? "查看网页"
          : "查看笔记"
      : creatingDocument
        ? "正在创建笔记"
        : "创建并查看笔记";
  const showCommentSidebar = showDocumentSidebar && sidebarMode === "comments";
  const showOutlineSidebar = showDocumentSidebar && sidebarMode === "outline";
  const showSidebarPlaceholder = showCommentSidebar || showOutlineSidebar;
  const sidebarPlaceholderVisibilityClass =
    showCommentSidebar && !showOutlineSidebar
      ? "@[800px]/web-clip-editor:w-[40px] w-[120px]"
      : "w-[120px] hidden @[800px]/web-clip-editor:block @[800px]/web-clip-editor:w-[40px]";
  const outlineResponsiveClass = "hidden @[800px]/web-clip-editor:block";

  if (!currentUrl) return null;

  // 渲染文档编辑器区域
  const renderDocumentView = () => (
    <div className="@container/web-clip-editor border-20 box-border flex h-full w-full overflow-hidden border-transparent">
      <div className="min-h-0 min-w-0 flex-1">
        <div
          ref={editorContainerRef}
          className="flex h-full w-full items-start justify-center overflow-y-auto pr-1"
        >
          {showSidebarPlaceholder && (
            <div
              className={`${sidebarPlaceholderVisibilityClass} mr-6 flex-none`}
              aria-hidden={true}
            />
          )}
          <div className="relative min-w-0 max-w-[720px] flex-1">
            {isAnyClipping && (
              <div
                className={`mb-4 flex items-center gap-2 rounded-lg border ${themeColors.borderClass} ${"bg-[var(--th-bg-hover)]"} px-4 py-3 text-sm ${themeColors.textClass}`}
              >
                <LoadingOutlined />
                <span>正在解析网页内容，请稍候...</span>
              </div>
            )}
            {currentClipError && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
                {currentClipError}
              </div>
            )}
            <Editor
              contentId={editorContentId}
              className="mx-20"
              key={`${projectItemId}-${activeDocumentSource}-${activeNoteId ?? "parsed"}`}
              ref={editorRef}
              initValue={currentContent}
              onChange={handleEditorChange}
              readonly={activeDocumentSource === "parsed" && isAnyClipping}
              extensions={dynamicExtensions}
              onInit={editorInstance => {
                slateEditorRef.current = editorInstance as CustomEditor;
              }}
            />
          </div>
          {showCommentSidebar && (
            <div className="ml-6 w-[280px] flex-none self-start">
              <EditorComment
                className="w-full"
                editorRef={slateEditorRef}
                containerRef={editorContainerRef}
                show={true}
                onCommentClick={handleSidebarCommentClick}
              />
            </div>
          )}
          {showOutlineSidebar && (
            <div
              className={`${outlineResponsiveClass} sticky top-4 ml-6 w-[280px] flex-none self-start`}
            >
              <div className="scrollbar-hide max-h-[calc(100vh-220px)] min-h-0 overflow-y-auto pb-4 pr-1">
                <EditorOutline
                  className="w-full"
                  content={currentContent}
                  show={true}
                  onClickHeader={onClickHeader}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-full w-full flex-col">
      {/* Header */}
      <div
        className={`flex items-center justify-between border-b ${themeColors.borderClass} px-4 py-2.5`}
      >
        {/* 标题区域 - 点击编辑 icon 弹窗编辑 */}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <h1 className="m-0 truncate text-lg font-semibold leading-snug">{title}</h1>
          <Tooltip title="编辑标题" mouseEnterDelay={0.5}>
            <button
              className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent text-gray-400 transition-all hover:bg-gray-100 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-zinc-800 dark:hover:text-gray-300"
              onClick={handleEditTitle}
            >
              <EditOutlined className="text-sm" />
            </button>
          </Tooltip>
        </div>

        {/* Right side icons */}
        <div className="ml-2 flex items-center gap-1">
          {showDocumentSidebar && (
            <>
              <Tooltip title="显示/隐藏目录" mouseEnterDelay={0.5}>
                <button
                  className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border-none transition-all ${getActiveButtonClass(sidebarMode === "outline", "green")}`}
                  onClick={() => setSidebarMode(sidebarMode === "outline" ? null : "outline")}
                >
                  <OutlineMenuIcon />
                </button>
              </Tooltip>
              <Tooltip title="显示/隐藏评论" mouseEnterDelay={0.5}>
                <button
                  className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border-none transition-all ${getActiveButtonClass(sidebarMode === "comments", "purple")}`}
                  onClick={() => setSidebarMode(sidebarMode === "comments" ? null : "comments")}
                >
                  <CommentSidebarIcon />
                </button>
              </Tooltip>
            </>
          )}
          {hasClipResult && (
            <Tooltip title={docTooltip} mouseEnterDelay={0.5}>
              <button
                className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border-none transition-all ${getActiveButtonClass(docButtonActive, "green")}`}
                onClick={handleToggleParsedDocument}
              >
                <SwitchViewIcon />
              </button>
            </Tooltip>
          )}
          <Tooltip title={noteTooltip} mouseEnterDelay={0.5}>
            <button
              className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border-none transition-all ${getActiveButtonClass(noteButtonActive, "purple")} disabled:cursor-not-allowed disabled:opacity-50`}
              onClick={() => {
                if (creatingDocument && notes.length === 0) return;
                void handleToggleNoteDocument();
              }}
              disabled={creatingDocument && notes.length === 0}
            >
              <BookOutlined />
            </button>
          </Tooltip>

          {/* 解析网页 */}
          <div
            className="relative"
            onMouseEnter={openClipMenu}
            onMouseLeave={scheduleCloseClipMenu}
          >
            <Tooltip
              title={isAnyClipping ? "取消解析" : hasClipResult ? "重新解析" : "解析网页"}
              mouseEnterDelay={0.5}
            >
              <button
                className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border-none transition-all ${
                  isAnyClipping
                    ? `${themeColors.activeClass}`
                    : "bg-transparent text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-zinc-800"
                }`}
                onClick={() => {
                  closeClipMenu();
                  void handleStartClip();
                }}
              >
                {isAnyClipping ? <LoadingOutlined /> : <ClipIcon />}
              </button>
            </Tooltip>
            <div
              className={`absolute right-0 top-full z-40 h-2 w-[240px] ${
                clipMenuOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
              }`}
            />
            <div
              className={`${contextMenuStyles.contextMenu} absolute right-0 top-full z-50 mt-2 ${
                clipMenuOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
              } transition-opacity`}
            >
              <div className={contextMenuStyles.contextMenuList}>
                <button
                  type="button"
                  className={getClipMenuItemClass(isAnyClipping)}
                  onClick={() => {
                    closeClipMenu();
                    void handleStartClip();
                  }}
                  disabled={isAnyClipping}
                >
                  <span className={contextMenuStyles.contextMenuItemLabel}>LLM 转录</span>
                </button>
                <button
                  type="button"
                  className={getClipMenuItemClass(isAnyClipping)}
                  onClick={() => {
                    closeClipMenu();
                    handleStartLocalClip("smart");
                  }}
                  disabled={isAnyClipping}
                >
                  <span className={contextMenuStyles.contextMenuItemLabel}>剪藏网页</span>
                </button>
              </div>
            </div>
          </div>

          {/* 分屏视图 - 仅当有文档时显示 */}
          {hasAnyDocument && (
            <Tooltip title={viewMode === "split" ? "退出分屏" : "分屏视图"} mouseEnterDelay={0.5}>
              <button
                className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border-none transition-all ${getActiveButtonClass(viewMode === "split", "purple")}`}
                onClick={() => void handleToggleSplit()}
              >
                <SplitViewIcon />
              </button>
            </Tooltip>
          )}

          {/* 更多操作 */}
          <Dropdown
            menu={{ items: moreMenuItems, onClick: handleMoreMenuClick }}
            trigger={["click"]}
            placement="bottomRight"
          >
            <Tooltip title="更多操作" mouseEnterDelay={0.5}>
              <button
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent text-gray-600 transition-all hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-zinc-800"
                onClick={e => e.preventDefault()}
              >
                <MoreOutlined />
              </button>
            </Tooltip>
          </Dropdown>
        </div>
      </div>

      {/* Content area */}
      <div className="relative flex-1 overflow-hidden">
        {viewMode === "split" ? (
          /* 分屏视图 */
          <ResizablePanel
            id={`project-webview-split-${projectItemId}`}
            className="h-full w-full"
            leftClassName={`h-full overflow-hidden border-r ${themeColors.borderClass}`}
            rightClassName="h-full overflow-hidden"
            minLeft={360}
            minRight={420}
            initialLeftRatio={0.5}
            left={
              <Webview
                ref={webviewRef}
                src={currentUrl}
                sourceType={meta.sourceType}
                className="h-full w-full"
                allowPopups={false}
                onError={err => console.error("加载失败:", err)}
                convertFileSrc={convertFileSrc}
                getHomeDir={getHomeDir}
                remoteResourceToLocal={remoteResourceToLocal}
                cdnUrlResolver={useGithubCdnUrl}
              />
            }
            right={<div className="h-full w-full">{renderDocumentView()}</div>}
          />
        ) : (
          /* 单页视图 */
          <>
            {/* Webview */}
            <div
              className={`absolute inset-0 transition-opacity duration-200 ${
                showWebview && !showDocument
                  ? "z-10 opacity-100"
                  : "pointer-events-none z-0 opacity-0"
              }`}
            >
              <Webview
                ref={webviewRef}
                src={currentUrl}
                sourceType={meta.sourceType}
                className="h-full w-full"
                allowPopups={false}
                onError={err => console.error("加载失败:", err)}
                convertFileSrc={convertFileSrc}
                getHomeDir={getHomeDir}
                remoteResourceToLocal={remoteResourceToLocal}
                cdnUrlResolver={useGithubCdnUrl}
              />
            </div>
            <div
              className={`absolute inset-0 transition-opacity duration-200 ${
                showDocument && !showWebview
                  ? "z-10 opacity-100"
                  : "pointer-events-none z-0 opacity-0"
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
      <EditTitleModal
        open={!!renamingNote}
        onCancel={() => setRenamingNote(null)}
        onConfirm={handleConfirmRenameNote}
        initialTitle={renamingNote?.title || ""}
        modalTitle="重命名笔记"
        modalDescription="修改当前笔记的名称"
        placeholder="请输入笔记标题"
      />

      {/* 播客生成弹窗 */}
      <PodcastGenerationModal
        open={podcastModalOpen}
        cardContent={parsedContent}
        initialPodcast={projectItem?.podcast}
        onSuccess={handlePodcastSuccess}
        onCancel={closePodcastModal}
        saveText="保存到文档"
      />
    </div>
  );
};

export default WebViewProjectItemView;
