import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Textarea, ConfirmDialog } from "@tau/ui";
import { useMobilePlugins } from "../../app/plugins/context";
import {
  MOBILE_PLUGIN_QUERY,
  readMobilePlugins,
  clearMobilePluginData,
  installMobilePlugin,
  setMobilePluginEnabled,
  removeMobilePlugin,
  restoreMobilePlugin,
  cancelMobilePlugin,
  type PluginInstallSource,
} from "../../services/plugins";
import { useNavigator } from "../../router";
import { PluginPageShell } from "./PluginPageView";

export function PluginManager() {
  const runtime = useMobilePlugins();
  const navigator = useNavigator();
  const client = useQueryClient();
  const query = useQuery({ queryKey: MOBILE_PLUGIN_QUERY, queryFn: readMobilePlugins });
  const [source, setSource] = useState("");
  const [clearId, setClearId] = useState<string | null>(null);
  const [installId, setInstallId] = useState("");
  const mutation = useMutation({
    mutationFn: (action: () => Promise<unknown>) => action(),
    onSuccess: () => client.invalidateQueries({ queryKey: MOBILE_PLUGIN_QUERY, exact: true }),
  });
  const act = (action: () => Promise<unknown>) => mutation.mutate(action);
  return (
    <PluginPageShell title="插件管理">
      <p className="text-ink-2 mb-4">
        安装与启停在重新打开应用后生效。请先保存正文；代码回退不会回退插件数据。
      </p>
      {query.error && <p role="alert">{String(query.error)}</p>}
      {mutation.error && <p role="alert">{String(mutation.error)}</p>}
      {mutation.isSuccess && <p role="status">已保存。重新打开应用后生效。</p>}
      {query.data?.packages.map(item => (
        <section key={item.id} className="bg-surface mb-4 rounded-2xl p-4">
          <h2>{item.artifact?.manifest.name ?? item.id}</h2>
          {item.artifact?.manifest.editor && (
            <p className="text-ink-2">移动搜索暂不检索插件块内部源码；正文及导出仍保留原内容。</p>
          )}
          <p>
            {item.pending ? "有版本等待下次启动" : item.artifact?.manifest.version} · 下次启动
            {item.enabled ? "启用" : "停用"}
          </p>
          {(item.error || runtime?.errors.get(item.id)) && (
            <p role="alert">{item.error || runtime?.errors.get(item.id)}</p>
          )}
          {import.meta.env.DEV && (
            <div className="my-3 flex flex-wrap gap-2">
              <Button
                disabled={mutation.isPending}
                onClick={() =>
                  act(() => setMobilePluginEnabled(item.id, item.error ? false : !item.enabled))
                }
              >
                {item.error || item.enabled ? "停用" : "启用"}
              </Button>
              <Button
                disabled={mutation.isPending || runtime?.isPluginActive(item.id)}
                onClick={() => act(() => removeMobilePlugin(item.id))}
              >
                卸载并保留数据
              </Button>
              <Button
                disabled={mutation.isPending || !runtime || runtime.isPluginActive(item.id)}
                onClick={() => setClearId(item.id)}
              >
                清除此工作区的数据
              </Button>
              {item.pending && (
                <Button
                  disabled={mutation.isPending}
                  onClick={() => act(() => cancelMobilePlugin(item.id))}
                >
                  取消待生效更新
                </Button>
              )}
              {item.hasBackup && (
                <Button
                  disabled={mutation.isPending || runtime?.isPluginActive(item.id)}
                  onClick={() => act(() => restoreMobilePlugin(item.id))}
                >
                  恢复备份代码
                </Button>
              )}
            </div>
          )}
          {[...(runtime?.settings.entries() ?? [])]
            .filter(
              ([, entry]) => entry.context.pluginId === item.id && runtime?.active(entry.context)
            )
            .map(([id, entry]) => (
              <Button
                key={id}
                variant="ghost"
                onClick={() => navigator.push("pluginSettings", { id })}
              >
                {entry.definition.title}
              </Button>
            ))}
        </section>
      ))}
      {import.meta.env.DEV && query.data?.development && (
        <section className="my-4">
          <h2 className="mb-2 font-semibold">受控开发安装</h2>
          <p className="text-ink-2 mb-2">粘贴包含 id、version、url、sha256、size 的开发包描述。</p>
          <Textarea
            value={source}
            onChange={event => setSource(event.target.value)}
            aria-label="开发包描述"
          />
          <Button
            disabled={mutation.isPending || !runtime}
            onClick={() =>
              act(async () => {
                if (!runtime) throw new Error("插件宿主未就绪");
                const descriptor = JSON.parse(source) as PluginInstallSource;
                setInstallId(descriptor.id);
                try {
                  await installMobilePlugin(
                    descriptor,
                    runtime.environment.getSnapshot(),
                    runtime.appVersion
                  );
                } finally {
                  setInstallId("");
                }
              })
            }
          >
            校验并安装
          </Button>
          {installId && (
            <Button onClick={() => void cancelMobilePlugin(installId)}>取消下载</Button>
          )}
        </section>
      )}
      <ConfirmDialog
        open={clearId !== null}
        title="清除此工作区的插件数据"
        description="只清除当前工作区的插件私有存储，无法撤销；其他工作区与正文不受影响。"
        danger
        onOpenChange={open => {
          if (!open) setClearId(null);
        }}
        onConfirm={async () => {
          if (!runtime || !clearId) return;
          await mutation.mutateAsync(() => clearMobilePluginData(runtime.workspaceId, clearId));
          setClearId(null);
        }}
      />
    </PluginPageShell>
  );
}
