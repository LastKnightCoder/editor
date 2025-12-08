import { useState, useMemo, useRef } from "react";
import { App } from "antd";
import classNames from "classnames";
import { useDrag, useDrop } from "react-dnd";
import useSlideStore from "@/stores/useSlideStore";
import SlidePreview from "@/components/Slide/SlidePreview";
import CustomModal from "@/components/CustomModal";
import { DEFAULT_CARD_CONTENT } from "@/constants";
import useThemeColors from "@/hooks/useThemeColors";
import { SlidePage, SlideDeck } from "@/types/slide";
import { ChevronLeft, ChevronRight, Plus, Copy, Trash2, Play } from "lucide-react";

interface NavigatorPanelProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onStartPresent: () => void;
}

// DnD 类型
const DND_TYPE = "SLIDE_PAGE";

interface DragItem {
  id: number;
  index: number;
}

// 可拖拽的页面项组件
interface DraggablePageItemProps {
  page: SlidePage;
  deck: SlideDeck;
  index: number;
  isActive: boolean;
  themeColors: ReturnType<typeof useThemeColors>;
  onSelect: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMove: (dragIndex: number, hoverIndex: number) => void;
}

const DraggablePageItem = ({
  page,
  deck,
  index,
  isActive,
  themeColors,
  onSelect,
  onDuplicate,
  onDelete,
  onMove,
}: DraggablePageItemProps) => {
  const ref = useRef<HTMLDivElement>(null);

  const [{ isDragging }, drag] = useDrag({
    type: DND_TYPE,
    item: (): DragItem => ({ id: page.id, index }),
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  const [{ isOver }, drop] = useDrop<DragItem, void, { isOver: boolean }>({
    accept: DND_TYPE,
    collect: (monitor) => ({
      isOver: monitor.isOver(),
    }),
    hover: (item, monitor) => {
      if (!ref.current) return;

      const dragIndex = item.index;
      const hoverIndex = index;

      if (dragIndex === hoverIndex) return;

      const hoverBoundingRect = ref.current.getBoundingClientRect();
      const hoverMiddleY = (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2;
      const clientOffset = monitor.getClientOffset();
      if (!clientOffset) return;

      const hoverClientY = clientOffset.y - hoverBoundingRect.top;

      // 向下拖动时，只有在超过中点时才移动
      if (dragIndex < hoverIndex && hoverClientY < hoverMiddleY) return;
      // 向上拖动时，只有在超过中点时才移动
      if (dragIndex > hoverIndex && hoverClientY > hoverMiddleY) return;

      onMove(dragIndex, hoverIndex);
      item.index = hoverIndex;
    },
  });

  drag(drop(ref));

  return (
    <div
      ref={ref}
      onClick={onSelect}
      className={classNames(
        "relative p-2 rounded-xl cursor-pointer transition group",
        isActive ? themeColors.activeClass : themeColors.hoverClass,
        isDragging && "opacity-50",
        isOver && "border-2 border-brand"
      )}
      style={{ cursor: "grab" }}
    >
      {/* 左侧指示条 */}
      {isActive && (
        <div
          className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-8 rounded-r-full"
          style={{ backgroundColor: themeColors.accentColor }}
        />
      )}
      <div
        className="w-full rounded-lg overflow-hidden bg-bg-canvas"
        style={{ aspectRatio: `${deck.width} / ${deck.height}` }}
      >
        <SlidePreview deck={deck} page={page} />
      </div>
      {/* 页码和悬浮操作按钮 */}
      <div className="flex items-center justify-between text-xs text-text-2 mt-2">
        <span className={classNames(isActive && themeColors.activeTextClass)}>
          第 {page.pageIndex + 1} 页
        </span>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            className="p-1.5 rounded-md text-text-3 hover:text-brand hover:bg-brand/10 transition"
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate();
            }}
            title="复制页面"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button
            className="p-1.5 rounded-md text-text-3 hover:text-rose-500 hover:bg-rose-500/10 transition"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            title="删除页面"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};

const NavigatorPanel = ({
  collapsed,
  onToggleCollapse,
  onStartPresent,
}: NavigatorPanelProps) => {
  const { message } = App.useApp();
  const themeColors = useThemeColors();
  const {
    decks,
    loadingPages,
    currentDeckId,
    currentPageId,
    pagesByDeck,
    selectPage,
    createPage,
    updatePage,
    removePage,
  } = useSlideStore((state) => ({
    decks: state.decks,
    loadingPages: state.loadingPages,
    currentDeckId: state.currentDeckId,
    currentPageId: state.currentPageId,
    pagesByDeck: state.pagesByDeck,
    selectPage: state.selectPage,
    createPage: state.createPage,
    updatePage: state.updatePage,
    removePage: state.removePage,
  }));

  // 模态框状态 - 仅保留页面删除相关的
  const [deletePageModalOpen, setDeletePageModalOpen] = useState(false);
  const [deletePageInfo, setDeletePageInfo] = useState<{
    id: number;
    label: string;
  } | null>(null);
  const [isDeletingPage, setIsDeletingPage] = useState(false);

  const currentDeck = useMemo(
    () => decks.find((deck) => deck.id === currentDeckId),
    [decks, currentDeckId],
  );

  const currentPages = useMemo(() => {
    if (!currentDeckId) return [];
    return pagesByDeck[currentDeckId] ?? [];
  }, [currentDeckId, pagesByDeck]);

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

  // 使用 react-dnd 进行页面排序
  const handleMovePage = async (dragIndex: number, hoverIndex: number) => {
    if (dragIndex === hoverIndex) return;
    const ordered = [...currentPages].sort((a, b) => a.pageIndex - b.pageIndex);
    const [moved] = ordered.splice(dragIndex, 1);
    ordered.splice(hoverIndex, 0, moved);
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
          className="p-1.5 rounded-lg text-text-2 hover:text-text-1 hover:bg-hover transition"
          onClick={onToggleCollapse}
          title="展开导航"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col bg-bg-container transition-all duration-200 w-72">
        {/* 头部 */}
        <div className="p-3 flex items-center justify-between border-b border-gray-200 dark:border-gray-800">
          <span className="text-sm font-semibold text-text-1">
            {currentDeck?.title ?? "页面预览"}
          </span>
          <button
            className="p-1.5 rounded-lg text-text-2 hover:text-text-1 hover:bg-hover transition"
            onClick={onToggleCollapse}
            title="收起导航"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>

        {/* 页面缩略图列表 */}
        <div className="flex-1 p-3 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-gray-500">
              {currentPages.length} 页
            </span>
            {currentDeckId && (
              <button
                className="flex items-center gap-1 px-2 py-1 text-xs rounded-lg text-text-2 hover:text-brand transition"
                onClick={handleCreatePage}
              >
                <Plus className="w-3 h-3" />
                新页
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto space-y-3">
            {loadingPages ? (
              <div className="text-sm text-gray-400 text-center py-2">
                加载中...
              </div>
            ) : currentPages.length === 0 ? (
              <div className="text-sm text-gray-400 text-center py-2">
                暂无页面
              </div>
            ) : (
              currentPages
                .slice()
                .sort((a, b) => a.pageIndex - b.pageIndex)
                .map((page, index) => {
                  const isActive = page.id === currentPageId;
                  return currentDeck ? (
                    <DraggablePageItem
                      key={page.id}
                      page={page}
                      deck={currentDeck}
                      index={index}
                      isActive={isActive}
                      themeColors={themeColors}
                      onSelect={() => selectPage(page.id)}
                      onDuplicate={() => handleDuplicatePage(page.id)}
                      onDelete={() => openDeletePageModal(page.id)}
                      onMove={handleMovePage}
                    />
                  ) : null;
                })
            )}
          </div>
        </div>

        {/* 底部操作 */}
        <div className="p-3 space-y-2 border-t border-gray-200 dark:border-gray-800">
          <button
            className={classNames(
              "w-full px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
              "flex items-center justify-center gap-2",
              "border-2 disabled:opacity-50 disabled:cursor-not-allowed",
              themeColors.borderClass,
              themeColors.activeTextClass,
              "hover:border-brand hover:text-brand hover:bg-brand/5",
            )}
            onClick={onStartPresent}
            disabled={!currentDeckId || currentPages.length === 0}
          >
            <Play className="w-4 h-4" />
            开始演示
          </button>
        </div>
      </div>

      {/* 删除页面模态框 */}
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
