import { useEffect, useState } from "react";
import { Layers, ChevronRight, Copy, Ellipsis, Link2, Trash2 } from "lucide-react";
import { ContentDetailPage } from "../ContentDetailPage";
import { PageHeaderButton } from "../../../components/PageHeader";
import { ActionSheet } from "../../../components/ActionSheet";
import { MobileConfirmDialog } from "../../../components/MobileConfirmDialog";
import { toast } from "../../../components/toast";
import CardLinksSheet from "../CardLinksSheet";
import { useDiaryStore } from "../../diary/store/useDiaryStore";
import { useAppContext } from "../../../app/AppContext";
import * as tauri from "../../../services/tauri";
import type { CardDetailResponse } from "../../../types";
import { useContentCollabEntry } from "../../collaboration/useContentCollabEntry";
import { richTextPlainText } from "../../../utils/richTextText";
import {
  createPageSchema,
  definePage,
  paramBoolean,
  paramNumber,
  paramObject,
  paramOptional,
  paramString,
  useNavigator,
  usePage,
  usePageLifecycle,
} from "../../../router";

const contentDetailSchema = createPageSchema({
  // 两种入口二选一：内容 id（日记 / 编辑器内链）或卡片 id（列表/搜索/关联跳转）
  contentId: paramOptional(paramNumber()),
  cardId: paramOptional(paramNumber()),
  contentTitle: paramString(""),
  contentType: paramString(""),
  refId: paramOptional(paramNumber()),
  fromDiary: paramOptional(paramBoolean()),
  diaryDate: paramOptional(
    paramObject({
      title: paramString(""),
      sub: paramOptional(paramString("")),
    })
  ),
});
type ContentDetailParams = typeof contentDetailSchema.type;

