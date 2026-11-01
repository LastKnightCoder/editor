export const quoteSyncIdentifier = (name: string) => `"${name.replaceAll('"', '""')}"`;
const literal = (name: string) => `'${name.replaceAll("'", "''")}'`;
const cell = (prefix: string, column: string) =>
  `CASE WHEN typeof(${prefix}.${quoteSyncIdentifier(column)})='blob' THEN json_object('$blob',hex(${prefix}.${quoteSyncIdentifier(column)})) WHEN typeof(${prefix}.${quoteSyncIdentifier(column)})='integer' THEN json_object('$integer',CAST(${prefix}.${quoteSyncIdentifier(column)} AS TEXT)) ELSE ${prefix}.${quoteSyncIdentifier(column)} END`;
export interface SyncTable {
  name: string;
  columns: string[];
  key: string[];
  parents: string[];
  references?: { column: string; table: string }[];
}

export function syncCaptureSql(table: SyncTable) {
  const quote = quoteSyncIdentifier;
  const row = (prefix: string, action: string) =>
    `json_object(${table.columns
      .flatMap(column => {
        const managed =
          action === "UPDATE" &&
          ((table.name === "contents" && ["content", "count", "update_time"].includes(column)) ||
            (table.name === "content_documents" && ["contracts", "revision"].includes(column)));
        const value = cell(prefix, column);
        return [
          literal(column),
          managed
            ? `CASE WHEN EXISTS(SELECT 1 FROM _tau_device_documents WHERE content_id=${prefix}.${quote(table.name === "contents" ? "id" : "content_id")}) THEN NULL ELSE ${value} END`
            : value,
        ];
      })
      .join(",")})`;
  return ["INSERT", "UPDATE", "DELETE"]
    .map(action => {
      const marker = table.name === "_tau_device_documents";
      const key = marker ? ["content_id"] : table.key;
      const prefix = action === "DELETE" ? "OLD" : "NEW";
      return `CREATE TRIGGER IF NOT EXISTS ${quote(`_tau_device_capture_${table.name}_${action}`)} AFTER ${action} ON ${quote(table.name)}
      WHEN (SELECT CASE WHEN json_valid(payload) THEN (applying=0 OR (applying IN (2,3) AND coalesce(json_extract(payload,'$.requiresSnapshot'),0)=0)) AND json_extract(payload,'$.enabled')=1 ELSE 0 END FROM _tau_device_state WHERE id=1) AND coalesce((SELECT seq FROM sqlite_sequence WHERE name='_tau_device_log'),0)<9007199254740990 ${action === "UPDATE" && !marker ? `AND ${row("OLD", action)} IS NOT ${row("NEW", action)}` : ""}
      BEGIN INSERT INTO _tau_device_log(table_name,row_key,before_json,after_json,phase) VALUES (
        ${literal(marker ? "_document" : table.name)},json_array(${key.map(column => (marker ? `${prefix}.${quote(column)}` : cell(prefix, column))).join(",")}),
        ${marker || action === "INSERT" ? "NULL" : row("OLD", action)},${marker ? "'{}'" : action === "DELETE" ? "NULL" : row("NEW", action)},(SELECT applying>=2 FROM _tau_device_state WHERE id=1)); END;`;
    })
    .join("\n");
}

export function syncTableOrder(tables: SyncTable[]) {
  const seen = new Set<string>(),
    visiting = new Set<string>(),
    ordered: SyncTable[] = [];
  const byName = new Map(tables.map(table => [table.name, table]));
  const visit = (table: SyncTable) => {
    if (seen.has(table.name)) return;
    if (visiting.has(table.name)) throw new Error("DEVICE_SYNC_SCHEMA_CYCLE: 表之间存在循环外键");
    visiting.add(table.name);
    for (const name of table.parents)
      if (name !== table.name && byName.has(name)) visit(byName.get(name)!);
    visiting.delete(table.name);
    seen.add(table.name);
    ordered.push(table);
  };
  tables.forEach(visit);
  return ordered;
}
