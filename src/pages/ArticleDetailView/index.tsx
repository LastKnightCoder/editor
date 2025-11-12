import { useSearchParams } from "react-router-dom";
import { FloatButton, Dropdown, Empty } from "antd";
import { useMemoizedFn, useLocalStorageState } from "ahooks";
import { RiSlideshowLine } from "react-icons/ri";
import { useShallow } from "zustand/react/shallow";
import classnames from "classnames";

import { findOneArticle, openArticleInNewWindow } from "@/commands/article";
import useSettingStore from "@/stores/useSettingStore";
import PresentationMode from "@/components/PresentationMode";
import ResizableAndHideableSidebar from "@/components/ResizableAndHideableSidebar";
import useArticleManagementStore from "@/stores/useArticleManagementStore";
import useTabParams from "@/hooks/useTabParams";
import { TabType } from "@/types/tab";

import EditArticle from "./EditArticle";
import SimpleArticleList from "./SimpleArticleList";
import styles from "./index.module.less";

const ArticleDetailView = () => {
  const { id } = useTabParams(TabType.ArticleDetail);
  const articleId = id;

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

  const [sidebarWidth, setSidebarWidth] = useLocalStorageState(
    "article-list-sidebar-width",
    {
      defaultValue: 300,
    },
  );

  const [searchParams] = useSearchParams();
  const readonly = searchParams.get("readonly") === "true";

  const handleStartPresentation = useMemoizedFn(async () => {
    if (id) {
      const article = await findOneArticle(id);
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
        <div className={classnames(styles.simpleArticleListContainer)}>
          <ResizableAndHideableSidebar
            width={sidebarWidth ?? 300}
            onWidthChange={setSidebarWidth}
            open={!hideArticleList}
            disableResize={hideArticleList}
            className="h-full"
          >
            <SimpleArticleList activeArticleId={articleId} />
          </ResizableAndHideableSidebar>
        </div>
        <div
          className={classnames(styles.articleContainer, {
            [styles.readonly]: readonly,
          })}
        >
          <div className={styles.editContainer}>
            <EditArticle defaultReadonly={readonly} articleId={articleId} />
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
