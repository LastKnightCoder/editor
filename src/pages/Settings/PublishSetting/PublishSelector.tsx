import { memo, useState, useEffect, useCallback, useMemo } from "react";
import classNames from "classnames";
import { useMemoizedFn } from "ahooks";
import { Descendant } from "slate";
import CustomModal from "@/components/CustomModal";
import Editor from "@/components/Editor";

import {
  getPublishSelections,
  batchUpsertPublishSelections,
  getAllCards,
  getAllArticles,
  getProjectList,
  getAllDocuments,
} from "@/commands";
import { getProjectItemsByIds } from "@/commands/project";
import { getDocumentItemsByIds } from "@/commands/document";
import { ICard, ECardCategory } from "@/types/card";
import { IArticle } from "@/types/article";
import { Project, ProjectItem, EProjectItemType } from "@/types/project";
import { IDocument, IDocumentItem } from "@/types/document";
import { PublishContentType } from "@/types/publish";

interface CardListItem {
  id: number;
  title: string;
  summary: string;
  tags: string[];
  category: ECardCategory;
  updateTime: number;
  raw: ICard;
}

interface CardTagNode {
  id: string;
  label: string;
  depth: number;
  count: number;
  cards: CardListItem[];
  children: CardTagNode[];
}

interface DocTreeNode {
  id: number;
  title: string;
  hasContent: boolean;
  content: Descendant[];
  children: DocTreeNode[];
}

interface EntityScopeAll {
  mode: "all";
}

interface EntityScopePartial {
  mode: "partial";
  nodeIds: Set<number>;
}

type EntityScope = EntityScopeAll | EntityScopePartial;

interface EntityModalState {
  type: "project" | "document";
  entity: Project | IDocument;
}

const TABS: Array<{
  key: PublishContentType;
  label: string;
  description: string;
}> = [
  { key: "card", label: "卡片", description: "标签树 + 卡片预览" },
  { key: "article", label: "文章", description: "列表与正文预览" },
  { key: "project", label: "项目", description: "选择项目文档" },
  { key: "document", label: "知识库", description: "选择知识库文档" },
];

const CARD_CATEGORY_LABEL: Record<ECardCategory, string> = {
  [ECardCategory.Temporary]: "临时卡片",
  [ECardCategory.Permanent]: "永久卡片",
  [ECardCategory.Theme]: "主题卡片",
  [ECardCategory.Literature]: "文献卡片",
};

