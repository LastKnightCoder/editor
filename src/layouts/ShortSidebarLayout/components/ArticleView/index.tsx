import { Dropdown, FloatButton } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import classnames from "classnames";
import { useMemoizedFn } from "ahooks";

import ArticleList from "@/layouts/components/ArticleList";
import SimpleArticleList from "./SimpleArticleList";

import EditArticle from "@/layouts/components/EditArticle";
import { DEFAULT_ARTICLE_CONTENT } from "@/constants";

import useArticleManagementStore from "@/stores/useArticleManagementStore.ts";
import styles from "./index.module.less";
import { getFileBaseName, readTextFile, selectFile } from "@/commands";
import { getContentLength, importFromMarkdown } from "@/utils";

const ArticleView = () => {
  const { activeArticleId, createArticle, hideArticleList } =
    useArticleManagementStore((state) => ({
      activeArticleId: state.activeArticleId,
      createArticle: state.createArticle,
      hideArticleList: state.hideArticleList,
    }));

  const handleAddNewArticle = useMemoizedFn(async () => {
    const article = await createArticle({
      title: "默认文章标题",
      content: DEFAULT_ARTICLE_CONTENT,
      bannerBg: "",
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
                        isTop: false,
                        isDelete: false,
                        author: "",
                        content,
                        tags: [],
                        links: [],
                        count: getContentLength(content),
                      });
                    }
                  }
                },
              }}
            >
              <PlusOutlined />
            </Dropdown>
          }
        />
      )}
    </div>
  );
};

export default ArticleView;
