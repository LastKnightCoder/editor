import { memo, useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Spinner } from "@tau/ui";
import { PublishContentType } from "@/types/publish";
import { Project } from "@/types/project";
import { CardTagNode, DocTreeNode } from "./types";
import { TABS } from "./constants";
import { buildCardTagTree, collectCardsFromTagNode, buildProjectTree } from "./utils";
import { usePublishSelections, useContentLoader } from "./hooks";
import { TypeRail, CardSelector, ArticleSelector, EntitySelector } from "./components";

interface PublishSelectorProps {
  /** 任意选择变更（勾选 / 批量 / 作用域）完成后回调，便于上层重算发布计划 */
  onSelectionsChange?: () => void;
}

const PublishSelector = memo<PublishSelectorProps>(({ onSelectionsChange }) => {
  const [activeTab, setActiveTab] = useState<PublishContentType>("card");

  // 加载选择状态
  const {
    isItemSelected,
    batchToggle: rawBatchToggle,
    loadSelections,
    handleEntityToggle: rawHandleEntityToggle,
    updateEntityScope: rawUpdateEntityScope,
    getTotalSelectedCount,
    getTypeSelectedCount,
    projectScopes,
  } = usePublishSelections();

  // 选择变更后通知上层（用 ref 保持回调稳定，避免下游 memo 失效）
  const onChangeRef = useRef(onSelectionsChange);
  useEffect(() => {
    onChangeRef.current = onSelectionsChange;
  }, [onSelectionsChange]);

  const batchToggle = useCallback<typeof rawBatchToggle>(
    async (...args) => {
      await rawBatchToggle(...args);
      onChangeRef.current?.();
    },
    [rawBatchToggle]
  );

  const handleEntityToggle = useCallback<typeof rawHandleEntityToggle>(
    async (...args) => {
      await rawHandleEntityToggle(...args);
      onChangeRef.current?.();
    },
    [rawHandleEntityToggle]
  );

  const updateEntityScope = useCallback<typeof rawUpdateEntityScope>(
    async (...args) => {
      await rawUpdateEntityScope(...args);
      onChangeRef.current?.();
    },
    [rawUpdateEntityScope]
  );

  // 加载内容
  const { cards, articles, projects, isLoading, loadContent } = useContentLoader();

  // 项目树缓存
  const [projectTrees, setProjectTrees] = useState<Map<number, DocTreeNode[]>>(new Map());

  // 初始化加载
  useEffect(() => {
    loadSelections();
    loadContent();
  }, [loadSelections, loadContent]);

  // 各类型内容总数
  const getTypeTotalCount = useCallback(
    (type: PublishContentType) => {
      switch (type) {
        case "card":
          return cards.length;
        case "article":
          return articles.length;
        case "project":
          return projects.length;
        default:
          return 0;
      }
    },
    [cards, articles, projects]
  );

  // 构建卡片标签树
  const cardTree = useMemo(() => buildCardTagTree(cards), [cards]);

  // 切换卡片选择
  const handleToggleCard = useCallback(
    (cardId: number) => {
      const current = isItemSelected("card", cardId);
      batchToggle("card", [cardId], !current);
    },
    [isItemSelected, batchToggle]
  );

  // 批量切换卡片（按标签）
  const handleToggleTagCards = useCallback(
    (node: CardTagNode, selected: boolean) => {
      const cards = collectCardsFromTagNode(node);
      const ids = cards.map(c => c.id);
      batchToggle("card", ids, selected);
    },
    [batchToggle]
  );

  // 切换文章选择
  const handleToggleArticle = useCallback(
    (articleId: number) => {
      const current = isItemSelected("article", articleId);
      batchToggle("article", [articleId], !current);
    },
    [isItemSelected, batchToggle]
  );

  // 批量切换文章
  const handleBatchToggleArticles = useCallback(
    (ids: number[], selected: boolean) => {
      batchToggle("article", ids, selected);
    },
    [batchToggle]
  );

  // 加载项目树
  const handleLoadProjectTree = useCallback(async (entity: Project): Promise<DocTreeNode[]> => {
    const project = entity as Project;
    const nodes = await buildProjectTree(project);
    setProjectTrees(prev => new Map(prev).set(project.id, nodes));
    return nodes;
  }, []);

  // 渲染当前 Tab 内容
  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex h-full items-center justify-center">
          <Spinner className="size-7" />
        </div>
      );
    }

    switch (activeTab) {
      case "card":
        return (
          <CardSelector
            tree={cardTree}
            isItemSelected={isItemSelected}
            onToggleCard={handleToggleCard}
            onToggleTagCards={handleToggleTagCards}
          />
        );
      case "article":
        return (
          <ArticleSelector
            articles={articles}
            isItemSelected={isItemSelected}
            onToggleArticle={handleToggleArticle}
            onBatchToggle={handleBatchToggleArticles}
          />
        );
      case "project":
        return (
          <EntitySelector
            type="project"
            entities={projects}
            isItemSelected={isItemSelected}
            scopes={projectScopes}
            treeCache={projectTrees}
            onToggleEntity={handleEntityToggle}
            onUpdateScope={updateEntityScope}
            onLoadTree={handleLoadProjectTree}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex h-full min-h-0">
      <TypeRail
        tabs={TABS}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        totalSelected={getTotalSelectedCount()}
        getSelectedCount={getTypeSelectedCount}
        getTotalCount={getTypeTotalCount}
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{renderContent()}</div>
    </div>
  );
});

PublishSelector.displayName = "PublishSelector";

export default PublishSelector;
