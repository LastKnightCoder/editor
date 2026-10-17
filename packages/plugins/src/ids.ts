export function assertLocalId(value: string): void {
  if (typeof value !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(value)) {
    throw new Error("插件标识必须为 1 至 128 位字母、数字、点、横线或下划线");
  }
}
