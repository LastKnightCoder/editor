/**
 * 卡片详情视图：
 * 单栏正文列（640）在整张纸（bg-surface 卡面）内恒居中，卡头一行 meta（时间 · ⋯ 菜单），
 * 标签行在正文末，连接区仅在有连接时渲染（空卡不堆区块）。
 * 面包屑静态（无速切器）经槽位注入壳层；无底部状态栏——字数并入卡头 meta，
 * 协作：未共享时入口在 ⋯ 菜单「发起协作」；已共享时 meta 行常驻成员条，菜单项改「协作成员」。
 *
 * 保存分工：正文走 ContentEditor 文档会话，缓存由 queries 按 contentId 并入；
 * 元数据（标签/置顶/链接）每次操作即时 patch（CardMetadataPatch），
 * 双向链接双边写（等价 legacy useEditCard）。
 *
 * 搬用（§6.1 共存期复用，legacy 组件直接消费）：ContentEditor / AddTag /
 * PresentationMode / ImmersiveEditorMode（退出后恢复光标）/ 导出弹窗×3 /
 * 统一制卡入口（useFlashcardCreation）/ 协作控制。
 * 图谱入口不做（卡片库列表页已有）。
 */

import { useCardsI18n } from "../i18n";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Descendant, Range } from "slate";
import { Transforms } from "slate";
import { ReactEditor } from "slate-react";
import {
  BookOpen,
  ClipboardCopy,
  Copy,
  CreditCard,
  Download,
  ExternalLink,
  FileType,
  FileText,
  Image as ImageIcon,
  Link2,
  Maximize2,
  MessageSquare,
  MoreHorizontal,
  Play,
  Presentation,
  Share2,
  Users,
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react";
import type { EditorRef } from "@tau/editor";
import { usePage, usePageBreadcrumb, usePageParams } from "@/page/PageProvider";
import { isElectron } from "@/electron";
import ContentEditor from "@/components/ContentEditor";
import { HistoryPanel, composeEditorMarks, useContentHistory } from "@/components/ContentHistory";
import { History as HistoryIcon } from "lucide-react";
import { ErrorBoundary } from "@tau/ui";
import { FadeScroll } from "@tau/ui";
import AddTag from "@/components/AddTag";
import PresentationMode from "@/components/PresentationMode";
import ImmersiveEditorMode from "@/components/ImmersiveEditorMode";
import { ContentDocumentImageExportModal } from "@/components/ContentExportModal/ContentDocumentImageExportModal";
import EpubExportModal from "@/components/EpubExportModal";
import { PdfExportModal } from "@/components/PdfExportModal";
import ContentCollaborationControl, {
  type ContentCollaborationControlHandle,
} from "@/components/ContentCollaborationControl";
import useContentShared from "@/hooks/useContentShared";
import useFlashcardCreation from "@/features/flashcards/hooks/useFlashcardCreation";
import { useFeatureEnabled } from "@/app/featureQueries";
import useSettingStore from "@/stores/useSettingStore";
import { openCardInNewWindow } from "@/commands/card";
import { copyMarkdownToClipboard, copyWechatHtmlToClipboard, formatDate } from "@/utils";
import { Button, ConfirmDialog, IconButton, Loading, Menu, cn, toast } from "@tau/ui";
import { PAGE_MARGIN_INLINE_STYLE } from "@/utils/pageMargin";
import { loadCardTagSuggestions, useCardDetail, useCardsMutations } from "../queries";
import { AddContentLinkDialog } from "@/features/context/components/ContextLinks";
import { ContextBadge } from "@/features/context/components/ContextBadge";
import { cardTitle as titleOfCard } from "@/utils/card-title";
import { useInsightsView } from "@/features/insights/useInsightsView";
import { cardMorphKey } from "../morph";
import { usePatternCardDraft } from "../usePatternCardDraft";
import { exportContentAsWord, exportContentAsMarkdown } from "@/services/content-transfer";
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

export function CardDetailView() {
  const { t, locale } = useCardsI18n();
  const { navigator } = usePage();
  // 本实例 params（PageHost 按栈条目注入；勿读全局栈顶——多实例保活时会串台）
  const { id, at } = usePageParams<{ id: number; at?: string }>();

  const detailQuery = useCardDetail(Number.isFinite(id) ? id : null);
  const card = detailQuery.data ?? null;
  const mutations = useCardsMutations();
  const databaseName = useSettingStore(state => state.setting.database.active);
  const editorRef = useRef<EditorRef>(null);
  const collaborationRef = useRef<ContentCollaborationControlHandle>(null);
  const shared = useContentShared(card?.contentId);
  /* 编辑历史页边注：与正文同纸的右栏，选中条目联动正文块标注（连接线画在纸面行容器内） */
  const paperRowRef = useRef<HTMLDivElement>(null);
  const history = useContentHistory({
    contentId: card?.contentId,
    getEditor: () => editorRef.current?.getEditor(),
  });

  const [presenting, setPresenting] = useState<Descendant[] | null>(null);
  const [immersive, setImmersive] = useState(false);
  const [editorRemountKey, setEditorRemountKey] = useState(0);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [addLinkOpen, setAddLinkOpen] = useState(false);
  const [exportKind, setExportKind] = useState<"image" | "epub" | "pdf" | null>(null);

  /* 沉浸模式：进入记录选区，退出回传选区，正文 remount 后恢复光标（文章页同款） */
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

  const cardTitle = useMemo(
    () => (card ? titleOfCard(card, 20) || t("card.fallback", { id: card.id }) : ""),
    [card, t]
  );

  /* AI 洞见：元信息行入口 + 正文上方报告 + 就地标记（KL-058） */
  const insights = useInsightsView({
    ref: { kind: "card", id: card?.id ?? 0 },
    contentId: card?.contentId ?? 0,
    getEditor: useCallback(() => editorRef.current?.getEditor(), []),
  });

  /* 同一思路「写成卡片」的草稿：空正文的占位提示，关闭时还空着就撤回（KL-069） */
  const rootRef = useRef<HTMLDivElement>(null);
  const draft = usePatternCardDraft(card?.id ?? null, rootRef);

  /* 制卡：闪卡引用指向卡片正文（refType content，与文章制卡同链路） */
  const flashcardsEnabled = useFeatureEnabled("review");
  const flashcard = useFlashcardCreation({
    getContent: () => card?.content ?? [],
    getReference: () => ({
      refType: "content",
      contentId: card?.contentId ?? 0,
      title: cardTitle || t("detail.reference"),
    }),
  });

  /* 标题栏面包屑（静态，v2 无速切器）：「卡片库 / #12 首行」；须 useMemo 稳定化 */
  const breadcrumbNode = useMemo(() => {
    if (!card) return null;
    return (
      <span className="text-tau-meta text-ink-2 flex min-w-0 items-center gap-1">
        <button
          type="button"
          onClick={() => navigator.push("cards")}
          title={t("detail.back")}
          className="ease-tau-out hover:text-accent-text rounded-tau-sm hover:bg-hover px-1.5 py-0.5 transition-colors"
        >
          {t("title")}
        </button>
        <span className="text-ink-3">/</span>
        <span className="text-ink-1 flex min-w-0 items-center gap-1.5 font-medium">
          <span className="max-w-[44ch] truncate">{cardTitle}</span>
        </span>
      </span>
    );
  }, [card, cardTitle, navigator, t]);
  usePageBreadcrumb("card-detail", breadcrumbNode);

  if (Number.isFinite(id) && detailQuery.isPending) return <Loading />;
  if (detailQuery.error)
    return (
      <div role="alert" className="flex flex-col items-center gap-3 py-20">
        <p className="text-danger">{t("detail.loadError", { error: detailQuery.error.message })}</p>
        <Button onClick={() => void detailQuery.refetch()}>{t("retry")}</Button>
      </div>
    );
  if (!card)
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-center">
        <p className="text-ink-2 text-[15px] font-medium">{t("detail.missing")}</p>
        <Button onClick={() => navigator.push("cards")}>{t("detail.back")}</Button>
      </div>
    );

  const cardMetaText = [
    t("meta.created", { date: formatDate(card.create_time, true, locale) }),
    t("meta.updated", { date: formatDate(card.update_time, true, locale) }),
    t("meta.words", { count: card.count, amount: card.count.toLocaleString(locale) }),
  ].join(" · ");

  return (
    <div
      ref={rootRef}
      className="mx-auto flex h-full min-h-0 w-full max-w-[1720px] flex-col px-4 pt-1 pb-4"
    >
      {/* 一整张纸（同卡片库/微信读书笔记页）：正文列在纸内居中滚动 */}
      {/* 纸面是形变目标：正文会话就绪前由只读全文占位，卡片数据到位即可截图 */}
      <div
        data-morph-key={cardMorphKey(card.id)}
        className="bg-surface shadow-card rounded-tau-lg flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        <div ref={paperRowRef} className="relative flex min-h-0 flex-1">
          <FadeScroll className="@container my-4 min-h-0 min-w-0 flex-1">
            <div className="w-full pt-6 pb-8" style={PAGE_MARGIN_INLINE_STYLE}>
              <article className="min-w-0">
                {/* 卡头 meta：时间 · ⋯ 菜单（时间右侧）；置顶操作在列表页承担
                （详情页不做） */}
                <div className="mb-5 flex items-center gap-2.5">
                  <span
                    className="text-tau-meta text-ink-3 min-w-0 truncate tabular-nums"
                    title={cardMetaText}
                  >
                    {cardMetaText}
                  </span>
                  {/* 脉络入口：浮层内建「连接」分区（显式连接 ∪ 内联引用） */}
                  <ContextBadge entity={{ kind: "card", id: card.id }} />
                  {insights.button}

                  {/* ⋯ 更多（时间右侧）：按频率排布——场景（演示/沉浸，高频）与连接在前，
                  复制/导出居中，生成类（制卡/播客，低频）收二级垫底，删除殿后。
                  图标全局同动作同 icon 且菜单内互不重复（02 规范 §6） */}
                  <span className="ml-auto flex min-w-0 items-center gap-1">
                    {/* 协作：已共享时常驻成员条（点开成员 Popover）；未共享不占位，由 ⋯「发起协作」打开对话框 */}
                    <ContentCollaborationControl
                      ref={collaborationRef}
                      hideTrigger
                      presence
                      contentId={card.contentId}
                      source={{ sourceType: "card", sourceId: card.id, sourceTitle: cardTitle }}
                    />
                    <IconButton
                      title={t("detail.history")}
                      aria-label={t("detail.history")}
                      aria-pressed={history.isOpen}
                      className={cn(
                        "size-[30px]",
                        history.isOpen && "bg-accent-soft text-accent-text"
                      )}
                      onClick={history.toggle}
                    >
                      <HistoryIcon className="size-4" />
                    </IconButton>
                    <Menu
                      align="end"
                      fit
                      trigger={
                        <button
                          type="button"
                          title={t("action.more")}
                          className="text-ink-3 hover:bg-hover hover:text-ink-1 rounded-tau-sm grid size-[26px] place-items-center transition-colors"
                        >
                          <MoreHorizontal className="size-4" strokeWidth={1.75} />
                        </button>
                      }
                    >
                      <Menu.Submenu
                        label={t("detail.scene")}
                        icon={<Presentation className="size-[15px] shrink-0" strokeWidth={1.75} />}
                      >
                        <Menu.Item
                          onSelect={() => setPresenting(card.content)}
                          icon={<Play className="size-[15px] shrink-0" strokeWidth={1.75} />}
                        >
                          {t("action.present")}
                        </Menu.Item>
                        <Menu.Item
                          onSelect={() => {
                            immersiveEntrySelectionRef.current = cloneRange(
                              editorRef.current?.getEditor().selection ?? null
                            );
                            setImmersive(true);
                          }}
                          icon={<Maximize2 className="size-[15px] shrink-0" strokeWidth={1.75} />}
                        >
                          {t("detail.immersive")}
                        </Menu.Item>
                        {isElectron && databaseName && (
                          <Menu.Item
                            onSelect={() => void openCardInNewWindow(databaseName, card.id)}
                            icon={
                              <ExternalLink className="size-[15px] shrink-0" strokeWidth={1.75} />
                            }
                          >
                            {t("detail.newWindow")}
                          </Menu.Item>
                        )}
                      </Menu.Submenu>
                      <Menu.Item
                        icon={<Link2 className="size-[15px] shrink-0" strokeWidth={1.75} />}
                        onSelect={() => setAddLinkOpen(true)}
                      >
                        {t("links.add")}
                      </Menu.Item>
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
                        {shared ? t("detail.members") : t("detail.startCollab")}
                      </Menu.Item>
                      {window.electron && (
                        <Menu.Item
                          icon={<HistoryIcon className="size-[15px]" />}
                          onSelect={() => history.open()}
                        >
                          {t("detail.history")}
                        </Menu.Item>
                      )}
                      <Menu.Submenu
                        label={t("detail.copy")}
                        icon={<Copy className="size-[15px] shrink-0" strokeWidth={1.75} />}
                      >
                        <Menu.Item
                          onSelect={() =>
                            void copyMarkdownToClipboard(card.content, toastAdapter, card.contentId)
                          }
                          icon={
                            <ClipboardCopy className="size-[15px] shrink-0" strokeWidth={1.75} />
                          }
                        >
                          {t("detail.copyMarkdown")}
                        </Menu.Item>
                        <Menu.Item
                          onSelect={() =>
                            void copyWechatHtmlToClipboard(
                              card.content,
                              toastAdapter,
                              card.contentId
                            )
                          }
                          icon={
                            <MessageSquare className="size-[15px] shrink-0" strokeWidth={1.75} />
                          }
                        >
                          {t("detail.copyWechat")}
                        </Menu.Item>
                      </Menu.Submenu>
                      <Menu.Submenu
                        label={t("action.export")}
                        icon={<Download className="size-[15px] shrink-0" strokeWidth={1.75} />}
                      >
                        <Menu.Item
                          onSelect={() => {
                            void exportContentAsMarkdown({
                              title: cardTitle,
                              content: card.content,
                              contentId: card.contentId,
                            });
                          }}
                          icon={<FileText className="size-[15px] shrink-0" strokeWidth={1.75} />}
                        >
                          {t("export.markdown")}
                        </Menu.Item>
                        <Menu.Item
                          onSelect={() => {
                            void exportContentAsWord({
                              title: cardTitle,
                              content: card.content,
                              contentId: card.contentId,
                            });
                          }}
                          icon={<FileText className="size-[15px] shrink-0" strokeWidth={1.75} />}
                        >
                          {t("export.word")}
                        </Menu.Item>
                        <Menu.Item
                          onSelect={() => setExportKind("image")}
                          icon={<ImageIcon className="size-[15px] shrink-0" strokeWidth={1.75} />}
                        >
                          {t("export.image")}
                        </Menu.Item>
                        <Menu.Item
                          onSelect={() => setExportKind("epub")}
                          icon={<BookOpen className="size-[15px] shrink-0" strokeWidth={1.75} />}
                        >
                          EPUB
                        </Menu.Item>
                        <Menu.Item
                          onSelect={() => setExportKind("pdf")}
                          icon={<FileType className="size-[15px] shrink-0" strokeWidth={1.75} />}
                        >
                          PDF
                        </Menu.Item>
                      </Menu.Submenu>
                      <Menu.Submenu
                        label={t("detail.generate")}
                        icon={<Wand2 className="size-[15px] shrink-0" strokeWidth={1.75} />}
                      >
                        {flashcardsEnabled && (
                          <>
                            <Menu.Item
                              onSelect={() => flashcard.openAiFlashcard()}
                              icon={
                                <Sparkles className="size-[15px] shrink-0" strokeWidth={1.75} />
                              }
                            >
                              {t("detail.aiFlashcard")}
                            </Menu.Item>
                            <Menu.Item
                              onSelect={() => flashcard.openManualFlashcard()}
                              icon={
                                <CreditCard className="size-[15px] shrink-0" strokeWidth={1.75} />
                              }
                            >
                              {t("detail.manualFlashcard")}
                            </Menu.Item>
                          </>
                        )}
                      </Menu.Submenu>
                      <PluginActionMenuItems target={{ kind: "card", id: String(card.id) }} />
                      <Menu.Separator />
                      <Menu.Item
                        danger
                        onSelect={() => setPendingDelete(true)}
                        icon={<Trash2 className="size-[15px] shrink-0" strokeWidth={1.75} />}
                      >
                        {t("action.delete")}
                      </Menu.Item>
                    </Menu>
                  </span>
                </div>

                {insights.report && <div className="-mt-1 mb-5">{insights.report}</div>}
                <PluginEntityPanels
                  target={{ kind: "card", id: String(card.id) }}
                  className="mb-5"
                />

                {/* 正文：常编辑态（无预览/编辑切换），协作绑定 card 源 */}
                {insights.frame(
                  <ErrorBoundary>
                    <ContentEditor
                      at={at}
                      ref={editorRef}
                      contentId={card.contentId}
                      key={`${card.id}-${editorRemountKey}`}
                      initValue={card.content}
                      readonly={false}
                      source={{ sourceType: "card", sourceId: card.id }}
                      editingContext={{ entityType: "card", entityId: card.id }}
                      className="min-h-[80px]"
                      onInit={draft.onInit}
                      {...(draft.placeholder ? { placeHolder: draft.placeholder } : {})}
                      {...composeEditorMarks(insights.editorProps, history.editorProps)}
                    />
                  </ErrorBoundary>
                )}

                {/* 标签行（正文末）：每次操作即时 patch */}
                <AddTag
                  divided
                  tags={card.tags}
                  loadSuggestions={loadCardTagSuggestions}
                  addTag={tag => {
                    if (card.tags.includes(tag)) return;
                    mutations.patch.mutate({
                      id: card.id,
                      patch: { tags: [...card.tags, tag] },
                    });
                  }}
                  removeTag={tag =>
                    mutations.patch.mutate({
                      id: card.id,
                      patch: { tags: card.tags.filter(item => item !== tag) },
                    })
                  }
                  editTag={(oldTag, newTag) => {
                    if (!newTag || newTag === oldTag || card.tags.includes(newTag)) return;
                    mutations.patch.mutate({
                      id: card.id,
                      patch: { tags: card.tags.map(item => (item === oldTag ? newTag : item)) },
                    });
                  }}
                />
              </article>
            </div>
          </FadeScroll>
          {history.isOpen && <HistoryPanel history={history} containerRef={paperRowRef} />}
        </div>
      </div>

      {/* 添加连接：入口在 ⋯ 菜单与脉络浮层的「连接」分区 */}
      <AddContentLinkDialog
        open={addLinkOpen}
        onOpenChange={setAddLinkOpen}
        from={{ kind: "card", id: card.id }}
        excludeContentIds={[card.contentId]}
      />

      {/* 删除确认：确认后返回上一页 */}
      <ConfirmDialog
        open={pendingDelete}
        onOpenChange={setPendingDelete}
        title={t("action.delete")}
        description={t("detail.deleteConfirm", { title: cardTitle })}
        impact={t("delete.impact")}
        danger
        confirmText={t("delete.confirm")}
        loading={mutations.remove.isPending}
        onConfirm={async () => {
          try {
            await mutations.remove.mutateAsync(card.id);
            toast.success(t("delete.success"));
            navigator.back();
          } catch {
            toast.error(t("delete.failed"));
          } finally {
            setPendingDelete(false);
          }
        }}
      />

      {/* 导出弹窗×3（legacy 搬用；PdfExportModal 的开合 prop 是 visible） */}
      <ContentDocumentImageExportModal
        open={exportKind === "image"}
        onClose={() => setExportKind(null)}
        source={{ contentId: card.contentId, sourceType: "card", sourceId: card.id }}
      />
      <EpubExportModal
        contentId={card.contentId}
        open={exportKind === "epub"}
        onClose={() => setExportKind(null)}
        content={card.content}
        title={cardTitle}
      />
      <PdfExportModal
        contentId={card.contentId}
        visible={exportKind === "pdf"}
        onClose={() => setExportKind(null)}
        content={card.content}
        title={cardTitle}
      />

      {/* 演示模式（legacy 搬用） */}
      {presenting && <PresentationMode content={presenting} onExit={() => setPresenting(null)} />}

      {/* 沉浸模式：退出回传选区，正文 remount 后由上方 effect 恢复光标 */}
      {immersive && (
        <ImmersiveEditorMode
          contentId={card.contentId}
          initValue={card.content}
          initialSelection={immersiveEntrySelectionRef.current}
          onExit={payload => {
            pendingSelectionRef.current = payload?.selection ?? null;
            setImmersive(false);
            setEditorRemountKey(key => key + 1);
          }}
        />
      )}
    </div>
  );
}
