import { useSearchParams } from "react-router-dom";
import { Empty } from "antd";
import { useLocalStorageState } from "ahooks";
import { useShallow } from "zustand/react/shallow";
import classnames from "classnames";

import PresentationMode from "@/components/PresentationMode";
import ResizableAndHideableSidebar from "@/components/ResizableAndHideableSidebar";
import SidebarToggleButton from "@/components/SidebarToggleButton";
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
    stopArticlePresentation,
    hideArticleList,
    setHideArticleList,
  } = useArticleManagementStore(
    useShallow((state) => ({
      isArticlePresentation: state.isArticlePresentation,
      presentationArticle: state.presentationArticle,
      stopArticlePresentation: state.stopArticlePresentation,
      hideArticleList: state.hideArticleList,
      setHideArticleList: state.setHideArticleList,
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

  const onToggleSidebar = () => {
    setHideArticleList(!hideArticleList);
  };

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
        <ResizableAndHideableSidebar
          width={sidebarWidth ?? 300}
          onWidthChange={setSidebarWidth}
          open={!hideArticleList}
          disableResize={hideArticleList}
          className="h-full relative"
        >
          <SimpleArticleList activeArticleId={articleId} />
          <SidebarToggleButton.Collapse onToggle={onToggleSidebar} side="left" />
        </ResizableAndHideableSidebar>
        <SidebarToggleButton.Expand
          isHidden={hideArticleList}
          onToggle={onToggleSidebar}
          side="left"
        />
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
