import { memo } from "react";
import type { Descendant } from "slate";
import ResizablePanel from "@/components/ResizablePanel";
import useSettingStore from "@/stores/useSettingStore";
import useFeedViewState from "./hooks/useFeedViewState";
import FeedSidebar from "./components/FeedSidebar";
import ArticleList from "./components/ArticleList";
import ReadingPane from "./components/ReadingPane";
import AddFeedDialog from "./components/AddFeedDialog";
import InsertNoteToTreeModal from "@/components/InsertNoteToTreeModal";
import { isBilibiliVideoArticle, resolveBilibiliVideoMetaInfo } from "./utils/bilibiliVideoMeta";

const EMPTY_NOTE_CONTENT: Descendant[] = [];

const FeedView: React.FC = memo(() => {
  const state = useFeedViewState();
  const projectArticle = state.projectArticleToAdd;
  const bilibiliCredentials = useSettingStore(
    store => store.setting.integration.bilibili.credentials
  );
  const shouldInsertAsBilibiliVideo = Boolean(
    projectArticle &&
    isBilibiliVideoArticle({
      url: projectArticle.url,
      content: projectArticle.content,
    })
  );

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
                articleTotal={state.articleTotal}
                hasMore={state.hasMoreArticles}
                search={state.articleSearch}
                articleProjectTargets={state.articleProjectTargets}
                onSelect={state.selectArticle}
                onSearchChange={state.setArticleSearch}
                onLoadMore={state.loadMoreArticles}
                onMarkAllRead={state.markAllRead}
                onRefresh={state.refreshCurrent}
                onToggleStar={state.toggleStar}
                onMarkRead={state.markRead}
                onMarkUnread={state.markUnread}
                onToggleReadLater={state.toggleReadLater}
                onArchive={state.archiveItem}
                onUnarchive={state.unarchiveItem}
                onDelete={state.deleteItem}
                onAddToProject={state.addToProject}
                onOpenProject={state.openProjectTarget}
                showBilibiliFollowingsSubscribe={state.showBilibiliFollowingsSubscribe}
                onSubscribeBilibiliFollowings={state.subscribeBilibiliFollowings}
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
      <AddFeedDialog open={state.addDialogOpen} onClose={() => state.setAddDialogOpen(false)} />
      <InsertNoteToTreeModal
        mode="project"
        open={!!projectArticle}
        noteTitle={projectArticle?.title || ""}
        noteContent={EMPTY_NOTE_CONTENT}
        insertMode={shouldInsertAsBilibiliVideo ? "video-note" : "webview"}
        webviewPayload={
          projectArticle?.url && !shouldInsertAsBilibiliVideo
            ? {
                title: projectArticle.title,
                url: projectArticle.url,
                sourceType: "remote",
              }
            : undefined
        }
        videoNotePayload={
          projectArticle?.url && shouldInsertAsBilibiliVideo
            ? {
                title: projectArticle.title,
                resolveMetaInfo: async () => {
                  return resolveBilibiliVideoMetaInfo(
                    {
                      url: projectArticle.url!,
                      content: projectArticle.content,
                    },
                    bilibiliCredentials
                  );
                },
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
