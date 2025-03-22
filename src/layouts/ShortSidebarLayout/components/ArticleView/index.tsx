import { Dropdown, FloatButton } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { RiSlideshowLine } from "react-icons/ri";
import classnames from "classnames";
import { useMemoizedFn } from "ahooks";
import { useShallow } from "zustand/react/shallow";

import ArticleList from "@/layouts/components/ArticleList";
import SimpleArticleList from "./SimpleArticleList";

import EditArticle from "@/layouts/components/EditArticle";
import { DEFAULT_ARTICLE_CONTENT } from "@/constants";

import useArticleManagementStore from "@/stores/useArticleManagementStore.ts";
import styles from "./index.module.less";
import { getFileBaseName, readTextFile, selectFile } from "@/commands";
import { getContentLength, importFromMarkdown } from "@/utils";
import PresentationMode from "@/components/PresentationMode";
import { openArticleInNewWindow } from "@/commands/article.ts";
import useSettingStore from "@/stores/useSettingStore.ts";

const ArticleView = () => {
  const {
    activeArticleId,
    createArticle,
    hideArticleList,
    isArticlePresentation,
    startArticlePresentation,
    stopArticlePresentation,
    presentationArticle,
  } = useArticleManagementStore(
    useShallow((state) => ({
      activeArticleId: state.activeArticleId,
      createArticle: state.createArticle,
      hideArticleList: state.hideArticleList,
      isArticlePresentation: state.isArticlePresentation,
      startArticlePresentation: state.startArticlePresentation,
      stopArticlePresentation: state.stopArticlePresentation,
      presentationArticle: state.presentationArticle,
    })),
  );

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
      {!activeArticleId && !isArticlePresentation && (
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
                  }
                },
              }}
            >
              <PlusOutlined />
            </Dropdown>
          }
        />
      )}
      {activeArticleId && !isArticlePresentation && (
        <FloatButton
          style={{
            right: 30,
            bottom: 80,
          }}
          icon={
            <Dropdown
              menu={{
                items: [
                  {
                    key: "presentation-mode",
                    label: "演示模式",
                  },
                  {
                    key: "open-in-new-window",
                    label: "在新窗口中打开",
                  },
                ],
                onClick: async ({ key }) => {
                  if (key === "presentation-mode") {
                    startArticlePresentation(activeArticleId);
                  } else if (key === "open-in-new-window") {
                    openArticleInNewWindow(
                      useSettingStore.getState().setting.database.active,
                      activeArticleId,
                    );
                  }
                },
              }}
            >
              <RiSlideshowLine />
            </Dropdown>
          }
        />
      )}
      {isArticlePresentation && presentationArticle && (
        <PresentationMode
          content={presentationArticle.content}
          onExit={() => {
            stopArticlePresentation();
          }}
        />
      )}
    </div>
  );
};

export default ArticleView;
