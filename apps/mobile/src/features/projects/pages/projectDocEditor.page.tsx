import { useMobilePluginActionItems } from "../../../app/plugins/action-menu";
import { useEffect, useMemo, useRef, useState } from "react";
import { Ellipsis, FilePlus2, FolderKanban, Trash2 } from "lucide-react";
import { PageHeaderButton } from "../../../components/PageHeader";
import { ContentDetailPage, type ContentDetailActions } from "../../cards/ContentDetailPage";
import {
  blockSelectionMenuItem,
  outlineMenuItem,
} from "../../cards/blockSelection/blockSelectionMenuItem";
import { ActionSheet } from "../../../components/ActionSheet";
import { BottomSheet } from "../../../components/BottomSheet";
import { MobileConfirmDialog } from "../../../components/MobileConfirmDialog";
import { toast } from "../../../components/toast";
import { useAppContext } from "../../../app/AppContext";
import { useQuery } from "@tanstack/react-query";
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
  useInvalidateProjects,
  useProjectItemCreate,
  useProjectItemDelete,
  useProjectItemsQuery,
} from "../queries";
import { clampText, richTextPlainText } from "../../../utils/richTextText";

const projectDocEditorSchema = createPageSchema({
  itemId: paramNumber(),
  block: paramOptional(paramNumber()),
  locationRequestId: paramOptional(paramString()),
  projectTitle: paramString(""),
});
type ProjectDocEditorParams = typeof projectDocEditorSchema.type;

function ProjectDocEditorScreen() {
  const { params } = usePage<ProjectDocEditorParams>();
  const navigator = useNavigator();
  const app = useAppContext();
  const invalidate = useInvalidateProjects();
  const { data: items } = useProjectItemsQuery();
  const [menuOpen, setMenuOpen] = useState(false);
  const [addChildOpen, setAddChildOpen] = useState(false);
  const [addChildTitle, setAddChildTitle] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const detailActionsRef = useRef<ContentDetailActions>(null);
  const deleteItem = useProjectItemDelete();
  const createItem = useProjectItemCreate();

  const item = useMemo(
    () => (items ?? []).find(entry => entry.id === params.itemId) ?? null,
    [items, params.itemId]
  );
  const refType = item?.refType;
  const refId = item?.refId ?? 0;
  const { data: source } = useQuery({
    queryKey: ["project-action-source", refType, refId],
    enabled: (refType === "card" || refType === "article") && refId > 0,
    queryFn: async () => {
      if (refType === "card") {
        const card = await tauri.getCardDetail(refId);
        return {
          kind: "card" as const,
          id: String(card.id),
          createTime: card.createTime,
          title:
            clampText(richTextPlainText(card.content).split("\n")[0]?.trim() ?? "", 24) ||
            `卡片 #${card.id}`,
        };
      }
      const article = await tauri.articleGet(refId);
      return {
        kind: "article" as const,
        id: String(article.id),
        createTime: article.createTime,
        title: article.title.trim() || `内容 #${article.id}`,
      };
    },
  });
  const sourceLabel = source?.title;
  const pluginActionItems = useMobilePluginActionItems(
    refType
      ? (source ?? null)
      : item?.contentId && item.projectItemType === "document"
        ? { kind: "document", id: String(item.id), createTime: item.createTime }
        : null
  );

  // onResume 重拉正文（协作结束后本地内容更新）；绑定刷新由 useContentCollabEntry 内部处理
  const [refreshRev, setRefreshRev] = useState(0);
  usePageLifecycle({ onResume: () => setRefreshRev(value => value + 1) });
  const collab = useContentCollabEntry(item?.contentId ?? undefined, {
    refreshKey: refreshRev,
    share: { title: item?.title ?? "", sourceType: "project-item", sourceId: params.itemId },
  });

  // 离开编辑器时刷新项目列表（字数 / 更新时间）
  useEffect(() => {
    return () => {
      invalidate();
    };
  }, [invalidate]);

  // 给当前文档挂子级（编辑页 ⋯ 菜单入口）
  const handleCreateChild = () => {
    const title = addChildTitle.trim();
    if (!title) {
      toast({ type: "warning", text: "给文档起个名字" });
      return;
    }
    createItem.mutate(
      {
        projectId: item?.projects[0] ?? 0,
        parentId: params.itemId,
        title,
        itemType: "document",
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
        contentId={item.contentId ?? 0}
        contentTitle={item.title}
        refreshKey={refreshRev}
        actionsRef={detailActionsRef}
        contextEntity={{ kind: "project-item", id: params.itemId }}
        aiContext={{ entityType: "project-item", entityId: params.itemId, title: item.title }}
        collaboration={collab.collaboration}
        onCollaborationEnded={() => {
          collab.onCollaborationEnded();
          setRefreshRev(value => value + 1);
        }}
        titleEditable
        contentType="项目文档"
        tags={item.tags ?? []}
        onTagsCommit={async tags => {
          await tauri.projectItemUpdate({ id: params.itemId, tags });
          invalidate();
        }}
        contentTypeBadge={{
          icon: FolderKanban,
          className: "bg-tag-4-soft text-tag-4",
        }}
        sourceRef={
          item.refType
            ? {
                label: sourceLabel || "…",
                typeLabel: item.refType === "card" ? "卡片" : "文章",
                toneClass: "text-tag-4",
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
        onTitleCommit={title => {
          tauri
            .projectItemUpdate({ id: params.itemId, title })
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
          className="input-base mb-3.5 w-full px-4 py-3"
        />
        <button
          type="button"
          disabled={createItem.isPending}
          onClick={handleCreateChild}
          className="bg-tag-1-soft text-tag-1 flex w-full items-center justify-center gap-2 rounded-full py-3.5 text-[14.5px] font-bold transition-transform active:scale-[0.97] disabled:opacity-60"
        >
          <FilePlus2 size={17} strokeWidth={2.2} />
          新建子文档
        </button>
      </BottomSheet>

      <ActionSheet
        open={menuOpen}
        title={item.title}
        kind="项目节点"
        onClose={() => setMenuOpen(false)}
        items={[
          blockSelectionMenuItem(() => detailActionsRef.current?.enterBlockSelection()),
          outlineMenuItem(() => detailActionsRef.current?.openOutline()),
          {
            label: "添加子文档",
            icon: <FilePlus2 size={18} />,
            tone: "sky",
            onClick: () => setAddChildOpen(true),
          },
          ...collab.menuItems,
          ...pluginActionItems,
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
  key: "projectDocEditor",
  match: "params",
  getId: p => String(p.itemId),
  params: projectDocEditorSchema.schema,
  component: ProjectDocEditorScreen,
});
