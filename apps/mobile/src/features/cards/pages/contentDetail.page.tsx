import { useEffect, useState } from "react";
import { Copy, Ellipsis, Tags, Trash2 } from "lucide-react";
import { ContentDetailPage } from "../ContentDetailPage";
import { PageHeaderButton } from "../../../components/PageHeader";
import { ActionSheet } from "../../../components/ActionSheet";
import { MobileConfirmDialog } from "../../../components/MobileConfirmDialog";
import { toast } from "../../../components/toast";
import { useDiaryStore } from "../../diary/store/useDiaryStore";
import { useAppContext } from "../../../app/AppContext";
import * as tauri from "../../../services/tauri";
import type { CardDetailResponse } from "../../../types";
import { richTextPlainText } from "../../../utils/richTextText";
import {
  CARD_CATEGORY_OPTIONS,
  cardCategoryIcon,
  cardCategoryLabel,
  cardCategoryTagClass,
} from "../cardCategory";
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

/** 卡片入口：cardId → contentId / 分类解析 + ⋯ 操作（修改类型 / 复制正文 / 删除） */
function CardEntryScreen(props: { cardId: number; refreshKey: number }) {
  const navigator = useNavigator();
  const app = useAppContext();
  const [card, setCard] = useState<CardDetailResponse | null>(null);
  const [resolving, setResolving] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [categorySheetOpen, setCategorySheetOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

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

  return (
    <>
      <ContentDetailPage
        contentId={card.contentId}
        contentType={cardCategoryLabel(card.category)}
        contentTypeBadge={{
          icon: cardCategoryIcon(card.category),
          className: cardCategoryTagClass(card.category),
        }}
        refreshKey={props.refreshKey}
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
        title={cardCategoryLabel(card.category)}
        kind="卡片"
        onClose={() => setMenuOpen(false)}
        items={[
          {
            label: "修改类型",
            icon: <Tags size={18} />,
            tone: "sky",
            onClick: () => setCategorySheetOpen(true),
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
            label: "删除卡片",
            danger: true,
            icon: <Trash2 size={18} />,
            onClick: () => setDeleteOpen(true),
          },
        ]}
      />

      <ActionSheet
        open={categorySheetOpen}
        title="修改卡片类型"
        items={CARD_CATEGORY_OPTIONS.map(option => ({
          label: option.label,
          onClick: async () => {
            await app.handleUpdateCardCategory(props.cardId, option.value);
            setCard(prev => (prev ? { ...prev, category: option.value } : prev));
          },
        }))}
        onClose={() => setCategorySheetOpen(false)}
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
