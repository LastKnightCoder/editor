import { useSourceI18n } from "./i18n";
import { CircleAlert, Plus, type LucideIcon } from "lucide-react";

export const KindLabel = ({ icon: Icon, title }: { icon: LucideIcon; title: string }) => (
  <span className="inline-flex items-center gap-[0.4em] text-[0.8em] whitespace-nowrap text-[var(--ed-text-tertiary)] select-none">
    <Icon size="1.05em" strokeWidth={1.9} />
    {title}
  </span>
);

export const ErrorBar = ({ message, stale }: { message: string; stale: boolean }) => {
  const { t } = useSourceI18n();
  return (
    <div className="flex items-start gap-[0.5em] bg-[var(--ed-danger-soft)] px-[1em] py-[0.45em] text-[0.8em] leading-[1.55] text-[var(--ed-danger)]">
      <CircleAlert size="1em" strokeWidth={1.9} className="mt-[0.2em] shrink-0" />
      <div className="min-w-0">
        <div className="font-[family-name:var(--ed-font-mono)] break-words whitespace-pre-wrap">
          {message}
        </div>
        {stale && <div className="text-[var(--ed-text-secondary)]">{t("stale")}</div>}
      </div>
    </div>
  );
};

/** 空源码块的斜纹占位：可编辑时提示点击开始编写，只读时说明为空 */
export const EmptySourcePlaceholder = ({
  title,
  readOnly,
  touch,
  onClick,
}: {
  title: string;
  readOnly: boolean;
  touch?: boolean;
  onClick?: () => void;
}) => {
  const { t } = useSourceI18n();
  return (
    <div
      className="flex h-[3.5em] cursor-pointer items-center justify-center gap-[0.5em] rounded-[0.5625em] bg-[repeating-linear-gradient(-45deg,transparent_0_7px,var(--ed-bg-hover)_7px_8px)] text-[0.9em] text-[var(--ed-text-tertiary)] shadow-[inset_0_0_0_1px_var(--ed-border)] transition-[color,box-shadow] duration-150 select-none hover:text-[var(--ed-text-secondary)] hover:shadow-[inset_0_0_0_1px_var(--ed-text-tertiary)]"
      onClick={onClick}
    >
      <Plus size="1.05em" strokeWidth={1.9} />
      {t(readOnly ? "empty" : touch ? "startTap" : "startClick", { title })}
    </div>
  );
};
