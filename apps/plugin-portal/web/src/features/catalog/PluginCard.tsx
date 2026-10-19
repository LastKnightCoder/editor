import { Link } from "react-router-dom";
import { Download, Heart } from "lucide-react";
import { IconButton, Tooltip } from "@tau/ui";
import type { CatalogEntry } from "../../../../contracts";
import { PluginMark } from "../../components/PluginMark";
import { formatCount, formatRelative } from "../../components/format";
import { categoryLabels } from "./categories";

/** 插件中心卡片：整卡链接到详情，悬停浮出快速下载 */
export function PluginCard({
  entry,
  onDownload,
  downloading,
}: {
  entry: CatalogEntry;
  onDownload: (entry: CatalogEntry) => void;
  downloading: boolean;
}) {
  return (
    <article className="border-line-1 bg-surface rounded-tau-md shadow-card hover:shadow-lift hover:border-track ease-tau-out group relative flex w-full flex-col gap-2.5 border p-4 transition-[box-shadow,transform,border-color] duration-200 hover:-translate-y-0.5">
      <div className="flex items-center gap-3">
        <PluginMark pluginId={entry.pluginId} name={entry.name} />
        <div className="min-w-0 flex-1">
          <h2 className="text-tau-title text-ink-1 truncate font-semibold leading-tight">
            <Link
              to={`/plugins/${encodeURIComponent(entry.pluginId)}`}
              className="outline-none after:absolute after:inset-0 after:rounded-[inherit] focus-visible:after:shadow-[var(--tau-focus-ring)]"
            >
              {entry.name}
            </Link>
          </h2>
          <p className="text-tau-sm text-ink-3 truncate">@{entry.publisher.login}</p>
        </div>
      </div>
      <div className="absolute right-3 top-3 z-10 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        <Tooltip content={`下载 v${entry.latest.version}`}>
          <IconButton
            aria-label="下载 ZIP"
            disabled={downloading}
            onClick={() => onDownload(entry)}
          >
            <Download size={15} />
          </IconButton>
        </Tooltip>
      </div>
      <p className="text-tau-meta text-ink-2 line-clamp-2 min-h-[2lh]">{entry.description}</p>
      {entry.categories.length > 0 && (
        <p className="text-tau-micro text-ink-3 truncate">
          {categoryLabels(entry.categories).join(" · ")}
        </p>
      )}
      <div className="text-tau-micro text-ink-3 flex items-center gap-3">
        <span className="font-tau-mono">v{entry.latest.version}</span>
        <span className="inline-flex items-center gap-1" title="累计下载">
          <Download size={12} />
          {formatCount(entry.downloadsTotal)}
        </span>
        <span className="inline-flex items-center gap-1" title="喜欢">
          <Heart size={12} />
          {formatCount(entry.likes)}
        </span>
        <span className="ml-auto">{formatRelative(entry.latest.publishedAt)}更新</span>
      </div>
    </article>
  );
}
