// 服务页的表单草稿：初值来自已存配置，显式保存（必填校验 → 插件 beforeSave → 合并写回）。

import { useMemo, useRef, useState } from "react";
import {
  isProviderFieldError,
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
  persist: (config: JsonValue) => Promise<void>
) {
  const empty = useMemo<ProviderForm>(() => ({ groups: [] }), []);
  const active = form ?? empty;
  const storedKey = JSON.stringify(stored ?? null);
  // 已存配置变化（保存成功、原生回写）后以新值为基线
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const baseline = useMemo(() => readProviderFormValues(active, stored), [active, storedKey]);
  const [values, setValues] = useState<Values>(baseline);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef(new AbortController());
  const dirty = Object.keys(values).some(key => values[key] !== baseline[key]);

  const change = (next: Values, key: string) => {
    setValues(next);
    setError("");
    setErrors(previous => (previous[key] ? { ...previous, [key]: "" } : previous));
  };

  /** 成功返回写入的配置；校验或保存失败返回 null，错误留在 errors / error。 */
  const save = async (): Promise<JsonValue | null> => {
    if (!form) return null;
    const missing = validateProviderFormValues(form, values);
    setErrors(missing);
    if (Object.keys(missing).length > 0) return null;
    setSaving(true);
    setError("");
    try {
      const prepared = form.beforeSave
        ? await form.beforeSave(values, controller.current.signal)
        : values;
      const config = mergeProviderFormValues(stored, prepared);
      await persist(config);
      setValues(readProviderFormValues(form, config));
      return config;
    } catch (issue) {
      if (isProviderFieldError(issue)) setErrors({ [issue.key]: issue.message });
      else setError(issue instanceof Error ? issue.message : "保存失败");
      return null;
    } finally {
      setSaving(false);
    }
  };

  return {
    values,
    errors,
    error,
    saving,
    dirty,
    signal: controller.current.signal,
    change,
    save,
    reset: () => {
      setValues(baseline);
      setErrors({});
      setError("");
    },
  };
}
