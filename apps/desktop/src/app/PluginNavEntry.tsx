/**
 * 插件侧栏条目：角标、子项与末尾动作行来自插件的 update，单独订阅，插件更新只重渲染本条目。
 * 条目页面在栈顶且侧栏展开时展开子项；子项参数包含于当前页参数即选中，再点回到条目本身。
 * 插件回调出错只弹通知，不影响侧栏。
 */

import { Fragment, useState, useSyncExternalStore, type DragEvent } from "react";
import { Plus } from "lucide-react";
import { ContextMenu, Menu } from "@tau/ui";
import type { PluginSidebarChild } from "@tau/plugins";
import { NavChild } from "@/components/NavChild";
import { appNotify } from "@/features/notifications/notify";
import { TONE_DOT } from "@/utils/groupTone";
import { isNavItemActive, type NavItem } from "./navigation";
import { NavItemButton } from "./NavItemButton";
import { PLUGIN_PAGE_KEY, type PluginSidebarSnapshot } from "./plugins/runtime";

type PluginNavItem = PluginSidebarSnapshot["items"][number];
type CurrentPage = { key: string; params: Record<string, unknown> } | undefined;

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

function invoke(run: () => unknown, title: string) {
  const report = (error: unknown) => appNotify({ title, body: errorText(error), tone: "danger" });
  try {
    void Promise.resolve(run()).catch(report);
  } catch (error) {
    report(error);
  }
}

/** 当前页是条目所在的插件页面时，返回它的页面参数 */
function pageParamsOf(plugin: PluginNavItem, current: CurrentPage) {
  if (
    current?.key !== PLUGIN_PAGE_KEY ||
    current.params.pluginId !== plugin.pluginId ||
    current.params.pageId !== plugin.pageId
  )
    return null;
  try {
    const params: unknown = JSON.parse(String(current.params.params ?? "{}"));
    return params && typeof params === "object" ? (params as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

const containsParams = (page: Record<string, unknown>, child: PluginSidebarChild) => {
  const entries = Object.entries(child.params);
  return entries.length > 0 && entries.every(([key, value]) => page[key] === value);
};

export function PluginNavEntry({
  item,
  current,
  collapsed,
}: {
  item: NavItem;
  current: CurrentPage;
  collapsed: boolean;
}) {
  const plugin = item.plugin as PluginNavItem;
  const state = useSyncExternalStore(plugin.subscribe, plugin.getState);
  const [dropId, setDropId] = useState<string | null>(null);
  const active = isNavItemActive(item, current);
  const page = pageParamsOf(plugin, current);
  const selected = page ? state.children.find(child => containsParams(page, child)) : undefined;
  const expanded =
    !collapsed &&
    (active || Boolean(selected)) &&
    (state.children.length > 0 || state.action !== null);

  const open = (run: () => Promise<void>) => invoke(run, "无法打开插件页面");
  const run = (callback: () => unknown) => invoke(callback, "插件操作失败");

  const dropProps = (child: PluginSidebarChild) => {
    const drop = child.onDrop;
    if (!drop) return {};
    return {
      onDragOver: (e: DragEvent) => {
        if (!e.dataTransfer.types.includes(drop.type)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setDropId(child.id);
      },
      onDragLeave: () => setDropId(id => (id === child.id ? null : id)),
      onDrop: (e: DragEvent) => {
        setDropId(null);
        const data = e.dataTransfer.getData(drop.type);
        run(() => drop.run(data));
      },
    };
  };

  const action = state.action;
  const ActionIcon = action?.icon;
  return (
    <div>
      <NavItemButton
        item={item}
        collapsed={collapsed}
        active={active || Boolean(selected)}
        hasActiveChild={expanded && Boolean(selected)}
        badge={
          !collapsed && state.badge > 0 ? (
            <span className="text-ink-3 ml-auto shrink-0 text-[11px] tabular-nums">
              {state.badge}
            </span>
          ) : null
        }
        onClick={() => open(plugin.open)}
      />
      {expanded && (
        <div className="mb-1 mt-0.5 space-y-px" role="group" aria-label={item.label}>
          {state.children.map(child => {
            const isSelected = child === selected;
            const row = (
              <NavChild
                active={isSelected}
                dropping={dropId === child.id}
                label={child.title}
                count={child.count}
                glyph={
                  child.tone ? (
                    <span
                      aria-hidden
                      className={`size-[7px] shrink-0 rounded-[2.5px] ${TONE_DOT[child.tone]}`}
                    />
                  ) : null
                }
                title={isSelected ? `再点一次回到「${item.label}」` : child.title}
                onClick={() =>
                  open(isSelected ? plugin.open : () => plugin.openWith({ ...child.params }))
                }
                {...dropProps(child)}
              />
            );
            const menu = child.menu ?? [];
            if (!menu.length) return <div key={child.id}>{row}</div>;
            return (
              <ContextMenu
                key={child.id}
                content={menu.map((entry, index) => (
                  <Fragment key={index}>
                    {entry.danger && index > 0 && !menu[index - 1].danger && <Menu.Separator />}
                    <Menu.Item danger={entry.danger} onSelect={() => run(entry.run)}>
                      {entry.title}
                    </Menu.Item>
                  </Fragment>
                ))}
              >
                {row}
              </ContextMenu>
            );
          })}
          {action && (
            <NavChild
              active={false}
              label={action.title}
              glyph={
                ActionIcon ? (
                  <ActionIcon size={13} strokeWidth={1.75} aria-hidden="true" />
                ) : (
                  <Plus className="size-[13px]" strokeWidth={1.75} />
                )
              }
              className="text-ink-3"
              onClick={() => run(action.run)}
            />
          )}
        </div>
      )}
    </div>
  );
}
