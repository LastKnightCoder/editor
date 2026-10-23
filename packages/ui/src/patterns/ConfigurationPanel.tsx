import { useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { Button } from "../primitives/Button";
import { Dialog, DialogBody } from "../primitives/Dialog";
import { Input } from "../primitives/input/Input";
import { Select } from "../primitives/Select";

export interface ConfigurationField {
  key: string;
  label: string;
  placeholder?: string;
  hint?: string;
  type?: "text" | "password";
  reset?: readonly string[];
  options?: readonly { value: string; label: string }[];
  loadOptions?: (value: Readonly<Record<string, string>>) => Promise<readonly string[]>;
}

function ConfigurationInput({
  field,
  value,
  onChange,
  onCommit,
  values,
  disabled,
}: {
  field: ConfigurationField;
  value: string;
  values: Readonly<Record<string, string>>;
  onChange(value: string): void;
  onCommit(): void;
  disabled?: boolean;
}) {
  const [options, setOptions] = useState<readonly string[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const request = useRef(0);
  const load = async () => {
    setOpen(true);
    if (!field.loadOptions || loading) return;
    const current = ++request.current;
    setLoading(true);
    setError("");
    try {
      const result = await field.loadOptions(values);
      if (current === request.current) setOptions(result);
    } catch (issue) {
      if (current === request.current)
        setError(issue instanceof Error ? issue.message : "加载失败");
    } finally {
      if (current === request.current) setLoading(false);
    }
  };
  return (
    <div className="text-ink-3 text-tau-meta flex flex-col gap-1 px-4 py-3">
      <span>{field.label}</span>
      {field.loadOptions ? (
        <>
          <button
            type="button"
            className="text-ink-1 text-tau-body-lg flex min-h-8 items-center text-left"
            disabled={disabled}
            onClick={() => void load()}
          >
            <span className="flex-1 truncate">{value || field.placeholder || "请选择"}</span>
            <ChevronRight size={16} />
          </button>
          <Dialog
            open={open}
            onOpenChange={value => {
              setOpen(value);
              if (!value) {
                request.current++;
                setLoading(false);
              }
            }}
            title={`选择${field.label}`}
          >
            <DialogBody>
              {loading && <p>正在加载…</p>}
              {error && (
                <p role="alert" className="text-danger">
                  {error}
                </p>
              )}
              {!loading && !error && options.length === 0 && <p>暂无可选项</p>}
              <div className="flex flex-col gap-2">
                {options.map(option => (
                  <Button
                    key={option}
                    variant="ghost"
                    onClick={() => {
                      onChange(option);
                      onCommit();
                      setOpen(false);
                    }}
                  >
                    {option}
                  </Button>
                ))}
              </div>
              {error && <Button onClick={() => void load()}>重试</Button>}
            </DialogBody>
          </Dialog>
        </>
      ) : field.options ? (
        <Select
          aria-label={field.label}
          value={value}
          disabled={disabled}
          options={[...field.options]}
          onValueChange={next => {
            onChange(next);
            onCommit();
          }}
        />
      ) : (
        <Input
          aria-label={field.label}
          type={field.type ?? "text"}
          value={value}
          disabled={disabled}
          placeholder={field.placeholder}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          className="w-full"
          onChange={event => onChange(event.target.value)}
          onBlur={onCommit}
        />
      )}
      {field.hint && <span>{field.hint}</span>}
    </div>
  );
}

/** 账号卡与位置字段复用现有触摸表单结构，保存策略由调用者提供。 */
export function ConfigurationPanel({
  initialValue,
  accountFields,
  fields,
  onSave,
  prepareAccount,
}: {
  initialValue: Readonly<Record<string, string>>;
  accountFields: readonly ConfigurationField[];
  fields: readonly ConfigurationField[];
  onSave(value: Record<string, string>): Promise<void>;
  prepareAccount?: (value: Record<string, string>) => Promise<Record<string, string>>;
}) {
  const [value, setValue] = useState<Record<string, string>>(() => ({ ...initialValue }));
  const valueRef = useRef(value);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const pending = useRef(0);
  const [accountOpen, setAccountOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [accountSaving, setAccountSaving] = useState(false);
  const accountBaseline = useRef<Record<string, string> | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const patch = (key: string, next: string) => {
    const updated = { ...valueRef.current, [key]: next };
    for (const reset of [...accountFields, ...fields].find(field => field.key === key)?.reset ?? [])
      updated[reset] = "";
    valueRef.current = updated;
    setValue(updated);
    setMessage("");
  };
  const restoreAccountFields = (
    current: Record<string, string>,
    baseline: Record<string, string>
  ) => {
    const next = { ...current };
    const keys = new Set(accountFields.flatMap(field => [field.key, ...(field.reset ?? [])]));
    for (const key of keys) {
      if (Object.hasOwn(baseline, key)) next[key] = baseline[key];
      else delete next[key];
    }
    return next;
  };
  const changeAccountOpen = (open: boolean) => {
    if (open) accountBaseline.current ??= { ...valueRef.current };
    else if (accountBaseline.current) {
      const next = restoreAccountFields(valueRef.current, accountBaseline.current);
      valueRef.current = next;
      setValue(next);
      accountBaseline.current = null;
    }
    setAccountOpen(open);
  };
  const save = async (account = false) => {
    const source = valueRef.current;
    const snapshot =
      !account && accountBaseline.current
        ? restoreAccountFields(source, accountBaseline.current)
        : { ...source };
    if (account) setAccountSaving(true);
    pending.current++;
    setSaving(true);
    setError("");
    setMessage("");
    const operation = queue.current
      .catch(() => undefined)
      .then(async () => {
        const next = account && prepareAccount ? await prepareAccount(snapshot) : snapshot;
        await onSave(next);
        const unchanged = valueRef.current === source;
        if (unchanged && (account || !accountBaseline.current)) {
          valueRef.current = next;
          setValue(next);
        }
        setError("");
        if (pending.current === 1 && unchanged) setMessage("配置已保存");
        if (account) {
          accountBaseline.current = null;
          setAccountOpen(false);
        }
      });
    queue.current = operation;
    try {
      await operation;
    } catch (issue) {
      setMessage("");
      setError(issue instanceof Error ? issue.message : "保存失败");
    } finally {
      if (account) setAccountSaving(false);
      pending.current--;
      setSaving(pending.current > 0);
    }
  };
  const renderField = (field: ConfigurationField, commit: boolean) => (
    <ConfigurationInput
      key={field.key}
      field={field}
      value={value[field.key] ?? ""}
      values={value}
      disabled={!commit && accountSaving}
      onChange={next => patch(field.key, next)}
      onCommit={() => {
        if (commit) void save();
      }}
    />
  );
  const hasAccount = accountFields
    .filter(field => field.type === "password")
    .some(field => value[field.key]);
  return (
    <div className="space-y-3" aria-busy={saving}>
      <p className="text-ink-3 text-tau-meta px-4">账号</p>
      <div className="bg-surface shadow-card rounded-tau-lg flex items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <p className="text-ink-1 text-tau-body-lg">
            {hasAccount ? "已填写账号" : "尚未配置账号"}
          </p>
          <p className="text-ink-3 text-tau-meta">仅用于当前服务</p>
        </div>
        <Button variant="ghost" onClick={() => changeAccountOpen(true)}>
          {hasAccount ? "更换" : "去连接"}
        </Button>
      </div>
      <p className="text-ink-3 text-tau-meta px-4">存储位置</p>
      <div className="bg-surface shadow-card rounded-tau-lg">
        {fields.map(field => renderField(field, true))}
      </div>
      {error && (
        <p role="alert" className="text-danger text-tau-meta">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="text-ink-3 text-tau-meta">
          {message}
        </p>
      )}
      <Dialog
        open={accountOpen}
        onOpenChange={changeAccountOpen}
        title="账号配置"
        locked={accountSaving}
        footer={
          <Button loading={accountSaving} onClick={() => void save(true)}>
            {prepareAccount ? "验证并保存" : "保存账号"}
          </Button>
        }
      >
        <DialogBody>
          {accountFields.map(field => renderField(field, false))}
          <p className="text-ink-3 text-tau-meta">
            保存后可在服务页测试连接。其他服务的账号独立管理。
          </p>
          {error && (
            <p role="alert" className="text-danger text-tau-meta">
              {error}
            </p>
          )}
        </DialogBody>
      </Dialog>
    </div>
  );
}
