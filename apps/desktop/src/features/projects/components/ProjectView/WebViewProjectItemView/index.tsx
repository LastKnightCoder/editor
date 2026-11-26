import { useProjectWebI18n } from "./i18n";
import { projectWebT, projectWebFailureText } from "./binding";
import { ProjectWebFailure } from "@/services/project-web-failure";
/**
 * 网页型项目条目视图。
 *
 * 版式（取代原「7 枚图标按钮 + 分屏」顶栏）：
 * - 顶栏只留 标题 · [网页 | 文档] 分段 · 侧栏开关 · ⋯。
 * - 主区在「网页」与「文档」（解析文档）之间切换；两层常驻挂载、按透明度切换，
 *   保证 webview 不重载、解析时仍能取到网页 HTML。
 * - 「文档」未解析时主区给空状态，解析入口（LLM 转录 / 剪藏网页）就放在这里；
 *   重新解析收进 ⋯。
 * - 右侧栏承载 目录 / 笔记（网页视图下只有笔记），分屏模式随之取消——
 *   笔记本身就是伴随阅读的侧栏内容。
 * - 批注卡片须随正文滚动对齐锚点，不能进固定侧栏：解析文档含批注时自动铺在页边。
 */

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import {
  Loader2,
  RotateCw,
  Pencil,
  MoreHorizontal,
  Trash2,
  PenLine,
  Globe,
  FileText,
  PanelRight,
  Sparkles,
  Scissors,
  ExternalLink,
  AppWindow,
  RefreshCcw,
  X,
  NotebookPen,
} from "lucide-react";
import { useLocalStorageState, useMemoizedFn } from "ahooks";
import { renderMenuEntries, usePluginMenuEntries, type MenuEntryList } from "../shared/menuEntries";
import { Descendant, Path, Transforms } from "slate";
import { Webview } from "@tau/shared";
import type { WebviewRef } from "@tau/shared";
import { convertFileSrc, getHomeDir, createWebClip, updateWebClip } from "@/commands";
import { findClippedWebClipId, recordWebClip } from "@/commands/lineage";
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
import { Editor as LocalEditor, type EditorRef } from "@tau/editor";
import { getContentKit } from "@/services/editorKit";
import { useLocalEditorDocument } from "@/hooks/useLocalEditorDocument";
import Editor from "@/components/ContentEditor";
import { usePageParams } from "@/page/PageProvider";
import {
  ContentOutline,
  extractContentHeaders,
  resolveEditorHeaderAnchor,
  type OutlineHeader,
} from "@/components/ContentOutline";
import EditorComment from "@/components/EditorComment";
import EditTitleModal from "@/components/EditTitleModal";
import { ResizableAndHideableSidebar as ResizeableAndHideableSidebar } from "@tau/ui";
import { FadeScroll } from "@tau/ui";
import {
  getProjectItemById,
  openExternal,
  updateProjectItem,
  updateWebLink,
  getWebClipById,
  getContentById,
  createContent,
  replaceContent,
  createWebNote,
  updateWebNote,
  deleteWebNote,
  listWebNotesByProjectItemId,
  getWebViewPreference,
  setWebViewPreference,
} from "@/commands";
import { type ProjectItem, WebClip, WebNote } from "@/types";
import useProjectWebLinkMeta from "@/hooks/useProjectWebLinkMeta";
import useWebClip from "@/hooks/useWebClip";
import { usePage } from "@/page/PageProvider";
import { useProjectContext } from "../ProjectContext";
import { ReactEditor } from "slate-react";
import type { CustomEditor } from "@tau/editor";
import { type CommentElement } from "@tau/editor/extensions/comment/types";
import { toast, Tooltip, ConfirmDialog, Menu, Segmented, IconButton, Button } from "@tau/ui";

interface WebViewProjectItemViewProps {
  projectItemId: number;
}

/** 主区视图：原网页 / 解析文档 */
type MainView = "web" | "parsed";
/** 右侧栏页签（网页视图下只有笔记） */
type RailTab = "outline" | "note";

