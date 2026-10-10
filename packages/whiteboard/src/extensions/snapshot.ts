/** 按内核不可变对象身份共享副本，视口变化不重新复制整棵元素树。 */
export function createSnapshotReader() {
  const copies = new WeakMap<object, object>();
  const read = <T>(value: T): T => {
    if (!value || typeof value !== "object") return value;
    const existing = copies.get(value);
    if (existing) return existing as T;
    const copy: Record<string, unknown> | unknown[] = Array.isArray(value) ? [] : {};
    copies.set(value, copy);
    for (const key of Object.keys(value)) {
      (copy as Record<string, unknown>)[key] = read((value as Record<string, unknown>)[key]);
    }
    return Object.freeze(copy) as T;
  };
  return read;
}
