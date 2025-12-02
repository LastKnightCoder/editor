import { memo, useState, useEffect, useCallback } from "react";
import { Tabs, Checkbox, Empty, Spin } from "antd";
import { useMemoizedFn } from "ahooks";

import {
  getPublishSelections,
  batchUpsertPublishSelections,
  getAllCards,
  getAllArticles,
  getProjectList,
  getAllDocuments,
} from "@/commands";
import { ICard } from "@/types/card";
import { IArticle } from "@/types/article";
import { Project } from "@/types/project";
import { IDocument } from "@/types/document";
import { PublishContentType } from "@/types/publish";

const PublishSelector = memo(() => {
  const [activeTab, setActiveTab] = useState<PublishContentType>("card");
  const [loading, setLoading] = useState(false);
  const [selections, setSelections] = useState<Map<string, boolean>>(new Map());

  // 内容数据
  const [cards, setCards] = useState<ICard[]>([]);
  const [articles, setArticles] = useState<IArticle[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [documents, setDocuments] = useState<IDocument[]>([]);

  // 加载已选择的内容
  const loadSelections = useCallback(async () => {
    try {
      const data = await getPublishSelections();
      const map = new Map<string, boolean>();
      data.forEach((item) => {
        map.set(`${item.contentType}-${item.contentId}`, item.selected);
      });
      setSelections(map);
    } catch (error) {
      console.error("Failed to load selections:", error);
    }
  }, []);

  // 加载内容数据
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
      // 只显示文档类型的项目
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

  // 处理选择变化
  const handleSelectionChange = useMemoizedFn(
    async (type: PublishContentType, ids: number[], selected: boolean) => {
      // 更新本地状态
      const newSelections = new Map(selections);
      ids.forEach((id) => {
        newSelections.set(`${type}-${id}`, selected);
      });
      setSelections(newSelections);

      // 保存到数据库
      try {
        await batchUpsertPublishSelections(
          ids.map((id) => ({
            contentType: type,
            contentId: id,
            selected,
          })),
        );
      } catch (error) {
        console.error("Failed to save selections:", error);
      }
    },
  );

  // 渲染卡片列表
  const renderCardList = () => {
    if (cards.length === 0) {
      return <Empty description="暂无卡片" />;
    }

    // 按标签分组
    const tagGroups = new Map<string, ICard[]>();
    const noTagCards: ICard[] = [];

    cards.forEach((card) => {
      if (card.tags.length === 0) {
        noTagCards.push(card);
      } else {
        card.tags.forEach((tag) => {
          const group = tagGroups.get(tag) || [];
          group.push(card);
          tagGroups.set(tag, group);
        });
      }
    });

    return (
      <div className="max-h-96 space-y-4 overflow-y-auto">
        {/* 无标签卡片 */}
        {noTagCards.length > 0 && (
          <div>
            <div className="mb-2 font-medium text-[var(--color-text-soft)]">
              未分类
            </div>
            <div className="space-y-1">
              {noTagCards.map((card) => {
                const key = `card-${card.id}`;
                const checked = selections.get(key) ?? false;
                return (
                  <Checkbox
                    key={card.id}
                    checked={checked}
                    onChange={(e) =>
                      handleSelectionChange("card", [card.id], e.target.checked)
                    }
                  >
                    <span className="text-sm">卡片 #{card.id}</span>
                  </Checkbox>
                );
              })}
            </div>
          </div>
        )}

        {/* 按标签分组 */}
        {Array.from(tagGroups.entries()).map(([tag, tagCards]) => (
          <div key={tag}>
            <div className="mb-2 flex items-center gap-2">
              <Checkbox
                indeterminate={
                  tagCards.some((c) => selections.get(`card-${c.id}`)) &&
                  !tagCards.every((c) => selections.get(`card-${c.id}`))
                }
                checked={tagCards.every((c) => selections.get(`card-${c.id}`))}
                onChange={(e) =>
                  handleSelectionChange(
                    "card",
                    tagCards.map((c) => c.id),
                    e.target.checked,
                  )
                }
              >
                <span className="font-medium">{tag}</span>
              </Checkbox>
              <span className="text-xs text-[var(--color-text-mute)]">
                ({tagCards.length})
              </span>
            </div>
            <div className="ml-6 space-y-1">
              {tagCards.map((card) => {
                const key = `card-${card.id}`;
                const checked = selections.get(key) ?? false;
                return (
                  <Checkbox
                    key={card.id}
                    checked={checked}
                    onChange={(e) =>
                      handleSelectionChange("card", [card.id], e.target.checked)
                    }
                  >
                    <span className="text-sm">卡片 #{card.id}</span>
                  </Checkbox>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  };

  // 渲染文章列表
  const renderArticleList = () => {
    if (articles.length === 0) {
      return <Empty description="暂无文章" />;
    }

    return (
      <div className="max-h-96 space-y-2 overflow-y-auto">
        <Checkbox
          indeterminate={
            articles.some((a) => selections.get(`article-${a.id}`)) &&
            !articles.every((a) => selections.get(`article-${a.id}`))
          }
          checked={articles.every((a) => selections.get(`article-${a.id}`))}
          onChange={(e) =>
            handleSelectionChange(
              "article",
              articles.map((a) => a.id),
              e.target.checked,
            )
          }
        >
          <span className="font-medium">全选</span>
        </Checkbox>

        <div className="ml-6 space-y-1">
          {articles.map((article) => {
            const key = `article-${article.id}`;
            const checked = selections.get(key) ?? false;
            return (
              <Checkbox
                key={article.id}
                checked={checked}
                onChange={(e) =>
                  handleSelectionChange(
                    "article",
                    [article.id],
                    e.target.checked,
                  )
                }
              >
                <span className="text-sm">
                  {article.title || `文章 #${article.id}`}
                </span>
              </Checkbox>
            );
          })}
        </div>
      </div>
    );
  };

  // 渲染项目列表
  const renderProjectList = () => {
    if (projects.length === 0) {
      return <Empty description="暂无文档类型项目" />;
    }

    return (
      <div className="max-h-96 space-y-2 overflow-y-auto">
        {projects.map((project) => {
          const key = `project-${project.id}`;
          const checked = selections.get(key) ?? false;
          return (
            <Checkbox
              key={project.id}
              checked={checked}
              onChange={(e) =>
                handleSelectionChange("project", [project.id], e.target.checked)
              }
            >
              <span className="text-sm">
                {project.title || `项目 #${project.id}`}
              </span>
            </Checkbox>
          );
        })}
      </div>
    );
  };

  // 渲染知识库列表
  const renderDocumentList = () => {
    if (documents.length === 0) {
      return <Empty description="暂无知识库" />;
    }

    return (
      <div className="max-h-96 space-y-2 overflow-y-auto">
        {documents.map((doc) => {
          const key = `document-${doc.id}`;
          const checked = selections.get(key) ?? false;
          return (
            <Checkbox
              key={doc.id}
              checked={checked}
              onChange={(e) =>
                handleSelectionChange("document", [doc.id], e.target.checked)
              }
            >
              <span className="text-sm">
                {doc.title || `知识库 #${doc.id}`}
              </span>
            </Checkbox>
          );
        })}
      </div>
    );
  };

  const tabItems = [
    {
      key: "card",
      label: `卡片 (${cards.length})`,
      children: renderCardList(),
    },
    {
      key: "article",
      label: `文章 (${articles.length})`,
      children: renderArticleList(),
    },
    {
      key: "project",
      label: `项目 (${projects.length})`,
      children: renderProjectList(),
    },
    {
      key: "document",
      label: `知识库 (${documents.length})`,
      children: renderDocumentList(),
    },
  ];

  // 计算选中数量
  const selectedCount = Array.from(selections.values()).filter(Boolean).length;

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)]">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
        <span className="text-sm font-medium">选择要发布的内容</span>
        <span className="text-xs text-[var(--color-text-mute)]">
          已选择 {selectedCount} 项
        </span>
      </div>

      <div className="p-4">
        {loading ? (
          <div className="flex h-48 items-center justify-center">
            <Spin tip="加载中..." />
          </div>
        ) : (
          <Tabs
            activeKey={activeTab}
            onChange={(key) => setActiveTab(key as PublishContentType)}
            items={tabItems}
          />
        )}
      </div>
    </div>
  );
});

PublishSelector.displayName = "PublishSelector";

export default PublishSelector;
