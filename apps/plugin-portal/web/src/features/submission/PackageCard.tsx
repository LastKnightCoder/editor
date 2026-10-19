import type { ReactNode } from "react";
import { Tag } from "@tau/ui";
import type { PackageManifest } from "../../../../contracts";
import { PluginMark } from "../../components/PluginMark";
import { categoryLabels } from "../catalog/categories";
import { formatBytes } from "./validation";

/** 插件包摘要：名称、版本与静态校验结果；完整清单在「文件」标签里 */
export function PackageCard({
  manifest,
  size,
  actions,
}: {
  manifest: PackageManifest;
  size?: number;
  actions?: ReactNode;
}) {
  const files = Object.keys(manifest.integrity).length;
  const facts = [
    manifest.id,
    size !== undefined ? formatBytes(size) : null,
    `最低 Tau ${manifest.minAppVersion}`,
    `${files} 个文件`,
  ].filter(Boolean);
  return (
    <div className="border-line-1 bg-surface rounded-tau-md shadow-card flex items-center gap-3.5 border px-4 py-3.5">
      <PluginMark pluginId={manifest.id} name={manifest.name} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2">
          <span className="text-tau-body-lg text-ink-1 font-semibold">{manifest.name}</span>
          <span className="text-tau-micro text-ink-3 font-tau-mono">v{manifest.version}</span>
          <Tag color="green">静态校验通过</Tag>
        </p>
        <p className="text-tau-sm text-ink-2 mt-0.5 truncate">{manifest.description}</p>
        <p className="text-tau-micro text-ink-3 font-tau-mono mt-0.5 truncate">
          {facts.join(" · ")}
        </p>
        <p className="text-tau-micro text-ink-3 mt-0.5 truncate">
          分类：{categoryLabels(manifest.categories).join("、") || "未填写"}
          {manifest.keywords?.length ? ` · 关键词：${manifest.keywords.join("、")}` : ""}
        </p>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
