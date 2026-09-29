import type { ReactNode } from "react";
import { cn } from "../cn";
import { Spinner } from "./Loading";

/** 进行中时在内容上盖一层半透明遮罩与转圈；内容保持渲染 */
export function LoadingOverlay({
  loading,
  className,
  children,
}: {
  loading: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("relative", className)} aria-busy={loading || undefined}>
      {children}
      {loading && (
        <div className="absolute inset-0 grid place-items-center rounded-[inherit] bg-[color-mix(in_oklab,var(--tau-bg-surface)_60%,transparent)]">
          <Spinner className="size-5" />
        </div>
      )}
    </div>
  );
}
