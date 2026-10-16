import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Tag } from "@tau/ui";
import type { SubmissionStatus } from "../../../contracts";

export function PageHeader({
  back,
  title,
  tag,
  meta,
  actions,
}: {
  back?: { to: string; label: string };
  title: ReactNode;
  tag?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-col gap-2">
      {back && (
        <Link
          to={back.to}
          className="text-tau-sm text-ink-3 hover:text-ink-1 -ml-0.5 inline-flex w-fit items-center gap-1 transition-colors"
        >
          <ArrowLeft size={14} strokeWidth={1.9} />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="text-tau-hero text-ink-1 min-w-0 font-semibold tracking-[-0.01em]">
          {title}
        </h1>
        {tag}
        {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
      </div>
      {meta && <p className="text-tau-sm text-ink-3">{meta}</p>}
    </header>
  );
}

const STATUS: Record<SubmissionStatus, { label: string; color: "gray" | "yellow" }> = {
  draft: { label: "草稿", color: "gray" },
  pending_review: { label: "待审核", color: "yellow" },
  changes_requested: { label: "需修改", color: "yellow" },
  rejected: { label: "已拒绝", color: "gray" },
  approved: { label: "已批准", color: "gray" },
};

export function StatusTag({ status }: { status: SubmissionStatus }) {
  const { label, color } = STATUS[status];
  return <Tag color={color}>{label}</Tag>;
}
