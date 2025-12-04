import { useEffect, useMemo, useState, DragEvent } from "react";
import { App } from "antd";
import { Descendant } from "slate";
import classNames from "classnames";

import Editor from "@/components/Editor";
import { DEFAULT_CARD_CONTENT } from "@/constants";
import useSlideStore from "@/stores/useSlideStore";
import SlidePreview from "@/components/Slide/SlidePreview";
import SlidePlayer from "@/components/Slide/SlidePlayer";
import CustomModal from "@/components/CustomModal";
import { SlideAnimation } from "@/types/slide";

const animationOptions = [
  { value: "fade", label: "淡入" },
  { value: "slide", label: "滑入" },
  { value: "zoom", label: "缩放" },
  { value: "bounce", label: "弹跳" },
  { value: "none", label: "无" },
];

const cls = {
  container: "flex w-full h-full bg-gray-50 dark:bg-[#0c0f17]",
  sidebar:
    "w-72 border-r border-gray-200 dark:border-gray-800 p-4 flex flex-col gap-3 bg-white/80 dark:bg-[#121625]/70 backdrop-blur",
  deckList: "flex-1 overflow-y-auto space-y-3",
  placeholder: "p-6 text-center text-sm text-gray-400 dark:text-gray-500",
  deckItem:
    "flex items-center justify-between p-3 rounded-xl border border-transparent cursor-pointer transition hover:bg-indigo-50/70 dark:hover:bg-indigo-500/10",
  deckItemActive:
    "border-indigo-500 bg-indigo-50/70 dark:bg-indigo-500/10 dark:border-indigo-500",
  deckTitle: "font-semibold text-[15px]",
  deckMeta: "text-xs text-gray-500 mt-0.5",
  deckActions: "flex items-center gap-2",
  content: "flex-1 flex flex-col p-4 overflow-hidden",
  contentHeader: "flex items-center justify-between mb-4",
  headerTitle: "text-lg font-semibold",
  headerActions: "flex items-center gap-3",
  pagesArea: "flex flex-1 gap-4 min-h-0",
  pagesList:
    "w-64 border-r border-gray-200 dark:border-gray-800 pr-3 space-y-3 overflow-y-auto",
  pageItem:
    "flex items-center justify-between rounded-lg border border-transparent px-3 py-2 cursor-pointer hover:bg-indigo-50/60 dark:hover:bg-indigo-500/10 transition",
  pageItemActive:
    "border-indigo-500 bg-indigo-50/70 dark:bg-indigo-500/10 dark:border-indigo-500",
  pageActions: "flex items-center gap-2",
  editorArea:
    "flex-1 min-w-0 flex flex-col overflow-y-auto pr-1 gap-4 scroll-smooth",
  previewContainer:
    "h-80 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#0f111a] shadow-lg shadow-indigo-200/30 p-4 flex flex-col",
  previewHeader: "flex items-center justify-between font-semibold text-sm",
  previewMeta: "text-xs text-gray-500",
  previewCanvas: "flex-1 min-h-0",
  editorContainer:
    "flex-1 min-h-0 border border-gray-200 dark:border-gray-700 rounded-2xl bg-white dark:bg-[#0f1118] shadow-md overflow-hidden",
  notesContainer:
    "border border-gray-200 dark:border-gray-700 rounded-2xl bg-white dark:bg-[#0f1118] shadow-md p-3 flex flex-col gap-2 h-48",
  notesHeader: "flex items-center justify-between text-sm font-semibold",
  notesEditor:
    "flex-1 min-h-0 border border-gray-100 dark:border-gray-700 rounded-xl overflow-hidden",
  editorActions: "mt-4 flex justify-end",
  empty: "flex items-center justify-center h-full text-gray-400",
  formItem: "flex flex-col gap-2 mb-3",
  input:
    "w-full rounded-xl border border-gray-200 bg-transparent px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-gray-700 dark:text-gray-100",
  confirmText: "text-sm text-gray-600 dark:text-gray-300 leading-6",
};

const baseButtonClass =
  "px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium transition bg-white dark:bg-[#111827] text-gray-800 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed";