const PublishSelector = memo(() => {
  const [activeTab, setActiveTab] = useState<PublishContentType>("card");
  const [loading, setLoading] = useState(false);
  const [selections, setSelections] = useState<Map<string, boolean>>(new Map());
  const [cards, setCards] = useState<ICard[]>([]);
  const [articles, setArticles] = useState<IArticle[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [documents, setDocuments] = useState<IDocument[]>([]);
  const [cardTree, setCardTree] = useState<CardTagNode[]>([]);
  const [activeTagId, setActiveTagId] = useState<string>("");
  const [activeArticleId, setActiveArticleId] = useState<number | null>(null);
  const [projectTrees, setProjectTrees] = useState<Map<number, DocTreeNode[]>>(
    new Map(),
  );
  const [documentTrees, setDocumentTrees] = useState<
    Map<number, DocTreeNode[]>
  >(new Map());
  const [projectScopes, setProjectScopes] = useState<Map<number, EntityScope>>(
    new Map(),
  );
  const [documentScopes, setDocumentScopes] = useState<
    Map<number, EntityScope>
  >(new Map());
  const [entityModal, setEntityModal] = useState<EntityModalState | null>(null);
  const [entityModalLoading, setEntityModalLoading] = useState(false);
  const [modalSelectedIds, setModalSelectedIds] = useState<Set<number>>(
    new Set(),
  );
  const [modalActiveNodeId, setModalActiveNodeId] = useState<number | null>(
    null,
  );
  const [cardTagModalNode, setCardTagModalNode] = useState<CardTagNode | null>(
    null,
  );
  const [articlePreviewModal, setArticlePreviewModal] =
    useState<IArticle | null>(null);

  const isItemSelected = useCallback(
    (type: PublishContentType, id: number) =>
      selections.get(`${type}-${id}`) ?? false,
    [selections],
  );

  const loadSelections = useCallback(async () => {
    try {
      const data = await getPublishSelections();
      const map = new Map<string, boolean>();
      const projectScope = new Map<number, EntityScope>();
      const documentScope = new Map<number, EntityScope>();
      data.forEach((item) => {
        const key = `${item.contentType}-${item.contentId}`;
        map.set(key, item.selected);
        if (item.contentType === "project") {
          projectScope.set(item.contentId, decodeScope(item.parentPath));
        }
        if (item.contentType === "document") {
          documentScope.set(item.contentId, decodeScope(item.parentPath));
        }
      });
      setSelections(map);
      setProjectScopes(projectScope);
      setDocumentScopes(documentScope);
    } catch (error) {
      console.error("Failed to load selections:", error);
    }
  }, []);

  const loadContent = useCallback(async () => {
    setLoading(true);
    try {
      const [cardsData, articlesData, projectsData, documentsData] =
        await Promise.all([
          getAllCards(),
          getAllArticles(),
          getProjectList(),
          getAllDocuments(),
        ]);
      setCards(cardsData);
      setArticles(articlesData);
      setProjects(
        projectsData.filter((p) => p.projectType === "document-tree"),
      );
      setDocuments(documentsData);
    } catch (error) {
      console.error("Failed to load content:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSelections();
    loadContent();
  }, [loadSelections, loadContent]);

  useEffect(() => {
    const tree = buildCardTagTree(cards);
    setCardTree(tree);
    if (!activeTagId && tree.length > 0) {
      setActiveTagId(tree[0].id);
    }
  }, [cards, activeTagId]);

  useEffect(() => {
    if (!activeArticleId && articles.length > 0) {
      setActiveArticleId(articles[0].id);
    }
  }, [articles, activeArticleId]);

  const handleSelectionChange = useMemoizedFn(
    async (
      type: PublishContentType,
      ids: number[],
      selected: boolean,
      options?: { parentPath?: string },
    ) => {
      const newSelections = new Map(selections);
      ids.forEach((id) => newSelections.set(`${type}-${id}`, selected));
      setSelections(newSelections);
      try {
        await batchUpsertPublishSelections(
          ids.map((id) => ({
            contentType: type,
            contentId: id,
            selected,
            parentPath: options?.parentPath ?? "",
          })),
        );
      } catch (error) {
        console.error("Failed to save selections:", error);
      }
    },
  );

  const toggleCardSelection = useMemoizedFn((card: CardListItem) => {
    const next = !isItemSelected("card", card.id);
    handleSelectionChange("card", [card.id], next);
  });

  const toggleTagSelection = useMemoizedFn((node: CardTagNode) => {
    const cardIds = collectCardsFromTagNode(node).map((item) => item.id);
    if (cardIds.length === 0) return;
    const shouldSelect = cardIds.some((id) => !isItemSelected("card", id));
    handleSelectionChange("card", cardIds, shouldSelect);
  });

  const toggleArticleSelection = useMemoizedFn((article: IArticle) => {
    const next = !isItemSelected("article", article.id);
    handleSelectionChange("article", [article.id], next);
  });

  const selectedCount = useMemo(() => {
    return Array.from(selections.values()).filter(Boolean).length;
  }, [selections]);

  const currentTabContent = useMemo(() => {
    switch (activeTab) {
      case "card":
        return (
          <CardSelectorPanel
            tree={cardTree}
            activeTagId={activeTagId}
            setActiveTagId={setActiveTagId}
            isSelected={isItemSelected}
            onToggleTag={toggleTagSelection}
            onToggleCard={toggleCardSelection}
            onOpenModal={setCardTagModalNode}
          />
        );
      case "article":
        return (
          <ArticleSelectorPanel
            articles={articles}
            activeArticleId={activeArticleId}
            setActiveArticleId={setActiveArticleId}
            isSelected={isItemSelected}
            onToggleArticle={toggleArticleSelection}
            onPreviewArticle={setArticlePreviewModal}
          />
        );
      case "project":
        return (
          <EntitySelectorPanel
            type="project"
            entities={projects}
            isSelected={isItemSelected}
            scopes={projectScopes}
            treeCache={projectTrees}
            onToggleEntity={(id, enabled) =>
              handleEntityToggle("project", id, enabled)
            }
            onOpenModal={(entity) => openEntityModal("project", entity)}
          />
        );
      case "document":
        return (
          <EntitySelectorPanel
            type="document"
            entities={documents}
            isSelected={isItemSelected}
            scopes={documentScopes}
            treeCache={documentTrees}
            onToggleEntity={(id, enabled) =>
              handleEntityToggle("document", id, enabled)
            }
            onOpenModal={(entity) => openEntityModal("document", entity)}
          />
        );
      default:
        return null;
    }
  }, [
    activeTab,
    cardTree,
    activeTagId,
    isItemSelected,
    toggleTagSelection,
    toggleCardSelection,
    articles,
    activeArticleId,
    toggleArticleSelection,
    projects,
    documents,
    projectScopes,
    documentScopes,
    projectTrees,
    documentTrees,
  ]);

  const handleEntityToggle = useMemoizedFn(
    async (type: "project" | "document", id: number, enabled: boolean) => {
      if (!enabled) {
        if (type === "project") {
          setProjectScopes((prev) => {
            const next = new Map(prev);
            next.delete(id);
            return next;
          });
        } else {
          setDocumentScopes((prev) => {
            const next = new Map(prev);
            next.delete(id);
            return next;
          });
        }
        await handleSelectionChange(type, [id], false);
        return;
      }
      const scopes = type === "project" ? projectScopes : documentScopes;
      const scope = scopes.get(id) ?? { mode: "all" };
      await handleSelectionChange(type, [id], true, {
        parentPath: encodeScope(scope),
      });
      if (type === "project") {
        setProjectScopes((prev) => new Map(prev).set(id, scope));
      } else {
        setDocumentScopes((prev) => new Map(prev).set(id, scope));
      }
    },
  );

  const openEntityModal = useMemoizedFn(
    async (type: "project" | "document", entity: Project | IDocument) => {
      setEntityModal({ type, entity });
      setEntityModalLoading(true);
      const treeCache = type === "project" ? projectTrees : documentTrees;
      let nodes = treeCache.get(entity.id);
      if (!nodes) {
        nodes =
          type === "project"
            ? await buildProjectTree(entity as Project)
            : await buildDocumentTree(entity as IDocument);
        if (type === "project") {
          setProjectTrees((prev) => new Map(prev).set(entity.id, nodes!));
        } else {
          setDocumentTrees((prev) => new Map(prev).set(entity.id, nodes!));
        }
      }
      setEntityModalLoading(false);
      setModalActiveNodeId(null);
      const totalIds = new Set(collectDocNodeIds(nodes));
      const scope =
        type === "project"
          ? projectScopes.get(entity.id)
          : documentScopes.get(entity.id);
      const initialIds =
        scope && scope.mode === "partial" ? scope.nodeIds : totalIds;
      setModalSelectedIds(new Set(initialIds));
    },
  );

  const closeEntityModal = useCallback(() => {
    setEntityModal(null);
    setModalSelectedIds(new Set());
    setModalActiveNodeId(null);
  }, []);

  const confirmEntityModal = useMemoizedFn(async () => {
    if (!entityModal) return;
    const { type, entity } = entityModal;
    const trees = (type === "project" ? projectTrees : documentTrees).get(
      entity.id,
    );
    if (!trees) return;
    const totalIds = collectDocNodeIds(trees);
    if (modalSelectedIds.size === 0) {
      await handleSelectionChange(type, [entity.id], false);
      if (type === "project") {
        setProjectScopes((prev) => {
          const next = new Map(prev);
          next.delete(entity.id);
          return next;
        });
      } else {
        setDocumentScopes((prev) => {
          const next = new Map(prev);
          next.delete(entity.id);
          return next;
        });
      }
      closeEntityModal();
      return;
    }
    const isAllSelected = modalSelectedIds.size === totalIds.length;
    const scope: EntityScope = isAllSelected
      ? { mode: "all" }
      : { mode: "partial", nodeIds: new Set(modalSelectedIds) };
    if (type === "project") {
      setProjectScopes((prev) => new Map(prev).set(entity.id, scope));
    } else {
      setDocumentScopes((prev) => new Map(prev).set(entity.id, scope));
    }
    await handleSelectionChange(type, [entity.id], true, {
      parentPath: encodeScope(scope),
    });
    closeEntityModal();
  });

  const currentTree = useMemo(() => {
    if (!entityModal) return [];
    const cache = entityModal.type === "project" ? projectTrees : documentTrees;
    return cache.get(entityModal.entity.id) ?? [];
  }, [entityModal, projectTrees, documentTrees]);

  return (
    <div className="rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-900/60">
      <header className="flex flex-wrap items-center gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">
            发布内容选择
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            通过标签树、列表和树形结构精确挑选需要发布的内容。
          </p>
        </div>
        <div className="ml-auto rounded-full bg-slate-100 px-4 py-1 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
          已选择 {selectedCount} 项
        </div>
      </header>

      <div className="mt-6 flex flex-wrap gap-3">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            className={classNames(
              "rounded-2xl border px-4 py-3 text-left transition-all",
              activeTab === tab.key
                ? "border-blue-500 bg-blue-50 text-blue-600 shadow-sm dark:border-blue-400/70 dark:bg-blue-500/10 dark:text-blue-200"
                : "border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:text-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
            )}
            onClick={() => setActiveTab(tab.key)}
          >
            <div className="text-sm font-semibold">{tab.label}</div>
            <div className="text-xs text-slate-400">{tab.description}</div>
          </button>
        ))}
      </div>

      <div className="mt-6 min-h-[24rem]">
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-200 border-t-blue-500 dark:border-slate-700 dark:border-t-blue-300" />
          </div>
        ) : (
          currentTabContent
        )}
      </div>

      {entityModal && (
        <EntityTreeModal
          open
          loading={entityModalLoading}
          type={entityModal.type}
          entity={entityModal.entity}
          nodes={currentTree}
          selectedIds={modalSelectedIds}
          setSelectedIds={setModalSelectedIds}
          activeNodeId={modalActiveNodeId}
          setActiveNodeId={setModalActiveNodeId}
          onCancel={closeEntityModal}
          onConfirm={confirmEntityModal}
        />
      )}
      {cardTagModalNode && (
        <CardTagModal
          node={cardTagModalNode}
          onClose={() => setCardTagModalNode(null)}
          isSelected={isItemSelected}
          onToggleCard={toggleCardSelection}
        />
      )}
      {articlePreviewModal && (
        <ArticlePreviewModal
          article={articlePreviewModal}
          onClose={() => setArticlePreviewModal(null)}
        />
      )}
    </div>
  );
});

