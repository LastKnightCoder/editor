import type { ReactNode } from "react";
import { RefreshCw, type LucideIcon } from "lucide-react";
import { Button, Panel } from "@tau/ui";
import { errorMessage } from "../api/errors";

/** 整块空态 / 失败态：图标 + 标题 + 说明 + 动作 */
export function StateBlock({
  icon: Icon,
  title,
  children,
  actions,
}: {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <Panel className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      <span className="bg-accent-soft text-accent-text grid size-11 place-items-center rounded-full">
        <Icon size={20} strokeWidth={1.75} />
      </span>
      <h2 className="text-tau-title text-ink-1 font-semibold">{title}</h2>
      {children && (
        <div className="text-tau-sm text-ink-2 max-w-[440px] leading-[1.7]">{children}</div>
      )}
      {actions && <div className="mt-2 flex flex-wrap justify-center gap-2">{actions}</div>}
    </Panel>
  );
}

export function ErrorState({
  icon,
  title,
  error,
  onRetry,
  retrying,
  actions,
}: {
  icon: LucideIcon;
  title: string;
  error: unknown;
  onRetry?: () => void;
  retrying?: boolean;
  actions?: ReactNode;
}) {
  return (
    <StateBlock
      icon={icon}
      title={title}
      actions={
        <>
          {onRetry && (
            <Button icon={RefreshCw} loading={retrying} onClick={onRetry}>
              重试
            </Button>
          )}
          {actions}
        </>
      }
    >
      {errorMessage(error)}
    </StateBlock>
  );
}
