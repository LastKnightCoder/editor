import { canonicalLocale } from "./locale.ts";

export type TranslationValues = Readonly<Record<string, string | number | boolean>>;
export interface I18nMessage {
  readonly kind: "i18n";
  readonly key: string;
  readonly values?: TranslationValues;
}
export type DisplayText = string | I18nMessage;
export type Localized<T, K extends keyof T = Extract<"title", keyof T>> = T extends unknown
  ? Omit<T, K> & { [P in K]: Exclude<T[P], string> | DisplayText }
  : never;

type BaseKey<K> = K extends `${infer Base}_${"zero" | "one" | "two" | "few" | "many" | "other"}`
  ? Base
  : K;
export interface I18nDefinition<Key extends string = string> {
  readonly fallbackLocale: string;
  readonly resources: Readonly<Record<string, Readonly<Record<string, string>>>>;
  ref(key: Key, values?: TranslationValues): I18nMessage;
}

export function defineI18n<const R extends Record<string, Record<string, string>>>(config: {
  fallbackLocale: string;
  resources: R;
}): I18nDefinition<Extract<BaseKey<{ [L in keyof R]: keyof R[L] }[keyof R]>, string>> {
  const fallbackLocale = canonicalLocale(config.fallbackLocale);
  const resources: Record<string, Readonly<Record<string, string>>> = {};
  for (const [language, messages] of Object.entries(config.resources)) {
    const locale = canonicalLocale(language);
    if (resources[locale]) throw new Error(`重复的词典语言：${locale}`);
    if (!messages || typeof messages !== "object" || Array.isArray(messages))
      throw new Error(`词典必须是文案对象：${locale}`);
    const entries = Object.entries(messages);
    if (entries.some(([key, value]) => !key || typeof value !== "string" || !value.trim()))
      throw new Error(`词典包含无效文案：${locale}`);
    resources[locale] = Object.freeze(Object.fromEntries(entries));
  }
  if (!resources[fallbackLocale] || !Object.keys(resources[fallbackLocale]).length)
    throw new Error("必须提供非空的回退语言词典");
  const definition: I18nDefinition = Object.freeze({
    fallbackLocale,
    resources: Object.freeze(resources),
    ref(key: string, values?: TranslationValues): I18nMessage {
      assertMessageKey(definition, key);
      return Object.freeze({
        kind: "i18n",
        key,
        ...(values ? { values: snapshotValues(values) } : {}),
      });
    },
  });
  return definition;
}

export function assertMessageKey(definition: I18nDefinition, key: string): void {
  const fallback = definition.resources[definition.fallbackLocale];
  if (
    !Object.hasOwn(fallback, key) &&
    !Object.keys(fallback).some(candidate =>
      ["zero", "one", "two", "few", "many", "other"].some(form => candidate === `${key}_${form}`)
    )
  )
    throw new Error(`回退词典缺少文案：${key}`);
}

export function snapshotValues(values: TranslationValues): TranslationValues {
  if (
    !values ||
    typeof values !== "object" ||
    Array.isArray(values) ||
    Object.values(values).some(
      value =>
        !["string", "number", "boolean"].includes(typeof value) ||
        (typeof value === "number" && !Number.isFinite(value))
    )
  )
    throw new Error("翻译参数只能包含字符串、有限数字或布尔值");
  return Object.freeze({ ...values });
}

export function snapshotDisplayText(value: DisplayText): DisplayText {
  if (typeof value === "string") return value;
  if (
    !value ||
    typeof value !== "object" ||
    value.kind !== "i18n" ||
    typeof value.key !== "string" ||
    !value.key
  )
    throw new Error("无效的文案引用");
  return Object.freeze({
    kind: "i18n",
    key: value.key,
    ...(value.values ? { values: snapshotValues(value.values) } : {}),
  });
}
