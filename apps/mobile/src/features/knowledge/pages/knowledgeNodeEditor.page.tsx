// 知识库节点编辑页：打开即编辑（复用 ContentDetailPage）。
// 关联（卡片/文章引用）只在知识库详情树里管理，编辑页不再挂底部关联面板；
// ⋯ 菜单提供「添加子文档」——给当前文档挂子级的唯一入口。

import { useEffect, useMemo, useState } from "react";
import { Ellipsis, FilePlus2, Library, Trash2 } from "lucide-react";
import { PageHeaderButton } from "../../../components/PageHeader";
import { ContentDetailPage } from "../../cards/ContentDetailPage";
import { ActionSheet } from "../../../components/ActionSheet";
import { BottomSheet } from "../../../components/BottomSheet";
import { MobileConfirmDialog } from "../../../components/MobileConfirmDialog";
import { toast } from "../../../components/toast";
import { useAppContext } from "../../../app/AppContext";
import { useRefSourceLabel } from "../../../hooks/useRefSourceLabel";
import * as tauri from "../../../services/tauri";
import { useContentCollabEntry } from "../../collaboration/useContentCollabEntry";
import {
  createPageSchema,
  definePage,
  paramNumber,
  paramString,
  useNavigator,
  usePage,
  usePageLifecycle,
} from "../../../router";
import {
  useDocumentItemCreate,
  useDocumentItemDelete,
  useDocumentItemsQuery,
  useInvalidateKnowledge,
} from "../queries";
import { clampText } from "../../../utils/richTextText";

const knowledgeNodeEditorSchema = createPageSchema({
  itemId: paramNumber(),
  libraryTitle: paramString(""),
});
type KnowledgeNodeEditorParams = typeof knowledgeNodeEditorSchema.type;

function KnowledgeNodeEditorScreen() {
  const { params } = usePage<KnowledgeNodeEditorParams>();
  const navigator = useNavigator();
  const app = useAppContext();
  const invalidate = useInvalidateKnowledge();
  const { data: items } = useDocumentItemsQuery();
  const [menuOpen, setMenuOpen] = useState(false);
  const [addChildOpen, setAddChildOpen] = useState(false);
  const [addChildTitle, setAddChildTitle] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const createItem = useDocumentItemCreate();
  const deleteItem = useDocumentItemDelete();

  const item = useMemo(
    () => (items ?? []).find(entry => entry.id === params.itemId) ?? null,
    [items, params.itemId]
  );
  const sourceLabel = useRefSourceLabel(item?.refType ?? "", item?.refId ?? 0);

  // onResume 重拉正文（协作结束后本地内容更新）；绑定刷新由 useContentCollabEntry 内部处理
  const [refreshRev, setRefreshRev] = useState(0);
  usePageLifecycle({ onResume: () => setRefreshRev(value => value + 1) });
  const collab = useContentCollabEntry(item?.contentId ?? undefined, {
    refreshKey: refreshRev,
    share: { title: item?.title ?? "", sourceType: "document-item", sourceId: params.itemId },
  });

  useEffect(() => {
    return () => {
      invalidate();
    };
  }, [invalidate]);

  const handleCreateChild = () => {
    const title = addChildTitle.trim();
    if (!title) {
      toast({ type: "warning", text: "给文档起个名字" });
      return;
    }
    createItem.mutate(
      {
        documentId: item?.documents[0] ?? 0,
        parentId: params.itemId,
        title,
      },
      {
        onSuccess: () => {
          setAddChildOpen(false);
          setAddChildTitle("");
          toast({ type: "success", text: "已添加子文档" });
        },
        onError: error => app.presentError(error, "添加子文档失败"),
      }
    );
  };

  if (!item) {
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
        contentId={item.contentId ?? 0}
        contentTitle={item.title}
        titleEditable
        contentType="知识库"
        contentTypeBadge={{
          icon: Library,
          className: "bg-sky-soft text-sky",
        }}
        tags={item.tags}
        refreshKey={refreshRev}
        collaboration={collab.collaboration}
        onCollaborationEnded={() => {
          collab.onCollaborationEnded();
          setRefreshRev(value => value + 1);
        }}
        onTagsCommit={async next => {
          await tauri.documentItemUpdate({ id: params.itemId, tags: next });
          invalidate();
        }}
        sourceRef={
          item.refType
            ? {
                label: sourceLabel || "…",
                typeLabel: item.refType === "card" ? "卡片" : "文章",
                toneClass: "text-sky",
                onOpen: () => {
                  if (item.refType === "card") {
                    navigator.push("contentDetail", { cardId: item.refId });
                  } else {
                    navigator.push("articleEditor", { articleId: item.refId });
                  }
                },
              }
            : undefined
        }
        persistentToolbar
        onTitleCommit={title => {
          tauri
            .documentItemUpdate({ id: params.itemId, title })
            .then(() => invalidate())
            .catch(error => app.presentError(error, "标题保存失败"));
        }}
        headerRight={
          <PageHeaderButton
            icon={<Ellipsis size={17} />}
            aria-label="节点操作"
            onClick={() => setMenuOpen(true)}
          />
        }
        onBack={() => navigator.goBack("ui")}
        onError={(error, fallback) => app.presentError(error, fallback)}
      />

      <BottomSheet
        open={addChildOpen}
        title={`添加子文档到「${clampText(item.title, 12)}」`}
        onClose={() => setAddChildOpen(false)}
      >
        <input
          value={addChildTitle}
          onChange={event => setAddChildTitle(event.target.value)}
          placeholder="文档标题…"
          className="input-base mb-3.5 w-full px-4 py-3 text-[14.5px]"
        />
        <button
          type="button"
          disabled={createItem.isPending}
          onClick={handleCreateChild}
          className="bg-sage-soft text-sage flex w-full items-center justify-center gap-2 rounded-full py-3.5 text-[14.5px] font-bold transition-transform active:scale-[0.97] disabled:opacity-60"
        >
          <FilePlus2 size={17} strokeWidth={2.2} />
          新建子文档
        </button>
      </BottomSheet>

      <ActionSheet
        open={menuOpen}
        title={item.title}
        kind="知识节点"
        onClose={() => setMenuOpen(false)}
        items={[
          {
            label: "添加子文档",
            icon: <FilePlus2 size={18} />,
            tone: "sky",
            onClick: () => setAddChildOpen(true),
          },
          ...collab.menuItems,
          {
            label: "删除节点",
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
        title="删除节点"
        description={`「${clampText(item.title, 18)}」及其子节点将被删除。`}
        danger
        loading={deleteItem.isPending}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => {
          setDeleteOpen(false);
          deleteItem.mutate(item.id);
          toast({ type: "success", text: "已删除节点" });
          navigator.goBack("ui");
        }}
      />
    </>
  );
}

export default definePage({
  key: "knowledgeNodeEditor",
  match: "params",
  getId: p => String(p.itemId),
  params: knowledgeNodeEditorSchema.schema,
  component: KnowledgeNodeEditorScreen,
});
