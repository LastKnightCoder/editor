import { useCallback, useRef, type ReactNode } from "react";
import { PortalScope, UiHostProvider, UiProvider } from "@tau/ui";
import { PageHeader } from "../../../../components/PageHeader";
import { useEdgeFade } from "../../../../hooks/useScrollState";
import { usePage, usePageInstanceContext } from "../../../../router";

export function TtsPageShell({
  title,
  children,
  footer,
}: {
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const { navigator, entryId } = usePage();
  const { phase } = usePageInstanceContext();
  const scrollRef = useRef<HTMLDivElement>(null);
  useEdgeFade(scrollRef, { bottom: false });
  const registerDismiss = useCallback(
    (dismiss: () => void) => {
      if (phase !== "active") return () => undefined;
      return navigator.registerBackHandler(entryId, () => {
        dismiss();
        return true;
      });
    },
    [navigator, entryId, phase]
  );

  return (
    <div className="mobile-kb-screen bg-page fixed inset-0 flex flex-col">
      <PageHeader title={title} onBack={() => void navigator.goBack("ui")} />
      <div
        ref={scrollRef}
        data-page-footer={footer ? true : undefined}
        className="edge-fade-scroll mobile-page-scroll min-h-0 flex-1 overflow-y-auto px-4"
      >
        <PortalScope>
          <UiHostProvider registerDismiss={registerDismiss}>
            <UiProvider className="contents">{children}</UiProvider>
          </UiHostProvider>
        </PortalScope>
      </div>
      {footer && (
        <div
          className="bg-page flex gap-2.5 px-4 pt-2"
          style={{ paddingBottom: "calc(var(--mobile-screen-safe-bottom) + 12px)" }}
        >
          {footer}
        </div>
      )}
    </div>
  );
}