PublishSelector.displayName = "PublishSelector";

const CardSelectorPanel = ({
  tree,
  activeTagId,
  setActiveTagId,
  isSelected,
  onToggleTag,
  onOpenModal,
}: {
  tree: CardTagNode[];
  activeTagId: string;
  setActiveTagId: (id: string) => void;
  isSelected: (type: PublishContentType, id: number) => boolean;
  onToggleTag: (node: CardTagNode) => void;
  onToggleCard: (card: CardListItem) => void;
  onOpenModal: (node: CardTagNode) => void;
}) => {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 dark:border-slate-700 dark:bg-slate-900/50">
      <div className="text-xs font-semibold text-slate-400">标签树</div>
      <div className="mt-3 max-h-[28rem] space-y-1 overflow-y-auto pr-2 text-sm">
        {tree.map((node) => (
          <TagNodeItem
            key={node.id}
            node={node}
            activeTagId={activeTagId}
            onSelect={(id) => setActiveTagId(id)}
            onToggleTag={onToggleTag}
            isSelected={isSelected}
            onOpenModal={onOpenModal}
          />
        ))}
      </div>
      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400">
        点击“管理”按钮在弹窗中查看并选择该标签下的所有卡片。
      </div>
    </div>
  );
};
const TagNodeItem = ({
  node,
  activeTagId,
  onSelect,
  onToggleTag,
  isSelected,
  onOpenModal,
}: {
  node: CardTagNode;
  activeTagId: string;
  onSelect: (id: string) => void;
  onToggleTag: (node: CardTagNode) => void;
  isSelected: (type: PublishContentType, id: number) => boolean;
  onOpenModal: (node: CardTagNode) => void;
}) => {
  const cards = collectCardsFromTagNode(node);
  const allSelected =
    cards.length > 0 && cards.every((item) => isSelected("card", item.id));
  const partiallySelected =
    !allSelected && cards.some((item) => isSelected("card", item.id));
  return (
    <div className="space-y-1">
      <div
        className={classNames(
          "flex items-center justify-between rounded-xl px-3 py-1",
          activeTagId === node.id
            ? "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-200"
            : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800/60",
        )}
        style={{ paddingLeft: node.depth * 16 + 8 }}
      >
        <button
          className="flex-1 text-left text-sm"
          onClick={() => onSelect(node.id)}
        >
          {node.label}
          <span className="ml-2 text-xs text-slate-400">({node.count})</span>
        </button>
        <div className="flex items-center gap-2">
          <button
            className={classNames(
              "rounded-full border px-2 py-0.5 text-[10px] font-medium",
              allSelected
                ? "border-blue-300 text-blue-500"
                : partiallySelected
                  ? "border-amber-300 text-amber-500"
                  : "border-slate-200 text-slate-400",
            )}
            onClick={() => onToggleTag(node)}
          >
            {allSelected ? "已选" : partiallySelected ? "部分" : "选择"}
          </button>
          <button
            className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-500 hover:border-blue-300 hover:text-blue-500 dark:border-slate-600 dark:text-slate-300"
            onClick={() => onOpenModal(node)}
          >
            管理
          </button>
        </div>
      </div>
      {node.children.length > 0 && (
        <div className="space-y-1">
          {node.children.map((child) => (
            <TagNodeItem
              key={child.id}
              node={child}
              activeTagId={activeTagId}
              onSelect={onSelect}
              onToggleTag={onToggleTag}
              isSelected={isSelected}
              onOpenModal={onOpenModal}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const ArticleSelectorPanel = ({
  articles,
  activeArticleId,
  setActiveArticleId,
  isSelected,
  onToggleArticle,
  onPreviewArticle,
}: {
  articles: IArticle[];
  activeArticleId: number | null;
  setActiveArticleId: (id: number) => void;
  isSelected: (type: PublishContentType, id: number) => boolean;
  onToggleArticle: (article: IArticle) => void;
  onPreviewArticle: (article: IArticle) => void;
}) => {
  const articleItems = useMemo(
    () =>
      articles.map((article) => ({
        id: article.id,
        title: article.title || `文章 #${article.id}`,
        description:
          buildPlainText(article.content).slice(0, 180) || "暂无内容",
        raw: article,
      })),
    [articles],
  );

  const previewArticle = useMemo(() => {
    if (!activeArticleId) return articleItems[0];
    return articleItems.find((item) => item.id === activeArticleId);
  }, [articleItems, activeArticleId]);

  return (
    <div className="grid gap-6 lg:grid-cols-[320px,1fr]">
      <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 dark:border-slate-700 dark:bg-slate-900/50">
        <div className="text-xs font-semibold text-slate-400">文章列表</div>
        <div className="mt-3 max-h-[26rem] space-y-2 overflow-y-auto pr-2 text-sm">
          {articleItems.map((item) => {
            const selected = isSelected("article", item.id);
            return (
              <div
                key={item.id}
                className={classNames(
                  "rounded-xl border p-3",
                  activeArticleId === item.id
                    ? "border-blue-400 bg-blue-50/70 dark:border-blue-400/70 dark:bg-blue-500/10"
                    : "border-slate-200 bg-white hover:border-blue-200 dark:border-slate-700 dark:bg-slate-800",
                )}
              >
                <button
                  className="text-left"
                  onClick={() => setActiveArticleId(item.id)}
                >
                  <div className="font-semibold text-slate-900 dark:text-white">
                    {item.title}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {item.description}
                  </p>
                </button>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    className="rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold text-slate-600 hover:border-blue-300 hover:text-blue-500 dark:border-slate-600 dark:text-slate-300"
                    onClick={() => onToggleArticle(item.raw)}
                  >
                    {selected ? "已选择" : "选择"}
                  </button>
                  <button
                    className="rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold text-slate-500 hover:border-blue-300 hover:text-blue-500 dark:border-slate-600 dark:text-slate-300"
                    onClick={() => onPreviewArticle(item.raw)}
                  >
                    预览
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white/70 p-5 text-sm leading-relaxed text-slate-600 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300">
        <div className="text-xs font-semibold text-slate-400">正文预览</div>
        {previewArticle ? (
          <div className="mt-4 space-y-3">
            <h4 className="text-base font-semibold text-slate-900 dark:text-white">
              {previewArticle.title}
            </h4>
            <p>{buildPlainText(previewArticle.raw.content) || "暂无内容"}</p>
          </div>
        ) : (
          <EmptyPlaceholder text="请选择左侧文章查看预览" />
        )}
      </div>
    </div>
  );
};

const EntitySelectorPanel = ({
  type,
  entities,
  isSelected,
  scopes,
  treeCache,
  onToggleEntity,
  onOpenModal,
}: {
  type: "project" | "document";
  entities: (Project | IDocument)[];
  isSelected: (contentType: PublishContentType, id: number) => boolean;
  scopes: Map<number, EntityScope>;
  treeCache: Map<number, DocTreeNode[]>;
  onToggleEntity: (id: number, enabled: boolean) => Promise<void> | void;
  onOpenModal: (entity: Project | IDocument) => void;
}) => {
  return (
    <div className="space-y-4">
      {entities.length === 0 && (
        <EmptyPlaceholder
          text={`暂无${type === "project" ? "项目" : "知识库"}`}
        />
      )}
      {entities.map((entity) => {
        const selected = isSelected(type, entity.id);
        const scope = scopes.get(entity.id) ?? { mode: "all" };
        const trees = treeCache.get(entity.id);
        const totalCount = trees ? collectDocNodeIds(trees).length : undefined;
        const partialCount =
          scope.mode === "partial" ? scope.nodeIds.size : totalCount;
        return (
          <div
            key={entity.id}
            className={classNames(
              "flex flex-col gap-3 rounded-2xl border p-4 md:flex-row md:items-center",
              selected
                ? "border-blue-400 bg-blue-50/70 dark:border-blue-400/60 dark:bg-blue-500/10"
                : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900/40",
            )}
          >
            <div className="flex-1">
              <div className="text-sm font-semibold text-slate-900 dark:text-white">
                {entity.title ||
                  `${type === "project" ? "项目" : "知识库"} #${entity.id}`}
              </div>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {selected
                  ? scope.mode === "all"
                    ? "将发布全部文档"
                    : `将发布 ${scope.nodeIds.size} 篇文档`
                  : "未选择该实体"}
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <button
                className="rounded-full border border-slate-200 px-3 py-1 font-semibold text-slate-500 hover:border-blue-300 hover:text-blue-500 dark:border-slate-600 dark:text-s late-300"
                onClick={() => onToggleEntity(entity.id, !selected)}
              >
                {selected ? "取消选择" : "选择"}
              </button>
              <button
                className="rounded-full border border-blue-300 px-3 py-1 font-semibold text-blue-500 hover:bg-blue-50 dark:border-blue-400/70 dark:text-blue-200"
                onClick={() => onOpenModal(entity)}
              >
                {trees ? "管理文档" : "加载文档"}
              </button>
              {totalCount !== undefined && (
                <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-500 dark:bg-slate-700/70 dark:text-slate-200">
                  共 {totalCount} 篇
                </span>
              )}
              {scope.mode === "partial" && (
                <span className="rounded-full bg-blue-100 px-3 py-1 text-blue-600 dark:bg-blue-500/20 dark:text-blue-200">
                  部分发布 {partialCount ?? scope.nodeIds.size} 篇
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const EntityTreeModal = ({
  open,
  loading,
  type,
  entity,
  nodes,
  selectedIds,
  setSelectedIds,
  activeNodeId,
  setActiveNodeId,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  loading: boolean;
  type: "project" | "document";
  entity: Project | IDocument;
  nodes: DocTreeNode[];
  selectedIds: Set<number>;
  setSelectedIds: (value: Set<number>) => void;
  activeNodeId: number | null;
  setActiveNodeId: (id: number | null) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) => {
  if (!open) return null;
  const totalCount = collectDocNodeIds(nodes).length;
  const previewNode = activeNodeId
    ? findDocTreeNode(nodes, activeNodeId)
    : undefined;
  return (
    <CustomModal
      open={open}
      onCancel={onCancel}
      width="80vw"
      bodyClassName="!p-0"
      contentClassName="flex h-[80vh] flex-col"
      title={
        entity.title ||
        `${type === "project" ? "项目" : "知识库"} #${entity.id}`
      }
      subtitle={`已选择 ${selectedIds.size} / ${totalCount} 篇内容`}
      footer={
        <div className="flex w-full items-center justify-between gap-3 text-sm">
          <span className="text-slate-500 dark:text-slate-400">
            共 {totalCount} 篇，可通过勾选决定发布范围
          </span>
          <div className="flex gap-2">
            <button
              className="rounded-full border border-slate-200 px-4 py-1 font-semibold text-slate-600 hover:border-slate-400 dark:border-slate-600 dark:text-slate-300"
              onClick={onCancel}
            >
              取消
            </button>
            <button
              className="rounded-full border border-blue-400 bg-blue-500/90 px-4 py-1 font-semibold text-white shadow disabled:opacity-60"
              onClick={onConfirm}
              disabled={loading}
            >
              保存
            </button>
          </div>
        </div>
      }
    >
      <div className="flex flex-1 gap-4 overflow-hidden p-4">
        <div className="w-2/3 rounded-2xl border border-slate-200 bg-white/80 p-4 dark:border-slate-700 dark:bg-slate-900/50">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-200 border-t-blue-500 dark:border-slate-700 dark:border-t-blue-300" />
            </div>
          ) : nodes.length === 0 ? (
            <EmptyPlaceholder text="暂无可发布的文档" />
          ) : (
            <div className="max-h-full overflow-y-auto pr-4">
              {nodes.map((node) => (
                <DocTreeNodeItem
                  key={node.id}
                  node={node}
                  selectedIds={selectedIds}
                  onToggle={(target) => {
                    const ids = collectDocNodeIds([target]);
                    const next = new Set(selectedIds);
                    const shouldSelect = ids.some((id) => !next.has(id));
                    ids.forEach((id) => {
                      if (shouldSelect) {
                        next.add(id);
                      } else {
                        next.delete(id);
                      }
                    });
                    setSelectedIds(next);
                  }}
                  onHover={(target) => setActiveNodeId(target.id)}
                />
              ))}
            </div>
          )}
        </div>
        <div className="w-1/3 rounded-2xl border border-slate-200 bg-white/80 p-4 dark:border-slate-700 dark:bg-slate-900/50">
          <div className="text-xs font-semibold text-slate-400">节点预览</div>
          {previewNode ? (
            <div className="mt-3 space-y-3 text-sm text-slate-600 dark:text-slate-300">
              <h5 className="text-base font-semibold text-slate-900 dark:text-white">
                {previewNode.title}
              </h5>
              <div className="rounded-2xl border border-slate-200 bg-white/70 p-3 dark:border-slate-700 dark:bg-slate-900/40">
                <Editor
                  initValue={previewNode.content}
                  readonly
                  disableStartExtensions
                  className="text-sm"
                  style={{ minHeight: 220 }}
                />
              </div>
            </div>
          ) : (
            <EmptyPlaceholder text="悬停节点查看预览" />
          )}
        </div>
      </div>
    </CustomModal>
  );
};

const DocTreeNodeItem = ({
  node,
  selectedIds,
  onToggle,
  onHover,
  depth = 0,
}: {
  node: DocTreeNode;
  selectedIds: Set<number>;
  onToggle: (node: DocTreeNode) => void;
  onHover: (node: DocTreeNode) => void;
  depth?: number;
}) => {
  const descendantIds = collectDocNodeIds([node]);
  const allSelected =
    descendantIds.length > 0 &&
    descendantIds.every((id) => selectedIds.has(id));
  const partiallySelected =
    !allSelected && descendantIds.some((id) => selectedIds.has(id));

  return (
    <div className="space-y-1" style={{ paddingLeft: depth * 16 }}>
      <div className="flex items-center gap-2 rounded-xl px-2 py-1 hover:bg-slate-50 dark:hover:bg-slate-800/50">
        <button
          className="flex-1 text-left text-sm text-slate-700 dark:text-slate-200"
          onMouseEnter={() => onHover(node)}
          onClick={() => onToggle(node)}
        >
          {node.title}
        </button>
        <span
          className={classNames(
            "rounded-full px-2 py-0.5 text-[10px] font-medium",
            allSelected
              ? "bg-blue-100 text-blue-600"
              : partiallySelected
                ? "bg-amber-100 text-amber-600"
                : "bg-slate-100 text-slate-400",
          )}
        >
          {allSelected ? "已选" : partiallySelected ? "部分" : "未选"}
        </span>
      </div>
      {node.children.map((child) => (
        <DocTreeNodeItem
          key={child.id}
          node={child}
          selectedIds={selectedIds}
          onToggle={onToggle}
          onHover={onHover}
          depth={depth + 1}
        />
      ))}
    </div>
  );
};

const CardTagModal = ({
  node,
  onClose,
  isSelected,
  onToggleCard,
}: {
  node: CardTagNode | null;
  onClose: () => void;
  isSelected: (type: PublishContentType, id: number) => boolean;
  onToggleCard: (card: CardListItem) => void;
}) => {
  if (!node) return null;
  const cards = collectCardsFromTagNode(node);
  return (
    <CustomModal
      open={Boolean(node)}
      onCancel={onClose}
      width="720px"
      title={`标签：${node.label}`}
      subtitle={`共 ${cards.length} 条卡片，可批量调整发布选择`}
      footer={
        <div className="flex justify-end">
          <button
            className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:border-slate-400 dark:border-slate-600 dark:text-slate-300"
            onClick={onClose}
          >
            关闭
          </button>
        </div>
      }
    >
      <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-2">
        {cards.map((card) => {
          const selected = isSelected("card", card.id);
          return (
            <article
              key={card.id}
              className={classNames(
                "rounded-2xl border p-4 text-sm",
                selected
                  ? "border-blue-400 bg-blue-50/60 dark:border-blue-400/60 dark:bg-blue-500/10"
                  : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h5 className="font-semibold text-slate-900 dark:text-white">
                    {card.title}
                  </h5>
                </div>
                <button
                  className="rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold text-slate-600 hover:border-blue-300 hover:text-blue-500 dark:border-slate-600 dark:text-slate-300"
                  onClick={() => onToggleCard(card)}
                >
                  {selected ? "已选择" : "选择"}
                </button>
              </div>
              <div className="mt-3 rounded-2xl border border-slate-200 bg-white/70 p-3 dark:border-slate-700 dark:bg-slate-900/40">
                <Editor
                  initValue={card.raw.content}
                  readonly
                  disableStartExtensions
                  className="text-sm text-slate-600 dark:text-slate-300"
                  style={{ minHeight: 160 }}
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-slate-400">
                <span>{CARD_CATEGORY_LABEL[card.category]}</span>
                <span>更新 {formatDate(card.updateTime)}</span>
                {card.tags.slice(0, 4).map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-slate-100 px-2 py-0.5 dark:bg-slate-700/70"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </CustomModal>
  );
};

const ArticlePreviewModal = ({
  article,
  onClose,
}: {
  article: IArticle | null;
  onClose: () => void;
}) => {
  if (!article) return null;
  return (
    <CustomModal
      open={Boolean(article)}
      onCancel={onClose}
      width="760px"
      title={article.title || `文章 #${article.id}`}
      subtitle={`更新于 ${formatDate(article.update_time)}`}
      footer={
        <div className="flex justify-end">
          <button
            className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:border-slate-400 dark:border-slate-600 dark:text-slate-300"
            onClick={onClose}
          >
            关闭
          </button>
        </div>
      }
    >
      <div className="max-h-[60vh] overflow-y-auto pr-2">
        <Editor
          initValue={article.content}
          readonly
          disableStartExtensions
          className="rounded-2xl border border-slate-200 bg-white/70 p-3 text-sm leading-relaxed text-slate-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-200"
          style={{ minHeight: 260 }}
        />
      </div>
    </CustomModal>
  );
};

const EmptyPlaceholder = ({ text }: { text: string }) => (
  <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/40 p-6 text-sm text-slate-400 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-500">
    {text}
  </div>
);

function buildPlainText(nodes: Descendant[] | undefined): string {
  if (!nodes) return "";
  const parts: string[] = [];
  const traverse = (value: any) => {
    if (!value) return;
    if (typeof value === "string") {
      parts.push(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(traverse);
      return;
    }
    if (typeof value === "object") {
      if (typeof value.text === "string") parts.push(value.text);
      if (typeof value.code === "string") parts.push(value.code);
      if (Array.isArray(value.children)) value.children.forEach(traverse);
    }
  };
  traverse(nodes);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function formatDate(timestamp?: number) {
  if (!timestamp) return "";
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(timestamp));
  } catch {
    return "";
  }
}

function buildCardTagTree(cards: ICard[]): CardTagNode[] {
  const root = new Map<string, CardTagNodeBuilder>();
  const untagged: CardListItem[] = [];
  cards.forEach((card) => {
    const item: CardListItem = {
      id: card.id,
      title: card.tags[0] || `卡片 #${card.id}`,
      summary: buildPlainText(card.content) || "暂无内容",
      tags: card.tags || [],
      category: card.category,
      updateTime: card.update_time,
      raw: card,
    };
    if (!card.tags || card.tags.length === 0) {
      untagged.push(item);
      return;
    }
    card.tags.forEach((tagPath) => {
      const segments = tagPath
        .split("/")
        .map((segment) => segment.trim())
        .filter(Boolean);
      if (segments.length === 0) {
        untagged.push(item);
        return;
      }
      insertTagNode(root, segments, item);
    });
  });
  const tree = Array.from(root.values()).map((node) =>
    normalizeTagNode(node, []),
  );
  if (untagged.length > 0) {
    tree.unshift({
      id: "__untagged__",
      label: "未分类",
      depth: 0,
      count: untagged.length,
      cards: untagged,
      children: [],
    });
  }
  return tree;
}

interface CardTagNodeBuilder {
  label: string;
  count: number;
  cards: CardListItem[];
  children: Map<string, CardTagNodeBuilder>;
}

function insertTagNode(
  container: Map<string, CardTagNodeBuilder>,
  segments: string[],
  card: CardListItem,
) {
  const [current, ...rest] = segments;
  let node = container.get(current);
  if (!node) {
    node = { label: current, count: 0, cards: [], children: new Map() };
    container.set(current, node);
  }
  node.count += 1;
  if (rest.length === 0) {
    node.cards.push(card);
  } else {
    insertTagNode(node.children, rest, card);
  }
}

function normalizeTagNode(
  node: CardTagNodeBuilder,
  ancestors: string[],
): CardTagNode {
  const id = [...ancestors, node.label].join(" /");
  return {
    id,
    label: node.label,
    depth: ancestors.length,
    count: node.count,
    cards: node.cards,
    children: Array.from(node.children.values()).map((child) =>
      normalizeTagNode(child, [...ancestors, node.label]),
    ),
  };
}

function collectCardsFromTagNode(node: CardTagNode): CardListItem[] {
  const cards = [...node.cards];
  node.children.forEach((child) =>
    cards.push(...collectCardsFromTagNode(child)),
  );
  return cards;
}

async function buildProjectTree(project: Project): Promise<DocTreeNode[]> {
  const rootIds = Array.isArray(project.children) ? project.children : [];
  if (rootIds.length === 0) return [];
  const map = await loadProjectItemsMap(rootIds);
  return rootIds
    .map((id) => createProjectTreeNode(map, id))
    .filter((node): node is DocTreeNode => Boolean(node));
}

async function loadProjectItemsMap(
  rootIds: number[],
): Promise<Map<number, ProjectItem>> {
  const queue = [...new Set(rootIds)];
  const map = new Map<number, ProjectItem>();
  const visited = new Set<number>();
  while (queue.length > 0) {
    const batch = queue.splice(0, 20);
    const items = await getProjectItemsByIds(batch);
    items.forEach((item) => {
      if (visited.has(item.id)) return;
      visited.add(item.id);
      map.set(item.id, item);
      if (item.children && item.children.length > 0) {
        queue.push(...item.children);
      }
    });
  }
  return map;
}

function createProjectTreeNode(
  map: Map<number, ProjectItem>,
  itemId: number,
): DocTreeNode | null {
  const item = map.get(itemId);
  if (!item) return null;
  const children = (item.children || [])
    .map((childId) => createProjectTreeNode(map, childId))
    .filter((node): node is DocTreeNode => Boolean(node));
  const hasContent =
    item.projectItemType === EProjectItemType.Document &&
    hasMeaningfulContent(item.content || []);
  return {
    id: item.id,
    title: item.title || `条目 #${item.id}`,
    hasContent,
    content: item.content || [],
    children,
  };
}

async function buildDocumentTree(document: IDocument): Promise<DocTreeNode[]> {
  const rootIds = Array.isArray(document.children) ? document.children : [];
  if (rootIds.length === 0) return [];
  const map = await loadDocumentItemsMap(rootIds);
  return rootIds
    .map((id) => createDocumentTreeNode(map, id))
    .filter((node): node is DocTreeNode => Boolean(node));
}

async function loadDocumentItemsMap(
  rootIds: number[],
): Promise<Map<number, IDocumentItem>> {
  const queue = [...new Set(rootIds)];
  const map = new Map<number, IDocumentItem>();
  const visited = new Set<number>();
  while (queue.length > 0) {
    const batch = queue.splice(0, 20);
    const items = await getDocumentItemsByIds(batch);
    items.forEach((item) => {
      if (visited.has(item.id)) return;
      visited.add(item.id);
      map.set(item.id, item);
      if (item.children && item.children.length > 0) {
        queue.push(...item.children);
      }
    });
  }
  return map;
}

function createDocumentTreeNode(
  map: Map<number, IDocumentItem>,
  itemId: number,
): DocTreeNode | null {
  const item = map.get(itemId);
  if (!item) return null;
  const children = (item.children || [])
    .map((childId) => createDocumentTreeNode(map, childId))
    .filter((node): node is DocTreeNode => Boolean(node));
  const hasContent = hasMeaningfulContent(item.content || []);
  return {
    id: item.id,
    title: item.title || `文档 ${item.id}`,
    hasContent,
    content: item.content || [],
    children,
  };
}

function hasMeaningfulContent(content: Descendant[]): boolean {
  if (!Array.isArray(content) || content.length === 0) {
    return false;
  }
  const text = buildPlainText(content);
  return text.trim().length > 0;
}

function collectDocNodeIds(nodes: DocTreeNode[]): number[] {
  const result: number[] = [];
  const traverse = (node: DocTreeNode) => {
    if (node.hasContent) {
      result.push(node.id);
    }
    node.children.forEach(traverse);
  };
  nodes.forEach(traverse);
  return result;
}

function findDocTreeNode(
  nodes: DocTreeNode[],
  id: number,
): DocTreeNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    const child = findDocTreeNode(node.children, id);
    if (child) return child;
  }
  return undefined;
}

function encodeScope(scope: EntityScope): string {
  if (scope.mode === "partial") {
    return JSON.stringify({
      mode: "partial",
      nodes: Array.from(scope.nodeIds),
    });
  }
  return "";
}

function decodeScope(raw: string): EntityScope {
  if (!raw) {
    return { mode: "all" };
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed && parsed.mode === "partial" && Array.isArray(parsed.nodes)) {
      const nodeIds = new Set(
        parsed.nodes.filter(
          (value: unknown) => typeof value === "number",
        ) as number[],
      );
      if (nodeIds.size > 0) {
        return { mode: "partial", nodeIds };
      }
    }
  } catch (error) {
    return { mode: "all" };
  }
  return { mode: "all" };
}

export default PublishSelector;
