/**
 * 文章详情视图（mockups/article-detail/plan-a4-quiet.html 定稿落地）。
 * 版心 = hero + 正文列（720）恒居中（grid 三列），目录贴正文右缘 sticky；
 * 面包屑（含速切器）与底部状态栏经 usePageBreadcrumb/usePageStatusBar 注入壳层。
 *
 * 保存分工（对齐 legacy EditArticle 的双链路设计）：正文持久化走 useEditContent
 * （1s 节流写 content 表 + content:updated 广播，多实例/多 tab 同步），元数据
 * （标题/标签/置顶等）走 useEditArticle.saveArticle（updateArticle 的类型
 * IUpdateArticle 本身不含 content）+ article:updated 广播。
 *
 * 搬用（legacy 组件直接消费，后续按新体系重写）：
 * · 正文编辑器 ContentEditor（@tau/editor 包装，D-015 编辑器正式迁移时替换）；
 * · 演示模式 PresentationMode、沉浸模式 ImmersiveEditorMode（退出后恢复光标）；
 * · 导出弹窗 ContentExportModal / EpubExportModal / PdfExportModal；
 * · 制卡四弹窗（useFlashcardCreation 已去 antd）；
 * · 协作控制 ContentCollaborationControl（已去 antd）。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRafInterval, useUnmount } from "ahooks";
import type { Descendant, Range } from "slate";
import { Transforms } from "slate";
import { ReactEditor } from "slate-react";
import {
  ChevronUp,
  Copy,
  CreditCard,
  Download,
  FileAudio,
  Maximize2,
  Play,
  Presentation,
} from "lucide-react";
import type { EditorRef } from "@tau/editor/src";
import { usePage, usePageBreadcrumb, usePageParams, usePageStatusBar } from "@/page/PageProvider";
import { isElectron } from "@/electron";
import ContentEditor from "@/components/ContentEditor";
import ErrorBoundary from "@/components/ErrorBoundary";
import PresentationMode from "@/components/PresentationMode";
import ImmersiveEditorMode from "@/components/ImmersiveEditorMode";
import ContentExportModal from "@/components/ContentExportModal";
import EpubExportModal from "@/components/EpubExportModal";
import { PdfExportModal } from "@/components/PdfExportModal";
import ContentCollaborationControl from "@/components/ContentCollaborationControl";
import DeckSelectorModal from "@/components/DeckSelectorModal";
import FlashcardGenerationModal from "@/components/FlashcardGenerationModal";
import GeneratedFlashcardEditModal from "@/components/GeneratedFlashcardEditModal";
import FlashcardEditor from "@/components/FlashcardEditor";
import useEditArticle from "@/hooks/useEditArticle";
import useEditContent from "@/hooks/useEditContent";
import useFlashcardCreation from "@/hooks/useFlashcardCreation";
import useUploadResource from "@/hooks/useUploadResource";
import useDynamicExtensionsStore from "@/stores/useDynamicExtensionsStore";
import useSettingStore from "@/stores/useSettingStore";
import { openArticleInNewWindow, updateArticleBannerBg } from "@/commands/article";
import { getFileBaseName, readBinaryFile, selectFile } from "@/commands";
import {
  copyMarkdownToClipboard,
  copyWechatHtmlToClipboard,
  defaultArticleEventBus,
  downloadMarkdown,
  getContentLength,
  getMarkdown,
} from "@/utils";
import type { IArticle } from "@/types";
import { Loading, Menu, toast, cn } from "@tau/ui";
import { useEdgeFade } from "@tau/ui/hooks";

import { ArticlePodcast } from "../components/ArticlePodcast";
import { ArticleHero } from "../components/ArticleHero";
import { ArticleTags } from "../components/ArticleTags";
import { ArticleSwitcher } from "../components/ArticleSwitcher";
import {
  ArticleOutline,
  extractArticleHeaders,
  type OutlineHeader,
} from "../components/ArticleOutline";

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
  const { id } = usePageParams<{ id: number }>();

  const {
    editingArticle,
    onContentChange,
    onInit,
    onTitleChange,
    onAddTag,
    onDeleteTag,
    saveArticle,
    setEditingArticle,
  } = useEditArticle(id);

  const editorRef = useRef<EditorRef>(null);
  const extensions = useDynamicExtensionsStore(store => store.extensions);
  const uploadResource = useUploadResource();
  const databaseName = useSettingStore(state => state.setting.database.active);
  const darkMode = useSettingStore(state => state.setting.darkMode);

  /* 版心滚动容器：callback ref（挂载后接线目录同步与阅读进度） */
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  useEdgeFade(scrollEl);

  const [readPercent, setReadPercent] = useState(0);
  const [saved, setSaved] = useState(true);
  const [podcastModalOpen, setPodcastModalOpen] = useState(false);
  const [presenting, setPresenting] = useState<Descendant[] | null>(null);
  const [immersive, setImmersive] = useState(false);
  const [editorRemountKey, setEditorRemountKey] = useState(0);
  const [changingCover, setChangingCover] = useState(false);
  const [exportKind, setExportKind] = useState<"image" | "epub" | "pdf" | null>(null);

  /* 多实例同步：正文层（content 表 + content:updated 广播，远端/初始内容推给编辑器） */
  const { throttleHandleEditorContentChange } = useEditContent(
    editingArticle?.contentId,
    content => {
      editorRef.current?.setEditorValue(content);
      if (editingArticle) onContentChange(content);
    }
  );

  /* 多实例同步：文章层（保存后广播，订阅远端更新本地态与标题）。
     订阅走 editor 实例（sourceUuid 过滤，收不到自己的广播） */
  const articleEventBus = useMemo(() => defaultArticleEventBus.createEditor(), []);
  useEffect(() => {
    if (!id) return;
    return articleEventBus.subscribeToArticleWithId("article:updated", id, data => {
      setEditingArticle(data.article);
      setSaved(true);
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

  /* 定时落库（无变化时 saveArticle 内部跳过；正文另有 useEditContent 1s 节流链路）；
     离开页面/切换文章兜底保存；保存成功广播 article:updated（多实例同步） */
  const persistAndBroadcast = async () => {
    const updated = await saveArticle();
    if (updated) {
      setSaved(true);
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

  const handleScroll = useCallback(() => {
    if (!scrollEl) return;
    const max = scrollEl.scrollHeight - scrollEl.clientHeight;
    setReadPercent(max > 0 ? Math.round((scrollEl.scrollTop / max) * 100) : 0);
  }, [scrollEl]);

  /* 目录锚点解析：编辑器 onChange 输出经 normalize 重建（props 里的节点引用与
     editor.children 脱钩，直接 toDOMNode 会抛错）——按序索引编辑器实时
     children 再定位 DOM（口径同编辑器自带 scrollHeaderIntoView 的实现） */
  const resolveAnchor = useCallback((_header: OutlineHeader, index: number): HTMLElement | null => {
    const editor = editorRef.current?.getEditor();
    if (!editor) return null;
    const liveHeaders = editor.children.filter(
      node => (node as { type?: string }).type === "header"
    );
    const node = liveHeaders[index];
    if (!node) return null;
    try {
      return ReactEditor.toDOMNode(editor, node as never);
    } catch {
      return null;
    }
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
      setSaved(false);
      toast.success("封面已更新");
    } finally {
      setChangingCover(false);
    }
  };

  const handleExportMarkdownFile = () => {
    if (!editingArticle) return;
    downloadMarkdown(
      getMarkdown(editingArticle.content),
      editingArticle.title || `文章-${editingArticle.id}`
    );
  };

  const handlePodcastUpdated = (updated: IArticle) => {
    setEditingArticle(updated);
    setSaved(true);
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

  /* 全局状态栏（usePageStatusBar）：协作/字数/保存态 | 阅读%/「更多」菜单。
     须 useMemo 稳定化，协议同面包屑 */
  const statusBarNode = useMemo(() => {
    if (!editingArticle) return null;
    return (
      <div className="text-tau-sm text-ink-3 flex min-w-0 flex-1 items-center gap-3.5">
        <ContentCollaborationControl
          contentId={editingArticle.contentId}
          source={{
            sourceType: "article",
            sourceId: editingArticle.id,
            sourceTitle: editingArticle.title,
          }}
        />
        <span className="text-ink-2 tabular-nums">
          {getContentLength(editingArticle.content)} 字
        </span>
        <span className={cn("transition-colors", saved && "text-ink-3")}>
          {saved ? "已保存" : "编辑中…"}
        </span>

        <span className="flex-1" />

        <span className="tabular-nums">阅读 {readPercent}%</span>
        <Menu
          align="end"
          trigger={
            <button
              type="button"
              title="提取 / 导出 / 生成 / 场景"
              className="text-ink-3 hover:bg-hover hover:text-ink-1 rounded-tau-sm flex items-center gap-1 px-1.5 py-0.5 transition-colors"
            >
              更多
              <ChevronUp className="size-3" strokeWidth={1.75} />
            </button>
          }
        >
          <Menu.Group>提取</Menu.Group>
          <Menu.Item
            icon={<Copy className="size-[15px]" strokeWidth={1.75} />}
            onSelect={() => void copyMarkdownToClipboard(editingArticle.content, toastAdapter)}
          >
            复制 Markdown
          </Menu.Item>
          <Menu.Item
            icon={<Copy className="size-[15px]" strokeWidth={1.75} />}
            onSelect={() => void copyWechatHtmlToClipboard(editingArticle.content, toastAdapter)}
          >
            复制公众号格式
          </Menu.Item>
          <Menu.Group>导出</Menu.Group>
          <Menu.Submenu
            label="导出文章"
            icon={<Download className="size-[15px]" strokeWidth={1.75} />}
          >
            <Menu.Item onSelect={handleExportMarkdownFile}>Markdown 文件</Menu.Item>
            <Menu.Item onSelect={() => setExportKind("image")}>图片</Menu.Item>
            <Menu.Item onSelect={() => setExportKind("epub")}>EPUB</Menu.Item>
            <Menu.Item onSelect={() => setExportKind("pdf")}>PDF</Menu.Item>
          </Menu.Submenu>
          <Menu.Group>生成</Menu.Group>
          <Menu.Item
            icon={<FileAudio className="size-[15px]" strokeWidth={1.75} />}
            onSelect={() => setPodcastModalOpen(true)}
          >
            {editingArticle.podcast ? "编辑播客" : "生成播客"}
          </Menu.Item>
          <Menu.Item
            icon={<CreditCard className="size-[15px]" strokeWidth={1.75} />}
            onSelect={() => flashcard.openAiFlashcard()}
          >
            AI 制卡
          </Menu.Item>
          <Menu.Item
            icon={<CreditCard className="size-[15px]" strokeWidth={1.75} />}
            onSelect={() => flashcard.openManualFlashcard()}
          >
            手动制卡
          </Menu.Item>
          <Menu.Group>场景</Menu.Group>
          <Menu.Item
            icon={<Presentation className="size-[15px]" strokeWidth={1.75} />}
            onSelect={() => setPresenting(editingArticle.content)}
          >
            演示模式
          </Menu.Item>
          <Menu.Item
            icon={<Maximize2 className="size-[15px]" strokeWidth={1.75} />}
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
              icon={<Play className="size-[15px]" strokeWidth={1.75} />}
              onSelect={() => void openArticleInNewWindow(databaseName, editingArticle.id)}
            >
              在新窗口打开
            </Menu.Item>
          )}
        </Menu>
      </div>
    );
    // 菜单回调闭包随 editingArticle/数据库名更新；saved/readPercent 为显示态
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingArticle, saved, readPercent, databaseName]);
  usePageStatusBar("article-detail", statusBarNode);

  if (!editingArticle) {
    return <Loading />;
  }

  const headers = extractArticleHeaders(editingArticle.content);

  return (
    <div className="h-full">
      {/* 滚动区：版心恒居中（hero 与正文列同轴）；状态栏与面包屑由壳层槽位渲染 */}
      <div
        ref={setScrollEl}
        onScroll={handleScroll}
        className="edge-fade-scroll h-full overflow-y-auto"
      >
        <ArticleHero
          article={editingArticle}
          onTitleChange={title => {
            onTitleChange(title);
            setSaved(false);
          }}
          onChangeCover={() => void handleChangeCover()}
          changingCover={changingCover}
        />

        <div className="grid grid-cols-[1fr_minmax(0,720px)_1fr] items-start px-[26px] pb-[60px] pt-8">
          <article className="col-start-2 min-w-0">
            <ArticlePodcast
              article={editingArticle}
              modalOpen={podcastModalOpen}
              onModalOpenChange={setPodcastModalOpen}
              onUpdated={handlePodcastUpdated}
            />

            <div className={editingArticle.podcast ? "mt-[30px]" : undefined}>
              <ErrorBoundary>
                <ContentEditor
                  ref={editorRef}
                  contentId={editingArticle.contentId}
                  key={`${editingArticle.id}-${editorRemountKey}`}
                  initValue={editingArticle.content}
                  onInit={onInit}
                  extensions={extensions}
                  onChange={content => {
                    // 正文持久化 + 广播走 useEditContent（content 表），本地态供字数/目录
                    throttleHandleEditorContentChange(content);
                    onContentChange(content);
                    setSaved(false);
                  }}
                  readonly={false}
                />
              </ErrorBoundary>
            </div>

            <ArticleTags
              tags={editingArticle.tags}
              onAdd={tag => {
                onAddTag(tag);
                setSaved(false);
              }}
              onDelete={tag => {
                onDeleteTag(tag);
                setSaved(false);
              }}
            />
          </article>

          {/* 目录：贴正文右缘 sticky（不参与版心计算） */}
          <div className="sticky top-4 col-start-3 ml-7">
            <ArticleOutline headers={headers} scrollEl={scrollEl} resolveAnchor={resolveAnchor} />
          </div>
        </div>
      </div>

      {/* 导出弹窗（legacy 搬用；PdfExportModal 的开合 prop 是 visible） */}
      <ContentExportModal
        open={exportKind === "image"}
        onClose={() => setExportKind(null)}
        content={editingArticle.content}
        title={editingArticle.title}
      />
      <EpubExportModal
        open={exportKind === "epub"}
        onClose={() => setExportKind(null)}
        content={editingArticle.content}
        title={editingArticle.title || `文章 #${editingArticle.id}`}
      />
      <PdfExportModal
        visible={exportKind === "pdf"}
        onClose={() => setExportKind(null)}
        content={editingArticle.content}
        title={editingArticle.title || `文章 #${editingArticle.id}`}
      />

      {/* 制卡四弹窗（legacy 搬用，useFlashcardCreation 已去 antd） */}
      <DeckSelectorModal
        open={flashcard.deckSelectorOpen}
        onCancel={flashcard.closeDeckSelector}
        onSelect={flashcard.handleDeckSelect}
        title={
          flashcard.deckSelectorMode === "manual" ? "选择卡组 - 手动制卡" : "选择卡组 - AI 制卡"
        }
      />
      {flashcard.flashcardEditorOpen && flashcard.selectedDeck && (
        <FlashcardEditor
          open={flashcard.flashcardEditorOpen}
          mode="create"
          activeDeckId={flashcard.selectedDeck.id}
          onClose={flashcard.closeFlashcardEditor}
          isDark={darkMode}
          initialReferences={[flashcard.getReference()]}
        />
      )}
      <FlashcardGenerationModal
        open={flashcard.aiGenerationModalOpen}
        onCancel={flashcard.handleCancelAiGeneration}
        isGenerating={flashcard.isGenerating}
        isPending={flashcard.isGenerationPending}
        error={flashcard.generationError}
        generatedCards={flashcard.generatedCards}
        selectedDeck={flashcard.selectedDeck}
        onToggleCard={flashcard.toggleCardSelection}
        onSelectAll={flashcard.selectAll}
        onDeselectAll={flashcard.deselectAll}
        onConfirm={() => void flashcard.handleConfirmAiGeneration()}
        onChangeDeck={flashcard.changeDeck}
        onEditCard={flashcard.handleEditGeneratedCard}
      />
      <GeneratedFlashcardEditModal
        open={flashcard.generatedCardEditModalOpen}
        card={flashcard.editingGeneratedCard}
        onSave={flashcard.handleSaveGeneratedCard}
        onCancel={flashcard.closeGeneratedCardEditModal}
        isDark={darkMode}
      />

      {/* 演示模式（legacy 搬用） */}
      {presenting && <PresentationMode content={presenting} onExit={() => setPresenting(null)} />}

      {/* 沉浸模式（legacy 搬用）：退出回传选区，正文 remount 后由上方 effect 恢复光标 */}
      {immersive && (
        <ImmersiveEditorMode
          contentId={editingArticle.contentId}
          initValue={editingArticle.content}
          initialSelection={immersiveEntrySelectionRef.current}
          onChange={content => {
            throttleHandleEditorContentChange(content);
            onContentChange(content);
            setSaved(false);
          }}
          onInit={onInit}
          onExit={payload => {
            pendingSelectionRef.current = payload?.selection ?? null;
            setImmersive(false);
            setEditorRemountKey(key => key + 1);
          }}
          wordCount={getContentLength(editingArticle.content)}
          readonly={false}
          extensions={extensions}
        />
      )}
    </div>
  );
}
