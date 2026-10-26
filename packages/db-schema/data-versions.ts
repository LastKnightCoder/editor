/** 编辑器和白板共用直接历史版本声明，不递归展开历史定义。 */
export interface PreviousDataVersion<T> {
  element: T;
  access: "read" | "edit" | "none";
}
export function assertDataVersions<
  T extends {
    type: string;
    dataVersion?: number;
    collaboration?: unknown;
    previousVersions?: readonly PreviousDataVersion<T>[];
  },
>(spec: T, validate: (element: T) => unknown): void {
  if (spec.dataVersion === undefined) {
    if (spec.collaboration || spec.previousVersions)
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
}
