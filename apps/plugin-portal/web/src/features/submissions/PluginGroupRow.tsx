import { Link, useNavigate } from "react-router-dom";
import { ChevronDown, ChevronRight, Package } from "lucide-react";
import { Button, cn } from "@tau/ui";
import type { SubmissionGroup, SubmissionSummary } from "../../../../contracts";
import { PluginMark } from "../../components/PluginMark";
import { StatusTag } from "../../components/PageHeader";
import { formatRelative } from "../../components/format";
import { activityText } from "./activity";
import { headlineOf, lastActivity } from "./groups";

const detailPath = (item: SubmissionSummary) => `/submissions/${encodeURIComponent(item.id)}`;
const describe = (item: SubmissionSummary) =>
  activityText({ ...item, hasPackage: !!item.pluginId }, "author");

function VersionRow({ item }: { item: SubmissionSummary }) {
  return (
    <li>
      <Link
        to={detailPath(item)}
        className="hover:bg-surface-hover focus-visible:bg-surface-hover text-tau-meta flex items-center gap-3 py-2.5 pl-[72px] pr-[18px] outline-none transition-colors"
      >
        <span className="font-tau-mono text-ink-1 w-16 shrink-0 font-medium">
          {item.version ? `v${item.version}` : "—"}
        </span>
        <StatusTag status={item.status} />
        <span className="text-ink-2 min-w-0 flex-1 truncate">{describe(item)}</span>
        <span className="text-tau-micro text-ink-3 shrink-0">
          {formatRelative(lastActivity(item))}
        </span>
        <ChevronRight size={15} className="text-ink-3 shrink-0" />
      </Link>
    </li>
  );
}

/** 一个插件一行：显示最该关注的那次提交，展开后列出全部版本 */
export function PluginGroupRow({
  group,
  expanded,
  onToggle,
}: {
  group: SubmissionGroup;
  expanded: boolean;
  onToggle: () => void;
}) {
  const navigate = useNavigate();
  const headline = headlineOf(group);
  const needsWork = headline.status === "changes_requested" || headline.status === "draft";
  const title = group.pluginId ? (group.name ?? group.pluginId) : "未上传插件包的草稿";
  const count = group.submissions.length;
  return (
    <li>
      <div
        onClick={onToggle}
        className={cn(
          "hover:bg-surface-hover relative flex cursor-pointer items-center gap-3.5 px-[18px] py-3.5 transition-colors",
          headline.status === "changes_requested" &&
            "before:bg-warn before:absolute before:inset-y-3 before:left-0 before:w-[3px] before:rounded-r"
        )}
      >
        {group.pluginId ? (
          <PluginMark pluginId={group.pluginId} name={title} />
        ) : (
          <span className="bg-hover text-ink-3 grid size-10 shrink-0 place-items-center rounded-[11px]">
            <Package size={18} strokeWidth={1.6} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="flex items-baseline gap-2">
            <span className="text-tau-body-lg text-ink-1 truncate font-medium">{title}</span>
            {headline.version && (
              <span className="text-tau-micro text-ink-3 font-tau-mono shrink-0">
                v{headline.version}
              </span>
            )}
          </p>
          <p
            className={cn(
              "text-tau-sm truncate",
              headline.status === "changes_requested"
                ? "text-warn"
                : headline.status === "rejected"
                  ? "text-danger"
                  : "text-ink-2"
            )}
          >
            {group.pluginId ? describe(headline) : `${count} 个草稿还没有上传插件包`}
            <span className="text-ink-3"> · {formatRelative(lastActivity(headline))}</span>
          </p>
        </div>
        {needsWork && group.pluginId && (
          <Button
            size="sm"
            variant="soft"
            onClick={event => {
              event.stopPropagation();
              navigate(detailPath(headline));
            }}
          >
            {headline.status === "draft" ? "继续编辑" : "去修改"}
          </Button>
        )}
        {group.pluginId && <StatusTag status={headline.status} />}
        <button
          type="button"
          aria-expanded={expanded}
          aria-label={`${title}的提交记录`}
          onClick={event => {
            event.stopPropagation();
            onToggle();
          }}
          className="text-tau-sm text-ink-3 hover:text-ink-1 rounded-tau-sm flex shrink-0 items-center gap-1 px-1.5 py-1 transition-colors"
        >
          提交记录 {count}
          <ChevronDown
            size={15}
            className={cn(
              "ease-tau-out transition-transform duration-200",
              !expanded && "-rotate-90"
            )}
          />
        </button>
      </div>
      {expanded && (
        <ul className="border-line-2 divide-line-2 flex flex-col divide-y border-t">
          {group.submissions.map(item => (
            <VersionRow key={item.id} item={item} />
          ))}
        </ul>
      )}
    </li>
  );
}
