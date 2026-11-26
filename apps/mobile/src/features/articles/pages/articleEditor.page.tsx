import { useMobileArticlesI18n } from "../i18n";
import { useMobilePluginActionItems } from "../../../app/plugins/action-menu";
import { useEffect, useRef, useState } from "react";
import { Layers, Ellipsis, Newspaper, Star, Trash2 } from "lucide-react";
import { PageHeaderButton } from "../../../components/PageHeader";
import { ContentDetailPage, type ContentDetailActions } from "../../cards/ContentDetailPage";
import {
  blockSelectionMenuItem,
  outlineMenuItem,
} from "../../cards/blockSelection/blockSelectionMenuItem";
import { ActionSheet } from "../../../components/ActionSheet";
import { MobileConfirmDialog } from "../../../components/MobileConfirmDialog";
import { toast } from "../../../components/toast";
import { useAppContext } from "../../../app/AppContext";
import * as tauri from "../../../services/tauri";
import { useContentCollabEntry } from "../../collaboration/useContentCollabEntry";
import {
  createPageSchema,
  definePage,
  paramNumber,
  paramOptional,
  paramString,
  useNavigator,
  usePage,
  usePageLifecycle,
} from "../../../router";
import {
  useArticleQuery,
  useArticleDelete,
  useArticleToggleTop,
  useInvalidateArticles,
} from "../queries";
import { ArticleCover } from "../ArticleCover";
import { clampText } from "../../../utils/richTextText";

const articleEditorSchema = createPageSchema({
  articleId: paramNumber(),
  block: paramOptional(paramNumber()),
  locationRequestId: paramOptional(paramString()),
});
type ArticleEditorParams = typeof articleEditorSchema.type;

function ArticleEditorScreen() {
  const { t } = useMobileArticlesI18n();
  const { params } = usePage<ArticleEditorParams>();
  const navigator = useNavigator();
  const app = useAppContext();
  const invalidate = useInvalidateArticles();
  const { data: article } = useArticleQuery(params.articleId);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const detailActionsRef = useRef<ContentDetailActions>(null);
  const pluginActionItems = useMobilePluginActionItems(
    article ? { kind: "article", id: String(article.id), createTime: article.createTime } : null
  );
  // onResume 重拉正文（协作结束后本地内容更新）；绑定刷新由 useContentCollabEntry 内部处理
  const [refreshRev, setRefreshRev] = useState(0);
  usePageLifecycle({ onResume: () => setRefreshRev(value => value + 1) });
  const collab = useContentCollabEntry(article?.contentId ?? undefined, {
    refreshKey: refreshRev,
    share: {
      title: article?.title ?? "",
      content: article?.content ?? undefined,
      sourceType: "article",
      sourceId: params.articleId,
    },
  });
  const toggleTop = useArticleToggleTop(() => setMenuOpen(false));
  const deleteArticle = useArticleDelete(() => {
    toast({ type: "success", text: t("delete.success") });
    navigator.popTo("articles");
  });

  // 离开编辑器时刷新列表（字数 / 更新时间 / 置顶态）
  useEffect(() => {
    return () => {
      invalidate();
    };
  }, [invalidate]);

  if (!article) {
    return (
      <div className="mobile-kb-screen bg-page fixed inset-0 z-50 grid place-items-center">
        <div className="card w-48 space-y-3 p-5">
          <div className="bg-page h-4 w-2/5 animate-pulse rounded" />
          <div className="bg-page h-4 w-4/5 animate-pulse rounded" />
        </div>
      </div>
    );
  }

  return (
    <>
      <ContentDetailPage
        block={params.block}
        locationRequestId={params.locationRequestId}
        contentId={article.contentId ?? 0}
        contentTitle={article.title}
        titleEditable
        contentType={t("type")}
        contentTypeBadge={{
          icon: Newspaper,
          className: "bg-tag-5-soft text-tag-5",
        }}
        tags={article.tags}
        refreshKey={refreshRev}
        actionsRef={detailActionsRef}
        contextEntity={{ kind: "article", id: article.id }}
        aiContext={{ entityType: "article", entityId: article.id, title: article.title }}
        collaboration={collab.collaboration}
        collaborationBinding={collab.collaborationBinding}
        onCollaborationEnded={() => {
          collab.onCollaborationEnded();
          setRefreshRev(value => value + 1);
        }}
        onTagsCommit={async next => {
          await tauri.articleUpdate({ id: params.articleId, tags: next });
          invalidate();
        }}
        coverSlot={<ArticleCover article={article} variant="hero" />}
        onTitleCommit={title => {
          tauri
            .articleUpdate({ id: params.articleId, title })
            .then(() => invalidate())
            .catch(error => app.presentError(error, t("title.failed")));
        }}
        headerRight={
          <PageHeaderButton
            icon={<Ellipsis size={17} />}
            aria-label={t("action.actions")}
            onClick={() => setMenuOpen(true)}
          />
        }
        onBack={() => navigator.goBack("ui")}
        onError={(error, fallback) => app.presentError(error, fallback)}
      />

      <ActionSheet
        open={menuOpen}
        title={article.title}
        kind={t("type")}
        onClose={() => setMenuOpen(false)}
        items={[
          blockSelectionMenuItem(() => detailActionsRef.current?.enterBlockSelection()),
          outlineMenuItem(() => detailActionsRef.current?.openOutline()),
          {
            label: t(article.isTop ? "action.unpin" : "action.pin"),
            icon: <Star size={18} />,
            tone: "butter",
            trailing: article.isTop ? t("pin.success") : undefined,
            onClick: () =>
              toggleTop.mutate(article, {
                onError: error => app.presentError(error, t("pin.failed")),
              }),
          },
          {
            label: t("flashcards"),
            icon: <Layers size={18} />,
            tone: "lilac",
            onClick: () => {
              setMenuOpen(false);
              navigator.push("flashcardCreate", {
                deckId: -1,
                refContentId: article.contentId ?? 0,
                refTitle: article.title || "未命名文章",
              });
            },
          },
          ...collab.menuItems,
          ...pluginActionItems,
          {
            label: t("delete.action"),
            danger: true,
            icon: <Trash2 size={18} />,
            onClick: () => {
              setMenuOpen(false);
              setDeleteOpen(true);
            },
          },
        ]}
      />

      {collab.shareSheet}

      <MobileConfirmDialog
        open={deleteOpen}
        title={t("delete.action")}
        description={t("delete.description", { title: clampText(article.title, 18) })}
        danger
        loading={deleteArticle.isPending}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => {
          setDeleteOpen(false);
          deleteArticle.mutate(article.id, {
            onError: error => app.presentError(error, t("delete.failed")),
          });
        }}
      />
    </>
  );
}

export default definePage({
  key: "articleEditor",
  match: "params",
  getId: p => String(p.articleId),
  params: articleEditorSchema.schema,
  component: ArticleEditorScreen,
});
