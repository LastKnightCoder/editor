/**
 * 文章详情视图（mockups/article-detail/plan-a4-quiet.html 定稿落地）。
 * 版心 = hero + 正文列（720）恒居中（grid 三列），目录贴正文右缘 sticky；
 * 面包屑（含速切器）经 usePageBreadcrumb 注入壳层；无底部状态栏：标题/元信息在封面之上，
 * ⋯ 菜单（含「发起协作」）贴元信息行右侧；不展示保存态与阅读进度。
 *
 * 保存分工：正文持久化和跨实例同步由 ContentEditor 的文档会话负责，元数据
 * （标题/标签/置顶等）走 useEditArticle.saveArticle（updateArticle 的类型
 * IUpdateArticle 本身不含 content）+ article:updated 广播。
 *
 * 搬用（legacy 组件直接消费，后续按新体系重写）：
 * · 正文编辑器 ContentEditor（@tau/editor 包装，D-015 编辑器正式迁移时替换）；
 * · 演示模式 PresentationMode、沉浸模式 ImmersiveEditorMode（退出后恢复光标）；
 * · 导出弹窗 ContentExportModal / EpubExportModal / PdfExportModal；
 * · 统一制卡入口（useFlashcardCreation）；
 * · 协作控制 ContentCollaborationControl（已去 antd）。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRafInterval, useUnmount } from "ahooks";
import type { Descendant, Range } from "slate";
import { Transforms } from "slate";
import { ReactEditor } from "slate-react";
import {
  BookOpen,
  ClipboardCopy,
  CreditCard,
  Download,
  FileAudio,
  FileType,
  FileText,
  Image as ImageIcon,
  Maximize2,
  MessageSquare,
  Copy,
  ExternalLink,
  Trash2,
  Wand2,
  MoreHorizontal,
  Play,
  Presentation,
  Share2,
  Users,
  Sparkles,
} from "lucide-react";
import type { EditorRef } from "@tau/editor";
import { usePage, usePageBreadcrumb, usePageParams } from "@/page/PageProvider";
import { isElectron } from "@/electron";
import ContentEditor from "@/components/ContentEditor";
import { ErrorBoundary } from "@tau/ui";
import { FadeScroll } from "@tau/ui";
import PresentationMode from "@/components/PresentationMode";
import ImmersiveEditorMode from "@/components/ImmersiveEditorMode";
import ContentExportModal from "@/components/ContentExportModal";
import EpubExportModal from "@/components/EpubExportModal";
import { PdfExportModal } from "@/components/PdfExportModal";
import ContentCollaborationControl, {
  type ContentCollaborationControlHandle,
} from "@/components/ContentCollaborationControl";
import useContentShared from "@/hooks/useContentShared";
import useEditArticle from "@/hooks/useEditArticle";
import useFlashcardCreation from "@/features/flashcards/hooks/useFlashcardCreation";
import useUploadResource from "@/hooks/useUploadResource";
import useSettingStore from "@/stores/useSettingStore";
import { openArticleInNewWindow, updateArticleBannerBg } from "@/commands/article";
import { getFileBaseName, readBinaryFile, selectFile } from "@/commands";
import {
  copyMarkdownToClipboard,
  copyWechatHtmlToClipboard,
  defaultArticleEventBus,
} from "@/utils";
import type { IArticle } from "@/types";
import AddTag from "@/components/AddTag";
import { ConfirmDialog, Loading, Menu, cn, toast } from "@tau/ui";

import { useArticleMutations } from "../queries";
import { ArticlePodcast } from "../components/ArticlePodcast";
import { ArticleHero } from "../components/ArticleHero";
import { ArticleSwitcher } from "../components/ArticleSwitcher";
import { ArticleBodyFallback } from "../components/ArticleBodyFallback";
import { articleMorphKey } from "../morph";
import {
  ContentOutline,
  extractContentHeaders,
  resolveEditorHeaderAnchor,
  type OutlineHeader,
} from "@/components/ContentOutline";
import { ContextBadge } from "@/features/context/components/ContextBadge";
import { useInsightsView } from "@/features/insights/useInsightsView";
import { ComposeBoard } from "@/features/compose/components/ComposeBoard";
import { ComposeLayout } from "@/features/compose/components/ComposeLayout";
import { ComposeBoardEntry } from "@/features/compose/components/ComposeBoardEntry";
import { ComposeModeToggle } from "@/features/compose/components/ComposeModeToggle";
import { useComposeInsightOptions, useComposeInsightSync } from "@/features/compose/insights";
import { ComposeSessionContext, createComposeSession } from "@/features/compose/session";
import { useComposeWriting } from "@/features/compose/useComposeWriting";
import { getEditorText } from "@/utils/editor";
import { exportContentAsMarkdown } from "@/services/content-transfer";
import { PluginActionMenuItems } from "@/app/plugins/action-menu";
import { PluginEntityPanels } from "@/app/plugins/entity-panels";

/** copy utils 的 MessageApi 是结构类型，toast 同形适配（不引 antd message） */
const toastAdapter = {
  success: (msg: string) => toast.success(msg),
  error: (msg: string) => toast.error(msg),
};

