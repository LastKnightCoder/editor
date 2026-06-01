import { memo } from "react";
import type { Descendant } from "slate";
import ResizablePanel from "@/components/ResizablePanel";
import useFeedViewState from "./hooks/useFeedViewState";
import FeedSidebar from "./components/FeedSidebar";
import ArticleList from "./components/ArticleList";
import ReadingPane from "./components/ReadingPane";
import AddFeedDialog from "./components/AddFeedDialog";
import InsertNoteToTreeModal from "@/pages/VibeLearningView/AppSidebar/components/InsertNoteToTreeModal";

const EMPTY_NOTE_CONTENT: Descendant[] = [];

const FeedView: React.FC = memo(() => {
  const state = useFeedViewState();
  const projectArticle = state.projectArticleToAdd;

  return (
    <>
      <ResizablePanel
        id="feed-view-outer"
        className="h-full w-full"
        leftClassName="h-full overflow-hidden"
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
            leftClassName="h-full overflow-hidden"
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
                articleProjectTargets={state.articleProjectTargets}
                onSelect={state.selectArticle}
                onMarkAllRead={state.markAllRead}
                onRefresh={state.refreshCurrent}
                onToggleStar={state.toggleStar}
                onMarkRead={state.markRead}
                onToggleReadLater={state.toggleReadLater}
                onArchive={state.archiveItem}
                onUnarchive={state.unarchiveItem}
                onDelete={state.deleteItem}
                onAddToProject={state.addToProject}
                onOpenProject={state.openProjectTarget}
              />
            }
            right={
              <ReadingPane
                article={state.selectedArticle}
                isInReadLater={state.isSelectedInReadLater}
                actions={state}
              />
            }
          />
        }
      />
      <AddFeedDialog
        open={state.addDialogOpen}
        onClose={() => state.setAddDialogOpen(false)}
      />
      <InsertNoteToTreeModal
        mode="project"
        open={!!projectArticle}
        noteTitle={projectArticle?.title || ""}
        noteContent={EMPTY_NOTE_CONTENT}
        insertMode="webview"
        webviewPayload={
          projectArticle?.url
            ? {
                title: projectArticle.title,
                url: projectArticle.url,
                sourceType: "remote",
              }
            : undefined
        }
        onCancel={state.closeProjectInsertModal}
        onSuccess={() => {
          state.closeProjectInsertModal();
          void state.refreshArticleProjectTargets();
        }}
      />
    </>
  );
});

export default FeedView;
