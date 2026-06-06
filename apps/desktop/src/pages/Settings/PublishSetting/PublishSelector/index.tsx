import { memo, useEffect, useMemo, useState, useCallback } from "react";
import classNames from "classnames";
import useThemeColors from "@/hooks/useThemeColors";
import { PublishContentType } from "@/types/publish";
import { Project } from "@/types/project";
import { IDocument } from "@/types/document";
import { CardTagNode, DocTreeNode, EntityScope } from "./types";
import { TABS } from "./constants";
import {
  buildCardTagTree,
  collectCardsFromTagNode,
  buildProjectTree,
  buildDocumentTree,
} from "./utils";
import { usePublishSelections, useContentLoader } from "./hooks";
import {
  Header,
  TabBar,
  CardSelector,
  ArticleSelector,
  EntitySelector,
  QuestSelector,
} from "./components";

const PublishSelector = memo(() => {
  const themeColors = useThemeColors();
  const [activeTab, setActiveTab] = useState<PublishContentType>("card");

  // 加载选择状态
  const {
    isItemSelected,
    batchToggle,
    loadSelections,
    handleEntityToggle,
    updateEntityScope,
    getTotalSelectedCount,
    getTypeSelectedCount,
    projectScopes,
    documentScopes,
    questScopes,
  } = usePublishSelections();

  // 加载内容
  const {
    cards,
    articles,
    projects,
    documents,
    questionGroups,
    questions,
    isLoading,
    loadContent,
  } = useContentLoader();

  // 项目/知识库树缓存
  const [projectTrees, setProjectTrees] = useState<Map<number, DocTreeNode[]>>(
    new Map(),
  );
  const [documentTrees, setDocumentTrees] = useState<
    Map<number, DocTreeNode[]>
  >(new Map());

  // 初始化加载
  useEffect(() => {
    loadSelections();
    loadContent();
  }, [loadSelections, loadContent]);

  // 构建卡片标签树
  const cardTree = useMemo(() => buildCardTagTree(cards), [cards]);

  // 切换卡片选择
  const handleToggleCard = useCallback(
    (cardId: number) => {
      const current = isItemSelected("card", cardId);
      batchToggle("card", [cardId], !current);
    },
    [isItemSelected, batchToggle],
  );

  // 批量切换卡片（按标签）
  const handleToggleTagCards = useCallback(
    (node: CardTagNode, selected: boolean) => {
      const cards = collectCardsFromTagNode(node);
      const ids = cards.map((c) => c.id);
      batchToggle("card", ids, selected);
    },
    [batchToggle],
  );

  // 切换文章选择
  const handleToggleArticle = useCallback(
    (articleId: number) => {
      const current = isItemSelected("article", articleId);
      batchToggle("article", [articleId], !current);
    },
    [isItemSelected, batchToggle],
  );

  // 批量切换文章
  const handleBatchToggleArticles = useCallback(
    (ids: number[], selected: boolean) => {
      batchToggle("article", ids, selected);
    },
    [batchToggle],
  );

  // 加载项目树
  const handleLoadProjectTree = useCallback(
    async (entity: Project | IDocument): Promise<DocTreeNode[]> => {
      const project = entity as Project;
      const nodes = await buildProjectTree(project);
      setProjectTrees((prev) => new Map(prev).set(project.id, nodes));
      return nodes;
    },
    [],
  );

  // 加载知识库树
  const handleLoadDocumentTree = useCallback(
    async (entity: Project | IDocument): Promise<DocTreeNode[]> => {
      const document = entity as IDocument;
      const nodes = await buildDocumentTree(document);
      setDocumentTrees((prev) => new Map(prev).set(document.id, nodes));
      return nodes;
    },
    [],
  );

  // 更新项目作用域
  const handleUpdateProjectScope = useCallback(
    async (entityId: number, scope: EntityScope) => {
      await updateEntityScope("project", entityId, scope);
    },
    [updateEntityScope],
  );

  // 更新知识库作用域
  const handleUpdateDocumentScope = useCallback(
    async (entityId: number, scope: EntityScope) => {
      await updateEntityScope("document", entityId, scope);
    },
    [updateEntityScope],
  );

  // 更新问题管理分组作用域
  const handleUpdateQuestScope = useCallback(
    async (groupId: number, scope: EntityScope) => {
      if (scope.mode === "partial" && scope.nodeIds.size === 0) {
        await handleEntityToggle("quest", groupId, false);
        return;
      }
      await updateEntityScope("quest", groupId, scope);
    },
    [handleEntityToggle, updateEntityScope],
  );

  // 渲染当前 Tab 内容
  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex h-64 items-center justify-center">
          <div
            className={classNames(
              "h-10 w-10 animate-spin rounded-full border-2",
              themeColors.cardBorderClass,
              "border-t-current",
              themeColors.activeTextClass,
            )}
          />
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
      case "quest":
        return (
          <QuestSelector
            groups={questionGroups}
            questions={questions}
            isItemSelected={isItemSelected}
            scopes={questScopes}
            onToggleGroup={(id, enabled) =>
              handleEntityToggle("quest", id, enabled)
            }
            onUpdateScope={handleUpdateQuestScope}
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
            onToggleEntity={(id, enabled) =>
              handleEntityToggle("project", id, enabled)
            }
            onUpdateScope={handleUpdateProjectScope}
            onLoadTree={handleLoadProjectTree}
          />
        );
      case "document":
        return (
          <EntitySelector
            type="document"
            entities={documents}
            isItemSelected={isItemSelected}
            scopes={documentScopes}
            treeCache={documentTrees}
            onToggleEntity={(id, enabled) =>
              handleEntityToggle("document", id, enabled)
            }
            onUpdateScope={handleUpdateDocumentScope}
            onLoadTree={handleLoadDocumentTree}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div
      className={classNames(
        "rounded-xl border p-6",
        themeColors.cardBgClass,
        themeColors.cardBorderClass,
      )}
    >
      <Header totalSelected={getTotalSelectedCount()} />

      <TabBar
        tabs={TABS}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        getSelectedCount={getTypeSelectedCount}
      />

      <div className="min-h-[24rem]">{renderContent()}</div>
    </div>
  );
});

PublishSelector.displayName = "PublishSelector";

export default PublishSelector;
