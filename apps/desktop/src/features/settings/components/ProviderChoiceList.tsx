/* eslint-disable react-refresh/only-export-components -- 分区判定与列表同源，供同步 / 资源存储两页共用 */
/**
 * 存储服务单选列表（同步 / 资源存储共用）：只显示配置摘要与状态，不出现任何连接字段；
 * 「配置」跳插件详情 › 设置，未配置的服务不可选。
 */

import { useId, type ReactNode } from "react";
import { ChevronRight, ExternalLink, Plus } from "lucide-react";
import {
  isProviderFormComplete,
  providerFormSummary,
  type JsonValue,
  type PluginProviderSettingsDefinition,
} from "@tau/plugins";
import { Button, ROW_DIVIDER, Radio } from "@tau/ui";
import type { RegisteredPluginSettings } from "@/app/plugins/runtime";
import { PLUGIN_DETAIL_KEY } from "@/app/plugins/runtime";
import { useSettingsStore } from "@/app/settingsStore";
import { openPage } from "@/services/page-navigation";
import type { SettingsSectionKey } from "../sections";
import { StatusChip } from "./StatusChip";

export type ProviderSection = RegisteredPluginSettings & {
  definition: PluginProviderSettingsDefinition;
};

/** 含旧版组件式分区：它们没有 form，只显示已存状态并提示更新插件 */
export function isProviderSection(
  section: RegisteredPluginSettings,
  target: "sync" | "upload"
): section is ProviderSection {
  return section.definition.target === target;
}

function leave(open: () => void) {
  useSettingsStore.getState().closeSettings();
  open();
}

export function ProviderChoiceList({
  sections,
  configurations,
  current,
  from,
  disabled,
  probing,
  addLabel,
  leading,
  onSelect,
}: {
  sections: readonly ProviderSection[];
  configurations: Record<string, unknown> | undefined;
  current: string;
  from: SettingsSectionKey;
  disabled?: boolean;
  /** 正在探测（切换前读云端）的插件 */
  probing?: string;
  addLabel: string;
  /** 列表首项（如「本地」），与插件服务同组互斥 */
  leading?: (name: string) => ReactNode;
  onSelect: (pluginId: string, title: string) => void;
}) {
  const name = useId();
  return (
    <>
      {leading?.(name)}
      {sections.map(section => {
        const pluginId = section.context.pluginId;
        const stored =
          configurations && Object.hasOwn(configurations, pluginId)
            ? (configurations[pluginId] as JsonValue)
            : undefined;
        const form = section.definition.form as
          | PluginProviderSettingsDefinition["form"]
          | undefined;
        const configured = form ? isProviderFormComplete(form, stored) : stored !== undefined;
        const summary = !form
          ? "插件版本较旧，更新后才能修改配置"
          : configured
            ? providerFormSummary(form, stored)
            : "";
        const isCurrent = current === pluginId;
        return (
          <div
            key={section.key}
            className={`flex min-h-14 items-center gap-3 px-3 py-2 ${ROW_DIVIDER}`}
          >
            <div className="min-w-0 flex-1">
              <Radio
                name={name}
                value={pluginId}
                checked={isCurrent}
                disabled={disabled || !configured || probing === pluginId}
                onChange={() => onSelect(pluginId, section.definition.title)}
                label={
                  <span className="text-tau-body-lg text-ink-1 inline-flex items-center gap-2 font-medium">
                    {section.definition.title}
                    {isCurrent && <StatusChip tone="accent">当前</StatusChip>}
                    {probing === pluginId && <StatusChip>连接中…</StatusChip>}
                  </span>
                }
                description={
                  <span className="text-tau-meta text-ink-2 block truncate">
                    {configured ? summary || "已配置" : "未配置"}
                  </span>
                }
              />
            </div>
            <Button
              size="sm"
              variant={configured ? "ghost" : "secondary"}
              onClick={() =>
                leave(() =>
                  openPage(PLUGIN_DETAIL_KEY, {
                    pluginId,
                    tab: "settings",
                    section: section.key,
                    from,
                  })
                )
              }
            >
              {configured ? "配置" : "去配置"}
              <ChevronRight size={14} />
            </Button>
          </div>
        );
      })}
      <button
        type="button"
        className={`hover:bg-hover rounded-tau-sm flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left ${ROW_DIVIDER}`}
        onClick={() => leave(() => openPage("plugins", { tab: "discover" }))}
      >
        <span className="text-ink-3 grid size-6 place-items-center">
          <Plus size={15} />
        </span>
        <span className="text-tau-body-lg text-ink-2 min-w-0 flex-1">{addLabel}</span>
        <ExternalLink size={14} className="text-ink-3" />
      </button>
    </>
  );
}
