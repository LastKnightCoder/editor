/**
 * 侧栏「插件」入口的待授权数：应用不在前台时插件发起的请求不弹窗，记在这里等用户处理；
 * 收起为图标列时退化为角点。
 */

import { usePluginPermissionUi } from "@/app/plugins/permissions";

export function PluginPermissionNavBadge({ collapsed }: { collapsed: boolean }) {
  const count = usePluginPermissionUi(state => Object.keys(state.pending).length);
  if (!count) return null;
  if (collapsed)
    return <i aria-hidden className="bg-accent absolute right-2.5 top-2 size-1.5 rounded-full" />;
  return (
    <span
      aria-label={`${count} 个插件等待授权`}
      className="bg-accent-soft text-accent ml-auto min-w-[18px] shrink-0 rounded-full px-[5px] text-center text-[11px] font-[600] tabular-nums leading-[18px]"
    >
      {count}
    </span>
  );
}
