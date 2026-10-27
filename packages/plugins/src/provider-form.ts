import type { JsonValue } from "./json";

/** 提供方配置表单：插件只声明字段，桌面与移动宿主各自渲染、保存与校验。 */
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
  /** 仅当另一字段取指定值时显示；隐藏的字段不参与必填校验，已存值保留 */
  visibleWhen?: { key: string; equals: string };
}

export interface ProviderTextField extends ProviderFieldBase {
  type: "text" | "secret" | "url";
  default?: string;
}

/** 开关字段：取值为 "true" / "false"，与其它字段一样按字符串保存；不参与必填校验。 */
export interface ProviderSwitchField extends ProviderFieldBase {
  type: "switch";
  default?: boolean;
}

/** 可由宿主提供选择界面的服务；不支持的宿主把字段显示为不可用。 */
export type ProviderHostService = "git.cacheDirectory";

/**
 * 宿主服务选择：值由宿主服务给出（如选择 Git 缓存目录），用户不直接输入。
 * key 存服务返回的标识，labelKey 存显示名；留空表示使用宿主默认，placeholder 为默认时的说明。
 */
export interface ProviderServiceChoiceField extends ProviderFieldBase {
  type: "service-choice";
  service: ProviderHostService;
  labelKey: string;
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

export type ProviderField =
  | ProviderTextField
  | ProviderChoiceField
  | ProviderRemoteChoiceField
  | ProviderSwitchField
  | ProviderServiceChoiceField;

export interface ProviderFieldGroup {
  title: string;
  description?: string;
  /** 外部链接（如服务商控制台），由宿主在分组旁展示 */
  link?: { label: string; url: string };
  fields: readonly ProviderField[];
}

/** beforeSave 抛出此错误时，宿主把文案标在对应字段上。 */
export class ProviderFieldError extends Error {
  constructor(
    readonly key: string,
    message: string
  ) {
    super(message);
    this.name = "ProviderFieldError";
  }
}

export function isProviderFieldError(error: unknown): error is ProviderFieldError {
  return (
    error instanceof Error &&
    error.name === "ProviderFieldError" &&
    typeof (error as { key?: unknown }).key === "string"
  );
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
    throw new Error("提供方设置必须声明表单分组");
  const keys = new Set<string>();
  for (const group of form.groups) {
    if (!group.title?.trim()) throw new Error("表单分组标题不能为空");
    if (group.link && (!group.link.label?.trim() || !/^https:\/\//.test(group.link.url ?? "")))
      throw new Error(`表单分组「${group.title}」的链接需要标题与 https 地址`);
    if (!Array.isArray(group.fields) || group.fields.length === 0)
      throw new Error(`表单分组「${group.title}」没有字段`);
    for (const field of group.fields) {
      if (!field.key?.trim() || !field.label?.trim()) throw new Error("表单字段需要 key 与 label");
      if (keys.has(field.key)) throw new Error(`表单字段 key 重复：${field.key}`);
      keys.add(field.key);
      if (field.type === "switch" && field.summary)
        throw new Error(`开关字段不能作为摘要：${field.key}`);
      if (field.type === "secret" && field.summary)
        throw new Error(`密钥字段不能作为摘要：${field.key}`);
      if (field.type === "choice" && field.options.length === 0)
        throw new Error(`选择字段没有选项：${field.key}`);
      if (field.type === "remote-choice" && typeof field.load !== "function")
        throw new Error(`远程选择字段缺少 load：${field.key}`);
      if (field.type === "service-choice") {
        if (field.service !== "git.cacheDirectory")
          throw new Error(`不支持的宿主服务：${String(field.service)}`);
        if (!field.labelKey?.trim() || field.labelKey === field.key)
          throw new Error(`服务选择字段需要独立的 labelKey：${field.key}`);
        if (field.summary) throw new Error(`服务选择字段不能作为摘要：${field.key}`);
      }
      if (
        !["text", "secret", "url", "choice", "remote-choice", "switch", "service-choice"].includes(
          field.type
        )
      )
        throw new Error(`不支持的字段类型：${String((field as { type: unknown }).type)}`);
    }
  }
  for (const field of providerFormFields(form)) {
    if (field.type === "remote-choice")
      for (const dependency of field.dependsOn ?? [])
        if (!keys.has(dependency)) throw new Error(`字段 ${field.key} 依赖的字段不存在`);
    if (
      field.visibleWhen &&
      (!keys.has(field.visibleWhen.key) || field.visibleWhen.key === field.key)
    )
      throw new Error(`字段 ${field.key} 的显示条件引用了不存在的字段`);
    if (field.type === "service-choice" && keys.has(field.labelKey))
      throw new Error(`服务选择字段的 labelKey 与其他字段重复：${field.labelKey}`);
  }
}

/** 字段在当前取值下是否显示。 */
export function isProviderFieldVisible(field: ProviderField, values: ProviderFormValues): boolean {
  return !field.visibleWhen || values[field.visibleWhen.key] === field.visibleWhen.equals;
}

/** 从已存配置读出表单初值：只取声明字段的字符串值，字段缺省时取声明的 default。 */
export function readProviderFormValues(
  form: ProviderForm,
  stored: JsonValue | undefined
): Record<string, string> {
  const source = stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
  const values: Record<string, string> = {};
  for (const field of providerFormFields(form)) {
    const value = source[field.key];
    if (field.type === "service-choice") {
      const label = source[field.labelKey];
      values[field.key] = typeof value === "string" ? value : "";
      values[field.labelKey] = typeof label === "string" ? label : "";
    } else if (field.type === "switch")
      values[field.key] =
        typeof value === "boolean" || typeof value === "string"
          ? String(value === true || value === "true")
          : String(field.default ?? false);
    else
      values[field.key] =
        typeof value === "string" ? value : "default" in field ? (field.default ?? "") : "";
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
    if (
      field.type !== "switch" &&
      field.type !== "service-choice" &&
      !field.optional &&
      isProviderFieldVisible(field, values) &&
      !values[field.key]?.trim()
    )
      errors[field.key] = `请填写${field.label}`;
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
