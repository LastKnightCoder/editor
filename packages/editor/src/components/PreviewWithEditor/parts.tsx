import { CircleAlert, type LucideIcon } from "lucide-react";

export const KindLabel = ({ icon: Icon, title }: { icon: LucideIcon; title: string }) => (
  <span className="inline-flex select-none items-center gap-[0.4em] whitespace-nowrap text-[0.8em] text-[var(--ed-text-tertiary)]">
    <Icon size="1.05em" strokeWidth={1.9} />
    {title}
  </span>
);

export const ErrorBar = ({ message, stale }: { message: string; stale: boolean }) => (
  <div className="flex items-start gap-[0.5em] bg-[var(--ed-danger-soft)] px-[1em] py-[0.45em] text-[0.8em] leading-[1.55] text-[var(--ed-danger)]">
    <CircleAlert size="1em" strokeWidth={1.9} className="mt-[0.2em] shrink-0" />
    <div className="min-w-0">
      <div className="whitespace-pre-wrap break-words font-[family-name:var(--ed-font-mono)]">
        {message}
      </div>
      {stale && <div className="text-[var(--ed-text-secondary)]">预览保留上一次成功的结果</div>}
    </div>
  </div>
);