const primaryButtonClass =
  "px-4 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-indigo-500 to-purple-500 shadow-lg shadow-indigo-200/40 hover:opacity-90";
const textButtonClass =
  "px-2 py-1 text-xs rounded-lg text-gray-500 hover:text-indigo-500";
const textDangerClass = "px-2 py-1 text-xs text-rose-500 rounded-lg";
const pageActionButton =
  "px-2 py-1 text-[11px] rounded-md bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-200";
const pageActionDanger =
  "px-2 py-1 text-[11px] rounded-md bg-rose-100 text-rose-600";

const SlideManagerPage = () => {
  const { message } = App.useApp();
  const {
    decks,
    loadingDecks,
    loadingPages,
    currentDeckId,
    currentPageId,
    pagesByDeck,
    init,
    selectDeck,
    selectPage,
    createDeck,
    createPage,
    updatePage,
    updateDeck,
    removeDeck,
    removePage,
  } = useSlideStore((state) => ({
    decks: state.decks,
    loadingDecks: state.loadingDecks,
    loadingPages: state.loadingPages,
    currentDeckId: state.currentDeckId,
    currentPageId: state.currentPageId,
    pagesByDeck: state.pagesByDeck,
    init: state.init,
    selectDeck: state.selectDeck,
    selectPage: state.selectPage,
    createDeck: state.createDeck,
    createPage: state.createPage,
    updatePage: state.updatePage,
    updateDeck: state.updateDeck,
    removeDeck: state.removeDeck,
    removePage: state.removePage,
  }));

  const [deckModalOpen, setDeckModalOpen] = useState(false);
  const [newDeckTitle, setNewDeckTitle] = useState("");
  const [isCreatingDeck, setIsCreatingDeck] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [pageDraft, setPageDraft] =
    useState<Descendant[]>(DEFAULT_CARD_CONTENT);
  const [notesDraft, setNotesDraft] =
    useState<Descendant[]>(DEFAULT_CARD_CONTENT);
  const [presentDeckId, setPresentDeckId] = useState<number | null>(null);
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
  const [animationDrafts, setAnimationDrafts] = useState<SlideAnimation[]>([]);
  const [notesDrawerOpen, setNotesDrawerOpen] = useState(false);
  const [draggingPageId, setDraggingPageId] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    pageId: number | null;
  }>({
    visible: false,
    x: 0,
    y: 0,
    pageId: null,
  });

  const currentDeck = useMemo(
    () => decks.find((deck) => deck.id === currentDeckId),
    [decks, currentDeckId],
  );

  const currentPages = useMemo(() => {
    if (!currentDeckId) return [];
    return pagesByDeck[currentDeckId] ?? [];
  }, [currentDeckId, pagesByDeck]);

  const currentPage = useMemo(
    () => currentPages.find((page) => page.id === currentPageId),
    [currentPageId, currentPages],
  );

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    const handleGlobalClick = () =>
      setContextMenu((prev) => ({ ...prev, visible: false }));
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setContextMenu((prev) => ({ ...prev, visible: false }));
        setNotesDrawerOpen(false);
      }
    };
    window.addEventListener("click", handleGlobalClick);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("click", handleGlobalClick);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (currentPage?.content && currentPage.content.length > 0) {
      setPageDraft(currentPage.content);
    } else {
      setPageDraft(DEFAULT_CARD_CONTENT);
    }
    if (currentPage?.speakerNotes && currentPage.speakerNotes.length > 0) {
      setNotesDraft(currentPage.speakerNotes);
    } else {
      setNotesDraft(DEFAULT_CARD_CONTENT);
    }
    setAnimationDrafts(currentPage?.animations ?? []);
  }, [currentPage?.id]);

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

  const handleCreatePage = async () => {
    if (!currentDeckId) return;
    const page = await createPage({
      deckId: currentDeckId,
      content: DEFAULT_CARD_CONTENT,
    });
    selectPage(page.id);
    message.success("已创建新页面");
  };

  const handleSavePage = async () => {
    if (!currentPage) return;
    setIsSaving(true);
    try {
      await updatePage({
        id: currentPage.id,
        content: pageDraft,
        speakerNotes: notesDraft,
        animations: syncAnimationOrder(animationDrafts),
      });
      setAnimationDrafts(syncAnimationOrder(animationDrafts));
      message.success("页面已保存");
    } catch (error) {
      console.error(error);
      message.error("保存失败");
    } finally {
      setIsSaving(false);
    }
  };

  const handleStartPresent = () => {
    if (!currentDeckId || currentPages.length === 0) {
      message.warning("请先创建页面");
      return;
    }
    setPresentDeckId(currentDeckId);
  };

  const handleStopPresent = () => {
    setPresentDeckId(null);
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

  const handlePageDragStart = (pageId: number) => {
    setDraggingPageId(pageId);
    setContextMenu((prev) => ({ ...prev, visible: false }));
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

  const syncAnimationOrder = (list: SlideAnimation[]) =>
    list.map((step, idx) => ({
      ...step,
      trigger: { type: "click", at: idx + 1 },
    }));

  const handleAddAnimation = () => {
    setAnimationDrafts((prev) => [
      ...prev,
      {
        id: crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${prev.length}`,
        label: `动画步骤 ${prev.length + 1}`,
        description: "",
        targets: [],
        trigger: { type: "click", at: prev.length + 1 },
        effect: { type: "fade", duration: 0 },
      },
    ]);
  };

  const handleUpdateAnimation = (
    id: string,
    updates: Partial<SlideAnimation>,
  ) => {
    setAnimationDrafts((prev) =>
      prev.map((step) => (step.id === id ? { ...step, ...updates } : step)),
    );
  };

  const handleMoveAnimation = (id: string, offset: number) => {
    setAnimationDrafts((prev) => {
      const index = prev.findIndex((step) => step.id === id);
      const target = index + offset;
      if (index < 0 || target < 0 || target >= prev.length) return prev;
      const newList = [...prev];
      const [item] = newList.splice(index, 1);
      newList.splice(target, 0, item);
      return syncAnimationOrder(newList);
    });
  };

  const handleDeleteAnimation = (id: string) => {
    setAnimationDrafts((prev) =>
      syncAnimationOrder(prev.filter((step) => step.id !== id)),
    );
  };

  return (
    <div className={cls.container}>
      <div className={cls.sidebar}>
        <button
          className={primaryButtonClass}
          onClick={() => setDeckModalOpen(true)}
        >
          新建幻灯片
        </button>
        <div className={cls.deckList}>
          {loadingDecks ? (
            <div className={cls.placeholder}>加载中...</div>
          ) : decks.length === 0 ? (
            <div className={cls.placeholder}>暂无幻灯片</div>
          ) : (
            <div>
              {decks.map((deck) => (
                <div
                  key={deck.id}
                  className={classNames(cls.deckItem, {
                    [cls.deckItemActive]: deck.id === currentDeckId,
                  })}
                  onClick={() => selectDeck(deck.id)}
                >
                  <div>
                    <div className={cls.deckTitle}>{deck.title}</div>
                    <div className={cls.deckMeta}>{deck.pageIds.length} 页</div>
                  </div>
                  <div className={cls.deckActions}>
                    <button
                      className={textButtonClass}
                      onClick={(e) => {
                        e.stopPropagation();
                        openRenameModal(deck.id, deck.title);
                      }}
                    >
                      重命名
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
              ))}
            </div>
          )}
        </div>
      </div>
      <div className={cls.content}>
        <div className={cls.contentHeader}>
          <div className={cls.headerTitle}>
            {currentPage
              ? `第 ${currentPage.pageIndex + 1} 页`
              : "请选择幻灯片"}
          </div>
          <div className={cls.headerActions}>
            {currentDeckId && (
              <>
                <button className={baseButtonClass} onClick={handleCreatePage}>
                  新增页面
                </button>
                <button
                  className={baseButtonClass}
                  onClick={() => setNotesDrawerOpen(true)}
                  disabled={!currentPage}
                >
                  编辑备注
                </button>
                <button
                  className={primaryButtonClass}
                  onClick={handleStartPresent}
                >
                  演示
                </button>
              </>
            )}
          </div>
        </div>
        <div className={cls.pagesArea}>
          <div className={cls.pagesList}>
            {loadingPages ? (
              <div className={cls.placeholder}>加载中...</div>
            ) : currentPages.length === 0 ? (
              <div className={cls.placeholder}>暂无页面</div>
            ) : (
              currentPages.map((page) => (
                <div
                  key={page.id}
                  draggable
                  onDragStart={() => handlePageDragStart(page.id)}
                  onDragOver={handlePageDragOver}
                  onDrop={() => handlePageDrop(page.id)}
                  onDragEnd={handleDragEnd}
                  onClick={() => selectPage(page.id)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setContextMenu({
                      visible: true,
                      x: event.clientX,
                      y: event.clientY,
                      pageId: page.id,
                    });
                  }}
                  className={classNames(
                    "p-2 rounded-2xl border transition shadow-sm cursor-pointer",
                    {
                      "border-indigo-500 bg-indigo-50/70 dark:bg-indigo-500/10":
                        page.id === currentPageId,
                      "border-gray-200 dark:border-gray-800 bg-white dark:bg-[#0f1118]":
                        page.id !== currentPageId,
                      "ring-2 ring-indigo-400":
                        draggingPageId && draggingPageId === page.id,
                    },
                  )}
                >
                  {currentDeck && (
                    <div className="w-full h-36 rounded-xl overflow-hidden border border-gray-100 dark:border-gray-700 bg-white dark:bg-[#0f1118] shadow-inner">
                      <SlidePreview deck={currentDeck} page={page} />
                    </div>
                  )}
                  <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mt-2">
                    <span>第 {page.pageIndex + 1} 页</span>
                    <span>
                      {new Date(page.updateTime).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className={cls.editorArea}>
            {currentPage ? (
              <>
                {currentDeck && (
                  <div className={cls.previewContainer}>
                    <div className={cls.previewHeader}>
                      <span>页面预览</span>
                      <span className={cls.previewMeta}>
                        {currentDeck.width} × {currentDeck.height}
                      </span>
                    </div>
                    <div className={cls.previewCanvas}>
                      <SlidePreview deck={currentDeck} page={currentPage} />
                    </div>
                  </div>
                )}
                <div className={cls.editorContainer}>
                  <Editor
                    key={currentPage.id}
                    readonly={false}
                    initValue={currentPage.content ?? DEFAULT_CARD_CONTENT}
                    onChange={(value) => setPageDraft(value)}
                    className="slide-editor"
                  />
                </div>
                <div className="mt-3 border border-gray-200 dark:border-gray-700 rounded-2xl bg-white dark:bg-[#0f1118] shadow p-3 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold">动画序列</div>
                    <button
                      className={baseButtonClass}
                      onClick={handleAddAnimation}
                    >
                      新增动画
                    </button>
                  </div>
                  {animationDrafts.length === 0 ? (
                    <div className="text-sm text-gray-400">暂无动画</div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {animationDrafts.map((step, index) => (
                        <div
                          key={step.id}
                          className="border border-gray-200 dark:border-gray-700 rounded-xl p-3 space-y-2"
                        >
                          <div className="flex gap-3">
                            <input
                              className={cls.input}
                              value={step.label ?? ""}
                              onChange={(e) =>
                                handleUpdateAnimation(step.id, {
                                  label: e.target.value,
                                })
                              }
                              placeholder={`动画步骤 ${index + 1}`}
                            />
                            <select
                              className={cls.input}
                              value={step.effect?.type ?? "fade"}
                              onChange={(e) =>
                                handleUpdateAnimation(step.id, {
                                  effect: {
                                    ...(step.effect || { duration: 0 }),
                                    type: e.target
                                      .value as SlideAnimation["effect"]["type"],
                                  },
                                })
                              }
                            >
                              {animationOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <textarea
                            className={`${cls.input} h-20`}
                            value={step.description ?? ""}
                            placeholder="动画描述"
                            onChange={(e) =>
                              handleUpdateAnimation(step.id, {
                                description: e.target.value,
                              })
                            }
                          />
                          <div className="flex gap-2">
                            <button
                              className={pageActionButton}
                              disabled={index === 0}
                              onClick={() => handleMoveAnimation(step.id, -1)}
                            >
                              上移
                            </button>
                            <button
                              className={pageActionButton}
                              disabled={index === animationDrafts.length - 1}
                              onClick={() => handleMoveAnimation(step.id, 1)}
                            >
                              下移
                            </button>
                            <button
                              className={pageActionDanger}
                              onClick={() => handleDeleteAnimation(step.id)}
                            >
                              删除
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className={cls.editorActions}>
                  <button
                    className={primaryButtonClass}
                    onClick={handleSavePage}
                    disabled={isSaving}
                  >
                    {isSaving ? "保存中..." : "保存"}
                  </button>
                </div>
              </>
            ) : (
              <div className={cls.empty}>
                {currentDeckId ? "请选择页面" : "请选择或创建一个幻灯片"}
              </div>
            )}
          </div>
        </div>
      </div>
      <CustomModal
        open={deckModalOpen}
        onCancel={() => {
          setDeckModalOpen(false);
          setNewDeckTitle("");
          setIsCreatingDeck(false);
        }}
        title="新建幻灯片"
        onOk={handleCreateDeck}
        confirmLoading={isCreatingDeck}
      >
        <div className="flex flex-col gap-2 mb-3">
          <label>标题</label>
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
          <label>标题</label>
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
        <div className={cls.confirmText}>
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
        <div className={cls.confirmText}>
          确认删除 {deletePageInfo?.label} 吗？
        </div>
      </CustomModal>
      {presentDeckId && currentDeck && currentPages.length > 0 && (
        <SlidePlayer
          deck={currentDeck}
          pages={currentPages}
          onExit={handleStopPresent}
        />
      )}
      {contextMenu.visible && contextMenu.pageId && (
        <div
          className="fixed inset-0 z-[4000]"
          onClick={() =>
            setContextMenu((prev) => ({ ...prev, visible: false }))
          }
        >
          <div className="absolute inset-0" />
          <div
            className="absolute bg-white dark:bg-[#080b12] rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 py-2 w-40"
            style={{ top: contextMenu.y, left: contextMenu.x }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-800"
              onClick={() => {
                handleDuplicatePage(contextMenu.pageId!);
                setContextMenu((prev) => ({ ...prev, visible: false }));
              }}
            >
              复制页面
            </button>
            <button
              className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-800"
              onClick={() => {
                openDeletePageModal(contextMenu.pageId!);
                setContextMenu((prev) => ({ ...prev, visible: false }));
              }}
            >
              删除页面
            </button>
          </div>
        </div>
      )}
      {notesDrawerOpen && (
        <div className="fixed inset-0 z-[4500] flex">
          <div
            className="flex-1 bg-black/40 backdrop-blur-sm"
            onClick={() => setNotesDrawerOpen(false)}
          />
          <div className="w-[360px] h-full bg-white dark:bg-[#080b12] border-l border-gray-200 dark:border-gray-800 flex flex-col">
            <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
              <div className="text-sm font-semibold">编辑备注</div>
              <button
                className={classNames(pageActionButton, "text-xs")}
                onClick={() => setNotesDrawerOpen(false)}
              >
                关闭
              </button>
            </div>
            <div className="flex-1 min-h-0 p-4">
              {currentPage ? (
                <Editor
                  key={`drawer-notes-${currentPage?.id ?? "none"}`}
                  readonly={false}
                  initValue={notesDraft}
                  onChange={(value) => setNotesDraft(value)}
                  className="h-full"
                />
              ) : (
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  请先选择页面
                </div>
              )}
            </div>
            <div className="p-4 border-t border-gray-200 dark:border-gray-800 flex justify-end gap-2">
              <button
                className={baseButtonClass}
                onClick={() => setNotesDrawerOpen(false)}
              >
                取消
              </button>
              <button
                className={primaryButtonClass}
                onClick={async () => {
                  await handleSavePage();
                  setNotesDrawerOpen(false);
                }}
                disabled={!currentPage}
              >
                保存备注
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SlideManagerPage;
