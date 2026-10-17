/* eslint-disable react-refresh/only-export-components -- 插件入口默认导出插件定义。 */
import { useState } from "react";
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  definePlugin,
  SIDEBAR_GROUPS,
  type PluginPageProps,
  type PluginSettingsProps,
} from "@tau/plugins";
import { Button, Panel, Dialog, DialogBody } from "@tau/ui";
import "./styles.css";
import { CounterIcon } from "./CounterIcon";

declare const __PLUGIN_META__: { id: string; name: string; version: string };

function Counter({ context }: PluginSettingsProps) {
  const client = useQueryClient();
  const key = [context.pluginId, "count"];
  const query = useQuery({
    queryKey: key,
    queryFn: async () => {
      const value = await context.storage.get("count");
      if (value !== undefined && typeof value !== "number") throw new Error("计数数据格式无效");
      return value ?? 0;
    },
  });
  const save = useMutation({
    mutationFn: async () => {
      const next = (query.data ?? 0) + 1;
      await context.storage.set("count", next);
      return next;
    },
    onSuccess: value => {
      if (!context.signal.aborted) client.setQueryData(key, value);
    },
  });
  const [help, setHelp] = useState(false);
  return (
    <Panel className="example-counter">
      <p role="status">{query.isPending ? "正在读取…" : `已保存计数：${query.data}`}</p>
      <Button
        disabled={query.isPending || query.isError || save.isPending}
        onClick={() => save.mutate()}
      >
        增加并保存
      </Button>
      <Button variant="ghost" onClick={() => setHelp(true)}>
        说明
      </Button>
      {(query.error || save.error) && (
        <p role="alert">{query.error?.message ?? save.error?.message}</p>
      )}
      {query.isError && <Button onClick={() => void query.refetch()}>重新读取</Button>}
      <Dialog open={help} onOpenChange={setHelp} title="使用说明">
        <DialogBody>设置保存在当前工作区，停用后保留。</DialogBody>
      </Dialog>
    </Panel>
  );
}

function Settings(props: PluginSettingsProps) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } })
  );
  return (
    <QueryClientProvider client={client}>
      <Counter {...props} />
    </QueryClientProvider>
  );
}

function Page({ context }: PluginPageProps) {
  return (
    <section>
      <h1>计数器</h1>
      <Settings context={context} />
    </section>
  );
}

export default definePlugin({
  ...__PLUGIN_META__,
  create: () => ({
    activate(context) {
      const page = context.pages.register({ id: "counter", title: "计数器", component: Page });
      context.sidebar.registerItem({
        id: "counter",
        title: "计数器",
        icon: CounterIcon,
        group: SIDEBAR_GROUPS.daily,
        page,
      });
      context.settings.register({ id: "preferences", title: "计数设置", component: Settings });
      context.commands.register({
        id: "open",
        title: "打开计数器",
        run: async () => {
          await page.open();
          return null;
        },
      });
    },
  }),
});