const DEFAULT_CONTENT: Descendant[] = [
  {
    type: "paragraph",
    children: [{ type: "formatted", text: "" }],
  },
];
const createEmptyEditorContent = (): Descendant[] =>
  JSON.parse(JSON.stringify(DEFAULT_CONTENT)) as Descendant[];

const RAIL_DEFAULT_W = 320;

/** 文档中是否含批注节点（决定页边批注栏是否出现） */
const hasCommentNode = (nodes: Descendant[]): boolean =>
  nodes.some(node => {
    const element = node as { type?: string; children?: Descendant[] };
    if (element.type === "comment") return true;
    return Array.isArray(element.children) && hasCommentNode(element.children);
  });

const WebViewProjectItemView = (props: WebViewProjectItemViewProps) => {
  const { t } = useProjectWebI18n();
  const { projectItemId } = props;
  const locationParams = usePageParams<{ itemId?: number; at?: string }>();
  const [projectItem, setProjectItem] = useState<ProjectItem | null>(null);
  const webviewRef = useRef<WebviewRef>(null);
  const editorRef = useRef<EditorRef>(null);
  const slateEditorRef = useRef<CustomEditor | null>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const [editorScrollEl, setEditorScrollEl] = useState<HTMLDivElement | null>(null);
  const setEditorContainer = useCallback((node: HTMLDivElement | null) => {
    editorContainerRef.current = node;
    setEditorScrollEl(node);
  }, []);
  const resolveOutlineAnchor = useCallback(
    (_header: OutlineHeader, index: number) =>
      resolveEditorHeaderAnchor(editorRef.current?.getEditor(), index),
    []
  );
  const projectItemEventBus = defaultProjectItemEventBus.createEditor();
  /* 命令式 modal.confirm → 声明式：待确认动作（重新解析覆盖 ×2 / 删除笔记） */
  const [pendingConfirm, setPendingConfirm] = useState<null | {
    kind: "reparse" | "delete-note";
    action: () => void | Promise<void>;
  }>(null);
  useProjectContext(); // Keep context active
  const { navigator } = usePage();

  // 主区视图；用户手动切过之后，加载到已有解析文档时不再自动跳到「文档」
  const [mainView, setMainView] = useState<MainView>("web");
  const userPickedViewRef = useRef(false);

  // 右侧栏：开合按主区视图分别记（读文档默认看目录，逛网页默认不占宽）
  const [railOpen, setRailOpen] = useState<Record<MainView, boolean>>({
    web: false,
    parsed: true,
  });
  const [railTab, setRailTab] = useState<RailTab>("outline");
  const [railWidth, setRailWidth] = useLocalStorageState<number>("tau-webview-rail-width", {
    defaultValue: RAIL_DEFAULT_W,
  });

  // 已保存的解析结果
  const [savedWebClip, setSavedWebClip] = useState<WebClip | null>(null);
  const [parsedContent, setParsedContent] = useState<Descendant[]>(DEFAULT_CONTENT);
  const [clipInput, setClipInput] = useState<Descendant[]>(DEFAULT_CONTENT);
  const [draftRevision, setDraftRevision] = useState(0);
  const clipDocument = useLocalEditorDocument(
    `clip:${projectItemId}:${draftRevision}`,
    setParsedContent
  );
  const [isLocalClipping, setIsLocalClipping] = useState(false);
  const [clipCompleting, setClipCompleting] = useState(false);
  const clipRun = useRef(0);
  const [localClipError, setLocalClipError] = useState<Error | null>(null);
  const localClipAbortRef = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      clipRun.current++;
      localClipAbortRef.current?.abort();
      localClipAbortRef.current = null;
      setIsLocalClipping(false);
      setClipCompleting(false);
    },
    [projectItemId]
  );

  // 编辑标题弹窗
  const [editTitleModalOpen, setEditTitleModalOpen] = useState(false);
  const [creatingDocument, setCreatingDocument] = useState(false);
  const [notes, setNotes] = useState<WebNote[]>([]);
  const [activeNoteId, setActiveNoteId] = useState<number | null>(null);
  const [preferredNoteContentId, setPreferredNoteContentId] = useState<number | null>(null);
  const [renamingNote, setRenamingNote] = useState<WebNote | null>(null);

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
        setPreferredNoteContentId(preference?.preferredContentId ?? null);
      } catch (error) {
        console.error("Failed to load notes for project item:", error);
      }
    };
    loadNotesAndPreference();
    return () => {
      cancelled = true;
    };
  }, [projectItemId]);

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

  /* 偏好 preferredContentId 的语义：上次离开时笔记侧栏是开着的 */
  const persistPreferredNote = useMemoizedFn(async (contentId: number | null) => {
    if (contentId === preferredNoteContentId) return;
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

  // 恢复偏好：上次开着笔记 → 两种视图都以笔记页签打开侧栏（只在首次加载时应用一次）
  const preferenceAppliedRef = useRef(false);
  useEffect(() => {
    if (preferenceAppliedRef.current || !preferredNoteContentId) return;
    const note = notes[0] ?? null;
    if (!note) return;
    preferenceAppliedRef.current = true;
    if (note.contentId === preferredNoteContentId) {
      setRailTab("note");
      setRailOpen({ web: true, parsed: true });
    } else {
      void persistPreferredNote(null);
    }
  }, [preferredNoteContentId, notes, persistPreferredNote]);

  // 查询已有的解析结果
  useEffect(() => {
    const loadExistingWebClip = async () => {
      try {
        const webClipId = await findClippedWebClipId(projectItemId);

        if (webClipId) {
          const webClip = await getWebClipById(webClipId);
          if (webClip) {
            setSavedWebClip(webClip);
            // 已解析过的网页默认进「文档」阅读
            if (!userPickedViewRef.current) setMainView("parsed");
            const content = await getContentById(webClip.contentId);
            if (content && content.content) {
              setParsedContent(content.content);
            }
          }
        }
      } catch (error) {
        console.error("[WebClip] Load existing web clip error:", error);
      }
    };

    loadExistingWebClip();
  }, [projectItemId]);

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
      setClipInput(content);
      setParsedContent(content);
    },
    onComplete: async (_markdown, content, webClipId) => {
      const run = clipRun.current;
      setClipCompleting(true);
      setClipInput(content);
      // Electron 侧已经保存了数据，前端只需更新状态
      setParsedContent(content);

      try {
        if (webClipId) {
          const updatedWebClip = await getWebClipById(webClipId);
          if (run !== clipRun.current) return;
          if (updatedWebClip) setSavedWebClip(updatedWebClip);
        }
        toast.success(projectWebT("clip.done"));
      } catch (error) {
        if (run === clipRun.current)
          toast.error(projectWebT("error.loadResult", { reason: String(error) }));
      } finally {
        if (run === clipRun.current) setClipCompleting(false);
      }
    },
    onError: error => {
      toast.error(projectWebT("error.parse", { reason: projectWebFailureText(error) }));
    },
  });

  const isAnyClipping = isClipping || isLocalClipping;
  // 网页剪辑在保存前没有 contentId
  const editorContentId = isAnyClipping || clipCompleting ? undefined : savedWebClip?.contentId;
  const ParsedEditor = editorContentId ? Editor : LocalEditor;
  useEffect(() => {
    if (!editorContentId) clipDocument.updateContent(clipInput, "external");
  }, [clipDocument, editorContentId, clipInput]);
  const currentClipError =
    (localClipError ? projectWebFailureText(localClipError) : "") ||
    (clipError ? projectWebFailureText(clipError) : "");

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

  const saveLocalClipResult = useMemoizedFn(async (content: Descendant[]) => {
    if (!currentUrl) {
      throw new ProjectWebFailure("missingUrl");
    }

    const existingWebClipId = await findClippedWebClipId(projectItemId);

    if (existingWebClipId) {
      const existingWebClip = await getWebClipById(existingWebClipId);
      if (existingWebClip) {
        await replaceContent(existingWebClip.contentId, { nodes: content });
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
      throw new ProjectWebFailure("createContent");
    }

    const createdWebClip = await createWebClip({
      contentId,
      url: currentUrl,
      title: title || "解析文档",
    });
    await recordWebClip(projectItemId, createdWebClip.id);
    setSavedWebClip(createdWebClip);
    return createdWebClip;
  });

  const doStartLocalClip = useMemoizedFn(async (mode: "smart" | "full") => {
    if (!currentUrl) {
      toast.error(projectWebT("error.missingUrl"));
      return;
    }

    const abortController = new AbortController();
    clipRun.current++;
    setClipCompleting(false);
    localClipAbortRef.current = abortController;
    try {
      setMainView("parsed");
      resetClipState();
      setDraftRevision(previous => previous + 1);
      setClipInput(DEFAULT_CONTENT);
      setParsedContent(DEFAULT_CONTENT);
      setLocalClipError(null);
      setIsLocalClipping(true);

      const html = await webviewRef.current?.getHTML();
      if (abortController.signal.aborted || localClipAbortRef.current !== abortController) return;
      if (!html) {
        toast.error(projectWebT("error.getHtml"));
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
        throw new ProjectWebFailure("empty");
      }

      if (abortController.signal.aborted || localClipAbortRef.current !== abortController) return;
      setClipInput(parsed);
      await saveLocalClipResult(parsed);
      if (abortController.signal.aborted || localClipAbortRef.current !== abortController) return;
      setParsedContent(parsed);
      toast.success(projectWebT("clip.done"));
    } catch (error) {
      if (
        abortController.signal.aborted ||
        localClipAbortRef.current !== abortController ||
        (error instanceof Error && error.message === "aborted")
      ) {
        return;
      }
      const errorMessage = error instanceof Error ? error : new ProjectWebFailure("generic");
      setLocalClipError(errorMessage);
      toast.error(projectWebT("error.parse", { reason: projectWebFailureText(errorMessage) }));
    } finally {
      if (localClipAbortRef.current === abortController) {
        localClipAbortRef.current = null;
        setIsLocalClipping(false);
      }
    }
  });

  const doStartClip = useMemoizedFn(async () => {
    if (!currentUrl) {
      toast.error(projectWebT("error.missingUrl"));
      return;
    }

    const run = ++clipRun.current;
    setClipCompleting(false);
    try {
      setMainView("parsed");
      setLocalClipError(null);

      const html = await webviewRef.current?.getHTML();
      if (run !== clipRun.current) return;
      if (!html) {
        toast.error(projectWebT("error.getHtml"));
        return;
      }

      const contentHTML = getContentHTML(html);

      setDraftRevision(previous => previous + 1);
      setClipInput(DEFAULT_CONTENT);
      setParsedContent(DEFAULT_CONTENT);
      void startClip(contentHTML, currentUrl, title || "", false);
    } catch (error) {
      console.error("Start clip error:", error);
      toast.error(projectWebT("error.start"));
    }
  });

  /* 解析入口统一收口：已有解析文档时先确认覆盖 */
  const handleStartParse = useMemoizedFn(async (mode: "llm" | "smart") => {
    if (isAnyClipping || clipCompleting) return;
    const run = () => (mode === "llm" ? doStartClip() : doStartLocalClip("smart"));
    if (savedWebClip) {
      setPendingConfirm({
        kind: "reparse",
        action: run,
      });
      return;
    }
    void run();
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
      const note = await createWebNote({
        projectItemId,
        contentId,
        title: `笔记 ${notes.length + 1}`,
      });
      setNotes([note]);
      setActiveNoteId(note.id);
      await persistPreferredNote(note.contentId);
      return note;
    } catch (error) {
      console.error("Failed to create note:", error);
      toast.error(projectWebT("note.createFailed"));
      return null;
    } finally {
      setCreatingDocument(false);
    }
  });

  const handleDeleteNote = useMemoizedFn(async (noteId: number) => {
    const note = notes.find(item => item.id === noteId);
    if (!note) return;
    try {
      await deleteWebNote(noteId);
      setNotes(prev => prev.filter(item => item.id !== noteId));
      await persistPreferredNote(null);
      toast.success(projectWebT("note.deleted"));
    } catch (error) {
      console.error("Failed to delete note:", error);
      toast.error(projectWebT("note.deleteFailed"));
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
      toast.success(projectWebT("note.renamed"));
    } catch (error) {
      console.error("Failed to rename note:", error);
      toast.error(projectWebT("note.renameFailed"));
    } finally {
      setRenamingNote(null);
    }
  });

  const activeNote =
    activeNoteId !== null
      ? (notes.find(note => note.id === activeNoteId) ?? notes[0] ?? null)
      : (notes[0] ?? null);

  // 网页视图下侧栏只有笔记
  const activeRailTab: RailTab = mainView === "web" ? "note" : railTab;
  const railVisible = railOpen[mainView];

  /* 笔记侧栏是否开着 → 写回偏好（下次进入时恢复） */
  const syncNotePreference = useMemoizedFn((open: boolean, tab: RailTab) => {
    void persistPreferredNote(open && tab === "note" && activeNote ? activeNote.contentId : null);
  });

  const handleSwitchMainView = useMemoizedFn((next: MainView) => {
    userPickedViewRef.current = true;
    setMainView(next);
  });

  const handleToggleRail = useMemoizedFn(() => {
    const nextOpen = !railVisible;
    setRailOpen(prev => ({ ...prev, [mainView]: nextOpen }));
    syncNotePreference(nextOpen, activeRailTab);
  });

  const handleSwitchRailTab = useMemoizedFn((tab: RailTab) => {
    setRailTab(tab);
    syncNotePreference(true, tab);
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

  // 在独立网页页面中打开当前地址。
  const handleOpenInNewTab = useMemoizedFn(() => {
    if (!currentUrl) return;
    navigator.push("webview", { url: currentUrl });
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
    toast.success(projectWebT("title.updated"));
  });

  const handleEditorChange = useMemoizedFn((content: Descendant[]) => {
    if (savedWebClip && !isAnyClipping) {
      setParsedContent(content);
    }
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

  // 是否有解析结果
  const hasClipResult = savedWebClip !== null;

  const moreMenuItems: MenuEntryList = [];
  if (isAnyClipping) {
    moreMenuItems.push({
      key: "cancel-parse",
      label: t("parse.cancel"),
      icon: <X className="size-[15px]" strokeWidth={1.75} />,
    });
  } else if (hasClipResult) {
    moreMenuItems.push({
      key: "reparse",
      label: t("parse.again"),
      icon: <RefreshCcw className="size-[15px]" strokeWidth={1.75} />,
      children: [
        { key: "reparse-llm", label: t("parse.llm") },
        { key: "reparse-smart", label: t("parse.smart") },
      ],
    });
  }
  if (moreMenuItems.length > 0) {
    moreMenuItems.push({ key: "divider-1", label: "", divider: true });
  }
  moreMenuItems.push(
    {
      key: "refresh",
      label: t("page.reload"),
      icon: <RotateCw className="size-[15px]" strokeWidth={1.75} />,
    },
    {
      key: "browser",
      label: t("page.browser"),
      icon: <ExternalLink className="size-[15px]" strokeWidth={1.75} />,
    },
    {
      key: "new-tab",
      label: t("page.app"),
      icon: <AppWindow className="size-[15px]" strokeWidth={1.75} />,
    }
  );

  // 剪藏成功后，剪藏本身作为材料接插件对象动作
  const pluginEntries = usePluginMenuEntries(
    savedWebClip ? { kind: "material", id: `web-clip:${savedWebClip.id}` } : null
  );
  const menuEntries = pluginEntries.insert(moreMenuItems);

  const handleMoreMenuClick = useMemoizedFn((key: string) => {
    if (pluginEntries.select(key)) return;
    if (key === "cancel-parse") {
      void cancelAnyClip();
    } else if (key === "reparse-llm") {
      void handleStartParse("llm");
    } else if (key === "reparse-smart") {
      void handleStartParse("smart");
    } else if (key === "refresh") {
      handleRefresh();
    } else if (key === "browser") {
      handleOpenInBrowser();
    } else if (key === "new-tab") {
      handleOpenInNewTab();
    }
  });

  const noteMenuItems: MenuEntryList = [
    {
      key: "note-rename",
      label: t("note.rename"),
      icon: <PenLine className="size-[15px]" strokeWidth={1.75} />,
    },
    {
      key: "note-delete",
      label: t("note.delete"),
      icon: <Trash2 className="size-[15px]" strokeWidth={1.75} />,
      danger: true,
    },
  ];

  const handleNoteMenuClick = useMemoizedFn((key: string) => {
    if (!activeNote) return;
    if (key === "note-rename") {
      setRenamingNote(activeNote);
    } else if (key === "note-delete") {
      const noteId = activeNote.id;
      setPendingConfirm({
        kind: "delete-note",
        action: () => handleDeleteNote(noteId),
      });
    }
  });

  const currentParsedContent = isClipping ? clipContent : parsedContent;
  const parsedHeaders = useMemo(
    () => extractContentHeaders(currentParsedContent),
    [currentParsedContent]
  );
  const showComments = useMemo(
    () => hasClipResult && !isAnyClipping && hasCommentNode(parsedContent),
    [hasClipResult, isAnyClipping, parsedContent]
  );

  if (!currentUrl) return null;

  const renderParseEmptyState = () => (
    <div className="flex h-full items-center justify-center px-6">
      <div className="flex max-w-[380px] flex-col items-center text-center">
        <FileText className="text-ink-3 size-8" strokeWidth={1.5} />
        <p className="text-ink-1 mt-4 text-[15px] font-medium">{t("parse.emptyTitle")}</p>
        <p className="text-ink-3 text-tau-sm mt-1.5 leading-relaxed">{t("parse.emptyHint")}</p>
        {currentClipError && (
          <p className="text-tau-sm mt-3 text-red-600">
            {t("parse.previousFailure", { reason: currentClipError })}
          </p>
        )}
        <div className="mt-5 flex gap-2">
          <Button
            size="sm"
            variant="primary"
            icon={Sparkles}
            onClick={() => void handleStartParse("llm")}
          >
            {t("parse.llm")}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            icon={Scissors}
            onClick={() => void handleStartParse("smart")}
          >
            {t("parse.smart")}
          </Button>
        </div>
      </div>
    </div>
  );

  const renderDocumentView = () => {
    if (!hasClipResult && !isAnyClipping) return renderParseEmptyState();
    // py-4：视口与纸面上下缘留出间距（同文档型条目正文），正文在视口边缘渐隐而非贴卡片边硬切
    return (
      <div className="h-full py-4">
        <FadeScroll
          scrollRef={setEditorContainer}
          className="tau-sheet-scroll @container/web-clip-editor h-full w-full [--edge-fade-bottom-size:24px] [--edge-fade-top-size:24px]"
        >
          <div className="mx-auto flex w-full items-start justify-center gap-6 px-5 py-5">
            <div className="relative max-w-[720px] min-w-0 flex-1">
              {isAnyClipping && (
                <div className="border-line-1 bg-hover text-ink-1 mx-20 mb-4 flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm">
                  <Loader2 className="size-4 animate-spin" strokeWidth={1.75} />
                  <span className="flex-1">{t("parse.running")}</span>
                  <Button size="sm" variant="ghost" onClick={() => void cancelAnyClip()}>
                    {t("action.cancel")}
                  </Button>
                </div>
              )}
              {currentClipError && !isAnyClipping && (
                <div className="mx-20 mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {currentClipError}
                </div>
              )}
              <ParsedEditor
                kit={getContentKit()}
                document={editorContentId ? undefined : clipDocument.document}
                contentId={editorContentId}
                at={locationParams.itemId === projectItemId ? locationParams.at : undefined}
                className="mx-20"
                key={`${projectItemId}-parsed`}
                ref={editorRef}
                initValue={currentParsedContent}
                onChange={handleEditorChange}
                readonly={isAnyClipping || clipCompleting}
                editingContext={{ entityType: "project-item", entityId: projectItemId }}
                onInit={editorInstance => {
                  slateEditorRef.current = editorInstance as CustomEditor;
                }}
              />
            </div>
            {showComments && (
              <div className="hidden w-[260px] flex-none self-start @[900px]/web-clip-editor:block">
                <EditorComment
                  className="w-full"
                  editorRef={slateEditorRef}
                  containerRef={editorContainerRef}
                  show={true}
                  onCommentClick={handleSidebarCommentClick}
                />
              </div>
            )}
          </div>
        </FadeScroll>
      </div>
    );
  };

  const renderRailBody = () => {
    if (activeRailTab === "outline") {
      return (
        <FadeScroll className="h-full py-3 pr-2.5 pl-4">
          {hasClipResult || isAnyClipping ? (
            <ContentOutline
              className="w-full"
              headers={parsedHeaders}
              scrollEl={editorScrollEl}
              resolveAnchor={resolveOutlineAnchor}
              showTitle={false}
            />
          ) : (
            <p className="text-ink-3 text-tau-sm pt-2">{t("outline.empty")}</p>
          )}
        </FadeScroll>
      );
    }
    if (!activeNote) {
      return (
        <div className="flex h-full flex-col items-center justify-center px-6 text-center">
          <NotebookPen className="text-ink-3 size-7" strokeWidth={1.5} />
          <p className="text-ink-2 text-tau-sm mt-3">{t("note.empty")}</p>
          <Button
            size="sm"
            variant="secondary"
            className="mt-4"
            disabled={creatingDocument}
            onClick={() => void createNote()}
          >
            {t(creatingDocument ? "note.creating" : "note.create")}
          </Button>
        </div>
      );
    }
    return (
      <FadeScroll className="h-full py-3">
        <Editor
          contentId={activeNote.contentId}
          className="mx-8"
          key={`${projectItemId}-note-${activeNote.id}`}
          readonly={false}
        />
      </FadeScroll>
    );
  };

  return (
    <div className="flex h-full w-full flex-col">
      {/* Header：标题 · 视图切换 · 侧栏开关 · ⋯ */}
      <div className="border-line-1 flex items-center gap-3 border-b px-4 py-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <h1 className="m-0 truncate text-lg leading-snug font-semibold">{title}</h1>
          <Tooltip content={t("title.edit")} delay={500}>
            <IconButton
              className="text-ink-3 size-7 shrink-0"
              aria-label={t("title.edit")}
              onClick={() => setEditTitleModalOpen(true)}
            >
              <Pencil className="size-4" strokeWidth={1.75} />
            </IconButton>
          </Tooltip>
        </div>

        <Segmented
          label={t("view.label")}
          value={mainView}
          onValueChange={(v: MainView) => handleSwitchMainView(v)}
        >
          <Segmented.Item value="web" label={t("view.web")} icon={Globe} />
          <Segmented.Item value="parsed" label={t("view.document")} icon={FileText} />
        </Segmented>

        <div className="flex items-center gap-0.5">
          <Tooltip
            content={t(
              railVisible ? "rail.close" : mainView === "web" ? "rail.openNotes" : "rail.openDetail"
            )}
            delay={500}
          >
            <IconButton
              aria-label={t(railVisible ? "rail.close" : "rail.open")}
              aria-pressed={railVisible}
              className={railVisible ? "text-ink-1" : undefined}
              onClick={handleToggleRail}
            >
              <PanelRight size={17} strokeWidth={1.75} />
            </IconButton>
          </Tooltip>

          {/* 更多操作（trigger 用原生 button + title：Menu.trigger 需单一透传元素，
              Tooltip 包裹会吞注入） */}
          <Menu
            align="end"
            trigger={
              <button
                type="button"
                title={t("action.more")}
                aria-label={t("action.more")}
                className="text-ink-2 hover:bg-hover hover:text-ink-1 rounded-tau-sm grid size-[30px] cursor-pointer place-items-center border-none bg-transparent transition-colors"
              >
                <MoreHorizontal className="size-4" strokeWidth={1.75} />
              </button>
            }
          >
            {renderMenuEntries(menuEntries, key => void handleMoreMenuClick(key))}
          </Menu>
        </div>
      </div>

      {/* Body：主区 + 右侧栏 */}
      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1 overflow-hidden">
          {/* 两层常驻挂载：webview 不重载，解析时仍可取 HTML */}
          <div
            className={`absolute inset-0 transition-opacity duration-200 ${
              mainView === "web" ? "z-10 opacity-100" : "pointer-events-none z-0 opacity-0"
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
            />
          </div>
          <div
            className={`absolute inset-0 transition-opacity duration-200 ${
              mainView === "parsed" ? "z-10 opacity-100" : "pointer-events-none z-0 opacity-0"
            }`}
          >
            {renderDocumentView()}
          </div>
        </div>

        <ResizeableAndHideableSidebar
          width={railWidth ?? RAIL_DEFAULT_W}
          onWidthChange={setRailWidth}
          open={railVisible}
          sidebarPosition="right"
          resizeHandleSide="left"
          minWidth={260}
          maxWidth={560}
          disableResize={!railVisible}
          showDivider
          className="h-full shrink-0"
        >
          <div className="flex h-full flex-col">
            <div className="flex h-11 shrink-0 items-center gap-2 px-3">
              {mainView === "parsed" ? (
                <Segmented
                  label={t("rail.label")}
                  value={railTab}
                  onValueChange={(v: RailTab) => handleSwitchRailTab(v)}
                >
                  <Segmented.Item value="outline" label={t("rail.outline")} />
                  <Segmented.Item value="note" label={t("rail.note")} />
                </Segmented>
              ) : (
                <span className="text-ink-2 text-tau-sm px-1 font-medium">{t("rail.note")}</span>
              )}
              {activeRailTab === "note" && activeNote && (
                <>
                  <span className="text-ink-3 text-tau-sm min-w-0 flex-1 truncate">
                    {activeNote.title}
                  </span>
                  <Menu
                    align="end"
                    trigger={
                      <button
                        type="button"
                        title={t("note.actions")}
                        aria-label={t("note.actions")}
                        className="text-ink-3 hover:bg-hover hover:text-ink-1 rounded-tau-sm grid size-[26px] cursor-pointer place-items-center border-none bg-transparent transition-colors"
                      >
                        <MoreHorizontal className="size-[15px]" strokeWidth={1.75} />
                      </button>
                    }
                  >
                    {renderMenuEntries(noteMenuItems, key => void handleNoteMenuClick(key))}
                  </Menu>
                </>
              )}
            </div>
            <div className="min-h-0 flex-1 pb-4">{renderRailBody()}</div>
          </div>
        </ResizeableAndHideableSidebar>
      </div>

      {/* 编辑标题弹窗 */}
      <EditTitleModal
        open={editTitleModalOpen}
        onCancel={() => setEditTitleModalOpen(false)}
        onConfirm={handleConfirmEditTitle}
        initialTitle={title}
        modalTitle={t("title.editPage")}
        modalDescription={t("title.editHint")}
        placeholder={t("title.placeholder")}
      />
      <EditTitleModal
        open={!!renamingNote}
        onCancel={() => setRenamingNote(null)}
        onConfirm={handleConfirmRenameNote}
        initialTitle={renamingNote?.title || ""}
        modalTitle={t("note.rename")}
        modalDescription={t("note.renameHint")}
        placeholder={t("note.placeholder")}
      />

      <ConfirmDialog
        open={pendingConfirm !== null}
        onOpenChange={next => {
          if (!next) setPendingConfirm(null);
        }}
        title={
          pendingConfirm
            ? t(pendingConfirm.kind === "reparse" ? "parse.overwriteTitle" : "note.delete")
            : ""
        }
        description={
          pendingConfirm
            ? t(pendingConfirm.kind === "reparse" ? "parse.overwriteHint" : "note.deleteHint")
            : ""
        }
        danger={pendingConfirm?.kind === "delete-note"}
        confirmText={t(pendingConfirm?.kind === "delete-note" ? "action.delete" : "action.confirm")}
        onConfirm={async () => {
          const pending = pendingConfirm;
          setPendingConfirm(null);
          await pending?.action();
        }}
      />
    </div>
  );
};

export default WebViewProjectItemView;
