import { lazy, Suspense } from "react";
import type { DataTable } from "@tau/shared/database-types";
import { DesktopDatabase, type DesktopDatabaseProps } from "./DesktopDatabase";
import { useSharedDatabaseI18n } from "./i18n";
import useSettingStore from "@/stores/useSettingStore";
import { useDatabaseConnectionId } from "@/hooks/useDatabaseCommands";

const StoredQueryDatabase = lazy(() => import("../query-database/StoredQueryDatabase"));

interface DataTableEditorProps extends DesktopDatabaseProps {
  query?: DataTable["query"];
  reload?: () => Promise<void>;
}

export function DataTableEditor({ query, reload, ...props }: DataTableEditorProps) {
  return query ? (
    <QueryDatabaseHost {...props} query={query} reload={reload} />
  ) : (
    <DesktopDatabase {...props} />
  );
}

function QueryDatabaseHost({
  query,
  reload,
  ...props
}: DesktopDatabaseProps & {
  query: NonNullable<DataTable["query"]>;
  reload?: () => Promise<void>;
}) {
  const { t } = useSharedDatabaseI18n();
  const databaseName = useSettingStore(state => state.setting.database.active);
  const connectionId = useDatabaseConnectionId(databaseName);
  return (
    <Suspense fallback={<div className="text-ink-3 p-4">{t("editor.loadingQuery")}</div>}>
      <StoredQueryDatabase
        key={`${databaseName}:${connectionId}:${props.tableId}`}
        {...props}
        query={query}
        reload={reload}
      />
    </Suspense>
  );
}
