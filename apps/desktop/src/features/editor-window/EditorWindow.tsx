/**
 * 编辑窗口主体：标题栏 + 纸面（头部字段 · 正文 · 大纲 · 状态栏）。
 * 内容类型差异全部收在 DocumentDriver（标题 / 标签有无、读写、扩展）。
 *
 * 保存分工：正文走 useEditContent（content 表 + Yjs 会话）；标题绑定会话文档的 title
 * 文本（本地 / 共享模式一致）；标签等元数据由 useEditorDocument 定时落库。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  ClipboardCopy,
  Copy,
  Download,
  FileText,
  FileType,
  Focus,
  Image as ImageIcon,
  ListTree,
  MessageSquare,
  Monitor,
  MoreHorizontal,
  Pin,
  Search,
  Share2,
  TextCursorInput,
  Users,
  X,
} from "lucide-react";
import type { EditorRef } from "@tau/editor/src";
import { IconButton, Menu, Popover, cn, toast, useEdgeFade, FADE_SCROLL_CLASS } from "@tau/ui";
import ContentEditor from "@/components/ContentEditor";
import ErrorBoundary from "@/components/ErrorBoundary";
import { CollaborativeTitleField } from "@/components/CollaborativeTitle";
import ContentCollaborationControl, {
  type ContentCollaborationControlHandle,
} from "@/components/ContentCollaborationControl";
import {
  ContentOutline,
  extractContentHeaders,
  resolveEditorHeaderAnchor,
  type OutlineHeader,
} from "@/components/ContentOutline";
import { ThemeToggle } from "@/app/Titlebar";
import { ArticleTags } from "@/features/articles/components/ArticleTags";
import useEditContent from "@/hooks/useEditContent";
import useContentSession from "@/hooks/useContentSession";
import useCollaborationDocument from "@/hooks/useCollaborationDocument";
import useCollaborationStore from "@/stores/useCollaborationStore";
import useSettingStore from "@/stores/useSettingStore";
import { closeWindow, setAlwaysOnTop } from "@/commands";
import { platform } from "@/platform";
import { requestOpenContentInMainWindow } from "@/services/main-window-requests";
import ContentExportModal from "@/components/ContentExportModal";
import EpubExportModal from "@/components/EpubExportModal";
import { PdfExportModal } from "@/components/PdfExportModal";
import {
  copyMarkdownToClipboard,
  copyWechatHtmlToClipboard,
  downloadMarkdown,
  getContentLength,
  getMarkdown,
} from "@/utils";
import { formatDate } from "@/utils/time";
import { getEditorText } from "@/utils/editor";
import type { DocumentDriver, DocumentFields, EditorDocument } from "./documentDrivers";
import type { SaveState } from "./useEditorDocument";
import { useEditorWindowPrefs } from "./editorWindowPrefs";
import { EditorWindowTitlebar } from "./EditorWindowTitlebar";
import { EditorStatusBar } from "./EditorStatusBar";

/** 低于该宽度大纲不再常驻右栏，改由标题栏按钮弹出 */
const OUTLINE_COLUMN_MIN_WIDTH = 900;

const toastAdapter = {
  success: (msg: string) => toast.success(msg),
  error: (msg: string) => toast.error(msg),
};

const iconClass = "size-[15px] shrink-0";

