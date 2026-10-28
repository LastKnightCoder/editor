/**
 * 侧栏「插件」入口的角标：等待授权数与可更新数并列，离开插件页也能发现；
 * 收起为图标列时合并为一个角点。
 */

import { useDesktopPlugins } from "@/app/plugins/context";
import { usePluginPermissionUi } from "@/app/plugins/permissions";
import { availableUpdates, installedPlugins } from "../model";
import { usePluginCatalog } from "../queries";

const PILL =
  "min-w-[18px] shrink-0 rounded-full px-[5px] text-center text-[11px] font-[600] tabular-nums leading-[18px]";

/** 与插件页「更新」标签同一目录查询，侧栏常驻时缓存共享。 */
function useUpdateCount() {
  const runtime = useDesktopPlugins();
  const catalog = usePluginCatalog("", "updated");
  if (!runtime || !catalog.data) return 0;
  return availableUpdates(catalog.data.items, installedPlugins(runtime)).length;
}

export function PluginNavBadge({ collapsed }: { collapsed: boolean }) {
  const requests = usePluginPermissionUi(state => Object.keys(state.pending).length);
  const updates = useUpdateCount();
  if (!requests && !updates) return null;
  if (collapsed)
    return <i aria-hidden className="bg-accent absolute top-2 right-2.5 size-1.5 rounded-full" />;
  return (
    <span className="ml-auto flex shrink-0 items-center gap-1">
      {requests > 0 && (
        <span
          aria-label={`${requests} 个插件等待授权`}
          className={`bg-accent-soft text-accent ${PILL}`}
        >
          {requests}
        </span>
      )}
      {updates > 0 && (
        <span
          aria-label={`${updates} 个插件可更新`}
          title={`${updates} 个插件可更新`}
          className={`bg-ok-soft text-ok ${PILL}`}
        >
          ↑{updates}
        </span>
      )}
    </span>
  );
}
