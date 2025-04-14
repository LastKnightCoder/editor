import React, { useEffect, useState } from "react";
import { Button, Empty, List, Popover, Typography } from "antd";
import { LoadingOutlined, SyncOutlined } from "@ant-design/icons";
import { useMemoizedFn } from "ahooks";
import { useNavigate } from "react-router-dom";
import { IArticle, ICard, IDocumentItem, ProjectItem } from "@/types";
import { getLatestOperations } from "@/commands";
import Editor from "@/components/Editor";
import { getEditorText } from "@/utils";
import useProjectsStore from "@/stores/useProjectsStore";
import useDocumentsStore from "@/stores/useDocumentsStore";
import { getRootDocumentsByDocumentItemId } from "@/commands";
import TabsIndicator, { TabItem } from "@/components/TabsIndicator";

import {
  contentLinkExtension,
  fileAttachmentExtension,
  questionCardExtension,
  projectCardListExtension,
  documentCardListExtension,
} from "@/editor-extensions";
const customExtensions = [
  contentLinkExtension,
  fileAttachmentExtension,
  questionCardExtension,
  projectCardListExtension,
  documentCardListExtension,
];

import styles from "./index.module.less";

type ItemType = "cards" | "articles" | "projectItems" | "documentItems";

const LatestUpdate: React.FC = () => {
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<ItemType>("cards");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [latestData, setLatestData] = useState<{
    cards: ICard[];
    articles: IArticle[];
    projectItems: ProjectItem[];
    documentItems: IDocumentItem[];
  }>({
    cards: [],
    articles: [],
    projectItems: [],
    documentItems: [],
  });

  const fetchLatestOperations = useMemoizedFn(async () => {
    setLoading(true);
    try {
      const operations = await getLatestOperations(10);
      setLatestData(operations);
    } catch (error) {
      console.error("获取最近编辑项目失败:", error);
    } finally {
      setLoading(false);
    }
  });

  const handleRefresh = useMemoizedFn(async () => {
    if (refreshing || loading) return;

    setRefreshing(true);
    try {
      await fetchLatestOperations();
    } finally {
      setTimeout(() => {
        setRefreshing(false);
      }, 500);
    }
  });

  const handleTabChange = useMemoizedFn((tab: ItemType) => {
    setActiveTab(tab);
  });

  const handleCardClick = useMemoizedFn((cardId: number) => {
    navigate(`/cards/detail/${cardId}`);
  });

  const handleArticleClick = useMemoizedFn((articleId: number) => {
    navigate(`/articles/detail/${articleId}`);
  });

  const handleProjectItemClick = useMemoizedFn((projectItem: ProjectItem) => {
    if (projectItem.projects.length === 0) return;
    navigate(`/projects/detail/${projectItem.projects[0]}`);
    useProjectsStore.setState({
      activeProjectItemId: projectItem.id,
    });
  });

  const handleDocumentItemClick = useMemoizedFn(
    async (documentItemId: number) => {
      const documents = await getRootDocumentsByDocumentItemId(documentItemId);
      if (documents.length === 0) return;
      const documentId = documents[0].id;
      navigate(`/documents/detail/${documentId}`);
      useDocumentsStore.setState({
        activeDocumentItemId: documentItemId,
      });
    },
  );

  useEffect(() => {
    fetchLatestOperations();
  }, []);

  const renderContent = () => {
    if (loading) {
      return (
        <div className={styles.loadingContainer}>
          <LoadingOutlined />
        </div>
      );
    }

    const currentItems = latestData[activeTab];

    if (currentItems.length === 0) {
      return (
        <div className={styles.emptyContainer}>
          <Empty description="暂无数据" />
        </div>
      );
    }

    // Limit to 5 items per tab
    const displayItems = currentItems.slice(0, 5);

    return (
      <List
        dataSource={displayItems as any[]}
        renderItem={(item: any) => {
          const isCard = activeTab === "cards";
          const isArticle = activeTab === "articles";
          const isProjectItem = activeTab === "projectItems";
          const isDocumentItem = activeTab === "documentItems";

          const title = isCard
            ? getEditorText(item.content, 40)
            : isArticle
              ? item.title
              : isProjectItem
                ? item.title
                : item.title;

          return (
            <List.Item
              className={styles.itemListItem}
              onClick={() => {
                if (isCard) handleCardClick(item.id);
                if (isArticle) handleArticleClick(item.id);
                if (isProjectItem) handleProjectItemClick(item);
                if (isDocumentItem) handleDocumentItemClick(item.id);
              }}
            >
              <Popover
                trigger="hover"
                content={
                  <Editor
                    key={`${item.type}-${item.id}`}
                    initValue={item.content}
                    readonly
                    extensions={customExtensions}
                    className={styles.editor}
                  />
                }
                placement="bottom"
                mouseEnterDelay={0.8}
              >
                <Typography.Text ellipsis title={title}>
                  {title || "无标题"}
                </Typography.Text>
              </Popover>
            </List.Item>
          );
        }}
      />
    );
  };

  const tabs: TabItem<ItemType>[] = [
    { key: "cards", label: "卡片" },
    { key: "articles", label: "文章" },
    { key: "projectItems", label: "项目" },
    { key: "documentItems", label: "知识库" },
  ];

  return (
    <div className={styles.latestUpdate}>
      <div className={styles.header}>
        <Typography.Title level={5} style={{ margin: 0 }}>
          最近编辑
        </Typography.Title>
        <Button
          type="text"
          icon={<SyncOutlined spin={refreshing} />}
          onClick={handleRefresh}
          disabled={loading || refreshing}
        />
      </div>

      <TabsIndicator
        tabs={tabs}
        activeTab={activeTab}
        onChange={handleTabChange}
      />

      <div className={styles.content}>{renderContent()}</div>
    </div>
  );
};

export default LatestUpdate;
