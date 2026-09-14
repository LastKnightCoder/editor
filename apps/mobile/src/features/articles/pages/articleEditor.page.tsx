import { useEffect, useState } from "react";
import { Layers, Ellipsis, Newspaper, Star, Trash2 } from "lucide-react";
import { PageHeaderButton } from "../../../components/PageHeader";
import { ContentDetailPage } from "../../cards/ContentDetailPage";
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
});
type ArticleEditorParams = typeof articleEditorSchema.type;

function ArticleEditorScreen() {
  const { params } = usePage<ArticleEditorParams>();
  const navigator = useNavigator();
  const app = useAppContext();
  const invalidate = useInvalidateArticles();
  const { data: article } = useArticleQuery(params.articleId);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
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
    toast({ type: "success", text: "已删除文章" });
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
          <div className="bg-input h-4 w-2/5 animate-pulse rounded" />
          <div className="bg-input h-4 w-4/5 animate-pulse rounded" />
        </div>
      </div>
    );
  }

  return (
    <>
      <ContentDetailPage
        contentId={article.contentId ?? 0}
        contentTitle={article.title}
        titleEditable
        contentType="文章"
        contentTypeBadge={{
          icon: Newspaper,
          className: "bg-rose-soft text-rose",
        }}
        tags={article.tags}
        refreshKey={refreshRev}
        collaboration={collab.collaboration}
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
            .catch(error => app.presentError(error, "标题保存失败"));
        }}
        headerRight={
          <PageHeaderButton
            icon={<Ellipsis size={17} />}
            aria-label="文章操作"
            onClick={() => setMenuOpen(true)}
          />
        }
        onBack={() => navigator.goBack("ui")}
        onError={(error, fallback) => app.presentError(error, fallback)}
      />

      <ActionSheet
        open={menuOpen}
        title={article.title}
        kind="文章"
        onClose={() => setMenuOpen(false)}
        items={[
          {
            label: article.isTop ? "取消置顶" : "置顶",
            icon: <Star size={18} />,
            tone: "butter",
            trailing: article.isTop ? "已置顶" : undefined,
            onClick: () => toggleTop.mutate(article),
          },
          {
            label: "加入闪卡",
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
          {
            label: "删除文章",
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
        title="删除文章"
        description={`「${clampText(article.title, 18)}」将被移入回收站，正文一并删除。`}
        danger
        loading={deleteArticle.isPending}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => {
          setDeleteOpen(false);
          deleteArticle.mutate(article.id);
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
