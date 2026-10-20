import { useState } from "react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { definePlugin, type PluginSettingsProps } from "@tau/plugins";
import { Button, Panel } from "@tau/ui";

declare const __PLUGIN_META__: { id: string; name: string; version: string };

function SystemInfo({ context }: PluginSettingsProps) {
  const query = useQuery({
    queryKey: [context.pluginId, "system-info"],
    queryFn: ({ signal }) => context.backend.call("system.info", null, { signal }),
    retry: false,
  });
  return (
    <Panel>
      <p>请先在本插件的「本机后台」中授予运行权限。</p>
      {query.isPending && <p role="status">正在读取系统信息…</p>}
      {query.error && <p role="alert">{query.error.message}</p>}
      {query.data && <pre>{JSON.stringify(query.data, null, 2)}</pre>}
      <Button onClick={() => void query.refetch()} disabled={query.isFetching}>
        重新读取
      </Button>
    </Panel>
  );
}
function Settings(props: PluginSettingsProps) {
  const [client] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={client}>
      <SystemInfo {...props} />
    </QueryClientProvider>
  );
}
export default definePlugin({
  ...__PLUGIN_META__,
  create: () => ({
    activate(context) {
      context.settings.register({ id: "system", title: "系统信息", component: Settings });
    },
  }),
});
