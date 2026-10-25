/** 编辑器和白板共用直接历史版本声明，不递归展开历史定义。 */
export interface PreviousDataVersion<T> {
  element: T;
  access: "read" | "edit" | "none";
}
export interface DataMigration<T = Record<string, unknown>> {
  from: number;
  migrate(data: Readonly<T>): T;
}
export function assertDataVersions<
  T extends {
    type: string;
    dataVersion?: number;
    collaboration?: unknown;
    previousVersions?: readonly PreviousDataVersion<T>[];
    migrations?: readonly DataMigration<any>[];
  },
>(spec: T, validate: (element: T) => unknown): void {
  if (spec.dataVersion === undefined) {
    if (spec.collaboration || spec.previousVersions || spec.migrations)
      throw new Error("协作声明与版本兼容必须指定 dataVersion");
    return;
  }
  validate(spec);
  const versions = new Set([spec.dataVersion]);
  for (const previous of spec.previousVersions ?? []) {
    if (
      !previous ||
      previous.element === spec ||
      previous.element?.type !== spec.type ||
      !["read", "edit", "none"].includes(previous.access)
    )
      throw new Error("历史节点声明无效");
    validate(previous.element);
    if (versions.has(previous.element.dataVersion!)) throw new Error("节点数据版本重复");
    versions.add(previous.element.dataVersion!);
  }
  const migrations = new Set<number>();
  for (const migration of spec.migrations ?? []) {
    if (
      !migration ||
      typeof migration.migrate !== "function" ||
      migration.from === spec.dataVersion ||
      !versions.has(migration.from) ||
      migrations.has(migration.from)
    )
      throw new Error("节点转换来源必须是显式声明的历史版本且不能重复");
    migrations.add(migration.from);
  }
}
