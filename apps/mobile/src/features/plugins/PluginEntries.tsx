import { Button } from "@tau/ui";
import { useMobilePlugins } from "../../app/plugins/context";
import { useNavigator } from "../../router";
import { toast } from "../../components/toast";

export function PluginEntries() {
  const runtime = useMobilePlugins();
  const navigator = useNavigator();
  const entries = [...(runtime?.entries.values() ?? [])].filter(item =>
    runtime?.active(item.context)
  );
  if (!import.meta.env.DEV && !entries.length) return null;
  return (
    <section className="bg-surface shadow-card my-4 rounded-2xl p-4">
      <h2 className="text-ink mb-3 font-semibold">插件功能</h2>
      <div className="flex flex-wrap gap-2">
        {entries.map(({ definition, context }) => (
          <Button
            key={`${context.pluginId}:${definition.id}`}
            onClick={() =>
              void definition.page
                .open(definition.params)
                .catch(error => toast.error(String(error)))
            }
          >
            {definition.title}
          </Button>
        ))}
      </div>
      {import.meta.env.DEV && (
        <Button variant="ghost" onClick={() => navigator.push("plugins")}>
          插件管理
        </Button>
      )}
    </section>
  );
}
