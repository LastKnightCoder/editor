import { bindI18nFields, defineI18n, type DisplayText } from "@tau/i18n";
import type {
  TemplateI18nDeclaration,
  TemplateI18nResources,
  TemplateSiteField,
  TemplateSiteFieldDeclaration,
} from "./template.ts";

/** 校验静态 JSON 字典与字段引用；返回值可直接经过 IPC。 */
export function readTemplateI18nResources(
  declaration: TemplateI18nDeclaration,
  resources: Readonly<Record<string, unknown>>,
  fields: readonly TemplateSiteFieldDeclaration[] | undefined
): TemplateI18nResources {
  const definition = defineI18n({
    fallbackLocale: declaration.fallbackLocale,
    resources: resources as Record<string, Record<string, string>>,
  });
  const check = (text: DisplayText | undefined) => {
    if (text && typeof text !== "string") definition.ref(text.key, text.values);
  };
  for (const field of fields ?? []) {
    check(field.label);
    check(field.description);
    if (field.type === "select") for (const option of field.options) check(option.label);
    else if (field.type !== "switch") check(field.placeholder);
  }
  return Object.freeze({
    fallbackLocale: definition.fallbackLocale,
    resources: definition.resources,
  });
}

/** 字段与选项只绑定一次；显示引用随所属模板的语言源读取。 */
export function resolveTemplateSiteFields(
  fields: readonly TemplateSiteFieldDeclaration[] | undefined,
  resolve: (text: DisplayText) => string
): readonly TemplateSiteField[] {
  return Object.freeze(
    (fields ?? []).map(field => {
      const keys: (keyof typeof field)[] = ["label"];
      if (field.description !== undefined) keys.push("description");
      const bound = bindI18nFields(field, keys, resolve);
      const descriptors = Object.getOwnPropertyDescriptors(bound);
      if (field.type === "select") {
        descriptors.options = {
          enumerable: true,
          value: Object.freeze(
            field.options.map(option => bindI18nFields(option, ["label"], resolve))
          ),
        };
      } else if (field.type !== "switch" && field.placeholder !== undefined) {
        const placeholder = bindI18nFields(field, ["placeholder"], resolve);
        descriptors.placeholder = { enumerable: true, get: () => placeholder.placeholder };
      }
      return Object.freeze(Object.defineProperties({}, descriptors)) as TemplateSiteField;
    })
  );
}
