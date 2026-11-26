import { useShellI18n } from "../app/shell.i18n";
import { useState, type ReactNode } from "react";
import { ErrorBoundary } from "@tau/ui";
import { PageHeader } from "../components/PageHeader";
import { usePageResourceReset } from "./PageResourceScope";

export function PageContentBoundary({ children, onBack }: { children: ReactNode; onBack(): void }) {
  const { t } = useShellI18n();
  const [attempt, setAttempt] = useState(0);
  const releaseResources = usePageResourceReset();
  return (
    <ErrorBoundary
      key={attempt}
      onError={error => {
        console.error("[mobile-page] render error", error);
        releaseResources();
      }}
      fallback={
        <div className="mobile-kb-screen bg-page flex flex-col">
          <PageHeader title={t("failure.open")} onBack={onBack} />
          <div role="alert" className="flex flex-1 flex-col items-center justify-center gap-4 px-6">
            <p className="text-ink-2">{t("failure.pageHint")}</p>
            <button
              type="button"
              onClick={() => setAttempt(value => value + 1)}
              className="bg-accent text-ink-inverse rounded-full px-5 py-2.5 font-semibold"
            >
              {t("action.retry")}
            </button>
          </div>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  );
}
