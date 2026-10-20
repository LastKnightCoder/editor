import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { Editor } from "@tau/editor";
import { Button, ErrorBoundary } from "@tau/ui";
import type { PluginPermission } from "@tau/plugins";
import type { ContentEditorProps, ContentPreviewProps } from "@tau/plugins/components";
import { contentPermissions } from "@tau/plugins/host";
import ContentEditor from "@/components/ContentEditor";
import { getContentKit } from "@/services/editorKit";
import { openPage } from "@/services/page-navigation";
import useSettingStore from "@/stores/useSettingStore";
import { defaultContentEventBus } from "@/utils/event-bus/content-event-bus";
import { useDesktopPlugins } from "./context";
import { usePluginComponentScope } from "./content-components";
import { resolvePluginContentTarget, type PluginContentTarget } from "./content-target";
import { PLUGIN_DETAIL_KEY } from "./runtime";

type Mode = "read" | "write";
type Access =
  | { status: "loading" | "outside" | "missing" }
  | { status: "error"; message: string }
  | { status: "prompt"; permission: PluginPermission }
  | { status: "denied" }
  | { status: "granted"; target: PluginContentTarget };

const noopSubscribe = () => () => undefined;
const zero = () => 0;

/** 组件挂载只查询授权、不弹窗；未决定时由用户点「允许访问」再询问，避免列表里每张卡各弹一次 */
function useContentAccess(contentRef: string, mode: Mode) {
  const context = usePluginComponentScope();
  const broker = useDesktopPlugins()?.permissions;
  const revision = useSyncExternalStore(
    broker?.subscribe ?? noopSubscribe,
    broker?.getRevision ?? zero
  );
  const databaseName = useSettingStore(state => state.setting.database.active);
  const queryClient = useQueryClient();
  const targetKey = useMemo(
    () => ["plugins", "content-target", databaseName, context?.pluginId, contentRef],
    [databaseName, context?.pluginId, contentRef]
  );
  const target = useQuery({
    queryKey: targetKey,
    queryFn: ({ signal }) =>
      resolvePluginContentTarget(databaseName, context?.pluginId ?? "", contentRef, signal),
    enabled: Boolean(context),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  const contentId = target.data?.contentId;
  // 预览读的是主库快照，正文落库后按 contentId 重读
  useEffect(() => {
    if (!contentId) return;
    return defaultContentEventBus.subscribeToContent("content:updated", contentId, () => {
      void queryClient.invalidateQueries({ queryKey: targetKey });
    });
  }, [contentId, queryClient, targetKey]);
  const candidates = useMemo(
    () => (target.data ? contentPermissions(target.data.owners, mode) : []),
    [target.data, mode]
  );
  const states = useQuery({
    queryKey: ["plugins", "content-access", context?.pluginId, candidates, revision],
    queryFn: () =>
      Promise.all(candidates.map(permission => context?.permissions.query(permission) ?? "denied")),
    enabled: Boolean(context && candidates.length),
    staleTime: Infinity,
  });
  const [requesting, setRequesting] = useState(false);

  let access: Access;
  if (!context) access = { status: "outside" };
  else if (target.error) access = { status: "error", message: String(target.error) };
  else if (target.isPending) access = { status: "loading" };
  else if (!target.data) access = { status: "missing" };
  // 插件自己的内容不需要业务权限
  else if (target.data.own) access = { status: "granted", target: target.data };
  else if (states.error) access = { status: "error", message: String(states.error) };
  else if (!states.data) access = { status: "loading" };
  else if (states.data.includes("granted")) access = { status: "granted", target: target.data };
  else {
    const index = states.data.indexOf("prompt");
    access = index < 0 ? { status: "denied" } : { status: "prompt", permission: candidates[index] };
  }

  const request = async () => {
    if (access.status !== "prompt" || !context) return;
    setRequesting(true);
    try {
      await context.permissions.request([access.permission]);
    } catch (error) {
      console.error("申请插件权限失败", error);
    } finally {
      setRequesting(false);
      void states.refetch();
    }
  };
  return { access, context, request, requesting };
}

function AccessNotice({
  access,
  mode,
  context,
  request,
  requesting,
}: ReturnType<typeof useContentAccess> & { mode: Mode }) {
  if (access.status === "loading" || access.status === "granted") return null;
  const verb = mode === "write" ? "编辑" : "查看";
  const message =
    access.status === "outside"
      ? "正文组件只能在插件页面中使用"
      : access.status === "missing"
        ? "内容不存在或已删除"
        : access.status === "error"
          ? `无法读取这段内容：${access.message}`
          : access.status === "prompt"
            ? `插件需要你的允许才能${verb}这段内容`
            : `插件没有获准${verb}这段内容，可在插件详情页的「权限」中修改`;
  return (
    <div
      role={access.status === "error" ? "alert" : "status"}
      className="bg-surface border-line-1 text-tau-meta text-ink-2 rounded-tau-md flex items-center gap-3 border px-3 py-2.5"
    >
      <Lock className="text-ink-3 size-4 shrink-0" strokeWidth={1.75} aria-hidden />
      <span className="min-w-0 flex-1">{message}</span>
      {access.status === "prompt" && (
        <Button size="sm" variant="soft" loading={requesting} onClick={() => void request()}>
          允许访问
        </Button>
      )}
      {access.status === "denied" && context && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            void openPage(PLUGIN_DETAIL_KEY, { pluginId: context.pluginId, tab: "permissions" })
          }
        >
          查看权限
        </Button>
      )}
    </div>
  );
}

export function PluginContentEditor({
  contentRef,
  readonly = false,
  placeholder,
  at,
}: ContentEditorProps) {
  const mode: Mode = readonly ? "read" : "write";
  const state = useContentAccess(contentRef, mode);
  if (state.access.status !== "granted") return <AccessNotice {...state} mode={mode} />;
  const { contentId, owner } = state.access.target;
  return (
    <ErrorBoundary>
      <ContentEditor
        contentId={contentId}
        // 插件自有内容没有宿主实体：按通用正文协作，不登记 AI 编辑身份
        source={
          owner
            ? { sourceType: owner.sourceType, sourceId: owner.id }
            : { sourceType: "content", sourceId: contentId }
        }
        {...(readonly || !owner
          ? {}
          : { editingContext: { entityType: owner.sourceType, entityId: owner.id } })}
        readonly={readonly}
        {...(placeholder ? { placeHolder: placeholder } : {})}
        {...(typeof at === "string" && at ? { at } : {})}
      />
    </ErrorBoundary>
  );
}

export function PluginContentPreview({ contentRef, maxBlocks = 3 }: ContentPreviewProps) {
  const state = useContentAccess(contentRef, "read");
  const nodes = state.access.status === "granted" ? state.access.target.nodes : null;
  const blocks = Number.isFinite(maxBlocks) && maxBlocks > 0 ? Math.floor(maxBlocks) : 3;
  const preview = useMemo(() => nodes?.slice(0, blocks) ?? [], [nodes, blocks]);
  // 只读 Editor 的 initValue 只在挂载时生效，摘要变化时重建
  const revision = useMemo(() => JSON.stringify(preview), [preview]);
  if (!nodes) return <AccessNotice {...state} mode="read" />;
  return (
    <ErrorBoundary>
      <Editor
        kit={getContentKit()}
        key={revision}
        readonly
        initValue={preview.length ? preview : undefined}
      />
    </ErrorBoundary>
  );
}
