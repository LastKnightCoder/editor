export interface LocaleSource {
  getSnapshot(): string;
  subscribe(listener: () => void): () => void;
}

export function canonicalLocale(value: string): string {
  return new Intl.Locale(value).toString();
}

export function resolveLocale(
  requested: string,
  supported: readonly string[],
  fallback: string
): string {
  const locale = new Intl.Locale(requested);
  const exact = supported.find(value => canonicalLocale(value) === locale.toString());
  if (exact) return exact;
  const script = locale.maximize().script;
  return (
    supported.find(value => {
      const candidate = new Intl.Locale(value);
      return candidate.language === locale.language && candidate.maximize().script === script;
    }) ?? fallback
  );
}

export function createLocaleStore(initial: string) {
  let locale = canonicalLocale(initial);
  const listeners = new Set<() => void>();
  return Object.freeze({
    getSnapshot: () => locale,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setLocale(value: string) {
      const next = canonicalLocale(value);
      if (next === locale) return;
      locale = next;
      for (const listener of [...listeners]) {
        try {
          listener();
        } catch (error) {
          console.error("语言订阅执行失败", error);
        }
      }
    },
  });
}
