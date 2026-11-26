import { createInstance } from "i18next";
import { resolveLocale, type LocaleSource } from "./locale";
import {
  assertMessageKey,
  snapshotDisplayText,
  snapshotValues,
  type DisplayText,
  type I18nDefinition,
  type TranslationValues,
} from "./messages";

export interface Translator<Key extends string = string> {
  t(key: Key, values?: TranslationValues): string;
  resolve(value: DisplayText): string;
}

export function createI18nRuntime({ localeSource }: { localeSource: LocaleSource }) {
  let translators = new WeakMap<I18nDefinition, Translator>();
  let disposed = false;
  const assertOpen = () => {
    if (disposed) throw new Error("翻译运行时已关闭");
  };
  return Object.freeze({
    getSnapshot: () => localeSource.getSnapshot(),
    subscribe: (listener: () => void) => localeSource.subscribe(listener),
    get<Key extends string>(definition: I18nDefinition<Key>): Translator<Key> {
      assertOpen();
      const cached = translators.get(definition);
      if (cached) return cached;
      const available = Object.keys(definition.resources);
      const language = () =>
        resolveLocale(localeSource.getSnapshot(), available, definition.fallbackLocale);
      const engine = createInstance();
      // 词典全部随定义提供，初始化和切换均不经过异步加载器。
      void engine.init({
        initAsync: false,
        lng: language(),
        supportedLngs: available,
        fallbackLng: definition.fallbackLocale,
        load: "currentOnly",
        keySeparator: false,
        nsSeparator: false,
        resources: Object.fromEntries(
          Object.entries(definition.resources).map(([locale, messages]) => [
            locale,
            { translation: messages },
          ])
        ),
        returnNull: false,
        returnEmptyString: false,
        saveMissing: false,
        interpolation: { escapeValue: false },
      });
      const translator: Translator = Object.freeze({
        t(key: string, values?: TranslationValues): string {
          assertOpen();
          assertMessageKey(definition, key);
          const next = language();
          if (engine.language !== next) void engine.changeLanguage(next);
          const replacements = values ? snapshotValues(values) : {};
          if (
            !Object.hasOwn(definition.resources[definition.fallbackLocale], key) &&
            typeof replacements.count !== "number"
          )
            throw new Error(`复数文案需要 count 参数：${key}`);
          return engine.t(key, {
            replace: replacements,
            count: typeof replacements.count === "number" ? replacements.count : undefined,
          });
        },
        resolve(value: DisplayText): string {
          assertOpen();
          const text = snapshotDisplayText(value);
          return typeof text === "string" ? text : translator.t(text.key, text.values);
        },
      });
      translators.set(definition, translator);
      return translator;
    },
    dispose() {
      disposed = true;
      translators = new WeakMap();
    },
  });
}

export type I18nRuntime = ReturnType<typeof createI18nRuntime>;

type BoundFields<T, K extends keyof T> = T extends unknown
  ? Omit<T, K> & { readonly [P in K]: string }
  : never;

export function bindI18nFields<T extends object, K extends keyof T>(
  input: T,
  keys: readonly K[],
  resolve: (text: DisplayText) => string
): BoundFields<T, K> {
  const descriptors = Object.getOwnPropertyDescriptors(input);
  for (const key of keys) {
    const text = snapshotDisplayText(input[key] as DisplayText);
    resolve(text);
    Object.defineProperty(descriptors, key, {
      value: { enumerable: true, configurable: false, get: () => resolve(text) },
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return Object.freeze(Object.defineProperties({}, descriptors)) as BoundFields<T, K>;
}
