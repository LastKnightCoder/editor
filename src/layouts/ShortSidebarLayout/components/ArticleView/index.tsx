import { Dropdown, FloatButton } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { RiSlideshowLine } from "react-icons/ri";
import classnames from "classnames";
import { useMemoizedFn } from "ahooks";
import { useState, useMemo } from "react";

import ArticleList from "@/layouts/components/ArticleList";
import SimpleArticleList from "./SimpleArticleList";

import EditArticle from "@/layouts/components/EditArticle";
import { DEFAULT_ARTICLE_CONTENT } from "@/constants";

import useArticleManagementStore from "@/stores/useArticleManagementStore.ts";
import styles from "./index.module.less";
import { getFileBaseName, readTextFile, selectFile } from "@/commands";
import { getContentLength, importFromMarkdown } from "@/utils";
import PresentationMode from "@/components/PresentationMode";

const ArticleView = () => {
  const [isPresentation, setIsPresentation] = useState(false);
  const { activeArticleId, createArticle, hideArticleList, articles } =
    useArticleManagementStore((state) => ({
      activeArticleId: state.activeArticleId,
      createArticle: state.createArticle,
      hideArticleList: state.hideArticleList,
      articles: state.articles,
    }));

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
    useArticleManagementStore.setState({
      activeArticleId: article.id,
    });
  });

  const isShowEdit = !!activeArticleId;

  // 获取当前激活的文章
  const activeArticle = useMemo(() => {
    return articles.find((article) => article.id === activeArticleId);
  }, [articles, activeArticleId]);

  return (
    <div
      className={classnames(styles.viewContainer, {
        [styles.showEdit]: isShowEdit,
        [styles.hideArticleList]: hideArticleList,
      })}
    >
      {!activeArticleId && <ArticleList className={styles.listContainer} />}
      {activeArticleId && (
        <SimpleArticleList className={styles.simpleListContainer} />
      )}
      <div className={styles.editContainer}>
        {isShowEdit && <EditArticle key={activeArticleId} />}
      </div>
      {!activeArticleId && (
        <FloatButton
          style={{
            right: 60,
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
                  {
                    key: "presentation-mode",
                    label: "演示模式",
                    disabled: !activeArticleId,
                  },
                ],
                onClick: async ({ key }) => {
                  if (key === "create-article") {
                    await handleAddNewArticle();
                  } else if (key === "import-markdown") {
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
                      const content = importFromMarkdown(markdown);
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
                  } else if (
                    key === "presentation-mode" &&
                    activeArticleId &&
                    activeArticle
                  ) {
                    setIsPresentation(true);
                  }
                },
              }}
            >
              <PlusOutlined />
            </Dropdown>
          }
        />
      )}
      {activeArticleId && (
        <FloatButton
          style={{
            right: 60,
          }}
          onClick={() => {
            setIsPresentation(true);
          }}
          icon={<RiSlideshowLine />}
        />
      )}

      {isPresentation && activeArticle && (
        <PresentationMode
          content={activeArticle.content}
          onExit={() => {
            setIsPresentation(false);
          }}
        />
      )}
    </div>
  );
};

export default ArticleView;