/** 沉浸模式进/出传递 selection 须深拷贝（Slate 选区对象会被编辑器原地修改） */
function cloneRange(selection: Range | null): Range | null {
  if (!selection) return null;
  return {
    anchor: { path: [...selection.anchor.path], offset: selection.anchor.offset },
    focus: { path: [...selection.focus.path], offset: selection.focus.offset },
  };
}

export function ArticleDetailView() {
  const { navigator } = usePage();
  // 本实例 params（PageHost 按栈条目注入；勿读全局栈顶——多实例保活时会串台）
  const { id, at, layout } = usePageParams<{ id: number; at?: string; layout?: string }>();
  const composing = layout === "compose";

  const {
    editingArticle,
    onContentChange,
    onInit,
    onTitleChange,
    onAddTag,
    onDeleteTag,
    onTagsChange,
    saveArticle,
    setEditingArticle,
  } = useEditArticle(id);

  const editorRef = useRef<EditorRef>(null);
  const collaborationRef = useRef<ContentCollaborationControlHandle>(null);
  const shared = useContentShared(editingArticle?.contentId);
  const getEditor = useCallback(() => editorRef.current?.getEditor(), []);
  /* 创作模式（KL-070）：白板与正文两栏共享的会话 */
  const [composeSession] = useState(() => createComposeSession(getEditor));
  /* AI 洞见：标题栏下元信息行入口 + 正文上方报告 + 就地标记（KL-058）；创作模式下白板资料进候选 */
  const insights = useInsightsView({
    ref: { kind: "article", id: editingArticle?.id ?? 0 },
    contentId: editingArticle?.contentId ?? 0,
    getEditor,
    ...useComposeInsightOptions(composeSession, composing),
  });
  useComposeInsightSync(composeSession, composing, insights);
  useComposeWriting(composeSession, { active: composing, content: editingArticle?.content });
  const [pendingDelete, setPendingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { remove } = useArticleMutations();
  const uploadResource = useUploadResource();
  const databaseName = useSettingStore(state => state.setting.database.active);

  /* 版心滚动容器：callback ref（挂载后接线目录同步与阅读进度） */
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);

  const [podcastModalOpen, setPodcastModalOpen] = useState(false);
  const [presenting, setPresenting] = useState<Descendant[] | null>(null);
  const [immersive, setImmersive] = useState(false);
  const [editorRemountKey, setEditorRemountKey] = useState(0);
  const [changingCover, setChangingCover] = useState(false);
  const [exportKind, setExportKind] = useState<"image" | "epub" | "pdf" | null>(null);

  /* 多实例同步：文章层（保存后广播，订阅远端更新本地态与标题）。
     订阅走 editor 实例（sourceUuid 过滤，收不到自己的广播） */
  const articleEventBus = useMemo(() => defaultArticleEventBus.createEditor(), []);
  useEffect(() => {
    if (!id) return;
    return articleEventBus.subscribeToArticleWithId("article:updated", id, data => {
      setEditingArticle(data.article);
    });
  }, [id, articleEventBus, setEditingArticle]);

  /* 制卡（useFlashcardCreation 已去 antd，反馈走 toast） */
  const flashcard = useFlashcardCreation({
    getContent: () => editingArticle?.content ?? [],
    getReference: () => ({
      refType: "content",
      contentId: editingArticle?.contentId ?? 0,
      title: editingArticle?.title || "文章参考",
    }),
  });

  /* 元数据定时落库（无变化时 saveArticle 内部跳过；正文由文档会话保存）；
     离开页面/切换文章兜底保存；保存成功广播 article:updated（多实例同步） */
  const persistAndBroadcast = async () => {
    const updated = await saveArticle();
    if (updated) {
      articleEventBus.publishArticleEvent("article:updated", updated);
    }
  };
  useRafInterval(() => void persistAndBroadcast(), 500);
  useUnmount(() => {
    void saveArticle().then(updated => {
      if (updated) articleEventBus.publishArticleEvent("article:updated", updated);
    });
  });
  /* 切换文章是原位更新（栈机去重）不卸载组件：id 变更的 cleanup 里
     先落库旧文章（闭包持有旧编辑态），再由 useEditArticle 重载新文章 */
  useEffect(() => {
    return () => {
      void saveArticle();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  /* 沉浸模式：进入记录选区，退出回传选区，正文 remount 后恢复光标 */
  const immersiveEntrySelectionRef = useRef<Range | null>(null);
  const pendingSelectionRef = useRef<Range | null>(null);
  useEffect(() => {
    if (immersive || !pendingSelectionRef.current) return;
    const timer = window.setTimeout(() => {
      const editor = editorRef.current?.getEditor();
      const selection = pendingSelectionRef.current;
      if (!editor || !selection) return;
      try {
        Transforms.select(editor, selection);
        ReactEditor.focus(editor as never);
        pendingSelectionRef.current = null;
      } catch (error) {
        console.warn("恢复沉浸模式焦点失败:", error);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [editorRemountKey, immersive]);

  /* 目录锚点解析：编辑器 onChange 输出经 normalize 重建（props 里的节点引用与
     editor.children 脱钩，直接 toDOMNode 会抛错）——按序索引编辑器实时
     children 再定位 DOM（由标题扩展统一解析） */
  const resolveAnchor = useCallback((_header: OutlineHeader, index: number): HTMLElement | null => {
    return resolveEditorHeaderAnchor(editorRef.current?.getEditor(), index);
  }, []);

  /* 换封面：选择 → 上传资源 → 落库 → 本地态同步（口径同列表页 handleChangeCover） */
  const handleChangeCover = async () => {
    if (!editingArticle) return;
    const paths = await selectFile({
      properties: ["openFile"],
      filters: [{ name: "Image", extensions: ["jpg", "jpeg", "png", "gif", "bmp", "webp"] }],
    });
    const path = Array.isArray(paths) ? paths[0] : paths;
    if (!path) return;
    setChangingCover(true);
    try {
      const data = (await readBinaryFile(path)) as Uint8Array<ArrayBuffer>;
      const file = new File([data], await getFileBaseName(path));
      const url = await uploadResource(file);
      if (!url) {
        toast.error("封面上传失败");
        return;
      }
      await updateArticleBannerBg(editingArticle.id, url);
      setEditingArticle({ ...editingArticle, bannerBg: url });
      toast.success("封面已更新");
    } finally {
      setChangingCover(false);
    }
  };

  const handleExportMarkdownFile = () => {
    if (!editingArticle) return;
    void exportContentAsMarkdown({
      title: editingArticle.title || `文章-${editingArticle.id}`,
      content: editingArticle.content,
      contentId: editingArticle.contentId,
    });
  };

  const handlePodcastUpdated = (updated: IArticle) => {
    setEditingArticle(updated);
  };

  /* 标题栏面包屑（usePageBreadcrumb）：「文章 / [速切器]」——须 useMemo 稳定化
     （注册协议要求，见 PageProvider 的 usePageSlot JSDoc）；加载中传 null 回退默认 */
  const breadcrumbNode = useMemo(() => {
    if (!editingArticle) return null;
    return (
      <span className="text-tau-meta text-ink-2 flex min-w-0 items-center gap-1">
        <button
          type="button"
          onClick={() => navigator.push("articles")}
          title="返回文章列表"
          className="ease-tau-out hover:text-accent-text rounded-tau-sm hover:bg-hover px-1.5 py-0.5 transition-colors"
        >
          文章
        </button>
        <span className="text-ink-3">/</span>
        <ArticleSwitcher
          currentId={editingArticle.id}
          currentTitle={editingArticle.title}
          onOpenArticle={articleId => navigator.push("article-detail", { id: articleId })}
          onDeleteCurrent={() => navigator.back()}
        />
      </span>
    );
    // navigator 引用稳定（dispatch 闭包）；回调闭包随 editingArticle 更新
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingArticle, navigator]);
  usePageBreadcrumb("article-detail", breadcrumbNode);

  /* 元信息行右侧 ⋯ 菜单（结构对齐卡片详情）：场景（高频）与协作在前，复制/导出居中，
     生成类（制卡/播客，低频）收二级垫底，删除殿后 */
  const moreMenuNode = useMemo(() => {
    if (!editingArticle) return null;
    return (
      <Menu
        align="end"
        trigger={
          <button
            type="button"
            title="更多操作"
            className="text-ink-3 hover:bg-hover hover:text-ink-1 rounded-tau-sm grid size-[26px] place-items-center transition-colors"
          >
            <MoreHorizontal className="size-4" strokeWidth={1.75} />
          </button>
        }
      >
        <Menu.Submenu
          label="场景"
          icon={<Presentation className="size-[15px] shrink-0" strokeWidth={1.75} />}
        >
          <Menu.Item
            icon={<Play className="size-[15px] shrink-0" strokeWidth={1.75} />}
            onSelect={() => setPresenting(editingArticle.content)}
          >
            演示模式
          </Menu.Item>
          <Menu.Item
            icon={<Maximize2 className="size-[15px] shrink-0" strokeWidth={1.75} />}
            onSelect={() => {
              immersiveEntrySelectionRef.current = cloneRange(
                editorRef.current?.getEditor().selection ?? null
              );
              setImmersive(true);
            }}
          >
            沉浸模式
          </Menu.Item>
          {isElectron && databaseName && (
            <Menu.Item
              icon={<ExternalLink className="size-[15px] shrink-0" strokeWidth={1.75} />}
              onSelect={() => void openArticleInNewWindow(databaseName, editingArticle.id)}
            >
              在新窗口打开
            </Menu.Item>
          )}
        </Menu.Submenu>
        <Menu.Item
          icon={
            shared ? (
              <Users className="size-[15px] shrink-0" strokeWidth={1.75} />
            ) : (
              <Share2 className="size-[15px] shrink-0" strokeWidth={1.75} />
            )
          }
          onSelect={() => collaborationRef.current?.open()}
        >
          {shared ? "协作成员" : "发起协作"}
        </Menu.Item>
        <Menu.Submenu
          label="复制"
          icon={<Copy className="size-[15px] shrink-0" strokeWidth={1.75} />}
        >
          <Menu.Item
            icon={<ClipboardCopy className="size-[15px] shrink-0" strokeWidth={1.75} />}
            onSelect={() =>
              void copyMarkdownToClipboard(
                editingArticle.content,
                toastAdapter,
                editingArticle.contentId
              )
            }
          >
            复制 Markdown
          </Menu.Item>
          <Menu.Item
            icon={<MessageSquare className="size-[15px] shrink-0" strokeWidth={1.75} />}
            onSelect={() =>
              void copyWechatHtmlToClipboard(
                editingArticle.content,
                toastAdapter,
                editingArticle.contentId
              )
            }
          >
            复制公众号格式
          </Menu.Item>
        </Menu.Submenu>
        <Menu.Submenu
          label="导出"
          icon={<Download className="size-[15px] shrink-0" strokeWidth={1.75} />}
        >
          <Menu.Item
            icon={<FileText className="size-[15px] shrink-0" strokeWidth={1.75} />}
            onSelect={handleExportMarkdownFile}
          >
            Markdown 文件
          </Menu.Item>
          <Menu.Item
            icon={<ImageIcon className="size-[15px] shrink-0" strokeWidth={1.75} />}
            onSelect={() => setExportKind("image")}
          >
            图片
          </Menu.Item>
          <Menu.Item
            icon={<BookOpen className="size-[15px] shrink-0" strokeWidth={1.75} />}
            onSelect={() => setExportKind("epub")}
          >
            EPUB
          </Menu.Item>
          <Menu.Item
            icon={<FileType className="size-[15px] shrink-0" strokeWidth={1.75} />}
            onSelect={() => setExportKind("pdf")}
          >
            PDF
          </Menu.Item>
        </Menu.Submenu>
        <Menu.Submenu
          label="生成"
          icon={<Wand2 className="size-[15px] shrink-0" strokeWidth={1.75} />}
        >
          <Menu.Item
            icon={<Sparkles className="size-[15px] shrink-0" strokeWidth={1.75} />}
            onSelect={() => flashcard.openAiFlashcard()}
          >
            AI 制卡（闪卡）
          </Menu.Item>
          <Menu.Item
            icon={<CreditCard className="size-[15px] shrink-0" strokeWidth={1.75} />}
            onSelect={() => flashcard.openManualFlashcard()}
          >
            手动制卡（闪卡）
          </Menu.Item>
          <Menu.Item
            icon={<FileAudio className="size-[15px] shrink-0" strokeWidth={1.75} />}
            onSelect={() => setPodcastModalOpen(true)}
          >
            {editingArticle.podcast ? "编辑播客" : "生成播客"}
          </Menu.Item>
        </Menu.Submenu>
        <PluginActionMenuItems target={{ kind: "article", id: String(editingArticle.id) }} />
        <Menu.Separator />
        <Menu.Item
          danger
          icon={<Trash2 className="size-[15px] shrink-0" strokeWidth={1.75} />}
          onSelect={() => setPendingDelete(true)}
        >
          删除文章
        </Menu.Item>
      </Menu>
    );
    // 菜单回调闭包随 editingArticle/数据库名更新
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingArticle, databaseName, shared]);

  if (!editingArticle) {
    return <Loading />;
  }

  const headers = extractContentHeaders(editingArticle.content);

  const setComposing = (next: boolean) =>
    navigator.push("article-detail", {
      id: editingArticle.id,
      ...(next ? { layout: "compose" } : {}),
    });
  /* 意图卡预填：标题 + 正文开头 */
  const initialIntent = [editingArticle.title, getEditorText(editingArticle.content, 120)]
    .filter(Boolean)
    .join("：");

  return (
    <ComposeSessionContext.Provider value={composeSession}>
      <div
        className={cn(
          "mx-auto flex h-full min-h-0 w-full flex-col px-4 pb-4 pt-1",
          !composing && "max-w-[1720px]"
        )}
      >
        <ComposeLayout
          active={composing}
          board={
            <ComposeBoard
              contentId={editingArticle.contentId}
              hostRef={{ kind: "article", id: editingArticle.id }}
              initialIntent={initialIntent}
            />
          }
        >
          {/* 一整张纸（同卡片详情）：封面内衬在纸顶，版心恒居中（hero 与正文列同轴）；
          滚动区贴满纸面（不留上下外边距），封面才能与纸边等距 10px；面包屑由壳层槽位渲染 */}
          {/* 纸面是形变目标（D-106）：文章读到才声明，切换文章的原位更新期间不认旧文章 */}
          <div
            data-morph-key={editingArticle.id === id ? articleMorphKey(id) : undefined}
            className="bg-surface shadow-card rounded-tau-lg flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            <FadeScroll scrollRef={setScrollEl} className="min-h-0 flex-1 border-r-[3px]">
              <ArticleHero
                article={editingArticle}
                onTitleChange={title => {
                  onTitleChange(title);
                }}
                onChangeCover={() => void handleChangeCover()}
                changingCover={changingCover}
                extraMeta={
                  <>
                    <ContextBadge
                      entity={{ kind: "article", id: editingArticle.id }}
                      extra={
                        composing
                          ? undefined
                          : close => (
                              <ComposeBoardEntry
                                contentId={editingArticle.contentId}
                                onOpen={() => {
                                  close();
                                  setComposing(true);
                                }}
                              />
                            )
                      }
                    />
                    {insights.button}
                    <ComposeModeToggle active={composing} onChange={setComposing} />
                  </>
                }
                actions={
                  <span className="flex items-center gap-1">
                    {/* 协作：已共享时常驻成员条（点开成员 Popover）；未共享不占位，由 ⋯「发起协作」打开对话框 */}
                    <ContentCollaborationControl
                      ref={collaborationRef}
                      hideTrigger
                      presence
                      contentId={editingArticle.contentId}
                      source={{
                        sourceType: "article",
                        sourceId: editingArticle.id,
                        sourceTitle: editingArticle.title,
                      }}
                    />
                    {moreMenuNode}
                  </span>
                }
              />

              <div className="grid grid-cols-[1fr_minmax(0,720px)_1fr] items-start px-[26px] pt-8 pb-10">
                <article className="col-start-2 min-w-0">
                  {insights.report && <div className="mb-6">{insights.report}</div>}
                  <PluginEntityPanels
                    target={{ kind: "article", id: String(editingArticle.id) }}
                    className="mb-6"
                  />
                  <ArticlePodcast
                    article={editingArticle}
                    modalOpen={podcastModalOpen}
                    onModalOpenChange={setPodcastModalOpen}
                    onUpdated={handlePodcastUpdated}
                  />

                  <div className={editingArticle.podcast ? "mt-[30px]" : undefined}>
                    {insights.frame(
                      <ErrorBoundary>
                        <ContentEditor
                          at={at}
                          ref={editorRef}
                          contentId={editingArticle.contentId}
                          key={`${editingArticle.id}-${editorRemountKey}`}
                          initValue={editingArticle.content}
                          fallback={<ArticleBodyFallback content={editingArticle.content} />}
                          onInit={onInit}
                          onChange={content => {
                            onContentChange(content);
                          }}
                          readonly={false}
                          editingContext={{ entityType: "article", entityId: editingArticle.id }}
                          {...insights.editorProps}
                        />
                      </ErrorBoundary>
                    )}
                  </div>

                  <AddTag
                    divided
                    tags={editingArticle.tags}
                    addTag={onAddTag}
                    removeTag={onDeleteTag}
                    editTag={(oldTag, newTag) =>
                      onTagsChange(editingArticle.tags.map(tag => (tag === oldTag ? newTag : tag)))
                    }
                  />
                </article>

                {/* 目录：贴正文右缘 sticky（不参与版心计算）；创作模式正文栏窄，不显示 */}
                {!composing && (
                  <div className="sticky top-4 col-start-3 ml-7">
                    <ContentOutline
                      headers={headers}
                      scrollEl={scrollEl}
                      resolveAnchor={resolveAnchor}
                    />
                  </div>
                )}
              </div>
            </FadeScroll>
          </div>
        </ComposeLayout>

        {/* 导出弹窗（legacy 搬用；PdfExportModal 的开合 prop 是 visible） */}
        <ContentExportModal
          open={exportKind === "image"}
          onClose={() => setExportKind(null)}
          content={editingArticle.content}
          title={editingArticle.title}
        />
        <EpubExportModal
          contentId={editingArticle.contentId}
          open={exportKind === "epub"}
          onClose={() => setExportKind(null)}
          content={editingArticle.content}
          title={editingArticle.title || `文章 #${editingArticle.id}`}
        />
        <PdfExportModal
          contentId={editingArticle.contentId}
          visible={exportKind === "pdf"}
          onClose={() => setExportKind(null)}
          content={editingArticle.content}
          title={editingArticle.title || `文章 #${editingArticle.id}`}
        />

        {/* 删除确认：确认后返回上一页 */}
        <ConfirmDialog
          open={pendingDelete}
          onOpenChange={setPendingDelete}
          title="删除文章"
          context={editingArticle.title || `文章 #${editingArticle.id}`}
          description="文章将移入回收语义删除，列表立即移除。"
          impact="该文章的正文与关联卡片链接将不再可访问"
          danger
          confirmText="删除"
          loading={deleting}
          onConfirm={async () => {
            setDeleting(true);
            try {
              await remove(editingArticle.id);
              toast.success("已删除");
              navigator.back();
            } catch {
              toast.error("删除失败");
            } finally {
              setDeleting(false);
              setPendingDelete(false);
            }
          }}
        />

        {/* 演示模式（legacy 搬用） */}
        {presenting && <PresentationMode content={presenting} onExit={() => setPresenting(null)} />}

        {/* 沉浸模式：退出回传选区，正文 remount 后由上方 effect 恢复光标 */}
        {immersive && (
          <ImmersiveEditorMode
            contentId={editingArticle.contentId}
            initValue={editingArticle.content}
            initialSelection={immersiveEntrySelectionRef.current}
            onChange={content => {
              onContentChange(content);
            }}
            onInit={onInit}
            onExit={payload => {
              pendingSelectionRef.current = payload?.selection ?? null;
              setImmersive(false);
              setEditorRemountKey(key => key + 1);
            }}
          />
        )}
      </div>
    </ComposeSessionContext.Provider>
  );
}
