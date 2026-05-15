import { memo } from "react";
import ResizablePanel from "@/components/ResizablePanel";
import useThemeColors from "@/hooks/useThemeColors";
import useFeedViewState from "./hooks/useFeedViewState";
import FeedSidebar from "./components/FeedSidebar";
import ArticleList from "./components/ArticleList";
import ReadingPane from "./components/ReadingPane";
import AddFeedDialog from "./components/AddFeedDialog";

const FeedView: React.FC = memo(() => {
  const themeColors = useThemeColors();
  const state = useFeedViewState();

  return (
    <>
      <ResizablePanel
        id="feed-view-outer"
        className="h-full w-full"
        leftClassName={`h-full overflow-hidden border-r ${themeColors.borderClass}`}
        rightClassName="h-full overflow-hidden"
        defaultLeftWidth={220}
        minLeft={180}
        minRight={500}
        left={
          <FeedSidebar
            selection={state.selection}
            onSelect={state.setSelection}
            onAddClick={() => state.setAddDialogOpen(true)}
          />
        }
        right={
          <ResizablePanel
            id="feed-view-inner"
            className="h-full w-full"
            leftClassName={`h-full overflow-hidden border-r ${themeColors.borderClass}`}
            rightClassName="h-full overflow-hidden"
            defaultLeftWidth={300}
            minLeft={240}
            minRight={360}
            left={
              <ArticleList
                selection={state.selection}
                articles={state.articles}
                selectedId={state.selectedArticle?.id || null}
                isLoading={state.isLoading}
                onSelect={state.selectArticle}
                onMarkAllRead={state.markAllRead}
                onRefresh={state.refreshCurrent}
              />
            }
            right={
              <ReadingPane article={state.selectedArticle} actions={state} />
            }
          />
        }
      />
      <AddFeedDialog
        open={state.addDialogOpen}
        onClose={() => state.setAddDialogOpen(false)}
      />
    </>
  );
});

export default FeedView;
