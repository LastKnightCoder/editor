/**
 * 卡片详情视图（mockups/card-detail/plan-a-plain.html v2 定稿落地）：
 * 单栏正文列（640）在整张纸（bg-surface 卡面）内恒居中，卡头一行 meta（分类 Tag 只读展示 · 时间 · ⋯ 菜单；
 * 分类切换与编号语言 2026-09-21 裁决：切换收进 ⋯ 菜单「编辑分类」，#id 与置顶操作移除），
 * 标签行在正文末，连接区仅在有连接时渲染（空卡不堆区块）。
 * 面包屑静态（无速切器）经槽位注入壳层；无底部状态栏——字数并入卡头 meta，
 * 协作：未共享时入口在 ⋯ 菜单「发起协作」；已共享时 meta 行常驻成员条，菜单项改「协作成员」。
 *
 * 保存分工（对齐预览弹窗/文章详情的双链路）：正文走 useEditContent
 * （content 表节流 + content:updated 广播，缓存由 queries 按 contentId 并入），
 * 元数据（标签/分类/置顶/链接）每次操作即时 patch（CardMetadataPatch），
 * 双向链接双边写（等价 legacy useEditCard）。
 *
 * 搬用（§6.1 共存期复用，legacy 组件直接消费）：ContentEditor / AddTag /
 * PresentationMode / ImmersiveEditorMode（退出后恢复光标）/ 导出弹窗×3 /
 * 播客（usePodcastAttachment + PodcastPlayer + PodcastGenerationModal）/
 * 制卡四弹窗（useFlashcardCreation）/ 协作控制。
 * 图谱入口不做（卡片库列表页已有）。
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
  FileAudio,
  FileType,
  FileText,
  Image as ImageIcon,
  Layers,
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
import type { EditorRef } from "@tau/editor/src";
import { usePage, usePageBreadcrumb, usePageParams } from "@/page/PageProvider";
import { isElectron } from "@/electron";
import ContentEditor from "@/components/ContentEditor";
import ErrorBoundary from "@/components/ErrorBoundary";
import { FadeScroll } from "@/components/FadeScroll";
import AddTag from "@/components/AddTag";
import PresentationMode from "@/components/PresentationMode";
import ImmersiveEditorMode from "@/components/ImmersiveEditorMode";
import ContentExportModal from "@/components/ContentExportModal";
import EpubExportModal from "@/components/EpubExportModal";
import { PdfExportModal } from "@/components/PdfExportModal";
import ContentCollaborationControl, {
  type ContentCollaborationControlHandle,
} from "@/components/ContentCollaborationControl";
import useContentShared from "@/hooks/useContentShared";
import PodcastPlayer from "@/components/PodcastPlayer";
import PodcastGenerationModal from "@/components/PodcastGenerationModal";
import DeckSelectorModal from "@/components/DeckSelectorModal";
import FlashcardGenerationModal from "@/components/FlashcardGenerationModal";
import GeneratedFlashcardEditModal from "@/components/GeneratedFlashcardEditModal";
import FlashcardEditor from "@/components/FlashcardEditor";
import useEditContent from "@/hooks/useEditContent";
import useFlashcardCreation from "@/hooks/useFlashcardCreation";
import usePodcastAttachment from "@/hooks/usePodcastAttachment";
import useSettingStore from "@/stores/useSettingStore";
import { attachPodcastToCard, detachPodcastFromCard } from "@/commands/podcast";
import { getScopedCard, openCardInNewWindow } from "@/commands/card";
import {
  copyMarkdownToClipboard,
  copyWechatHtmlToClipboard,
  defaultCardEventBus,
  downloadMarkdown,
  formatDate,
  getMarkdown,
} from "@/utils";
import { getEditorText } from "@/utils/editor";
import { ECardCategory, type ICard } from "@/types";
import { cardCategoryName } from "@/constants/card";
import { Button, ConfirmDialog, Loading, Menu, toast } from "@tau/ui";
import {
  cardsKey,
  cardDetailKey,
  useCardDetail,
  useCardsFeed,
  useCardsMutations,
} from "../queries";
import { CATEGORY_COLORS } from "../categoryColors";
import { AddCardLinkDialog, CardDetailLinks } from "../components/CardDetailLinks";
import { CategoryBadge } from "../components/CardItemView";

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

const CATEGORY_KEYS = Object.keys(cardCategoryName) as ECardCategory[];

export function CardDetailView() {
  const { navigator } = usePage();
  // 本实例 params（PageHost 按栈条目注入；勿读全局栈顶——多实例保活时会串台）
  const { id } = usePageParams<{ id: number }>();

  const detailQuery = useCardDetail(Number.isFinite(id) ? id : null);
  const card = detailQuery.data ?? null;
  const feed = useCardsFeed();
  const mutations = useCardsMutations();
  const queryClient = useQueryClient();
  const databaseName = useSettingStore(state => state.setting.database.active);
  const darkMode = useSettingStore(state => state.setting.darkMode);
  const editorRef = useRef<EditorRef>(null);
  const collaborationRef = useRef<ContentCollaborationControlHandle>(null);
  const shared = useContentShared(card?.contentId);

  const [presenting, setPresenting] = useState<Descendant[] | null>(null);
  const [immersive, setImmersive] = useState(false);
  const [editorRemountKey, setEditorRemountKey] = useState(0);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [addLinkOpen, setAddLinkOpen] = useState(false);
  const [exportKind, setExportKind] = useState<"image" | "epub" | "pdf" | null>(null);

  /* 正文：content 表节流持久化，远端更新推回编辑器（字数/时间经 queries 并入缓存） */
  const { throttleHandleEditorContentChange } = useEditContent(card?.contentId, content => {
    editorRef.current?.setEditorValue(content);
  });

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
    () => (card ? getEditorText(card.content, 20) || `卡片 #${card.id}` : ""),
    [card]
  );

  /* 制卡：闪卡引用指向卡片正文（refType content，与文章制卡同链路） */
  const flashcard = useFlashcardCreation({
    getContent: () => card?.content ?? [],
    getReference: () => ({
      refType: "content",
      contentId: card?.contentId ?? 0,
      title: cardTitle || "卡片参考",
    }),
  });

  /* 播客：挂载到卡片（attach/detach 命令），重载后同步单卡缓存并广播多实例 */
  const podcast = usePodcastAttachment({
    hostId: id,
    currentPodcast: card?.podcast,
    attachPodcast: attachPodcastToCard,
    detachPodcast: detachPodcastFromCard,
    reloadHost: async (hostId: number) =>
      databaseName ? getScopedCard(databaseName, hostId) : null,
    onHostReloaded: updated => {
      queryClient.setQueryData(cardDetailKey(databaseName, updated.id), updated);
      queryClient.setQueryData<ICard[]>(cardsKey(databaseName), list =>
        list?.map(item => (item.id === updated.id ? updated : item))
      );
      defaultCardEventBus.createEditor().publishCardEvent("card:updated", updated);
    },
    messages: { created: "播客已添加到卡片" },
  });

  /* 双向链接双边写（等价 legacy useEditCard）：本卡与对方卡各提交一次补丁。
     双侧非原子——对方侧失败或查不到时只 toast 不回滚（重连即可修复），不静默；
     对方卡优先取轻表，未就绪时回查单卡兜底，避免留下单向链接 */
  const resolveTarget = async (targetId: number) => {
    const fromFeed = feed.cards.find(item => item.id === targetId);
    if (fromFeed) return fromFeed;
    return databaseName ? getScopedCard(databaseName, targetId) : null;
  };
  const linkCards = async (targetIds: number[]) => {
    if (!card) return;
    try {
      await mutations.patch.mutateAsync({
        id: card.id,
        patch: { links: [...new Set([...card.links, ...targetIds])] },
      });
    } catch {
      return; // patch 失败已 toast，本卡未写入，无需处理对方侧
    }
    for (const targetId of targetIds) {
      try {
        const target = await resolveTarget(targetId);
        if (target && !target.links.includes(card.id)) {
          await mutations.patch.mutateAsync({
            id: targetId,
            patch: { links: [...target.links, card.id] },
          });
        }
      } catch {
        toast.error("连接可能不完整（对方卡片写入失败），请重新连接");
      }
    }
  };
  const unlinkCard = async (targetId: number) => {
    if (!card) return;
    try {
      await mutations.patch.mutateAsync({
        id: card.id,
        patch: { links: card.links.filter(link => link !== targetId) },
      });
    } catch {
      return;
    }
    try {
      const target = await resolveTarget(targetId);
      if (target?.links.includes(card.id)) {
        await mutations.patch.mutateAsync({
          id: targetId,
          patch: { links: target.links.filter(link => link !== card.id) },
        });
      }
    } catch {
      toast.error("解除可能不完整（对方卡片写入失败），请重试");
    }
  };

  /* 标题栏面包屑（静态，v2 无速切器）：「卡片库 / #12 首行」；须 useMemo 稳定化 */
  const breadcrumbNode = useMemo(() => {
    if (!card) return null;
    return (
      <span className="text-tau-meta text-ink-2 flex min-w-0 items-center gap-1">
        <button
          type="button"
          onClick={() => navigator.push("cards")}
          title="返回卡片库"
          className="ease-tau-out hover:text-accent-text rounded-tau-sm hover:bg-hover px-1.5 py-0.5 transition-colors"
        >
          卡片库
        </button>
        <span className="text-ink-3">/</span>
        <span className="text-ink-1 flex min-w-0 items-center gap-1.5 font-medium">
          <span className="max-w-[44ch] truncate">{cardTitle}</span>
        </span>
      </span>
    );
  }, [card, cardTitle, navigator]);
  usePageBreadcrumb("card-detail", breadcrumbNode);

  if (Number.isFinite(id) && detailQuery.isPending) return <Loading />;
  if (detailQuery.error)
    return (
      <div role="alert" className="flex flex-col items-center gap-3 py-20">
        <p className="text-danger">读取卡片失败：{detailQuery.error.message}</p>
        <Button onClick={() => void detailQuery.refetch()}>重试</Button>
      </div>
    );
  if (!card)
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-center">
        <p className="text-ink-2 text-[15px] font-medium">卡片不存在或已删除</p>
        <Button onClick={() => navigator.push("cards")}>返回卡片库</Button>
      </div>
    );

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[1720px] flex-col px-4 pb-4 pt-1">
      {/* 一整张纸（同卡片库/微信读书笔记页）：正文列在纸内居中滚动 */}
      <div className="bg-surface shadow-card rounded-tau-lg flex min-h-0 flex-1 flex-col overflow-hidden">
        <FadeScroll className="my-4 min-h-0 flex-1">
          <div className="grid grid-cols-[1fr_minmax(0,640px)_1fr] items-start px-[26px] pb-8 pt-6">
            <article className="col-start-2 min-w-0">
              {/* 卡头 meta：分类 Tag（只读展示，切换在 ⋯ 菜单「编辑分类」）· 时间 ·
                ⋯ 菜单（时间右侧）；置顶操作在列表页承担（2026-09-21 裁决，详情页不做） */}
              <div className="mb-5 flex items-center gap-2.5">
                <CategoryBadge category={card.category} full />
                <span className="text-tau-meta text-ink-3 tabular-nums">
                  创建于 {formatDate(card.create_time, true)} · 最后修改{" "}
                  {formatDate(card.update_time, true)} · {card.count.toLocaleString("zh-CN")} 字
                </span>

                {/* ⋯ 更多（时间右侧）：按频率排布——场景（演示/沉浸，高频）与连接在前，
                  复制/导出居中，生成类（制卡/播客，低频）收二级垫底，删除殿后。
                  图标全局同动作同 icon 且菜单内互不重复（02 规范 §6） */}
                <span className="ml-auto flex items-center gap-1">
                  {/* 协作：已共享时常驻成员条（点开成员 Popover）；未共享不占位，由 ⋯「发起协作」打开对话框 */}
                  <ContentCollaborationControl
                    ref={collaborationRef}
                    hideTrigger
                    presence
                    contentId={card.contentId}
                    source={{ sourceType: "card", sourceId: card.id, sourceTitle: cardTitle }}
                  />
                  <Menu
                    align="end"
                    fit
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
                        onSelect={() => setPresenting(card.content)}
                        icon={<Play className="size-[15px] shrink-0" strokeWidth={1.75} />}
                      >
                        演示模式
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
                        沉浸模式
                      </Menu.Item>
                      {isElectron && databaseName && (
                        <Menu.Item
                          onSelect={() => void openCardInNewWindow(databaseName, card.id)}
                          icon={
                            <ExternalLink className="size-[15px] shrink-0" strokeWidth={1.75} />
                          }
                        >
                          在新窗口打开
                        </Menu.Item>
                      )}
                    </Menu.Submenu>
                    <Menu.Item
                      icon={<Link2 className="size-[15px] shrink-0" strokeWidth={1.75} />}
                      onSelect={() => setAddLinkOpen(true)}
                    >
                      添加连接
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
                      {shared ? "协作成员" : "发起协作"}
                    </Menu.Item>
                    <Menu.Submenu
                      label="编辑分类"
                      icon={<Layers className="size-[15px] shrink-0" strokeWidth={1.75} />}
                    >
                      {CATEGORY_KEYS.map(key => (
                        <Menu.Item
                          key={key}
                          disabled={card.category === key}
                          onSelect={() => mutations.changeCategory.mutate({ card, category: key })}
                          icon={
                            <span
                              className="size-[8px] shrink-0 rounded-full"
                              style={{ background: CATEGORY_COLORS[key].text }}
                            />
                          }
                        >
                          {cardCategoryName[key]}
                        </Menu.Item>
                      ))}
                    </Menu.Submenu>
                    <Menu.Submenu
                      label="复制"
                      icon={<Copy className="size-[15px] shrink-0" strokeWidth={1.75} />}
                    >
                      <Menu.Item
                        onSelect={() => void copyMarkdownToClipboard(card.content, toastAdapter)}
                        icon={<ClipboardCopy className="size-[15px] shrink-0" strokeWidth={1.75} />}
                      >
                        复制 Markdown
                      </Menu.Item>
                      <Menu.Item
                        onSelect={() => void copyWechatHtmlToClipboard(card.content, toastAdapter)}
                        icon={<MessageSquare className="size-[15px] shrink-0" strokeWidth={1.75} />}
                      >
                        复制公众号格式
                      </Menu.Item>
                    </Menu.Submenu>
                    <Menu.Submenu
                      label="导出"
                      icon={<Download className="size-[15px] shrink-0" strokeWidth={1.75} />}
                    >
                      <Menu.Item
                        onSelect={() => {
                          downloadMarkdown(getMarkdown(card.content), cardTitle);
                          toast.success("已导出 Markdown");
                        }}
                        icon={<FileText className="size-[15px] shrink-0" strokeWidth={1.75} />}
                      >
                        Markdown 文件
                      </Menu.Item>
                      <Menu.Item
                        onSelect={() => setExportKind("image")}
                        icon={<ImageIcon className="size-[15px] shrink-0" strokeWidth={1.75} />}
                      >
                        图片
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
                      label="生成"
                      icon={<Wand2 className="size-[15px] shrink-0" strokeWidth={1.75} />}
                    >
                      <Menu.Item
                        onSelect={() => flashcard.openAiFlashcard()}
                        icon={<Sparkles className="size-[15px] shrink-0" strokeWidth={1.75} />}
                      >
                        AI 制卡（闪卡）
                      </Menu.Item>
                      <Menu.Item
                        onSelect={() => flashcard.openManualFlashcard()}
                        icon={<CreditCard className="size-[15px] shrink-0" strokeWidth={1.75} />}
                      >
                        手动制卡（闪卡）
                      </Menu.Item>
                      <Menu.Item
                        onSelect={podcast.openPodcastModal}
                        icon={<FileAudio className="size-[15px] shrink-0" strokeWidth={1.75} />}
                      >
                        {card.podcast ? "编辑播客" : "生成播客"}
                      </Menu.Item>
                    </Menu.Submenu>
                    <Menu.Separator />
                    <Menu.Item
                      danger
                      onSelect={() => setPendingDelete(true)}
                      icon={<Trash2 className="size-[15px] shrink-0" strokeWidth={1.75} />}
                    >
                      删除卡片
                    </Menu.Item>
                  </Menu>
                </span>
              </div>

              {/* 播客条：已挂载时在正文顶（生成/编辑入口在 ⋯ 菜单） */}
              {card.podcast && (
                <div className="mb-[30px]">
                  <PodcastPlayer
                    defaultPodcast={card.podcast}
                    onDelete={podcast.handleDeletePodcast}
                    onEdit={podcast.openPodcastModal}
                  />
                </div>
              )}

              {/* 正文：常编辑态（无预览/编辑切换），协作绑定 card 源 */}
              <ErrorBoundary>
                <ContentEditor
                  ref={editorRef}
                  contentId={card.contentId}
                  key={`${card.id}-${editorRemountKey}`}
                  initValue={card.content}
                  onLoadError={() => undefined}
                  onChange={throttleHandleEditorContentChange}
                  readonly={false}
                  source={{ sourceType: "card", sourceId: card.id }}
                  editingContext={{ entityType: "card", entityId: card.id }}
                  className="min-h-[80px]"
                />
              </ErrorBoundary>

              {/* 标签行（正文末）：每次操作即时 patch */}
              <AddTag
                tags={card.tags}
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

              {/* 连接区：links ∪ 内联引用，有关联才渲染 */}
              <CardDetailLinks
                card={card}
                cards={feed.cards}
                onNavigate={targetId => navigator.push("card-detail", { id: targetId })}
                onUnlink={targetId => void unlinkCard(targetId)}
                onOpenAddDialog={() => setAddLinkOpen(true)}
              />
            </article>
          </div>
        </FadeScroll>
      </div>

      {/* 添加连接（空卡时唯一连接入口在 ⋯ 菜单） */}
      <AddCardLinkDialog
        open={addLinkOpen}
        card={card}
        cards={feed.cards}
        onOpenChange={setAddLinkOpen}
        onLink={targetIds => void linkCards(targetIds)}
      />

      {/* 删除确认：确认后返回上一页 */}
      <ConfirmDialog
        open={pendingDelete}
        onOpenChange={setPendingDelete}
        title="删除卡片"
        description={`确定删除「${cardTitle}」吗？`}
        impact="卡片的正文与双向链接将不再可访问"
        danger
        confirmText="删除"
        loading={mutations.remove.isPending}
        onConfirm={async () => {
          try {
            await mutations.remove.mutateAsync(card.id);
            toast.success("已删除");
            navigator.back();
          } catch {
            toast.error("删除失败");
          } finally {
            setPendingDelete(false);
          }
        }}
      />

      {/* 导出弹窗×3（legacy 搬用；PdfExportModal 的开合 prop 是 visible） */}
      <ContentExportModal
        open={exportKind === "image"}
        onClose={() => setExportKind(null)}
        content={card.content}
      />
      <EpubExportModal
        open={exportKind === "epub"}
        onClose={() => setExportKind(null)}
        content={card.content}
        title={cardTitle}
      />
      <PdfExportModal
        visible={exportKind === "pdf"}
        onClose={() => setExportKind(null)}
        content={card.content}
        title={cardTitle}
      />

      {/* 播客生成（legacy 搬用） */}
      <PodcastGenerationModal
        open={podcast.podcastModalOpen}
        cardContent={card.content}
        initialPodcast={card.podcast}
        onSuccess={podcast.handlePodcastSuccess}
        onCancel={podcast.closePodcastModal}
        saveText="保存到卡片"
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
          contentId={card.contentId}
          initValue={card.content}
          initialSelection={immersiveEntrySelectionRef.current}
          onChange={throttleHandleEditorContentChange}
          onInit={() => undefined}
          onExit={payload => {
            pendingSelectionRef.current = payload?.selection ?? null;
            setImmersive(false);
            setEditorRemountKey(key => key + 1);
          }}
          wordCount={card.count}
          readonly={false}
        />
      )}
    </div>
  );
}
