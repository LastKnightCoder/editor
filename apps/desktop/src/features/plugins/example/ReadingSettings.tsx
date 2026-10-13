import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PluginSettingsProps } from "@tau/plugins";
import { Button, Dialog, DialogBody, Panel, Switch } from "@tau/ui";

export function ReadingSettings({ context }: PluginSettingsProps) {
  const [help, setHelp] = useState(false);
  const client = useQueryClient();
  const key = ["reading-settings", context.workspaceId, context.pluginId];
  const preference = useQuery({
    queryKey: key,
    queryFn: async () => {
      const value = await context.storage.get("reading-hints");
      if (value !== undefined && typeof value !== "boolean")
        throw new Error("已保存的阅读设置格式无效，请检查插件数据");
      return value ?? false;
    },
  });
  const save = useMutation({
    mutationFn: (value: boolean) => context.storage.set("reading-hints", value),
    onSuccess: (_result, value) => {
      if (!context.signal.aborted) client.setQueryData(key, value);
    },
  });
  return (
    <Panel>
      <div className="flex items-center gap-3">
        <Switch
          aria-label="启用阅读提示"
          checked={preference.data === true}
          disabled={preference.isPending || preference.isError || save.isPending}
          onCheckedChange={value => save.mutate(value)}
        />
        <span className="text-tau-body text-ink-1">启用阅读提示</span>
      </div>
      <p role="status" className="text-tau-meta text-ink-2 mt-3">
        {save.isPending
          ? "正在保存…"
          : save.isSuccess
            ? "已保存"
            : preference.isPending
              ? "正在读取设置…"
              : "保存成功后生效"}
      </p>
      {(preference.error || save.error) && (
        <p role="alert" className="text-tau-body text-danger mt-3">
          {preference.error?.message || save.error?.message}
        </p>
      )}
      {preference.isError && (
        <Button variant="ghost" onClick={() => void preference.refetch()}>
          重新读取设置
        </Button>
      )}
      <Button variant="ghost" onClick={() => setHelp(true)}>
        设置说明
      </Button>
      <Dialog open={help} onOpenChange={setHelp} title="插件设置说明">
        <DialogBody>
          设置仅保存在本机当前工作区。停用插件会关闭此分区，但不会删除已保存的偏好。
        </DialogBody>
      </Dialog>
    </Panel>
  );
}
