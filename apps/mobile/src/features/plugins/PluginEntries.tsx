import { useMobilePlugins } from "../../app/plugins/context";
import { useNavigator } from "../../router";
import { toast } from "../../components/toast";
import { useInstalledPluginUpdateCount, useMobileCenterConfig } from "./data/center-queries";

const ROW =
  "text-ink-1 active:bg-press flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-1 text-left text-[14px]";

/** “我的”中的插件区：已启用插件的功能入口与插件中心入口分开呈现。 */
export function PluginEntries() {
  const runtime = useMobilePlugins();
  const navigator = useNavigator();
  const config = useMobileCenterConfig();
  const canBrowse = config.data?.browsingEnabled === true;
  const updates = useInstalledPluginUpdateCount();
  const entries = [...(runtime?.entries.values() ?? [])].filter(item =>
    runtime?.active(item.context)
  );
  if (!canBrowse && !entries.length) return null;
  return (
    <section
      aria-labelledby="plugin-entries-title"
      className="bg-surface shadow-card my-4 rounded-2xl p-4"
    >
      <h2 id="plugin-entries-title" className="text-ink-1 mb-2 font-semibold">
        插件功能
      </h2>
      {entries.length ? (
        <ul className="flex flex-col">
          {entries.map(({ definition, context }) => (
            <li key={`${context.pluginId}:${definition.id}`}>
              <button
                type="button"
                className={ROW}
                onClick={() =>
                  void definition.page
                    .open(definition.params)
                    .catch(error => toast.error(String(error)))
                }
              >
                {definition.title}
                <span aria-hidden="true" className="text-ink-3">
                  ›
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-ink-3 text-[13px]">已启用插件提供的页面会显示在这里。</p>
      )}
      {canBrowse && (
        <div className="border-line-1 mt-2 border-t pt-2">
          <button
            type="button"
            className={ROW}
            onClick={() => navigator.push("plugins", updates ? { tab: "installed" } : {})}
          >
            <span className="flex flex-col">
              插件中心
              <span className="text-ink-3 text-[12px]">商店与已安装管理</span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              {updates > 0 && (
                <span className="bg-accent-soft text-accent rounded-full px-2 py-0.5 text-[11.5px] font-bold tabular-nums">
                  {updates} 个可更新
                </span>
              )}
              <span aria-hidden="true" className="text-ink-3">
                ›
              </span>
            </span>
          </button>
        </div>
      )}
    </section>
  );
}
