import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Breadcrumb, FloatButton, Dropdown, Empty } from "antd";
import { useMemoizedFn } from "ahooks";
import { RiSlideshowLine } from "react-icons/ri";
import { useShallow } from "zustand/react/shallow";
import classnames from "classnames";

import Titlebar from "@/layouts/components/Titlebar";
import { findOneArticle, openArticleInNewWindow } from "@/commands/article";
import useSettingStore from "@/stores/useSettingStore";
import PresentationMode from "@/components/PresentationMode";
import useArticleManagementStore from "@/stores/useArticleManagementStore";

import EditArticle from "./EditArticle";
import SimpleArticleList from "./SimpleArticleList";
import styles from "./index.module.less";

const ArticleDetailView = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const articleId = id ? parseInt(id, 10) : undefined;

  const {
    isArticlePresentation,
    presentationArticle,
    startArticlePresentation,
    stopArticlePresentation,
    hideArticleList,
  } = useArticleManagementStore(
    useShallow((state) => ({
      isArticlePresentation: state.isArticlePresentation,
      presentationArticle: state.presentationArticle,
      startArticlePresentation: state.startArticlePresentation,
      stopArticlePresentation: state.stopArticlePresentation,
      hideArticleList: state.hideArticleList,
    })),
  );

  const [searchParams] = useSearchParams();
  const readonly = searchParams.get("readonly") === "true";

  // 面包屑导航
  const breadcrumbItems = [
    { title: "首页", path: "/" },
    { title: "文章列表", path: "/articles/list" },
    {
      title: id ? `文章 #${id}` : "文章详情",
      path: `/articles/detail/${id}${readonly ? "?readonly=true" : ""}`,
    },
  ];

  const handleStartPresentation = useMemoizedFn(async () => {
    if (id) {
      const article = await findOneArticle(parseInt(id, 10));
      if (article) {
        startArticlePresentation(article);
      }
    }
  });

  if (!articleId) {
    return (
      <div className={styles.empty}>
        <Empty description="文章不存在或已被删除" />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div
          className={classnames(styles.simpleArticleListContainer, {
            [styles.hide]: hideArticleList,
          })}
        >
          <SimpleArticleList activeArticleId={articleId} />
        </div>
        <div
          className={classnames(styles.articleContainer, {
            [styles.readonly]: readonly,
          })}
        >
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
          <div className={styles.editContainer}>
            <EditArticle articleId={articleId} />
          </div>
        </div>
      </div>

      {!isArticlePresentation && (
        <FloatButton
          style={{
            position: "absolute",
            right: 32,
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
                    handleStartPresentation();
                  } else if (key === "open-in-new-window" && articleId) {
                    openArticleInNewWindow(
                      useSettingStore.getState().setting.database.active,
                      articleId,
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

export default ArticleDetailView;
