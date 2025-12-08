import { useState, useMemo, DragEvent } from "react";
import { App } from "antd";
import classNames from "classnames";
import useSlideStore from "@/stores/useSlideStore";
import SlidePreview from "@/components/Slide/SlidePreview";
import CustomModal from "@/components/CustomModal";
import { DEFAULT_CARD_CONTENT } from "@/constants";
import useThemeColors from "@/hooks/useThemeColors";

interface NavigatorPanelProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onStartPresent: () => void;
}

// 无边框设计 - 使用背景色差来区分区块
const cls = {
  container:
    "flex flex-col bg-bg-container transition-all duration-200",
  header:
    "p-3 flex items-center justify-between",
  headerTitle: "text-sm font-semibold text-text-1",
  collapseButton:
    "p-1.5 rounded-lg text-text-2 hover:text-text-1 hover:bg-hover transition",
  deckSection: "p-3",
  deckList: "space-y-1 max-h-48 overflow-y-auto",
  // Deck 项目 - 无边框，使用左侧指示条
  deckItem:
    "relative flex items-center justify-between p-2 rounded-lg cursor-pointer transition",
  deckTitle: "text-sm font-medium truncate flex-1 text-text-1",
  deckMeta: "text-xs text-text-2 ml-2",
  pageSection: "flex-1 p-3 overflow-hidden flex flex-col",
  pageSectionHeader: "flex items-center justify-between mb-3",
  pageList: "flex-1 overflow-y-auto space-y-3",
  // 页面项目 - 无边框设计，选中时左侧指示条
  pageItem:
    "relative p-2 rounded-xl cursor-pointer transition",
  pageItemDragging: "ring-2 ring-brand",
  pagePreview:
    "w-full rounded-lg overflow-hidden bg-bg-canvas",
  pageInfo:
    "flex items-center justify-between text-xs text-text-2 mt-2",
  actions: "p-3 space-y-2",
  // 填充式输入框 - 无边框
  input:
    "w-full rounded-xl bg-bg-input px-3 py-2.5 text-sm text-text-1 placeholder:text-text-3 focus:outline-none focus:ring-2 focus:ring-brand/30 transition",
};

const textButtonClass =
  "px-2 py-1 text-xs rounded-lg text-text-2 hover:text-brand transition";
const textDangerClass = "px-2 py-1 text-xs text-rose-500 rounded-lg hover:text-rose-600 transition";

