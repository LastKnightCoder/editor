import { useEffect, useState } from "react";
import { definePlugin, usePluginEnvironment, type PluginPageProps } from "@tau/plugins";

function CounterPage({ context, pageContext }: PluginPageProps) {
  const environment = usePluginEnvironment();
  const [count, setCount] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [help, setHelp] = useState(false);
  useEffect(() => {
    let active = true;
    context.storage
      .get("count")
      .then(value => {
        if (value !== undefined && typeof value !== "number") throw new Error("计数数据损坏");
        if (active) setCount(value ?? 0);
      })
      .catch(error => {
        if (active) setError(String(error));
      });
    return () => {
      active = false;
    };
  }, [context]);
  useEffect(() => {
    if (!help) return;
    const handle = pageContext.registerDismiss(() => setHelp(false));
    return () => {
      void handle.dispose();
    };
  }, [help, pageContext]);
  return (
    <section className="space-y-4 p-4" data-spike-counter data-platform={environment.platform}>
      <h2 className="text-tau-title">移动计数器</h2>
      <output data-spike-count>{count ?? "读取中"}</output>
      <button
        className="rounded-tau-md bg-accent-soft p-3"
        data-spike-increment
        disabled={count === null || busy}
        onClick={async () => {
          if (count === null) return;
          setBusy(true);
          try {
            await context.storage.set("count", count + 1);
            if (!context.signal.aborted) setCount(count + 1);
          } catch (error) {
            setError(String(error));
          } finally {
            if (!context.signal.aborted) setBusy(false);
          }
        }}
      >
        增加并保存
      </button>
      <button
        className="rounded-tau-md bg-surface p-3"
        data-spike-help
        onClick={() => setHelp(true)}
      >
        说明
      </button>
      {help && (
        <div role="dialog" aria-label="计数说明" data-spike-dialog className="bg-surface p-4">
          <p>返回会先关闭此说明。计数保存在插件自己的验证工作区。</p>
          <button onClick={() => setHelp(false)}>关闭</button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}

export default definePlugin({
  id: "spike.counter",
  name: "移动计数器",
  version: "0.1.0",
  create: () => ({
    activate(context) {
      const page = context.pages.register({
        id: "counter",
        title: "移动计数器",
        component: CounterPage,
      });
      context.navigation.registerEntry({ id: "counter", title: "计数器", page });
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
