import type { ReactNode } from "react";
import { AudioLines, CircleAlert, CircleCheck, LoaderCircle } from "lucide-react";
import { GroupLabel } from "../../../../components/GroupLabel";
import { GroupCard, GroupNote, LetterTile } from "../../components/ui";

export function TtsSection({
  label,
  children,
  note,
}: {
  label: string;
  children: ReactNode;
  note?: ReactNode;
}) {
  return (
    <section>
      <GroupLabel>{label}</GroupLabel>
      <GroupCard>{children}</GroupCard>
      {note && <GroupNote>{note}</GroupNote>}
    </section>
  );
}

export function TtsProviderTile({ name }: { name: string }) {
  return (
    <LetterTile letter={name.trim().slice(0, 1) || "T"} className="bg-tag-3-soft text-tag-3" />
  );
}

export function TtsEmpty({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <span className="bg-tag-3-soft text-tag-3 grid h-14 w-14 place-items-center rounded-2xl">
        <AudioLines size={27} aria-hidden="true" />
      </span>
      <h2 className="text-ink-1 text-tau-title mt-4 font-semibold">{title}</h2>
      <p className="text-ink-3 text-tau-meta mt-2 leading-relaxed">{description}</p>
      {actions && <div className="mt-5 grid w-full gap-1">{actions}</div>}
    </div>
  );
}

export function TtsStatus({
  tone,
  title,
  children,
  action,
}: {
  tone: "pending" | "success" | "warning" | "error";
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const Icon =
    tone === "pending"
      ? LoaderCircle
      : tone === "success"
        ? CircleCheck
        : tone === "error"
          ? CircleAlert
          : CircleAlert;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`mx-1 mt-3 flex gap-3 rounded-2xl px-4 py-3 ${
        tone === "error"
          ? "bg-danger-soft"
          : tone === "warning"
            ? "bg-warn-soft"
            : tone === "success"
              ? "bg-tag-1-soft"
              : "bg-surface"
      }`}
    >
      <Icon
        size={19}
        className={`mt-0.5 shrink-0 ${tone === "pending" ? "text-ink-3 animate-spin" : ""} ${
          tone === "error"
            ? "text-danger"
            : tone === "warning"
              ? "text-warn"
              : tone === "success"
                ? "text-tag-1"
                : ""
        }`}
        aria-hidden="true"
      />
      <div className="text-ink-2 text-tau-meta min-w-0 flex-1 leading-relaxed">
        <strong className="text-ink-1 text-tau-body block font-medium">{title}</strong>
        {children}
        {action && <div className="mt-2">{action}</div>}
      </div>
    </div>
  );
}

export function TtsCurrentBadge({ unavailable = false }: { unavailable?: boolean }) {
  return (
    <span
      className={`text-tau-micro shrink-0 rounded-full px-2 py-0.5 font-semibold ${
        unavailable ? "bg-warn-soft text-warn" : "bg-accent-soft text-accent-text"
      }`}
    >
      {unavailable ? "不可用" : "当前"}
    </span>
  );
}