function useWindowWidth() {
  const [width, setWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return width;
}

export function EditorWindow({
  driver,
  databaseName,
  document: doc,
  saveState,
  updateFields,
  autoFocus = false,
}: {
  driver: DocumentDriver;
  databaseName: string;
  document: EditorDocument;
  saveState: SaveState;
  updateFields: (fields: DocumentFields) => void;
  /** 打开即聚焦正文（快捷卡片窗口用） */
  autoFocus?: boolean;
}) {
  const editorRef = useRef<EditorRef>(null);

  // 正文要等内容会话就绪才挂载，短时轮询到编辑器出现再聚焦
  useEffect(() => {
    if (!autoFocus) return;
    let tries = 0;
    const timer = window.setInterval(() => {
      if (editorRef.current || ++tries > 20) {
        window.clearInterval(timer);
        editorRef.current?.focus();
      }
    }, 100);
    return () => window.clearInterval(timer);
  }, [autoFocus]);
  const collaborationRef = useRef<ContentCollaborationControlHandle>(null);
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const [editorEl, setEditorEl] = useState<HTMLDivElement | null>(null);
  useEdgeFade(scrollEl);

  const windowWidth = useWindowWidth();
  const outlineOn = useEditorWindowPrefs(s => s.outline[driver.kind]);
  const toggleOutline = useEditorWindowPrefs(s => s.toggleOutline);
  const typewriter = useEditorWindowPrefs(s => s.typewriter);
  const toggleTypewriter = useEditorWindowPrefs(s => s.toggleTypewriter);
  const [pinned, setPinned] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [selectedWords, setSelectedWords] = useState(0);
  const [exportKind, setExportKind] = useState<"image" | "epub" | "pdf" | null>(null);

  const title = driver.hasTitle
    ? doc.title || "未命名"
    : getEditorText(doc.content, 20) || `${driver.label} #${doc.id}`;
  useEffect(() => {
    document.title = title;
  }, [title]);

  /* 会话：标题绑定会话文档；frozen / shared 驱动横幅与状态栏 */
  const source = useMemo(
    () => ({ sourceType: driver.kind, sourceId: doc.id, sourceTitle: doc.title }),
    [driver.kind, doc.id, doc.title]
  );
  const { entry } = useContentSession(doc.contentId, source);
  const collab = useCollaborationDocument(entry?.documentId);
  const session = useCollaborationStore(state =>
    entry?.mode === "shared" ? state.sessions.find(item => item.id === entry.documentId) : undefined
  );

  /* 正文：远端 / 初始内容推给编辑器；本地变更节流落库 */
  const { throttleHandleEditorContentChange } = useEditContent(doc.contentId, content => {
    editorRef.current?.setEditorValue(content);
    updateFields({ content });
  });
  const extensions = useMemo(() => driver.extensions?.(doc.id) ?? [], [driver, doc.id]);

  const headers = useMemo(() => extractContentHeaders(doc.content), [doc.content]);
  const resolveAnchor = useCallback(
    (_header: OutlineHeader, index: number) =>
      resolveEditorHeaderAnchor(editorRef.current?.getEditor(), index),
    []
  );
  const outlineAsColumn = outlineOn && windowWidth >= OUTLINE_COLUMN_MIN_WIDTH;

  /* 选中字数 + 打字机滚动：都跟随编辑区内的 DOM 选区 */
  useEffect(() => {
    if (!editorEl) return;
    let raf = 0;
    const onSelectionChange = () => {
      const selection = window.getSelection();
      const inside = Boolean(selection?.anchorNode && editorEl.contains(selection.anchorNode));
      const text = inside && selection && !selection.isCollapsed ? selection.toString() : "";
      setSelectedWords(text ? getContentLength([{ type: "formatted", text }]) : 0);
      if (!typewriter || !inside || !selection?.isCollapsed || !scrollEl) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const rect = selection.rangeCount ? selection.getRangeAt(0).getBoundingClientRect() : null;
        if (!rect || (!rect.top && !rect.bottom)) return;
        const box = scrollEl.getBoundingClientRect();
        scrollEl.scrollTop += rect.top - (box.top + box.height / 2);
      });
    };
    document.addEventListener("selectionchange", onSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", onSelectionChange);
      cancelAnimationFrame(raf);
    };
  }, [editorEl, scrollEl, typewriter]);

  /* 专注模式：⌘. 开合，Esc 退出 */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      if ((event.metaKey || event.ctrlKey) && event.key === ".") {
        event.preventDefault();
        setFocusMode(on => !on);
      } else if (event.key === "Escape" && focusMode) {
        setFocusMode(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [focusMode]);

  const togglePin = () => {
    setPinned(!pinned);
    void setAlwaysOnTop(!pinned);
  };

  const inActiveDatabase = useSettingStore(s => s.setting.database.active) === databaseName;
  const openInMainWindow = async () => {
    await platform.window.showAndFocus();
    requestOpenContentInMainWindow(driver.kind, doc.id);
  };

  const outlineNode = (
    <ContentOutline
      headers={headers}
      scrollEl={scrollEl}
      resolveAnchor={resolveAnchor}
      className="w-full"
    />
  );

  const outlineButton = (
    <IconButton
      onClick={() => toggleOutline(driver.kind)}
      title={outlineOn ? "隐藏大纲" : "显示大纲"}
      aria-label="大纲"
      aria-pressed={outlineOn}
      className={outlineOn ? "bg-selected text-accent-text hover:bg-selected" : undefined}
    >
      <ListTree size={17} strokeWidth={1.75} />
    </IconButton>
  );

  const moreMenu = (
    <Menu
      align="end"
      fit
      trigger={
        <IconButton title="更多" aria-label="更多">
          <MoreHorizontal size={17} strokeWidth={1.75} />
        </IconButton>
      }
    >
      <Menu.Item
        icon={<Monitor className={iconClass} strokeWidth={1.75} />}
        disabled={!inActiveDatabase}
        onSelect={() => void openInMainWindow()}
      >
        {inActiveDatabase ? "在主窗口中打开" : "在主窗口中打开（非当前数据库）"}
      </Menu.Item>
      <Menu.Item
        icon={
          entry?.mode === "shared" ? (
            <Users className={iconClass} strokeWidth={1.75} />
          ) : (
            <Share2 className={iconClass} strokeWidth={1.75} />
          )
        }
        onSelect={() => collaborationRef.current?.open()}
      >
        {entry?.mode === "shared" ? "协作成员" : "发起协作"}
      </Menu.Item>
      <Menu.Separator />
      <Menu.Item
        icon={<Focus className={iconClass} strokeWidth={1.75} />}
        kbd="⌘."
        onSelect={() => setFocusMode(true)}
      >
        专注模式
      </Menu.Item>
      <Menu.CheckboxItem
        icon={<TextCursorInput className={iconClass} strokeWidth={1.75} />}
        checked={typewriter}
        onCheckedChange={toggleTypewriter}
      >
        打字机滚动
      </Menu.CheckboxItem>
      <Menu.Item
        icon={<Search className={iconClass} strokeWidth={1.75} />}
        kbd="⌘F"
        onSelect={() =>
          // 查找条（GlobalFindBar）监听全局快捷键，菜单入口复用同一事件
          document.dispatchEvent(
            new KeyboardEvent("keydown", { key: "f", ctrlKey: true, bubbles: true })
          )
        }
      >
        查找
      </Menu.Item>
      <Menu.Separator />
      <Menu.Submenu label="复制" icon={<Copy className={iconClass} strokeWidth={1.75} />}>
        <Menu.Item
          icon={<ClipboardCopy className={iconClass} strokeWidth={1.75} />}
          onSelect={() => void copyMarkdownToClipboard(doc.content, toastAdapter)}
        >
          复制 Markdown
        </Menu.Item>
        <Menu.Item
          icon={<MessageSquare className={iconClass} strokeWidth={1.75} />}
          onSelect={() => void copyWechatHtmlToClipboard(doc.content, toastAdapter)}
        >
          复制公众号格式
        </Menu.Item>
      </Menu.Submenu>
      <Menu.Submenu label="导出" icon={<Download className={iconClass} strokeWidth={1.75} />}>
        <Menu.Item
          icon={<FileText className={iconClass} strokeWidth={1.75} />}
          onSelect={() => downloadMarkdown(getMarkdown(doc.content), title)}
        >
          Markdown 文件
        </Menu.Item>
        <Menu.Item
          icon={<ImageIcon className={iconClass} strokeWidth={1.75} />}
          onSelect={() => setExportKind("image")}
        >
          图片
        </Menu.Item>
        <Menu.Item
          icon={<BookOpen className={iconClass} strokeWidth={1.75} />}
          onSelect={() => setExportKind("epub")}
        >
          EPUB
        </Menu.Item>
        <Menu.Item
          icon={<FileType className={iconClass} strokeWidth={1.75} />}
          onSelect={() => setExportKind("pdf")}
        >
          PDF
        </Menu.Item>
      </Menu.Submenu>
      <Menu.Separator />
      <Menu.Item
        icon={<X className={iconClass} strokeWidth={1.75} />}
        onSelect={() => void closeWindow()}
      >
        关闭窗口
      </Menu.Item>
    </Menu>
  );

  return (
    <div className="flex h-full flex-col">
      <EditorWindowTitlebar icon={driver.icon} label={driver.label} title={title}>
        {/* 协作：已共享时常驻成员条（点开成员与邀请）；未共享不占位，由 ⋯「发起协作」打开对话框 */}
        <ContentCollaborationControl
          ref={collaborationRef}
          hideTrigger
          presence
          contentId={doc.contentId}
          source={source}
        />
        {!focusMode && (
          <>
            {outlineOn && !outlineAsColumn && headers.length > 0 ? (
              <Popover
                placement="bottom-end"
                arrow={false}
                className="w-[240px] p-2"
                trigger={outlineButton}
              >
                {outlineNode}
              </Popover>
            ) : (
              outlineButton
            )}
            <IconButton
              onClick={togglePin}
              title={pinned ? "取消置顶" : "窗口置顶"}
              aria-label="窗口置顶"
              aria-pressed={pinned}
              className={pinned ? "bg-selected text-accent-text hover:bg-selected" : undefined}
            >
              <Pin size={17} strokeWidth={1.75} />
            </IconButton>
            <ThemeToggle />
            {moreMenu}
          </>
        )}
      </EditorWindowTitlebar>

      <div className="tau-sheet bg-surface shadow-card rounded-tau-md relative mx-2 mb-2 flex min-h-0 flex-1 flex-col overflow-hidden">
        {collab.frozen && (
          <div className="bg-warn-soft text-tau-sm text-warn mx-3 mt-2.5 rounded-[10px] px-3 py-2">
            正在切换共享状态… 正文暂时只读
          </div>
        )}
        <div ref={setScrollEl} className={cn(FADE_SCROLL_CLASS, "min-h-0 flex-1")}>
          {/* 版心居中：正文列两侧等分余量；大纲常驻时右列至少留 208px，不够由正文列让位 */}
          <div
            className={cn(
              "grid min-h-full",
              outlineAsColumn && !focusMode
                ? "grid-cols-[minmax(0,1fr)_minmax(0,720px)_minmax(208px,1fr)]"
                : "grid-cols-[1fr_minmax(0,720px)_1fr]"
            )}
          >
            {/* 纵向 flex：正文区撑满余高，标签行内容短时贴纸面底部、内容长时跟在正文末 */}
            <div className="col-start-2 flex min-w-0 flex-col px-10 pb-8 pt-8">
              {driver.hasTitle && (
                <CollaborativeTitleField
                  binding={collab.binding}
                  article={collab.article}
                  frozen={collab.frozen}
                  error={collab.error}
                  defaultValue={doc.title}
                  placeholder="未命名标题"
                  contentEditable
                  onChange={value => updateFields({ title: value })}
                  onPressEnter={() => editorRef.current?.focus()}
                  className="text-ink-1 text-[25px] font-semibold leading-[1.35] outline-none [--placeholder-color:var(--tau-ink-3)]"
                />
              )}
              <div
                className={cn(
                  "text-tau-sm text-ink-3 flex flex-wrap items-center gap-1.5 tabular-nums",
                  driver.hasTitle ? "mb-6 mt-3" : "mb-5"
                )}
              >
                <span>创建于 {formatDate(doc.createTime, true)}</span>
                <span className="mx-0.5 opacity-50">·</span>
                <span>修改于 {formatDate(doc.updateTime, true)}</span>
              </div>
              {/* 点正文下方空白处落到正文末尾 */}
              <div
                ref={setEditorEl}
                className="min-h-[120px] flex-1 cursor-text"
                onMouseDown={event => {
                  if (event.target !== event.currentTarget) return;
                  event.preventDefault();
                  editorRef.current?.focus();
                }}
              >
                <ErrorBoundary>
                  <ContentEditor
                    ref={editorRef}
                    contentId={doc.contentId}
                    source={source}
                    initValue={doc.content}
                    onChange={content => {
                      throttleHandleEditorContentChange(content);
                      updateFields({ content });
                    }}
                    extensions={extensions}
                    readonly={false}
                    editingContext={{ entityType: driver.kind, entityId: doc.id }}
                  />
                </ErrorBoundary>
              </div>
              {/* 标签独占一行（样式同文章详情页） */}
              {driver.hasTags && (
                <ArticleTags
                  tags={doc.tags ?? []}
                  onAdd={tag => updateFields({ tags: [...(doc.tags ?? []), tag] })}
                  onDelete={tag => updateFields({ tags: (doc.tags ?? []).filter(t => t !== tag) })}
                />
              )}
            </div>
            {outlineAsColumn && !focusMode && (
              <div className="col-start-3 min-w-0 pl-4 pr-3 pt-8">
                {/* 起始与标题同高（同正文列 pt-8），滚动后吸在同一留白处 */}
                <div className="sticky top-8 max-w-[240px]">{outlineNode}</div>
              </div>
            )}
          </div>
        </div>
        {!focusMode && (
          <EditorStatusBar
            words={getContentLength(doc.content)}
            selectedWords={selectedWords}
            showReadingTime={driver.kind !== "card"}
            saveState={saveState}
            session={session}
          />
        )}
      </div>

      {/* 导出弹窗（PdfExportModal 的开合 prop 是 visible） */}
      <ContentExportModal
        open={exportKind === "image"}
        onClose={() => setExportKind(null)}
        content={doc.content}
        title={title}
      />
      <EpubExportModal
        open={exportKind === "epub"}
        onClose={() => setExportKind(null)}
        content={doc.content}
        title={title}
      />
      <PdfExportModal
        visible={exportKind === "pdf"}
        onClose={() => setExportKind(null)}
        content={doc.content}
        title={title}
      />
    </div>
  );
}
