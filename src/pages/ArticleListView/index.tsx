import { useState, memo, useEffect, useMemo } from "react";
import For from "@/components/For";
import { useNavigate } from "react-router-dom";
import {
  Dropdown,
  FloatButton,
  Pagination,
  Breadcrumb,
  Empty,
  Button,
} from "antd";
import { LoadingOutlined, PlusOutlined } from "@ant-design/icons";
import ArticleCard from "./ArticleCard";
import styles from "./index.module.less";
import Titlebar from "@/components/Titlebar";
import { DEFAULT_ARTICLE_CONTENT } from "@/constants";
import { useMemoizedFn } from "ahooks";
import {
  createArticle,
  getFileBaseName,
  readTextFile,
  selectFile,
  getAllArticles,
  updateArticleBannerBg,
  updateArticleIsTop,
  deleteArticle,
} from "@/commands";
import { getContentLength, importFromMarkdown } from "@/utils";
import { IArticle } from "@/types";
import useArticleManagementStore from "@/stores/useArticleManagementStore";
import PresentationMode from "@/components/PresentationMode";
import useSettingStore from "@/stores/useSettingStore";
import useDatabaseConnected from "@/hooks/useDatabaseConnected";

const ArticleListView = memo(() => {
  const navigate = useNavigate();
  const [pageNum, setPageNum] = useState(1);
  const [articles, setArticles] = useState<IArticle[]>([]);
  const [loading, setLoading] = useState(false);

  const isArticlePresentation = useArticleManagementStore(
    (state) => state.isArticlePresentation,
  );
  const presentationArticle = useArticleManagementStore(
    (state) => state.presentationArticle,
  );

  const isConnected = useDatabaseConnected();
  const database = useSettingStore((state) => state.setting.database.active);

  useEffect(() => {
    if (isConnected && database) {
      setLoading(true);
      getAllArticles()
        .then((articles) => {
          setArticles(articles);
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [isConnected, database]);

  const sortedArticles = useMemo(() => {
    const topArticles = articles.filter((article) => article.isTop);
    const notTopArticles = articles.filter((article) => !article.isTop);
    return [...topArticles, ...notTopArticles];
  }, [articles]);

  const showArticles = sortedArticles.slice((pageNum - 1) * 10, pageNum * 10);

  const handleAddNewArticle = useMemoizedFn(async () => {
    const article = await createArticle({
      title: "默认文章标题",
      content: DEFAULT_ARTICLE_CONTENT,
      bannerBg: "",
      bannerPosition: "center",
      isTop: false,
      author: "",
      links: [],
      tags: [],
      isDelete: false,
      count: 0,
    });

    // 创建后跳转到编辑页
    navigate(`/articles/detail/${article.id}?readonly=false`);
  });

  const handleImportMarkdown = useMemoizedFn(async () => {
    const filePath = await selectFile({
      properties: ["openFile", "multiSelections"],
      filters: [
        {
          name: "Markdown",
          extensions: ["md"],
        },
      ],
    });
    if (!filePath) return;
    for (const path of filePath) {
      const markdown = await readTextFile(path);
      const content = importFromMarkdown(markdown, [
        "yaml",
        "footnoteDefinition",
        "footnoteReference",
      ]);
      const fileName = await getFileBaseName(path, true);
      await createArticle({
        title: fileName,
        bannerBg: "",
        bannerPosition: "center",
        isTop: false,
        isDelete: false,
        author: "",
        content,
        tags: [],
        links: [],
        count: getContentLength(content),
      });
    }
  });

  const handleUpdateArticleBannerBg = useMemoizedFn(
    async (id: number, bannerBg: string) => {
      const updatedArticle = await updateArticleBannerBg(id, bannerBg);
      const newArticles = articles.map((article) => {
        if (article.id === id) {
          return updatedArticle;
        }
        return article;
      });
      setArticles(newArticles);
    },
  );

  const handleUpdateArticleIsTop = useMemoizedFn(
    async (id: number, isTop: boolean) => {
      const updatedArticle = await updateArticleIsTop(id, isTop);
      const newArticles = articles.map((article) => {
        if (article.id === id) {
          return updatedArticle;
        }
        return article;
      });
      setArticles(newArticles);
    },
  );

  const handleDeleteArticle = useMemoizedFn(async (id: number) => {
    await deleteArticle(id);
    const newArticles = articles.filter((article) => article.id !== id);
    setArticles(newArticles);
  });

  // 面包屑导航
  const breadcrumbItems = [
    { title: "首页", path: "/" },
    { title: "文章列表", path: "/articles/list" },
  ];

  if (loading) {
    return (
      <div className={styles.loading}>
        <LoadingOutlined spin />
      </div>
    );
  }

  if (showArticles.length === 0) {
    return (
      <div className={styles.empty}>
        <Empty description="暂无文章">
          <Button onClick={handleAddNewArticle}>创建文章</Button>
        </Empty>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Titlebar className={styles.titlebar}>
        <Breadcrumb
          className={styles.breadcrumb}
          items={breadcrumbItems.map((item) => ({
            title: (
              <span
                className={styles.breadcrumbItem}
                onClick={() => navigate(item.path)}
              >
                {item.title}
              </span>
            ),
          }))}
        />
      </Titlebar>

      <div className={styles.content}>
        <div className={styles.listContainer}>
          <For
            data={showArticles}
            renderItem={(article, index) => (
              <ArticleCard
                className={styles.item}
                key={article.id}
                article={article}
                imageRight={index % 2 === 1}
                updateArticleBannerBg={handleUpdateArticleBannerBg}
                updateArticleIsTop={handleUpdateArticleIsTop}
                deleteArticle={handleDeleteArticle}
              />
            )}
          />
        </div>
        <div className={styles.pagination}>
          <Pagination
            align={"start"}
            pageSize={10}
            current={pageNum}
            onChange={setPageNum}
            total={articles.length}
            showSizeChanger={false}
            hideOnSinglePage={true}
          />
        </div>
      </div>

      {!isArticlePresentation && (
        <FloatButton
          style={{
            position: "absolute",
            right: 80,
            bottom: 60,
          }}
          icon={
            <Dropdown
              menu={{
                items: [
                  {
                    key: "create-article",
                    label: "创建文章",
                  },
                  {
                    key: "import-markdown",
                    label: "导入文章",
                  },
                ],
                onClick: async ({ key }) => {
                  if (key === "create-article") {
                    await handleAddNewArticle();
                  } else if (key === "import-markdown") {
                    await handleImportMarkdown();
                  }
                },
              }}
            >
              <PlusOutlined />
            </Dropdown>
          }
        />
      )}
      {isArticlePresentation && presentationArticle && (
        <PresentationMode
          content={presentationArticle.content}
          onExit={() => {
            useArticleManagementStore.getState().stopArticlePresentation();
          }}
        />
      )}
    </div>
  );
});

export default ArticleListView;