/** 卡片入口：cardId → contentId 解析 + ⋯ 操作（关联卡片 / 复制正文 / 删除） */
function CardEntryScreen(props: { cardId: number; refreshKey: number }) {
  const navigator = useNavigator();
  const app = useAppContext();
  const [card, setCard] = useState<CardDetailResponse | null>(null);
  const [resolving, setResolving] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [linksSheetOpen, setLinksSheetOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  // 关联写回后 bump：详情页内 LinksDisclosure 走自己的 detail 缓存，经 refreshKey 强制重拉同步
  const [linksRev, setLinksRev] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setResolving(true);
    tauri
      .getCardDetail(props.cardId)
      .then(result => {
        if (!cancelled) setCard(result);
      })
      .catch(error => {
        if (!cancelled) app.presentError(error, "卡片加载失败");
      })
      .finally(() => {
        if (!cancelled) setResolving(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.cardId]);

  // 协作绑定状态：有绑定时详情页原地切换为协作编辑（云端 Y.Doc 为真相源）；
  // onResume（refreshKey）与发起面板关闭后重查由 useContentCollabEntry 内部处理
  const collab = useContentCollabEntry(card?.contentId, {
    refreshKey: props.refreshKey,
    share: card
      ? {
          title: richTextPlainText(card.content).trim().slice(0, 40) || "未命名卡片",
          content: card.content,
          sourceType: "card",
          sourceId: card.id,
        }
      : undefined,
  });

  if (!card) {
    return (
      <div className="mobile-kb-screen bg-page fixed inset-0 z-50 grid place-items-center">
        {resolving ? (
          <div className="card w-48 space-y-3 p-5">
            <div className="bg-input h-4 w-2/5 animate-pulse rounded" />
            <div className="bg-input h-4 w-4/5 animate-pulse rounded" />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => navigator.goBack("ui")}
            className="bg-input text-ink-2 rounded-full px-5 py-2.5 text-sm font-semibold"
          >
            加载失败，点按返回
          </button>
        )}
      </div>
    );
  }

  const handleLinksConfirm = async (next: number[]) => {
    setLinksSheetOpen(false);
    const current = card.links;
    const unchanged = next.length === current.length && next.every(id => current.includes(id));
    if (unchanged) {
      return;
    }
    try {
      const saved = await tauri.updateCardLinks({ id: card.id, links: next });
      setCard(prev => (prev ? { ...prev, links: saved.links } : prev));
      setLinksRev(value => value + 1);
    } catch (error) {
      app.presentError(error, "关联保存失败");
    }
  };

  return (
    <>
      <ContentDetailPage
        contentId={card.contentId}
        refreshKey={props.refreshKey + linksRev}
        collaboration={collab.collaboration}
        onCollaborationEnded={collab.onCollaborationEnded}
        headerRight={
          <PageHeaderButton
            icon={<Ellipsis size={17} />}
            aria-label="卡片操作"
            onClick={() => setMenuOpen(true)}
          />
        }
        onBack={() => navigator.goBack("ui")}
        onError={(error, fallback) => app.presentError(error, fallback)}
      />

      <ActionSheet
        open={menuOpen}
        kind="卡片"
        onClose={() => setMenuOpen(false)}
        items={[
          {
            label: "关联卡片",
            icon: <Link2 size={18} />,
            tone: "lilac",
            trailing: <ChevronRight strokeWidth={2} />,
            onClick: () => setLinksSheetOpen(true),
          },
          {
            label: "复制正文",
            icon: <Copy size={18} />,
            tone: "sage",
            onClick: () => {
              void window.navigator.clipboard
                .writeText(richTextPlainText(card.content))
                .then(() => toast({ type: "success", text: "已复制正文" }))
                .catch(() => toast({ type: "warning", text: "复制失败" }));
            },
          },
          {
            label: "加入闪卡",
            icon: <Layers size={18} />,
            tone: "lilac",
            onClick: () => {
              setMenuOpen(false);
              navigator.push("flashcardCreate", {
                deckId: -1,
                refContentId: card.contentId,
                refTitle: richTextPlainText(card.content).trim().slice(0, 40) || "未命名卡片",
              });
            },
          },
          ...collab.menuItems,
          {
            label: "删除卡片",
            danger: true,
            icon: <Trash2 size={18} />,
            onClick: () => setDeleteOpen(true),
          },
        ]}
      />

      <CardLinksSheet
        open={linksSheetOpen}
        selfCardId={card.id}
        selected={card.links}
        onClose={() => setLinksSheetOpen(false)}
        onConfirm={next => void handleLinksConfirm(next)}
      />

      <MobileConfirmDialog
        open={deleteOpen}
        title="确定删除这个卡片？"
        cancelText="取消"
        confirmText="确认"
        danger
        loading={deleteLoading}
        onCancel={() => {
          if (deleteLoading) return;
          setDeleteOpen(false);
        }}
        onConfirm={async () => {
          setDeleteLoading(true);
          try {
            await app.handleDeleteCard(props.cardId);
            setDeleteOpen(false);
            navigator.goBack("ui");
          } catch {
            // 失败提示由 handleDeleteCard 统一处理
          } finally {
            setDeleteLoading(false);
          }
        }}
      />

      {collab.shareSheet}
    </>
  );
}

function ContentDetailScreen() {
  const { params } = usePage<ContentDetailParams>();
  const navigator = useNavigator();
  const app = useAppContext();
  // 从下层页面返回时重拉详情：双向关联在对侧卡片上写入时，本页缓存无感知
  const [refreshRev, setRefreshRev] = useState(0);
  usePageLifecycle({
    onResume: () => setRefreshRev(value => value + 1),
  });
  // contentId 直入（日记 / 文章内链等）同样接协作绑定：绑定即原地协作编辑（无发起面板入口）
  const collab = useContentCollabEntry(params.contentId ?? undefined, {
    refreshKey: refreshRev,
  });

  if (params.cardId && params.contentId == null) {
    return <CardEntryScreen cardId={params.cardId} refreshKey={refreshRev} />;
  }

  return (
    <ContentDetailPage
      contentId={params.contentId ?? 0}
      contentTitle={params.contentTitle}
      contentType={params.contentType}
      refId={params.refId}
      diaryDate={params.diaryDate}
      refreshKey={refreshRev}
      collaboration={collab.collaboration}
      onCollaborationEnded={() => {
        collab.onCollaborationEnded();
        setRefreshRev(value => value + 1);
      }}
      onSaved={saved => {
        if (!params.fromDiary) {
          return;
        }
        useDiaryStore.getState().syncEntryContentByContentId({
          contentId: params.contentId ?? 0,
          content: saved.content,
          wordCount: saved.count,
          updateTime: saved.updateTime,
        });
      }}
      onBack={() => navigator.goBack("ui")}
      onError={(error, fallback) => {
        app.presentError(error, fallback);
      }}
    />
  );
}

export default definePage({
  key: "contentDetail",
  // 同一内容详情在栈内只保留一份，重复打开 = 移到顶并刷新参数
  match: "params",
  getId: p => (p.contentId != null ? `c${p.contentId}` : `k${p.cardId}`),
  params: contentDetailSchema.schema,
  component: ContentDetailScreen,
});
