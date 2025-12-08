import { memo, useMemo, useEffect, useRef, useState } from "react";
import { App, FloatButton } from "antd";
import classNames from "classnames";
import { Plus, Presentation } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useLocalStorageState } from "ahooks";
import { useVirtualizer } from "@tanstack/react-virtual";
import { AnimatePresence, motion } from "framer-motion";
import SVG from "react-inlinesvg";
import rightSidebarIcon from "@/assets/icons/sidebar-right.svg";
import useSlideStore from "@/stores/useSlideStore";
import useTabStore from "@/stores/useTabStore";
import { useDatabaseChangeEffect } from "@/hooks/useDatabaseChangeEffect";
import useThemeColors from "@/hooks/useThemeColors";
import ResizeableAndHideableSidebar from "@/components/ResizableAndHideableSidebar";
import CustomModal from "@/components/CustomModal";
import { TabType } from "@/types/tab";
import SlideManagerSidebar from "./components/SlideManagerSidebar";
import SlideCard from "./components/SlideCard";

const SlideManagerPage = memo(() => {
  const { message } = App.useApp();
  const themeColors = useThemeColors();
  const { navigateTo } = useTabStore();

  const {
    decks,
    groups,
    selectedGroupId,
    searchKeyword,
    loadingDecks,
    init,
    createDeck,
    updateDeck,
    removeDeck,
    selectDeck,
  } = useSlideStore(
    useShallow((state) => ({
      decks: state.decks,
      groups: state.groups,
      selectedGroupId: state.selectedGroupId,
      searchKeyword: state.searchKeyword,
      loadingDecks: state.loadingDecks,
      init: state.init,
      createDeck: state.createDeck,
      updateDeck: state.updateDeck,
      removeDeck: state.removeDeck,
      selectDeck: state.selectDeck,
    })),
  );

  // 侧边栏状态
  const [hideSidebar, setHideSidebar] = useLocalStorageState(
    "slide-manager-hide-sidebar",
    { defaultValue: false },
  );
  const [sidebarWidth, setSidebarWidth] = useLocalStorageState(
    "slide-manager-sidebar-width",
    { defaultValue: 280 },
  );

  // 新建/重命名/删除 对话框状态
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newDeckTitle, setNewDeckTitle] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [renameDeckId, setRenameDeckId] = useState<number | null>(null);
  const [renameDeckTitle, setRenameDeckTitle] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteDeckId, setDeleteDeckId] = useState<number | null>(null);
  const [deleteDeckTitle, setDeleteDeckTitle] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  // 滚动容器 ref
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [columnsPerRow, setColumnsPerRow] = useState(4);

  // 初始化数据
  useDatabaseChangeEffect(() => {
    init();
  });

  // 根据选中分组和搜索关键词筛选 decks
  const displayedDecks = useMemo(() => {
    let filtered = decks;

    // 搜索筛选
    if (searchKeyword) {
      filtered = filtered.filter((d) =>
        d.title.toLowerCase().includes(searchKeyword.toLowerCase()),
      );
    }

    // 分组筛选
    if (selectedGroupId === "all") {
      // 显示全部
    } else if (selectedGroupId === null) {
      // 显示未分组
      filtered = filtered.filter((d) => !d.groupId);
    } else {
      // 显示指定分组（包括子分组）
      const getChildGroupIds = (parentId: number): number[] => {
        const children = groups.filter((g) => g.parentId === parentId);
        let ids = [parentId];
        children.forEach((child) => {
          ids = ids.concat(getChildGroupIds(child.id));
        });
        return ids;
      };
      const groupIds = getChildGroupIds(selectedGroupId);
      filtered = filtered.filter(
        (d) => d.groupId && groupIds.includes(d.groupId),
      );
    }

    return filtered;
  }, [decks, selectedGroupId, searchKeyword, groups]);

  // 响应式计算列数
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const updateColumns = () => {
      const width = container.clientWidth;
      const cols = Math.floor(width / 280);
      setColumnsPerRow(Math.max(1, Math.min(cols, 6)));
    };

    updateColumns();

    const resizeObserver = new ResizeObserver(() => {
      updateColumns();
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // 将 decks 分组为行
  const rows = useMemo(() => {
    const result: typeof displayedDecks[] = [];
    for (let i = 0; i < displayedDecks.length; i += columnsPerRow) {
      result.push(displayedDecks.slice(i, i + columnsPerRow));
    }
    return result;
  }, [displayedDecks, columnsPerRow]);

  // 虚拟滚动
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 220,
    overscan: 2,
  });

  // 处理点击卡片
  const handleCardClick = async (deckId: number) => {
    await selectDeck(deckId);
    navigateTo(TabType.SlideDetail, { id: deckId });
  };

  // 处理新建
  const handleCreate = async () => {
    if (!newDeckTitle.trim()) {
      message.warning("请输入标题");
      return;
    }
    try {
      setIsCreating(true);
      const deck = await createDeck({
        title: newDeckTitle.trim(),
        groupId: selectedGroupId === "all" ? null : selectedGroupId,
      });
      setCreateModalOpen(false);
      setNewDeckTitle("");
      message.success("已创建幻灯片");
      // 直接进入编辑页面
      await selectDeck(deck.id);
      navigateTo(TabType.SlideDetail, { id: deck.id });
    } catch (error) {
      message.error("创建失败");
    } finally {
      setIsCreating(false);
    }
  };

  // 打开重命名对话框
  const handleOpenRename = (deckId: number) => {
    const deck = decks.find((d) => d.id === deckId);
    if (!deck) return;
    setRenameDeckId(deckId);
    setRenameDeckTitle(deck.title);
    setRenameModalOpen(true);
  };

  // 处理重命名
  const handleRename = async () => {
    if (!renameDeckId || !renameDeckTitle.trim()) {
      message.warning("请输入标题");
      return;
    }
    try {
      setIsRenaming(true);
      await updateDeck({
        id: renameDeckId,
        title: renameDeckTitle.trim(),
      });
      setRenameModalOpen(false);
      setRenameDeckId(null);
      setRenameDeckTitle("");
      message.success("已更新标题");
    } catch (error) {
      message.error("更新失败");
    } finally {
      setIsRenaming(false);
    }
  };

  // 打开删除对话框
  const handleOpenDelete = (deckId: number) => {
    const deck = decks.find((d) => d.id === deckId);
    if (!deck) return;
    setDeleteDeckId(deckId);
    setDeleteDeckTitle(deck.title);
    setDeleteModalOpen(true);
  };

  // 处理删除
  const handleDelete = async () => {
    if (!deleteDeckId) return;
    try {
      setIsDeleting(true);
      await removeDeck(deleteDeckId);
      setDeleteModalOpen(false);
      setDeleteDeckId(null);
      setDeleteDeckTitle("");
      message.success("已删除幻灯片");
    } catch (error) {
      message.error("删除失败");
    } finally {
      setIsDeleting(false);
    }
  };

  // 拖拽开始处理
  const handleDragStart = (e: React.DragEvent, deckId: number) => {
    e.dataTransfer.setData("deck-id", String(deckId));
  };

  return (
    <div className="flex w-full h-full overflow-hidden">
      {/* 左侧侧边栏 */}
      <ResizeableAndHideableSidebar
        width={sidebarWidth ?? 280}
        onWidthChange={setSidebarWidth}
        open={!hideSidebar}
        disableResize={false}
        className="h-full overflow-hidden"
      >
        <SlideManagerSidebar onFoldSidebar={() => setHideSidebar(!hideSidebar)} />
      </ResizeableAndHideableSidebar>

      {/* 中间主内容区 */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto px-6 py-4"
        >
          {loadingDecks ? (
            <div className="flex items-center justify-center h-full">
              <span className={themeColors.secondaryTextClass}>加载中...</span>
            </div>
          ) : displayedDecks.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-12">
              <div
                className={classNames(
                  "w-20 h-20 rounded-full flex items-center justify-center mb-4",
                  themeColors.tagBgClass,
                )}
              >
                <Presentation
                  className={classNames(
                    "w-10 h-10",
                    themeColors.secondaryTextClass,
                  )}
                />
              </div>
              <p className={classNames("text-sm", themeColors.textClass)}>
                暂无幻灯片
              </p>
              <button
                onClick={() => setCreateModalOpen(true)}
                className={classNames(
                  "mt-4 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                  themeColors.primaryButtonClass,
                )}
              >
                创建幻灯片
              </button>
            </div>
          ) : (
            <div
              style={{
                height: `${virtualizer.getTotalSize()}px`,
                width: "100%",
                position: "relative",
              }}
            >
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const rowDecks = rows[virtualRow.index];
                return (
                  <div
                    key={virtualRow.key}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <div
                      className="grid gap-4"
                      style={{
                        gridTemplateColumns: `repeat(${columnsPerRow}, 1fr)`,
                      }}
                    >
                      {rowDecks.map((deck) => (
                        <div
                          key={deck.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, deck.id)}
                        >
                          <SlideCard
                            deck={deck}
                            onClick={() => handleCardClick(deck.id)}
                            onRename={() => handleOpenRename(deck.id)}
                            onDelete={() => handleOpenDelete(deck.id)}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 侧边栏折叠按钮 */}
      <AnimatePresence>
        {hideSidebar && (
          <motion.div
            className="absolute top-5 left-5 z-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <SVG
              className="cursor-pointer"
              src={rightSidebarIcon}
              onClick={() => setHideSidebar(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* 浮动新建按钮 */}
      {displayedDecks.length > 0 && (
        <FloatButton
          icon={<Plus className="w-5 h-5" />}
          type="primary"
          onClick={() => setCreateModalOpen(true)}
          style={{ right: 24, bottom: 24 }}
        />
      )}

      {/* 新建对话框 */}
      <CustomModal
        title="新建幻灯片"
        open={createModalOpen}
        onOk={handleCreate}
        onCancel={() => {
          setCreateModalOpen(false);
          setNewDeckTitle("");
        }}
        okText="创建"
        cancelText="取消"
        confirmLoading={isCreating}
      >
        <div className="flex flex-col gap-2 mb-3">
          <label className="text-sm">标题</label>
          <input
            className={classNames(
              "w-full px-4 py-3 rounded-xl text-sm outline-none transition-all",
              "bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-700",
              "text-gray-800 dark:text-white",
              "placeholder:text-gray-400 dark:placeholder:text-slate-500",
              "focus:border-blue-500 focus:shadow-[0_0_0_3px_rgba(59,130,246,0.15)]",
              "dark:focus:shadow-[0_0_0_3px_rgba(59,130,246,0.25)]",
            )}
            placeholder="如：团队周会"
            value={newDeckTitle}
            onChange={(e) => setNewDeckTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            autoFocus
          />
        </div>
      </CustomModal>

      {/* 重命名对话框 */}
      <CustomModal
        title="重命名幻灯片"
        open={renameModalOpen}
        onOk={handleRename}
        onCancel={() => {
          setRenameModalOpen(false);
          setRenameDeckId(null);
          setRenameDeckTitle("");
        }}
        okText="确定"
        cancelText="取消"
        confirmLoading={isRenaming}
      >
        <div className="flex flex-col gap-2 mb-3">
          <label className="text-sm">标题</label>
          <input
            className={classNames(
              "w-full px-4 py-3 rounded-xl text-sm outline-none transition-all",
              "bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-700",
              "text-gray-800 dark:text-white",
              "placeholder:text-gray-400 dark:placeholder:text-slate-500",
              "focus:border-blue-500 focus:shadow-[0_0_0_3px_rgba(59,130,246,0.15)]",
              "dark:focus:shadow-[0_0_0_3px_rgba(59,130,246,0.25)]",
            )}
            placeholder="请输入幻灯片标题"
            value={renameDeckTitle}
            onChange={(e) => setRenameDeckTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleRename()}
            autoFocus
          />
        </div>
      </CustomModal>

      {/* 删除对话框 */}
      <CustomModal
        title="删除幻灯片"
        open={deleteModalOpen}
        onOk={handleDelete}
        onCancel={() => {
          setDeleteModalOpen(false);
          setDeleteDeckId(null);
          setDeleteDeckTitle("");
        }}
        okText="删除"
        cancelText="取消"
        confirmLoading={isDeleting}
      >
        <div className="text-sm text-gray-600 dark:text-gray-300 leading-6">
          确认删除「{deleteDeckTitle}」？此操作不可恢复。
        </div>
      </CustomModal>
    </div>
  );
});

SlideManagerPage.displayName = "SlideManagerPage";

export default SlideManagerPage;
