import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PluginPageHandle, PluginPageProps } from "@tau/plugins";
import { Button, Dialog, DialogBody, Panel, Switch } from "@tau/ui";

export function Overview({ context, details }: PluginPageProps & { details: PluginPageHandle }) {
  const client = useQueryClient();
  const [help, setHelp] = useState(false);
  const [navigationError, setNavigationError] = useState("");
  const key = ["plugin-example", context.workspaceId, context.pluginId, "compact"];
  const preference = useQuery({
    queryKey: key,
    queryFn: async () => (await context.storage.get("compact")) === true,
    staleTime: 0,
  });
  const save = useMutation({
    mutationFn: (value: boolean) => context.storage.set("compact", value),
    onSuccess: (_result, value) => {
      if (!context.signal.aborted) client.setQueryData(key, value);
    },
  });
  const openDetail = (book: string) => {
    setNavigationError("");
    void details
      .open({ book })
      .catch(error => setNavigationError(error instanceof Error ? error.message : "打开失败"));
  };
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <h1 className="text-tau-title text-ink-1">插件页面示例</h1>
      <Panel>
        <p className="text-tau-body text-ink-2 mb-4">
          页面和命令通过插件 API 注册，控件使用公共 UI。
        </p>
        <div className="flex items-center gap-3">
          <Switch
            aria-label="紧凑排布"
            checked={preference.data === true}
            disabled={preference.isPending || preference.isError || save.isPending}
            onCheckedChange={value => save.mutate(value)}
          />
          <span className="text-tau-body text-ink-1">紧凑排布（本机偏好，保存成功后生效）</span>
        </div>
        {preference.isError && (
          <Button variant="ghost" onClick={() => void preference.refetch()}>
            重新读取偏好
          </Button>
        )}
        {(preference.error || save.error || navigationError) && (
          <p role="alert" className="text-danger text-tau-body mt-3">
            {navigationError || preference.error?.message || save.error?.message}
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => openDetail("A")}>打开条目 A</Button>
          <Button variant="secondary" onClick={() => openDetail("B")}>
            打开条目 B
          </Button>
          <Button variant="ghost" onClick={() => setHelp(true)}>
            查看说明
          </Button>
        </div>
      </Panel>
      <Dialog open={help} onOpenChange={setHelp} title="示例说明">
        <DialogBody>
          <p className="text-tau-body text-ink-2">
            偏好按插件与工作区保存。详情页按条目去重，返回和前进由应用导航处理。
          </p>
        </DialogBody>
      </Dialog>
    </div>
  );
}
export function Details({ context, params }: PluginPageProps) {
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <h1 className="text-tau-title text-ink-1">条目 {String(params.book ?? "未指定")}</h1>
      <Panel>
        <p className="text-tau-body text-ink-2">
          当前工作区：{context.workspaceId}。这是参数化页面示例，不创建业务数据。
        </p>
      </Panel>
    </div>
  );
}
