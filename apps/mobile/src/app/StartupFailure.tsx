import { useShellI18n } from "./shell.i18n";
import { Button } from "@tau/ui";
import { mapErrorToMessage } from "../services/errors";

export function StartupLoadingText() {
  const { t } = useShellI18n();
  return <p style={{ fontSize: 14, color: "var(--tau-ink-2)" }}>{t("startup.loading")}</p>;
}

export function StartupCodeFailure({
  code,
  detail,
  onRetry,
}: {
  code: string;
  detail: string;
  onRetry(): void;
}) {
  const { t } = useShellI18n();
  return (
    <StartupFailure
      message={mapErrorToMessage(code, t("startup.failed"))}
      detail={detail}
      onRetry={onRetry}
    />
  );
}

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
  const { t } = useShellI18n();
  return (
    <main className="bg-page flex min-h-dvh items-center justify-center px-6">
      <div role="alert" className="flex max-w-sm flex-col items-center gap-3 text-center">
        <p className="text-ink-1 text-[17px] font-semibold">{t("failure.title")}</p>
        <p className="text-ink-2 text-[14px] leading-relaxed">{message}</p>
        {detail && detail !== message && (
          <p className="text-ink-3 text-[12px] leading-relaxed break-words">{detail}</p>
        )}
        <Button className="mt-2 min-h-11 min-w-32" onClick={onRetry}>
          {t("action.retry")}
        </Button>
      </div>
    </main>
  );
}

export function AppRenderFailure({ error, onRetry }: { error: Error; onRetry(): void }) {
  const { t } = useShellI18n();
  const stack = error.stack ?? "";
  return (
    <main className="min-h-screen px-4 py-6">
      <section className="bg-tag-5-soft text-danger shadow-card mx-auto w-full max-w-md rounded-3xl p-4">
        <h1 className="text-base font-semibold">{t("failure.open")}</h1>
        <p className="mt-2 text-sm">{t("failure.appHint")}</p>
        <button
          type="button"
          onClick={onRetry}
          className="bg-accent shadow-lift text-ink-inverse mt-3 rounded-full px-3.5 py-2 text-sm font-bold"
        >
          {t("action.retry")}
        </button>
        {import.meta.env.DEV && stack ? (
          <pre className="bg-surface text-ink-2 mt-3 overflow-auto rounded-xl p-3 text-xs whitespace-pre-wrap">
            {stack}
          </pre>
        ) : null}
      </section>
    </main>
  );
}
