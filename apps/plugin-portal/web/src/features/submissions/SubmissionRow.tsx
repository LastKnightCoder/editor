import { Link } from "react-router-dom";
import { ChevronRight, Package } from "lucide-react";
import { cn } from "@tau/ui";
import type { Submission } from "../../../../contracts";
import { PluginMark } from "../../components/PluginMark";
import { StatusTag } from "../../components/PageHeader";
import { formatRelative } from "../../components/format";
import { activityText } from "./activity";

export function SubmissionRow({
  submission,
  to,
  showPluginId,
}: {
  submission: Submission;
  to: string;
  showPluginId?: boolean;
}) {
  const manifest = submission.content?.manifest;
  const needsWork = submission.status === "changes_requested";
  const time = submission.lastEvent?.createdAt ?? submission.submittedAt ?? submission.updatedAt;
  return (
    <li>
      <Link
        to={to}
        className={cn(
          "hover:bg-surface-hover focus-visible:bg-surface-hover relative flex items-center gap-3.5 px-[18px] py-3.5 outline-none transition-colors",
          needsWork &&
            "before:bg-warn before:absolute before:inset-y-3 before:left-0 before:w-[3px] before:rounded-r"
        )}
      >
        {manifest ? (
          <PluginMark pluginId={manifest.id} name={manifest.name} />
        ) : (
          <span className="bg-hover text-ink-3 grid size-10 shrink-0 place-items-center rounded-[11px]">
            <Package size={18} strokeWidth={1.6} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="flex items-baseline gap-2">
            <span className="text-tau-body-lg text-ink-1 truncate font-medium">
              {manifest?.name ?? "未命名草稿"}
            </span>
            {manifest && (
              <span className="text-tau-micro text-ink-3 font-tau-mono shrink-0">
                v{manifest.version}
              </span>
            )}
            {showPluginId && manifest && (
              <span className="text-tau-micro text-ink-3 truncate">{manifest.id}</span>
            )}
          </p>
          <p
            className={cn(
              "text-tau-sm truncate",
              needsWork
                ? "text-warn"
                : submission.status === "rejected"
                  ? "text-danger"
                  : "text-ink-2"
            )}
          >
            {activityText(submission)}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <StatusTag status={submission.status} />
          <span className="text-tau-micro text-ink-3">{formatRelative(time)}</span>
        </div>
        <ChevronRight size={16} className="text-ink-3 shrink-0" />
      </Link>
    </li>
  );
}
