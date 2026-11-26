import type { LucideIcon } from "lucide-react";
import { Highlighter, LayoutList, NotebookPen } from "lucide-react";
import { cn } from "@tau/ui";
import type { ConnectionState } from "../../shared/messages";
import { useLibrarySites } from "../queries";
import { SiteMark } from "./parts";
import { useLibraryI18n } from "../i18n";

export type LibraryView = "pages" | "feed" | "notes";

const VIEWS: Array<{ key: LibraryView; icon: LucideIcon }> = [
  { key: "pages", icon: LayoutList },
  { key: "feed", icon: Highlighter },
  { key: "notes", icon: NotebookPen },
];

const STATUS_DOT: Partial<Record<ConnectionState, string>> = {
  ready: "bg-ok",
  pairing: "bg-warn",
  connecting: "bg-warn",
  launching: "bg-warn",
};

function NavItem({
  active,
  onClick,
  children,
  count,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  count?: number;
}) {
  const { locale } = useLibraryI18n();
  return (
    <button
      type="button"
      aria-current={active}
      onClick={onClick}
      className={cn(
        "rounded-tau-sm flex h-8 w-full items-center gap-2 px-2 text-left",
        active ? "bg-selected text-accent-text font-semibold" : "text-ink-2 hover:bg-hover"
      )}
    >
      {children}
      {count !== undefined && (
        <span className="text-tau-sm ml-auto tabular-nums opacity-70">
          {count.toLocaleString(locale)}
        </span>
      )}
    </button>
  );
}

export function Sidebar({
  view,
  host,
  state,
  onView,
  onHost,
}: {
  view: LibraryView;
  host: string | null;
  state: ConnectionState;
  onView: (view: LibraryView) => void;
  onHost: (host: string | null) => void;
}) {
  const { t } = useLibraryI18n();
  const online = state === "ready";
  const sites = useLibrarySites(online).data ?? [];
  const status = {
    label:
      state === "ready" || state === "pairing" || state === "connecting" || state === "launching"
        ? t(`status.${state}`)
        : t("status.offline"),
    dot: STATUS_DOT[state] ?? "bg-ink-3",
  };

  return (
    <aside className="border-line-1 flex min-h-0 w-[208px] flex-none flex-col gap-0.5 border-r px-2.5 py-3.5">
      <div className="text-tau-body flex items-center gap-2 px-2 pb-3.5 font-semibold">
        <span className="bg-accent text-ink-inverse rounded-tau-sm grid size-[22px] place-items-center text-[12px]">
          τ
        </span>
        {t("title")}
      </div>
      {VIEWS.map(({ key, icon: Icon }) => (
        <NavItem
          key={key}
          active={view === key && !(key === "pages" && host)}
          onClick={() => {
            onHost(null);
            onView(key);
          }}
        >
          <Icon size={15} strokeWidth={1.8} />
          {t(`view.${key}`)}
        </NavItem>
      ))}
      {sites.length > 0 && (
        <>
          <p className="text-tau-sm text-ink-3 px-2 pt-3.5 pb-1">{t("sites")}</p>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {sites.map(site => (
              <NavItem
                key={site.host}
                active={view === "pages" && host === site.host}
                count={site.count}
                onClick={() => {
                  onHost(site.host);
                  onView("pages");
                }}
              >
                <SiteMark host={site.host} />
                <span className="min-w-0 truncate">{site.host.replace(/^www\./, "")}</span>
              </NavItem>
            ))}
          </div>
        </>
      )}
      <div className="text-tau-sm text-ink-3 mt-auto flex items-center gap-1.5 px-2 pt-2.5">
        <span className={cn("size-1.5 rounded-full", status.dot)} />
        {online ? status.label : t("status.cached", { status: status.label })}
      </div>
    </aside>
  );
}