const NavigatorPanel = ({
  collapsed,
  onToggleCollapse,
  onStartPresent,
}: NavigatorPanelProps) => {
  const { message } = App.useApp();
  const themeColors = useThemeColors();
  const {
    decks,
    loadingDecks,
    loadingPages,
    currentDeckId,
    currentPageId,
    pagesByDeck,
    selectDeck,
    selectPage,
    createDeck,
    createPage,
    updateDeck,
    updatePage,
    removeDeck,
    removePage,
  } = useSlideStore((state) => ({
    decks: state.decks,
    loadingDecks: state.loadingDecks,
    loadingPages: state.loadingPages,
    currentDeckId: state.currentDeckId,
    currentPageId: state.currentPageId,
    pagesByDeck: state.pagesByDeck,
    selectDeck: state.selectDeck,
    selectPage: state.selectPage,
    createDeck: state.createDeck,
    createPage: state.createPage,
    updateDeck: state.updateDeck,
    updatePage: state.updatePage,
    removeDeck: state.removeDeck,
    removePage: state.removePage,
  }));

  // 模态框状态
  const [deckModalOpen, setDeckModalOpen] = useState(false);
  const [newDeckTitle, setNewDeckTitle] = useState("");
  const [isCreatingDeck, setIsCreatingDeck] = useState(false);
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [editingDeckId, setEditingDeckId] = useState<number | null>(null);
  const [renameDeckTitle, setRenameDeckTitle] = useState("");
  const [isRenamingDeck, setIsRenamingDeck] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteDeckId, setDeleteDeckId] = useState<number | null>(null);
  const [deleteDeckTitle, setDeleteDeckTitle] = useState("");
  const [isDeletingDeck, setIsDeletingDeck] = useState(false);
  const [deletePageModalOpen, setDeletePageModalOpen] = useState(false);
  const [deletePageInfo, setDeletePageInfo] = useState<{
    id: number;
    label: string;
  } | null>(null);
  const [isDeletingPage, setIsDeletingPage] = useState(false);
  const [draggingPageId, setDraggingPageId] = useState<number | null>(null);

  const currentDeck = useMemo(
    () => decks.find((deck) => deck.id === currentDeckId),
    [decks, currentDeckId],
  );

  const currentPages = useMemo(() => {
    if (!currentDeckId) return [];
    return pagesByDeck[currentDeckId] ?? [];
  }, [currentDeckId, pagesByDeck]);

  // Deck 操作
  const handleCreateDeck = async () => {
    if (!newDeckTitle.trim()) {
      message.warning("请输入标题");
      return;
    }
    try {
      setIsCreatingDeck(true);
      const deck = await createDeck({
        title: newDeckTitle.trim(),
      });
      setDeckModalOpen(false);
      setNewDeckTitle("");
      await selectDeck(deck.id);
      message.success("已创建新的幻灯片文档");
    } catch (error) {
      console.error(error);
    } finally {
      setIsCreatingDeck(false);
    }
  };

  const openRenameModal = (deckId: number, title: string) => {
    setEditingDeckId(deckId);
    setRenameDeckTitle(title);
    setRenameModalOpen(true);
  };

  const handleRenameDeck = async () => {
    if (!editingDeckId) return;
    if (!renameDeckTitle.trim()) {
      message.warning("请输入标题");
      return;
    }
    try {
      setIsRenamingDeck(true);
      await updateDeck({
        id: editingDeckId,
        title: renameDeckTitle.trim(),
      });
      message.success("已更新标题");
      setRenameModalOpen(false);
    } catch (error) {
      console.error(error);
    } finally {
      setIsRenamingDeck(false);
    }
  };

  const openDeleteModal = (deckId: number, title: string) => {
    setDeleteDeckId(deckId);
    setDeleteDeckTitle(title);
    setDeleteModalOpen(true);
  };

  const handleDeleteDeck = async () => {
    if (!deleteDeckId) return;
    try {
      setIsDeletingDeck(true);
      await removeDeck(deleteDeckId);
      message.success("已删除幻灯片");
      setDeleteModalOpen(false);
      setDeleteDeckId(null);
      setDeleteDeckTitle("");
    } catch (error) {
      console.error(error);
    } finally {
      setIsDeletingDeck(false);
    }
  };

  // Page 操作
  const handleCreatePage = async () => {
    if (!currentDeckId) return;
    const page = await createPage({
      deckId: currentDeckId,
      content: DEFAULT_CARD_CONTENT,
    });
    selectPage(page.id);
    message.success("已创建新页面");
  };

  const openDeletePageModal = (pageId: number) => {
    const page = currentPages.find((p) => p.id === pageId);
    if (!page) return;
    setDeletePageInfo({
      id: pageId,
      label: `第 ${page.pageIndex + 1} 页`,
    });
    setDeletePageModalOpen(true);
  };

  const handleDeletePage = async () => {
    if (!deletePageInfo) return;
    try {
      setIsDeletingPage(true);
      await removePage(deletePageInfo.id);
      message.success("已删除页面");
    } catch (error) {
      console.error(error);
    } finally {
      setIsDeletingPage(false);
      setDeletePageModalOpen(false);
      setDeletePageInfo(null);
    }
  };

  // 拖拽排序
  const handlePageDragStart = (pageId: number) => {
    setDraggingPageId(pageId);
  };

  const handlePageDragOver = (event: DragEvent) => {
    event.preventDefault();
  };

  const handlePageDrop = async (targetId: number) => {
    if (!draggingPageId || draggingPageId === targetId) {
      setDraggingPageId(null);
      return;
    }
    await handleReorderPages(draggingPageId, targetId);
    setDraggingPageId(null);
  };

  const handleDragEnd = () => {
    setDraggingPageId(null);
  };

  const handleReorderPages = async (sourceId: number, targetId: number) => {
    if (sourceId === targetId) return;
    const ordered = [...currentPages].sort((a, b) => a.pageIndex - b.pageIndex);
    const sourceIndex = ordered.findIndex((p) => p.id === sourceId);
    const targetIndex = ordered.findIndex((p) => p.id === targetId);
    if (sourceIndex === -1 || targetIndex === -1) return;
    const [moved] = ordered.splice(sourceIndex, 1);
    ordered.splice(targetIndex, 0, moved);
    await Promise.all(
      ordered.map((page, index) =>
        updatePage({
          id: page.id,
          pageIndex: index,
        }),
      ),
    );
  };

  const handleDuplicatePage = async (pageId: number) => {
    const page = currentPages.find((p) => p.id === pageId);
    if (!page || !currentDeckId) return;
    try {
      const duplicated = await createPage({
        deckId: currentDeckId,
        pageIndex: currentPages.length,
        content: page.content ?? DEFAULT_CARD_CONTENT,
        speakerNotes: page.speakerNotes ?? DEFAULT_CARD_CONTENT,
        animations: page.animations ?? [],
      });
      selectPage(duplicated.id);
      message.success("已复制页面");
    } catch (error) {
      console.error(error);
    }
  };

  if (collapsed) {
    return (
      <div className="w-12 border-r border-gray-200 dark:border-gray-800 flex flex-col items-center py-3 bg-white/80 dark:bg-[#121625]/70 backdrop-blur">
        <button
          className={cls.collapseButton}
          onClick={onToggleCollapse}
          title="展开导航"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <>
      <div className={classNames(cls.container, "w-72")}>
        {/* 头部 */}
        <div className={cls.header}>
          <span className={cls.headerTitle}>幻灯片</span>
          <button
            className={cls.collapseButton}
            onClick={onToggleCollapse}
            title="收起导航"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
        </div>

        {/* 幻灯片组列表 */}
        <div className={cls.deckSection}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500">文档列表</span>
            <button
              className={textButtonClass}
              onClick={() => setDeckModalOpen(true)}
            >
              + 新建
            </button>
          </div>
          <div className={cls.deckList}>
            {loadingDecks ? (
              <div className="text-sm text-gray-400 text-center py-2">
                加载中...
              </div>
            ) : decks.length === 0 ? (
              <div className="text-sm text-gray-400 text-center py-2">
                暂无幻灯片
              </div>
            ) : (
              decks.map((deck) => {
                const isActive = deck.id === currentDeckId;
                return (
                  <div
                    key={deck.id}
                    className={classNames(
                      cls.deckItem,
                      isActive ? themeColors.activeClass : themeColors.hoverClass
                    )}
                    onClick={() => selectDeck(deck.id)}
                  >
                    {/* 左侧指示条 */}
                    {isActive && (
                      <div
                        className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r-full"
                        style={{ backgroundColor: themeColors.accentColor }}
                      />
                    )}
                    <span className={classNames(
                      cls.deckTitle,
                      isActive && themeColors.activeTextClass
                    )}>{deck.title}</span>
                    <span className={cls.deckMeta}>{deck.pageIds.length}页</span>
                    <div className="flex items-center ml-2">
                      <button
                        className={textButtonClass}
                        onClick={(e) => {
                          e.stopPropagation();
                          openRenameModal(deck.id, deck.title);
                        }}
                      >
                        编辑
                      </button>
                      <button
                        className={textDangerClass}
                        onClick={(e) => {
                          e.stopPropagation();
                          openDeleteModal(deck.id, deck.title);
                        }}
                      >
                        删除
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* 页面缩略图列表 */}
        <div className={cls.pageSection}>
          <div className={cls.pageSectionHeader}>
            <span className="text-xs text-gray-500">
              {currentDeck ? `${currentDeck.title} - 页面` : "页面"}
            </span>
            {currentDeckId && (
              <button className={textButtonClass} onClick={handleCreatePage}>
                + 新页
              </button>
            )}
          </div>
          <div className={cls.pageList}>
            {loadingPages ? (
              <div className="text-sm text-gray-400 text-center py-2">
                加载中...
              </div>
            ) : currentPages.length === 0 ? (
              <div className="text-sm text-gray-400 text-center py-2">
                {currentDeckId ? "暂无页面" : "请先选择文档"}
              </div>
            ) : (
              currentPages.map((page) => {
                const isActive = page.id === currentPageId;
                return (
                  <div
                    key={page.id}
                    draggable
                    onDragStart={() => handlePageDragStart(page.id)}
                    onDragOver={handlePageDragOver}
                    onDrop={() => handlePageDrop(page.id)}
                    onDragEnd={handleDragEnd}
                    onClick={() => selectPage(page.id)}
                    className={classNames(
                      cls.pageItem,
                      isActive ? themeColors.activeClass : themeColors.hoverClass,
                      { [cls.pageItemDragging]: draggingPageId === page.id }
                    )}
                  >
                    {/* 左侧指示条 */}
                    {isActive && (
                      <div
                        className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-8 rounded-r-full"
                        style={{ backgroundColor: themeColors.accentColor }}
                      />
                    )}
                    {currentDeck && (
                      <div
                        className={cls.pagePreview}
                        style={{ aspectRatio: `${currentDeck.width} / ${currentDeck.height}` }}
                      >
                        <SlidePreview deck={currentDeck} page={page} />
                      </div>
                    )}
                    <div className={cls.pageInfo}>
                      <span className={classNames(
                        isActive && themeColors.activeTextClass
                      )}>第 {page.pageIndex + 1} 页</span>
                      <div className="flex items-center gap-1">
                        <button
                          className={textButtonClass}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDuplicatePage(page.id);
                          }}
                        >
                          复制
                        </button>
                        <button
                          className={textDangerClass}
                          onClick={(e) => {
                            e.stopPropagation();
                            openDeletePageModal(page.id);
                          }}
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* 底部操作 */}
        <div className={cls.actions}>
          <button
            className={classNames(
              "w-full px-3 py-2.5 rounded-xl text-sm font-semibold text-white transition-all duration-200",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              themeColors.primaryButtonClass
            )}
            onClick={onStartPresent}
            disabled={!currentDeckId || currentPages.length === 0}
          >
            开始演示
          </button>
        </div>
      </div>

      {/* 模态框 */}
      <CustomModal
        open={deckModalOpen}
        onCancel={() => {
          setDeckModalOpen(false);
          setNewDeckTitle("");
        }}
        title="新建幻灯片"
        onOk={handleCreateDeck}
        confirmLoading={isCreatingDeck}
      >
        <div className="flex flex-col gap-2 mb-3">
          <label className="text-sm">标题</label>
          <input
            className={cls.input}
            placeholder="如：团队周会"
            value={newDeckTitle}
            onChange={(e) => setNewDeckTitle(e.target.value)}
          />
        </div>
      </CustomModal>

      <CustomModal
        open={renameModalOpen}
        onCancel={() => {
          setRenameModalOpen(false);
          setEditingDeckId(null);
          setRenameDeckTitle("");
        }}
        title="重命名幻灯片"
        onOk={handleRenameDeck}
        confirmLoading={isRenamingDeck}
      >
        <div className="flex flex-col gap-2 mb-3">
          <label className="text-sm">标题</label>
          <input
            className={cls.input}
            placeholder="请输入幻灯片标题"
            value={renameDeckTitle}
            onChange={(e) => setRenameDeckTitle(e.target.value)}
          />
        </div>
      </CustomModal>

      <CustomModal
        open={deleteModalOpen}
        onCancel={() => {
          setDeleteModalOpen(false);
          setDeleteDeckId(null);
          setDeleteDeckTitle("");
        }}
        title="删除幻灯片"
        onOk={handleDeleteDeck}
        okText="删除"
        cancelText="取消"
        confirmLoading={isDeletingDeck}
      >
        <div className="text-sm text-gray-600 dark:text-gray-300 leading-6">
          确认删除「{deleteDeckTitle}」？此操作不可恢复。
        </div>
      </CustomModal>

      <CustomModal
        open={deletePageModalOpen}
        onCancel={() => {
          setDeletePageModalOpen(false);
          setDeletePageInfo(null);
        }}
        title="删除页面"
        onOk={handleDeletePage}
        okText="删除"
        cancelText="取消"
        confirmLoading={isDeletingPage}
      >
        <div className="text-sm text-gray-600 dark:text-gray-300 leading-6">
          确认删除 {deletePageInfo?.label} 吗？
        </div>
      </CustomModal>
    </>
  );
};

export default NavigatorPanel;
