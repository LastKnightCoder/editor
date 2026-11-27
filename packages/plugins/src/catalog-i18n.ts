import { canonicalLocale, resolveLocale } from "@tau/i18n";

export interface PluginLocalizedMetadata {
  readonly name?: string;
  readonly description?: string;
  readonly keywords?: readonly string[];
}

export type PluginManifestI18n = Readonly<Record<string, PluginLocalizedMetadata>>;

const MAX_MANIFEST_LOCALES = 32;
const LOCALE_TAG_PATTERN = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;
const LOCALIZED_README_PATTERN = /^README\.([A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*)\.md$/;
const ALLOWED_ENTRY_KEYS = new Set(["name", "description", "keywords"]);

function parseLocaleTag(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label}必须是有效的语言标识`);
  const trimmed = value.trim();
  if (!LOCALE_TAG_PATTERN.test(trimmed) || trimmed.length > 35)
    throw new Error(`${label}不是有效的语言标识：${value}`);
  try {
    return canonicalLocale(trimmed);
  } catch {
    throw new Error(`${label}不是有效的语言标识：${value}`);
  }
}

export function readManifestI18n(value: unknown): PluginManifestI18n | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("i18n 必须是按语言键组织的对象");
  const entries = Object.entries(value as Record<string, unknown>);
  if (!entries.length) return undefined;
  if (entries.length > MAX_MANIFEST_LOCALES)
    throw new Error(`i18n 最多声明 ${MAX_MANIFEST_LOCALES} 种语言`);

  const result: Record<string, PluginLocalizedMetadata> = {};
  for (const [rawLocale, rawEntry] of entries) {
    const locale = parseLocaleTag(rawLocale, "i18n 语言键");
    if (Object.hasOwn(result, locale))
      throw new Error(`i18n 包含重复的语言键：${locale}`);
    if (!rawEntry || typeof rawEntry !== "object" || Array.isArray(rawEntry))
      throw new Error(`i18n.${rawLocale} 必须是对象`);
    const record = rawEntry as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      if (!ALLOWED_ENTRY_KEYS.has(key))
        throw new Error(`i18n.${rawLocale} 包含不支持的字段：${key}`);
    }

    let name: string | undefined;
    if (record.name !== undefined) {
      if (typeof record.name !== "string" || !record.name.trim())
        throw new Error(`i18n.${rawLocale}.name 必须是非空文本`);
      name = record.name.trim();
    }

    let description: string | undefined;
    if (record.description !== undefined) {
      if (typeof record.description !== "string" || !record.description.trim())
        throw new Error(`i18n.${rawLocale}.description 必须是非空文本`);
      description = record.description.trim();
    }

    let keywords: string[] | undefined;
    if (record.keywords !== undefined) {
      if (!Array.isArray(record.keywords))
        throw new Error(`i18n.${rawLocale}.keywords 必须是数组`);
      keywords = [];
      for (const item of record.keywords) {
        const keyword = typeof item === "string" ? item.trim() : "";
        if (!keyword) throw new Error(`i18n.${rawLocale}.keywords 必须包含非空文本`);
        if (!keywords.includes(keyword)) keywords.push(keyword);
      }
      if (!keywords.length) keywords = undefined;
    }

    if (name === undefined && description === undefined && keywords === undefined)
      throw new Error(`i18n.${rawLocale} 至少需要提供 name、description 或 keywords 之一`);

    result[locale] = Object.freeze({
      ...(name !== undefined ? { name } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(keywords ? { keywords: Object.freeze(keywords) } : {}),
    });
  }
  return Object.freeze(result);
}

export function readManifestLocales(value: unknown): readonly string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error("locales 必须是语言标识数组");
  const locales: string[] = [];
  for (const item of value) {
    const locale = parseLocaleTag(item, "locales");
    if (!locales.includes(locale)) locales.push(locale);
  }
  if (locales.length > MAX_MANIFEST_LOCALES)
    throw new Error(`locales 最多声明 ${MAX_MANIFEST_LOCALES} 种语言`);
  return locales.length ? Object.freeze(locales) : undefined;
}

/** 识别根目录下的多语言说明文件（如 `README.en-US.md`），返回规范化语言标识。 */
export function parseLocalizedReadmeFilename(fileName: string): string | null {
  const match = LOCALIZED_README_PATTERN.exec(fileName);
  if (!match) return null;
  const tag = match[1];
  if (tag.length > 35) return null;
  try {
    return canonicalLocale(tag);
  } catch {
    return null;
  }
}

function matchLocaleKey(
  record: Readonly<Record<string, unknown>> | undefined,
  locale: string | undefined
): string | null {
  if (!record || !locale) return null;
  const keys = Object.keys(record);
  if (!keys.length) return null;
  try {
    const matched = resolveLocale(locale, keys, "");
    return matched || null;
  } catch {
    return null;
  }
}

/** 按当前语言解析插件名称与简介，未命中时回退顶层默认文案。 */
export function resolvePluginMetadata(
  source: {
    readonly name: string;
    readonly description?: string;
    readonly i18n?: PluginManifestI18n;
  },
  locale?: string
): { readonly name: string; readonly description: string } {
  const key = matchLocaleKey(source.i18n, locale);
  const localized = key ? source.i18n?.[key] : undefined;
  return {
    name: localized?.name ?? source.name,
    description: localized?.description ?? source.description ?? "",
  };
}

/** 按当前语言选择插件说明文档，未命中时回退默认 `README.md`。 */
export function resolvePluginReadme(
  content: {
    readonly readme: string;
    readonly readmes?: Readonly<Record<string, string>>;
  },
  locale?: string
): string {
  const key = matchLocaleKey(content.readmes, locale);
  return (key ? content.readmes?.[key] : undefined) ?? content.readme;
}

/** 收集所有语言下的可搜索字段，保证跨语言检索一致命中。 */
export function pluginSearchTerms(source: {
  readonly pluginId?: string;
  readonly id?: string;
  readonly name: string;
  readonly description?: string;
  readonly keywords?: readonly string[];
  readonly i18n?: PluginManifestI18n;
}): string[] {
  const terms: string[] = [];
  const push = (value: string | undefined) => {
    if (value) terms.push(value);
  };
  push(source.pluginId ?? source.id);
  push(source.name);
  push(source.description);
  if (source.keywords) {
    for (const keyword of source.keywords) push(keyword);
  }
  if (source.i18n) {
    for (const entry of Object.values(source.i18n)) {
      push(entry.name);
      push(entry.description);
      if (entry.keywords) {
        for (const keyword of entry.keywords) push(keyword);
      }
    }
  }
  return terms;
}

const DISPLAY_LOCALE_ALIASES: Readonly<Record<string, string>> = {
  "zh-CN": "zh-Hans",
  "zh-SG": "zh-Hans",
  "zh-TW": "zh-Hant",
  "zh-HK": "zh-Hant",
  "zh-MO": "zh-Hant",
  "en-US": "en",
};

/** 将插件声明的 BCP 47 语言列表格式化为当前界面语言下的可读名称。 */
export function formatPluginLocales(locales: readonly string[], displayLocale: string): string[] {
  let display: Intl.DisplayNames | null = null;
  try {
    display = new Intl.DisplayNames([displayLocale], { type: "language" });
  } catch {
    display = null;
  }
  const formatted: string[] = [];
  for (const tag of locales) {
    let label = tag;
    if (display) {
      try {
        const canonical = canonicalLocale(tag);
        const target = DISPLAY_LOCALE_ALIASES[canonical] ?? canonical;
        label = display.of(target) || tag;
      } catch {
        label = tag;
      }
    }
    if (!formatted.includes(label)) formatted.push(label);
  }
  return formatted;
}
