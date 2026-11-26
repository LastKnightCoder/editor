/** Keep only the display-name getter live; structural fields retain spread snapshot timing. */
export function copyExtensionDisplay<T extends object>(source: T): T {
  const copy = {} as T;
  for (const key of Reflect.ownKeys(source)) {
    const descriptor = Object.getOwnPropertyDescriptor(source, key);
    if (!descriptor?.enumerable) continue;
    if (key === "name" && descriptor.get) {
      Object.defineProperty(copy, key, {
        enumerable: true,
        configurable: true,
        get: () => Reflect.get(source, key, source),
      });
    } else {
      Object.defineProperty(copy, key, {
        enumerable: true,
        configurable: true,
        writable: true,
        value: Reflect.get(source, key, source),
      });
    }
  }
  return copy;
}
