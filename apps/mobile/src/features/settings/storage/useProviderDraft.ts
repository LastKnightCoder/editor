import { useProviderDraftI18n } from "./draft.i18n";
// 服务页的表单草稿：初值来自已存配置，显式保存（必填校验 → 插件 beforeSave → 合并写回）。

import { useMemo, useRef, useState } from "react";
import {
  isProviderFieldError,
  providerFormFields,
  mergeProviderFormValues,
  readProviderFormValues,
  validateProviderFormValues,
  type JsonValue,
  type ProviderForm,
} from "@tau/plugins";

type Values = Record<string, string>;

export function useProviderDraft(
  form: ProviderForm | null,
  stored: JsonValue | undefined,
  persist: (config: JsonValue) => Promise<void>,
  errorText?: (error: unknown) => string
) {
  const { t } = useProviderDraftI18n();
  const empty = useMemo<ProviderForm>(() => ({ groups: [] }), []);
  const active = form ?? empty;
  const storedKey = JSON.stringify(stored ?? null);
  // 已存配置变化（保存成功、原生回写）后以新值为基线
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const baseline = useMemo(() => readProviderFormValues(active, stored), [active, storedKey]);
  const [values, setValues] = useState<Values>(baseline);
  const [validation, setValidation] = useState<
    Record<string, { required: true } | { message: string }>
  >({});
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<{ cause: unknown } | null>(null);
  const fields = providerFormFields(active);
  const errors = Object.fromEntries(
    Object.entries(validation).map(([key, issue]) => [
      key,
      "required" in issue
        ? t("required", { field: fields.find(field => field.key === key)?.label ?? key })
        : issue.message,
    ])
  );
  const controller = useRef(new AbortController());
  const dirty = Object.keys(values).some(key => values[key] !== baseline[key]);

  const change = (next: Values, key: string) => {
    setValues(next);
    setFailure(null);
    setValidation(previous => {
      const next = { ...previous };
      delete next[key];
      return next;
    });
  };

  /** 成功返回写入的配置；校验或保存失败返回 null，错误留在 errors / error。 */
  const save = async (): Promise<JsonValue | null> => {
    if (!form) return null;
    const missing = validateProviderFormValues(form, values);
    setValidation(Object.fromEntries(Object.keys(missing).map(key => [key, { required: true }])));
    if (Object.keys(missing).length > 0) return null;
    setSaving(true);
    setFailure(null);
    try {
      const prepared = form.beforeSave
        ? await form.beforeSave(values, controller.current.signal)
        : values;
      const config = mergeProviderFormValues(stored, prepared);
      await persist(config);
      setValues(readProviderFormValues(form, config));
      return config;
    } catch (issue) {
      if (isProviderFieldError(issue)) setValidation({ [issue.key]: { message: issue.message } });
      else setFailure({ cause: issue });
      return null;
    } finally {
      setSaving(false);
    }
  };

  return {
    values,
    errors,
    error:
      failure === null
        ? ""
        : errorText
          ? errorText(failure.cause)
          : failure.cause instanceof Error
            ? failure.cause.message
            : t("saveFailed"),
    saving,
    dirty,
    signal: controller.current.signal,
    change,
    save,
    reset: () => {
      setValues(baseline);
      setValidation({});
      setFailure(null);
    },
  };
}
