import { Button } from "@tau/ui";

/** 启动必需步骤（读取设置、打开数据库）失败时替代主界面，避免各模块拿着空数据库继续启动。 */
export function StartupFailure({
  message,
  detail,
  onRetry,
}: {
  message: string;
  detail?: string;
  onRetry: () => void;
}) {
  return (
    <main className="bg-page flex min-h-dvh items-center justify-center px-6">
      <div role="alert" className="flex max-w-sm flex-col items-center gap-3 text-center">
        <p className="text-ink-1 text-[17px] font-semibold">Tau 没能完成启动</p>
        <p className="text-ink-2 text-[14px] leading-relaxed">{message}</p>
        {detail && detail !== message && (
          <p className="text-ink-3 text-[12px] leading-relaxed break-words">{detail}</p>
        )}
        <Button className="mt-2 min-h-11 min-w-32" onClick={onRetry}>
          重试
        </Button>
      </div>
    </main>
  );
}
