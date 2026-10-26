import type { JsonValue } from "./json";

/** 存储提供方配置表单：插件只声明字段，桌面与移动宿主各自渲染、保存与校验。 */
export type ProviderFormValues = Readonly<Record<string, string>>;

interface ProviderFieldBase {
  key: string;
  label: string;
  description?: string;
  placeholder?: string;
  /** 未标注的字段为必填，空值时宿主拒绝保存 */
  optional?: boolean;
  /** 按声明顺序拼成服务列表里的配置摘要；secret 字段不能作摘要 */
  summary?: boolean;
}

export interface ProviderTextField extends ProviderFieldBase {
  type: "text" | "secret" | "url";
}

export interface ProviderChoiceOption {
  value: string;
  label?: string;
  description?: string;
}

export interface ProviderChoiceField extends ProviderFieldBase {
  type: "choice";
  options: readonly ProviderChoiceOption[];
  default?: string;
}

export interface ProviderRemoteChoiceField extends ProviderFieldBase {
  type: "remote-choice";
  /** 按当前填写的值加载可选项；失败时抛出可读的错误 */
  load(values: ProviderFormValues, signal: AbortSignal): Promise<readonly ProviderChoiceOption[]>;
  /** 其中任一字段变化时清空本字段 */
  dependsOn?: readonly string[];
}

export type ProviderField = ProviderTextField | ProviderChoiceField | ProviderRemoteChoiceField;

export interface ProviderFieldGroup {
  title: string;
  description?: string;
  fields: readonly ProviderField[];
}

export interface ProviderForm {
  groups: readonly ProviderFieldGroup[];
  /** 保存前调用：可补全字段（如按令牌取用户名）或抛错拒绝保存 */
  beforeSave?(values: ProviderFormValues, signal: AbortSignal): Promise<ProviderFormValues>;
}

export function providerFormFields(form: ProviderForm): readonly ProviderField[] {
  return form.groups.flatMap(group => group.fields);
}

export function assertProviderForm(form: ProviderForm): void {
  if (!form || !Array.isArray(form.groups) || form.groups.length === 0)
    throw new Error("存储提供方设置必须声明表单分组");
  const keys = new Set<string>();
  for (const group of form.groups) {
    if (!group.title?.trim()) throw new Error("表单分组标题不能为空");
    if (!Array.isArray(group.fields) || group.fields.length === 0)
      throw new Error(`表单分组「${group.title}」没有字段`);
    for (const field of group.fields) {
      if (!field.key?.trim() || !field.label?.trim()) throw new Error("表单字段需要 key 与 label");
      if (keys.has(field.key)) throw new Error(`表单字段 key 重复：${field.key}`);
      keys.add(field.key);
      if (field.type === "secret" && field.summary)
        throw new Error(`密钥字段不能作为摘要：${field.key}`);
      if (field.type === "choice" && field.options.length === 0)
        throw new Error(`选择字段没有选项：${field.key}`);
      if (field.type === "remote-choice" && typeof field.load !== "function")
        throw new Error(`远程选择字段缺少 load：${field.key}`);
      if (!["text", "secret", "url", "choice", "remote-choice"].includes(field.type))
        throw new Error(`不支持的字段类型：${String((field as { type: unknown }).type)}`);
    }
  }
  for (const field of providerFormFields(form))
    if (field.type === "remote-choice")
      for (const dependency of field.dependsOn ?? [])
        if (!keys.has(dependency)) throw new Error(`字段 ${field.key} 依赖的字段不存在`);
}

/** 从已存配置读出表单初值：只取声明字段的字符串值，choice 缺省时取 default。 */
export function readProviderFormValues(
  form: ProviderForm,
  stored: JsonValue | undefined
): Record<string, string> {
  const source = stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
  const values: Record<string, string> = {};
  for (const field of providerFormFields(form)) {
    const value = source[field.key];
    values[field.key] =
      typeof value === "string" ? value : field.type === "choice" ? (field.default ?? "") : "";
  }
  return values;
}

/** 改一个字段并清空依赖它的远程选择字段。 */
export function patchProviderFormValues(
  form: ProviderForm,
  values: ProviderFormValues,
  key: string,
  value: string
): Record<string, string> {
  const next: Record<string, string> = { ...values, [key]: value };
  if (values[key] === value) return next;
  const cleared = new Set([key]);
  // 依赖可以链式传递（仓库 → 分支），按声明反复传播直到稳定
  let changed = true;
  while (changed) {
    changed = false;
    for (const field of providerFormFields(form))
      if (
        field.type === "remote-choice" &&
        !cleared.has(field.key) &&
        field.dependsOn?.some(dependency => cleared.has(dependency))
      ) {
        next[field.key] = "";
        cleared.add(field.key);
        changed = true;
      }
  }
  return next;
}

/** 必填字段空值时返回 key → 错误文案；为空对象表示可保存。 */
export function validateProviderFormValues(
  form: ProviderForm,
  values: ProviderFormValues
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of providerFormFields(form))
    if (!field.optional && !values[field.key]?.trim()) errors[field.key] = `请填写${field.label}`;
  return errors;
}

export function isProviderFormComplete(form: ProviderForm, stored: JsonValue | undefined) {
  return (
    stored !== undefined &&
    Object.keys(validateProviderFormValues(form, readProviderFormValues(form, stored))).length === 0
  );
}

export function providerFormSummary(form: ProviderForm, stored: JsonValue | undefined): string {
  const values = readProviderFormValues(form, stored);
  return providerFormFields(form)
    .filter(field => field.summary && values[field.key]?.trim())
    .map(field => {
      const value = values[field.key].trim();
      return field.type === "choice"
        ? (field.options.find(option => option.value === value)?.label ?? value)
        : value;
    })
    .join(" · ");
}

/** 写回配置：字段值覆盖已存配置的同名键，未声明的键原样保留。 */
export function mergeProviderFormValues(
  stored: JsonValue | undefined,
  values: ProviderFormValues
): JsonValue {
  const source = stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
  return { ...source, ...values };
}
