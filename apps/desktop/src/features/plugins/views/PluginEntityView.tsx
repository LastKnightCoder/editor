import { useQuery } from "@tanstack/react-query";
import { Button, Panel } from "@tau/ui";
import ContentEditor from "@/components/ContentEditor";
import { ErrorState } from "@/components/ErrorState";
import { usePage, usePageBreadcrumb, usePageParams } from "@/page/PageProvider";
import { locatePluginEntity } from "@/commands/plugin-entities";
import { bindDatabaseCommands } from "@/services/command-context";
import { usePluginEntityAppearances, usePluginEntityKind } from "@/services/plugin-entity-kinds";
import useSettingStore from "@/stores/useSettingStore";
import { PLUGIN_DETAIL_KEY } from "@/app/plugins/runtime";
import { PLUGIN_ENTITY_PAGE_KEY } from "@/services/plugin-entity-kinds";

/** 插件不在运行时的只读查看：数据在主库，宿主始终能渲染正文；插件专属的块按未知节点保留 */
export function PluginEntityView() {
  const { id, at } = usePageParams<{ id: number; at?: string }>();
  const { navigator } = usePage();
  const databaseName = useSettingStore(state => state.setting.database.active);
  const query = useQuery({
    queryKey: ["plugins", "entity", databaseName, id],
    queryFn: () =>
      bindDatabaseCommands({ locatePluginEntity }, { databaseName }).locatePluginEntity(
        databaseName,
        id
      ),
    refetchOnWindowFocus: true,
  });
  const entity = query.data;
  const kind = usePluginEntityKind(entity?.pluginId, entity?.kind);
  // 插件停用后仍按它声明的类型名称呼这项内容
  const label = usePluginEntityAppearances()(entity?.pluginId, entity?.kind)?.label;
  usePageBreadcrumb(PLUGIN_ENTITY_PAGE_KEY, entity?.title || label || "插件内容");

  if (query.isError)
    return (
      <ErrorState
        error={query.error}
        title="读取内容失败"
        actions={[{ label: "重试", onClick: () => void query.refetch() }]}
      />
    );
  if (query.isPending) return null;
  if (!entity)
    return (
      <div className="mx-auto max-w-3xl p-6">
        <Panel>
          <p className="text-tau-body text-ink-2">这项内容已不存在。</p>
        </Panel>
      </div>
    );
  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-4 px-6 py-8">
      <div className="text-tau-meta text-ink-2 rounded-tau-md bg-hover flex items-center gap-3 px-3 py-2">
        <span className="min-w-0 flex-1">
          {kind
            ? `这是「${kind.label}」，可以回到插件中继续编辑。`
            : `${label ? `这是「${label}」，` : ""}创建它的插件已停用或已卸载，这里只能查看。`}
        </span>
        {kind ? (
          <Button size="sm" variant="soft" onClick={() => void kind.open(entity, at)}>
            在插件中打开
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => navigator.push(PLUGIN_DETAIL_KEY, { pluginId: entity.pluginId })}
          >
            查看插件
          </Button>
        )}
      </div>
      <h1 className="text-ink-1 text-[24px] font-semibold">{entity.title || "无标题"}</h1>
      <ContentEditor
        contentId={entity.contentId}
        source={{ sourceType: "content", sourceId: entity.contentId }}
        readonly
        {...(at ? { at } : {})}
      />
    </div>
  );
}
