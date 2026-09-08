import { useEffect, useMemo, useRef, useState } from "react";
import { isElectron } from "@/electron";
import { useLocalStorageState, useMemoizedFn } from "ahooks";
import { App, Button, Dropdown, Empty, MenuProps, message, Tooltip } from "antd";
import {
  ApartmentOutlined,
  HomeOutlined,
  NodeExpandOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import classnames from "classnames";
import DocumentItem from "../DocumentItem";
import useTabStore from "@/stores/useTabStore";
import { TabType } from "@/types/tab";
import If from "@/components/If";
import { DEFAULT_CREATE_DOCUMENT_ITEM } from "@/constants";
import {
  addChildDocumentItem,
  addRefChildDocumentItem,
  addRefRootDocumentItem,
  addRootDocumentItem,
  getAllArticles,
  getAllCards,
  getAllDocumentItems,
  getDocument,
  getDocumentItem,
  getDocumentItemAllParents,
  openDocumentItemInNewWindow,
  removeChildDocumentItem,
  removeRootDocumentItem,
} from "@/commands";
import { IArticle, ICard, IDocument, IDocumentItem, IndexType, SearchResult } from "@/types";
import ContentSelectorModal from "@/components/ContentSelectorModal";
import ContentExportModal from "@/components/ContentExportModal";
import EpubExportModal from "@/components/EpubExportModal";
import { PdfExportModal } from "@/components/PdfExportModal";
import PresentationMode from "@/components/PresentationMode";
import DeckSelectorModal from "@/components/DeckSelectorModal";
import FlashcardGenerationModal from "@/components/FlashcardGenerationModal";
import GeneratedFlashcardEditModal from "@/components/GeneratedFlashcardEditModal";
import FlashcardEditor from "@/pages/FlashcardCenter/FlashcardEditor";
import useFlashcardCreation from "@/hooks/useFlashcardCreation";
import useSettingStore from "@/stores/useSettingStore";
import useDynamicExtensionsStore from "@/stores/useDynamicExtensionsStore";
import { createDocumentCardListExtension } from "@/editor-extensions";
import {
  copyMarkdownToClipboard,
  copyWechatHtmlToClipboard,
  defaultDocumentItemEventBus,
  downloadMarkdown,
  getMarkdown,
} from "@/utils";
import DocumentMindMapView from "../DocumentMindMapView";
import { DocumentMindMapNodeMeta } from "../documentMindMap";
import { useDocumentTreeData } from "../useDocumentTreeData";
import { useDocumentContext } from "../../DocumentContext";

import styles from "./index.module.less";

interface IDocumentProps {
  documentId: number;
}

const ADD_MENU_ITEMS: MenuProps["items"] = [
  {
    key: "add-document",
    label: "添加文档",
  },
  {
    key: "associate-card",
    label: "关联卡片",
  },
  {
    key: "associate-article",
    label: "关联文章",
  },
  {
    key: "associate-document",
    label: "关联文档",
  },
];

const MORE_MENU_ITEMS: MenuProps["items"] = [
  {
    key: "delete",
    label: "删除文档",
  },
  {
    key: "copy",
    label: "复制文档",
    children: [
      {
        key: "copy-markdown",
        label: "Markdown",
      },
      {
        key: "copy-wechat",
        label: "微信公众号",
      },
    ],
  },
  {
    key: "export",
    label: "导出文档",
    children: [
      {
        key: "export-markdown",
        label: "Markdown",
      },
      {
        key: "export-image",
        label: "图片",
      },
      {
        key: "export-epub",
        label: "EPUB",
      },
      {
        key: "export-pdf",
        label: "PDF",
      },
    ],
  },
  {
    key: "presentation",
    label: "演示模式",
  },
  {
    key: "flashcard",
    label: "制作闪卡",
    children: [
      { key: "flashcard-manual", label: "手动制卡" },
      { key: "flashcard-ai", label: "AI 制卡" },
    ],
  },
  // 独立窗口为 Electron 专属能力，Web 端不展示入口
  ...(isElectron ? [{ key: "open-in-new-window", label: "窗口打开" }] : []),
];

const Document = (props: IDocumentProps) => {
  const { documentId } = props;

  const [cards, setCards] = useState<ICard[]>([]);
  const [document, setDocument] = useState<IDocument | null>(null);
  const [articles, setArticles] = useState<IArticle[]>([]);
  const [documentItems, setDocumentItems] = useState<IDocumentItem[]>([]);
  const [addingParentDocumentItemId, setAddingParentDocumentItemId] = useState<number | undefined>(
    undefined
  );
  const [selectCardModalOpen, setSelectCardModalOpen] = useState(false);
  const [selectArticleModalOpen, setSelectArticleModalOpen] = useState(false);
  const [selectDocumentItemModalOpen, setSelectDocumentItemModalOpen] = useState(false);
  const [excludeDocumentItemIds, setExcludeDocumentItemIds] = useState<number[]>([]);
  const [activeActionItem, setActiveActionItem] = useState<IDocumentItem | null>(null);
  const [isPresentation, setIsPresentation] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [epubExportModalOpen, setEpubExportModalOpen] = useState(false);
  const [pdfExportModalOpen, setPdfExportModalOpen] = useState(false);
  const dynamicExtensions = useDynamicExtensionsStore(state => state.extensions);
  const setting = useSettingStore(state => state.setting);
  const databaseName = setting.database.active;
  const darkMode = setting.darkMode;
  const { itemId: activeDocumentItemId } = useDocumentContext();
  const [sidebarView, setSidebarView] = useLocalStorageState<"tree" | "mindmap">(
    `document-sidebar-view:${databaseName}:${documentId}`,
    {
      defaultValue: "tree",
    }
  );
  const [mindMapState, setMindMapState] = useLocalStorageState<{
    pan?: { x: number; y: number };
    zoom?: number;
  }>(`document-mindmap-state:${databaseName}:${documentId}`, {
    defaultValue: {},
  });
  const mindMapViewportSaveTimerRef = useRef<number | null>(null);
  const pendingMindMapViewportRef = useRef<{
    pan: { x: number; y: number };
    zoom: number;
  } | null>(null);

  const navigateTo = useTabStore(state => state.navigateTo);
  const { modal } = App.useApp();
  const documentItemEventBus = useMemo(() => defaultDocumentItemEventBus.createEditor(), []);

  const flashcard = useFlashcardCreation({
    getContent: () => activeActionItem?.content || [],
    getReference: () => ({
      refType: "content",
      contentId: activeActionItem?.contentId || 0,
      title: activeActionItem?.title || "文档参考",
    }),
  });

  const extensions = useMemo(
    () => [
      ...dynamicExtensions,
      createDocumentCardListExtension(addingParentDocumentItemId || activeActionItem?.id || 0),
    ],
    [activeActionItem?.id, addingParentDocumentItemId, dynamicExtensions]
  );

  const refreshDocument = useMemoizedFn(() => {
    getDocument(documentId).then(document => {
      setDocument(document);
    });
  });

  const refreshSelectableContent = useMemoizedFn(() => {
    getAllCards().then(cards => {
      setCards(cards);
    });
    getAllArticles().then(articles => {
      setArticles(articles);
    });
    getAllDocumentItems().then(documentItems => {
      setDocumentItems(documentItems);
    });
  });

  useEffect(() => {
    refreshDocument();
    refreshSelectableContent();
  }, [refreshDocument, refreshSelectableContent]);

  const {
    treeData,
    loading: treeLoading,
    reload: reloadDocumentTree,
  } = useDocumentTreeData(document);

  const saveMindMapViewport = useMemoizedFn(
    (viewport: { pan: { x: number; y: number }; zoom: number }) => {
      setMindMapState(previous => {
        if (
          previous?.pan?.x === viewport.pan.x &&
          previous?.pan?.y === viewport.pan.y &&
          previous?.zoom === viewport.zoom
        ) {
          return previous;
        }
        return viewport;
      });
    }
  );

  const handleMindMapViewportChange = useMemoizedFn(
    (viewport: { pan: { x: number; y: number }; zoom: number }) => {
      pendingMindMapViewportRef.current = viewport;
      if (mindMapViewportSaveTimerRef.current !== null) return;

      mindMapViewportSaveTimerRef.current = window.setTimeout(() => {
        mindMapViewportSaveTimerRef.current = null;
        const nextViewport = pendingMindMapViewportRef.current;
        if (nextViewport) {
          saveMindMapViewport(nextViewport);
        }
      }, 200);
    }
  );

  useEffect(() => {
    return () => {
      if (mindMapViewportSaveTimerRef.current !== null) {
        window.clearTimeout(mindMapViewportSaveTimerRef.current);
      }
    };
  }, []);

  const addNewDocumentItem = useMemoizedFn(async (parentDocumentItemId?: number) => {
    if (!document) return null;
    if (!parentDocumentItemId) {
      const res = await addRootDocumentItem(document.id, DEFAULT_CREATE_DOCUMENT_ITEM);
      if (!res) return null;
      const [updatedDocument, createdItem] = res;
      setDocument(updatedDocument);
      await reloadDocumentTree({ silent: true });
      return createdItem;
    }

    const res = await addChildDocumentItem(parentDocumentItemId, DEFAULT_CREATE_DOCUMENT_ITEM);
    if (!res) return null;
    const [parentDocumentItem, createdItem] = res;
    if (parentDocumentItem) {
      documentItemEventBus.publishDocumentItemEvent("document-item:updated", parentDocumentItem);
    }
    await reloadDocumentTree({ silent: true });
    return createdItem;
  });

  const navigateToDocumentItem = useMemoizedFn((item: IDocumentItem) => {
    navigateTo(
      TabType.DocumentDetail,
      { id: documentId, itemId: item.id },
      `知识库 - ${item.title || `#${item.id}`}`
    );
  });

  const onRemoveDocumentItem = useMemoizedFn(async (id: number, notDelete?: boolean) => {
    if (!document) return null;
    const res = await removeRootDocumentItem(document.id, id, notDelete);
    if (!res) return null;
    const [updatedDocument, removedDocumentItem] = res;
    setDocument(updatedDocument);
    return removedDocumentItem;
  });

  const handleCardSelect = useMemoizedFn(async (selectedResults: SearchResult | SearchResult[]) => {
    const results = Array.isArray(selectedResults) ? selectedResults : [selectedResults];
    const selectedCard = cards.find(card => card.id === results[0]?.id);
    if (!selectedCard || !document) {
      message.warning("请选择卡片");
      return;
    }
    const payload = {
      ...DEFAULT_CREATE_DOCUMENT_ITEM,
      isCard: true,
      cardId: selectedCard.id,
      content: selectedCard.content,
    };
    const res = addingParentDocumentItemId
      ? await addChildDocumentItem(addingParentDocumentItemId, payload)
      : await addRootDocumentItem(document.id, payload);
    if (!res) return;
    const [parentOrDocument, createdItem] = res;
    if (addingParentDocumentItemId && parentOrDocument) {
      documentItemEventBus.publishDocumentItemEvent(
        "document-item:updated",
        parentOrDocument as IDocumentItem
      );
    } else {
      setDocument(parentOrDocument as IDocument);
    }
    setSelectCardModalOpen(false);
    setAddingParentDocumentItemId(undefined);
    await reloadDocumentTree({ silent: true });
    const cardItem = createdItem ? await getDocumentItem(createdItem.id) : null;
    if (cardItem) navigateToDocumentItem(cardItem);
  });

  const handleArticleSelect = useMemoizedFn(
    async (selectedResults: SearchResult | SearchResult[]) => {
      const results = Array.isArray(selectedResults) ? selectedResults : [selectedResults];
      const selectedArticle = articles.find(article => article.id === results[0]?.id);
      if (!selectedArticle || !document) {
        message.warning("请选择文章");
        return;
      }
      const payload = {
        ...DEFAULT_CREATE_DOCUMENT_ITEM,
        isArticle: true,
        articleId: selectedArticle.id,
        title: selectedArticle.title,
        content: selectedArticle.content,
      };
      const res = addingParentDocumentItemId
        ? await addChildDocumentItem(addingParentDocumentItemId, payload)
        : await addRootDocumentItem(document.id, payload);
      if (!res) return;
      const [parentOrDocument, createdItem] = res;
      if (addingParentDocumentItemId && parentOrDocument) {
        documentItemEventBus.publishDocumentItemEvent(
          "document-item:updated",
          parentOrDocument as IDocumentItem
        );
      } else {
        setDocument(parentOrDocument as IDocument);
      }
      setSelectArticleModalOpen(false);
      setAddingParentDocumentItemId(undefined);
      await reloadDocumentTree({ silent: true });
      const articleItem = createdItem ? await getDocumentItem(createdItem.id) : null;
      if (articleItem) navigateToDocumentItem(articleItem);
    }
  );

  const handleDocumentItemSelect = useMemoizedFn(
    async (selectedResults: SearchResult | SearchResult[]) => {
      const results = Array.isArray(selectedResults) ? selectedResults : [selectedResults];
      const selectedDocumentItem = documentItems.find(
        documentItem => documentItem.id === results[0]?.id
      );
      if (!selectedDocumentItem || !document) {
        message.warning("请选择文档");
        return;
      }
      const targetChildren = addingParentDocumentItemId
        ? treeData.itemMap.get(addingParentDocumentItemId)?.children || []
        : document.children;
      if (targetChildren.includes(selectedDocumentItem.id)) {
        message.warning("选择的文档已经在当前文档的子文档中");
        return;
      }
      const res = addingParentDocumentItemId
        ? await addRefChildDocumentItem(addingParentDocumentItemId, selectedDocumentItem.id)
        : await addRefRootDocumentItem(document.id, selectedDocumentItem.id);
      if (!res) return;
      const [parentOrDocument, createdItem] = res;
      if (addingParentDocumentItemId && parentOrDocument) {
        documentItemEventBus.publishDocumentItemEvent(
          "document-item:updated",
          parentOrDocument as IDocumentItem
        );
      } else {
        setDocument(parentOrDocument as IDocument);
      }
      if (createdItem) {
        documentItemEventBus.publishDocumentItemEvent("document-item:updated", createdItem);
      }
      setSelectDocumentItemModalOpen(false);
      setAddingParentDocumentItemId(undefined);
      await reloadDocumentTree({ silent: true });
      navigateToDocumentItem(selectedDocumentItem);
    }
  );

  const initialCardContents = useMemo(() => {
    return cards.map(card => ({
      id: card.id,
      contentId: card.contentId,
      type: "card" as IndexType,
      title: "",
      content: card.content,
      source: "fts" as "fts" | "vec-document",
      updateTime: card.update_time,
    }));
  }, [cards]);

  const initialArticleContents = useMemo(() => {
    return articles.map(article => ({
      id: article.id,
      contentId: article.contentId,
      type: "article" as IndexType,
      title: article.title,
      content: article.content,
      source: "fts" as "fts" | "vec-document",
      updateTime: article.update_time,
    }));
  }, [articles]);

  const initialDocumentItemContents = useMemo(() => {
    return documentItems.map(documentItem => ({
      id: documentItem.id,
      contentId: documentItem.contentId,
      type: "document-item" as IndexType,
      title: documentItem.title,
      content: documentItem.content,
      source: "fts" as "fts" | "vec-document",
      updateTime: documentItem.updateTime,
    }));
  }, [documentItems]);

  const handleAddMenuClick = useMemoizedFn(
    async (
      { key }: Parameters<NonNullable<MenuProps["onClick"]>>[0],
      parentDocumentItemId?: number
    ) => {
      if (!document) return;
      setAddingParentDocumentItemId(parentDocumentItemId);
      setActiveActionItem(
        parentDocumentItemId ? treeData.itemMap.get(parentDocumentItemId) || null : null
      );

      if (key === "add-document") {
        const item = await addNewDocumentItem(parentDocumentItemId);
        setAddingParentDocumentItemId(undefined);
        if (item) navigateToDocumentItem(item);
      } else if (key === "associate-card") {
        setSelectCardModalOpen(true);
      } else if (key === "associate-article") {
        setSelectArticleModalOpen(true);
      } else if (key === "associate-document") {
        try {
          const currentItem = parentDocumentItemId
            ? treeData.itemMap.get(parentDocumentItemId)
            : null;
          const allParents = parentDocumentItemId
            ? await getDocumentItemAllParents(parentDocumentItemId)
            : [];
          setExcludeDocumentItemIds([
            ...allParents,
            ...(parentDocumentItemId ? [parentDocumentItemId] : []),
            ...(currentItem?.children || document.children),
          ]);
          setSelectDocumentItemModalOpen(true);
        } catch (e) {
          console.error(e);
          message.error("获取文档列表失败" + e);
        }
      }
    }
  );

  const handleMoreMenuClick = useMemoizedFn(
    async (
      { key }: Parameters<NonNullable<MenuProps["onClick"]>>[0],
      meta: DocumentMindMapNodeMeta
    ) => {
      const item = meta.documentItem;
      if (!item) return;
      setActiveActionItem(item);
      if (key === "delete") {
        modal.confirm({
          title: "是否删除文档",
          content: item.children.length > 0 ? "该文档下包含多篇子文档，是否删除" : "删除后无法恢复",
          onOk: async () => {
            if (meta.isRoot) {
              await removeRootDocumentItem(documentId, item.id);
            } else if (typeof meta.parentId === "number") {
              const result = await removeChildDocumentItem(documentId, meta.parentId, item.id);
              const [updatedParentItem, updatedItem] = result || [];
              if (updatedParentItem) {
                documentItemEventBus.publishDocumentItemEvent(
                  "document-item:updated",
                  updatedParentItem
                );
              }
              if (updatedItem) {
                documentItemEventBus.publishDocumentItemEvent("document-item:updated", updatedItem);
              }
            }
            refreshDocument();
            await reloadDocumentTree({ silent: true });
            if (!activeDocumentItemId || activeDocumentItemId === item.id) {
              navigateTo(TabType.DocumentDetail, {
                id: documentId,
                itemId: undefined,
              });
            }
          },
          okText: "删除",
          cancelText: "取消",
          okButtonProps: { danger: true },
        });
      } else if (key === "export-markdown") {
        const markdown = getMarkdown(item.content);
        downloadMarkdown(markdown, item.title);
      } else if (key === "copy-markdown") {
        await copyMarkdownToClipboard(item.content, message);
      } else if (key === "copy-wechat") {
        await copyWechatHtmlToClipboard(item.content, message);
      } else if (key === "export-image") {
        setExportModalOpen(true);
      } else if (key === "export-epub") {
        setEpubExportModalOpen(true);
      } else if (key === "export-pdf") {
        setPdfExportModalOpen(true);
      } else if (key === "presentation") {
        setIsPresentation(true);
      } else if (key === "open-in-new-window") {
        openDocumentItemInNewWindow(databaseName, item.id);
      } else if (key === "flashcard-manual") {
        flashcard.openManualFlashcard();
      } else if (key === "flashcard-ai") {
        flashcard.openAiFlashcard();
      }
    }
  );

  if (!document) {
    return <Empty description="知识库不存在或者已被删除" />;
  }

  const { children } = document;

  return (
    <div className={styles.documentContainer}>
      <div className={styles.header}>
        <div className={styles.title}>
          <HomeOutlined
            onClick={() => {
              navigateTo(TabType.DocumentList);
            }}
          />
          {document.title}
        </div>
        <div className={styles.icons}>
          <Tooltip title={sidebarView === "tree" ? "切换到思维导图" : "切换到树视图"}>
            <div
              className={classnames(styles.icon, "transition-colors")}
              onClick={() => setSidebarView(sidebarView === "tree" ? "mindmap" : "tree")}
            >
              {sidebarView === "tree" ? <NodeExpandOutlined /> : <ApartmentOutlined />}
            </div>
          </Tooltip>
          <Dropdown
            menu={{
              items: ADD_MENU_ITEMS,
              onClick: info => handleAddMenuClick(info),
            }}
          >
            <div className={styles.icon}>
              <PlusOutlined />
            </div>
          </Dropdown>
        </div>
      </div>
      <div className={styles.divider}></div>
      {sidebarView === "mindmap" ? (
        <div className="min-h-0 flex-1 overflow-hidden">
          {treeLoading ? (
            <div className="flex h-full items-center justify-center text-sm opacity-60">
              正在加载思维导图...
            </div>
          ) : (
            <DocumentMindMapView
              document={document}
              treeData={treeData}
              activeItemId={activeDocumentItemId}
              databaseName={databaseName}
              addMenuItems={ADD_MENU_ITEMS}
              moreMenuItems={MORE_MENU_ITEMS}
              onAddMenuClick={handleAddMenuClick}
              onMoreMenuClick={handleMoreMenuClick}
              refreshDocument={refreshDocument}
              reloadTree={reloadDocumentTree}
              initialPan={mindMapState?.pan}
              initialZoom={mindMapState?.zoom}
              onViewportChange={handleMindMapViewportChange}
            />
          )}
        </div>
      ) : (
        <>
          <If condition={children.length === 0}>
            <div className={styles.empty}>
              <Empty description="该知识库下没有内容" />
              <Button
                onClick={() =>
                  handleAddMenuClick({
                    key: "add-document",
                  } as Parameters<NonNullable<MenuProps["onClick"]>>[0])
                }
              >
                添加文档
              </Button>
            </div>
          </If>
          <If condition={children.length > 0}>
            <div className={styles.document}>
              {children.map((itemId, index) => (
                <DocumentItem
                  key={itemId}
                  documentId={documentId}
                  path={[index]}
                  parentChildren={children}
                  onParentDeleteChild={onRemoveDocumentItem}
                  refreshDocument={refreshDocument}
                  itemId={itemId}
                  parentId={document.id}
                  isRoot
                  cards={cards}
                  articles={articles}
                  documentItems={documentItems}
                />
              ))}
            </div>
          </If>
        </>
      )}

      <ContentSelectorModal
        title={"选择关联卡片"}
        open={selectCardModalOpen}
        onCancel={() => {
          setSelectCardModalOpen(false);
          setAddingParentDocumentItemId(undefined);
        }}
        onSelect={handleCardSelect}
        contentType="card"
        multiple={false}
        excludeIds={[-1]}
        initialContents={initialCardContents}
        extensions={extensions}
      />
      <ContentSelectorModal
        title={"选择关联文章"}
        open={selectArticleModalOpen}
        onCancel={() => {
          setSelectArticleModalOpen(false);
          setAddingParentDocumentItemId(undefined);
        }}
        onSelect={handleArticleSelect}
        contentType="article"
        multiple={false}
        excludeIds={[-1]}
        extensions={extensions}
        initialContents={initialArticleContents}
      />
      <ContentSelectorModal
        title={"选择关联文档"}
        open={selectDocumentItemModalOpen}
        onCancel={() => {
          setSelectDocumentItemModalOpen(false);
          setAddingParentDocumentItemId(undefined);
        }}
        onSelect={handleDocumentItemSelect}
        contentType="document-item"
        multiple={false}
        excludeIds={excludeDocumentItemIds}
        extensions={extensions}
        initialContents={initialDocumentItemContents}
      />

      {isPresentation && activeActionItem && (
        <PresentationMode
          content={activeActionItem.content}
          onExit={() => {
            setIsPresentation(false);
          }}
        />
      )}

      <ContentExportModal
        open={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        content={activeActionItem?.content || []}
        title={activeActionItem?.title || "文档"}
      />
      <EpubExportModal
        open={epubExportModalOpen}
        onClose={() => setEpubExportModalOpen(false)}
        content={activeActionItem?.content || []}
        title={activeActionItem?.title || "文档"}
      />
      <PdfExportModal
        visible={pdfExportModalOpen}
        onClose={() => setPdfExportModalOpen(false)}
        content={activeActionItem?.content || []}
        title={activeActionItem?.title || "文档"}
      />

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
        onConfirm={flashcard.handleConfirmAiGeneration}
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
    </div>
  );
};

export default Document;
