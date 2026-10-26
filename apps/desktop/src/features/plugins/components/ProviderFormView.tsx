/**
 * 存储提供方连接配置（插件详情 › 设置）：按插件声明的表单渲染账号与存储位置，
 * 显式保存；同步服务保存后读取一次云端版本作为连接测试。保存不改变当前选用。
 */

import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  CircleAlert,
  CircleCheck,
  Eye,
  EyeOff,
  Image,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import {
  isProviderFormComplete,
  mergeProviderFormValues,
  patchProviderFormValues,
  readProviderFormValues,
  validateProviderFormValues,
  type JsonValue,
  type PluginProviderSettingsDefinition,
  type ProviderForm,
  type ProviderChoiceOption,
  type ProviderField,
  type ProviderRemoteChoiceField,
} from "@tau/plugins";
import { Button, IconButton, Input, Panel, Select, SettingRow, cn } from "@tau/ui";
import { StatusChip } from "@/features/settings/components/StatusChip";
import type { PluginContext } from "@tau/plugins";
import useSettingStore, { EImageBed, ESync } from "@/stores/useSettingStore";
import { useSyncProviderSwitch } from "@/hooks/useSyncProviderSwitch";
import {
  probeRemoteDatabaseVersion,
  saveProviderConfig,
  selectUploadTarget,
} from "@/services/storage-providers";

type Values = Record<string, string>;
type Outcome = { tone: "ok" | "danger"; text: string } | null;

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

function useStoredConfig(target: "sync" | "upload", pluginId: string) {
  return useSettingStore(state => {
    const plugin = (target === "sync" ? state.setting.sync : state.setting.imageBed).plugin;
    return plugin && Object.hasOwn(plugin.configurations, pluginId)
      ? (plugin.configurations[pluginId] as JsonValue)
      : undefined;
  });
}

function useIsCurrent(target: "sync" | "upload", pluginId: string) {
  return useSettingStore(state =>
    target === "sync"
      ? state.setting.sync.active === ESync.Plugin && state.setting.sync.plugin?.id === pluginId
      : state.setting.imageBed.active === EImageBed.Plugin &&
        state.setting.imageBed.plugin?.id === pluginId
  );
}

function CapabilityCard({
  target,
  pluginId,
  name,
  configured,
}: {
  target: "sync" | "upload";
  pluginId: string;
  name: string;
  configured: boolean;
}) {
  const current = useIsCurrent(target, pluginId);
  const switcher = useSyncProviderSwitch();
  const Icon = target === "sync" ? RefreshCw : Image;
  return (
    <Panel pad="none" className="mb-6 flex items-center gap-3 rounded-[14px] px-4 py-3">
      <span
        className={cn(
          "grid size-8 flex-none place-items-center rounded-[10px]",
          target === "sync" ? "bg-tag-2-soft text-tag-2" : "bg-tag-4-soft text-tag-4"
        )}
      >
        <Icon size={15} strokeWidth={1.8} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-tau-body-lg text-ink-1 font-semibold">
          {target === "sync" ? "同步服务" : "资源存储"}
        </p>
        <p className="text-tau-meta text-ink-2">
          {current
            ? target === "sync"
              ? "数据库与资源文件正同步到这里"
              : "新插入的图片与附件上传到这里"
            : configured
              ? "配置已保存，尚未使用"
              : "填写下方配置并保存后可使用"}
        </p>
      </div>
      {current ? (
        <StatusChip tone="ok">使用中</StatusChip>
      ) : (
        <Button
          size="sm"
          disabled={!configured}
          loading={switcher.probing === pluginId}
          loadingText="连接中…"
          onClick={() =>
            target === "sync" ? void switcher.request(pluginId, name) : selectUploadTarget(pluginId)
          }
        >
          {target === "sync" ? "设为同步服务" : "设为上传目标"}
        </Button>
      )}
      {switcher.dialog}
    </Panel>
  );
}

function SecretInput(props: {
  label: string;
  value: string;
  invalid: boolean;
  disabled: boolean;
  onChange(value: string): void;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <>
      <Input
        wrapperClassName="w-[260px]"
        aria-label={props.label}
        aria-invalid={props.invalid}
        type={visible ? "text" : "password"}
        value={props.value}
        autoComplete="off"
        spellCheck={false}
        disabled={props.disabled}
        onChange={event => props.onChange(event.target.value)}
      />
      <IconButton
        aria-label={visible ? "隐藏" : "显示"}
        onClick={() => setVisible(value => !value)}
      >
        {visible ? <EyeOff size={15} /> : <Eye size={15} />}
      </IconButton>
    </>
  );
}

function RemoteChoice(props: {
  field: ProviderRemoteChoiceField;
  values: Values;
  invalid: boolean;
  disabled: boolean;
  signal: AbortSignal;
  onChange(value: string): void;
}) {
  const [options, setOptions] = useState<readonly ProviderChoiceOption[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");
  const request = useRef(0);
  const value = props.values[props.field.key] ?? "";
  const load = async () => {
    const current = ++request.current;
    setState("loading");
    try {
      const result = await props.field.load(props.values, props.signal);
      if (current !== request.current) return;
      setOptions(result);
      setState("idle");
    } catch (issue) {
      if (current !== request.current) return;
      setError(errorText(issue));
      setState("error");
    }
  };
  const merged =
    value && !options.some(option => option.value === value) ? [{ value }, ...options] : options;
  return (
    <Select
      className="w-[260px]"
      aria-label={props.field.label}
      aria-invalid={props.invalid}
      status={props.invalid ? "error" : undefined}
      searchable
      creatable
      disabled={props.disabled}
      placeholder={props.field.placeholder ?? "请选择"}
      emptyText={state === "loading" ? "正在加载…" : state === "error" ? error : "无可选项"}
      value={value || null}
      options={merged.map(option => ({ value: option.value, label: option.label ?? option.value }))}
      onOpenChange={open => {
        if (open) void load();
      }}
      onValueChange={props.onChange}
    />
  );
}

function FieldControl(props: {
  field: ProviderField;
  values: Values;
  invalid: boolean;
  disabled: boolean;
  signal: AbortSignal;
  onChange(value: string): void;
}) {
  const { field } = props;
  const value = props.values[field.key] ?? "";
  if (field.type === "secret")
    return (
      <SecretInput
        label={field.label}
        value={value}
        invalid={props.invalid}
        disabled={props.disabled}
        onChange={props.onChange}
      />
    );
  if (field.type === "choice")
    return (
      <Select
        className="w-[260px]"
        aria-label={field.label}
        disabled={props.disabled}
        value={value || null}
        options={field.options.map(option => ({
          value: option.value,
          label: option.label ?? option.value,
        }))}
        onValueChange={props.onChange}
      />
    );
  if (field.type === "remote-choice") return <RemoteChoice {...props} field={field} />;
  return (
    <Input
      wrapperClassName="w-[260px]"
      aria-label={field.label}
      aria-invalid={props.invalid}
      type="text"
      inputMode={field.type === "url" ? "url" : undefined}
      value={value}
      placeholder={field.placeholder}
      autoComplete="off"
      spellCheck={false}
      disabled={props.disabled}
      onChange={event => props.onChange(event.target.value)}
    />
  );
}

export function ProviderFormView({
  definition,
  context,
  name,
}: {
  definition: PluginProviderSettingsDefinition;
  context: PluginContext;
  name: string;
}) {
  const { form, target } = definition;
  if (target !== "sync" && target !== "upload") throw new Error("不是存储提供方");
  return <StorageProviderForm form={form} target={target} context={context} name={name} />;
}

function StorageProviderForm({
  form,
  target,
  context,
  name,
}: {
  form: ProviderForm;
  target: "sync" | "upload";
  context: PluginContext;
  name: string;
}) {
  const pluginId = context.pluginId;
  const stored = useStoredConfig(target, pluginId);
  return (
    <ProviderConfigForm
      form={form}
      context={context}
      stored={stored}
      saveConfig={config => saveProviderConfig(target, pluginId, config)}
      probe={
        target === "sync"
          ? async config => {
              const remote = await probeRemoteDatabaseVersion(pluginId, config);
              return remote.version > 0
                ? `连接正常 · 云端已有数据库 v${remote.version}`
                : "连接正常 · 云端还没有这个数据库，首次同步会上传";
            }
          : undefined
      }
      header={
        <CapabilityCard
          target={target}
          pluginId={pluginId}
          name={name}
          configured={isProviderFormComplete(form, stored)}
        />
      }
    />
  );
}

export function ProviderConfigForm({
  form,
  context,
  stored,
  saveConfig,
  probe,
  header,
  children,
  changed = false,
  onReset,
}: {
  form: ProviderForm;
  context: PluginContext;
  stored: JsonValue | undefined;
  saveConfig(config: JsonValue): Promise<void>;
  probe?(config: JsonValue): Promise<string>;
  header?: ReactNode;
  children?: ReactNode;
  changed?: boolean;
  onReset?(): void;
}) {
  const baseline = useMemo(() => readProviderFormValues(form, stored), [form, stored]);
  const [values, setValues] = useState<Values>(baseline);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const dirty = changed || Object.keys(values).some(key => values[key] !== baseline[key]);
  const configured = isProviderFormComplete(form, stored);

  const patch = (key: string, value: string) => {
    setValues(previous => patchProviderFormValues(form, previous, key, value));
    setErrors(previous => (previous[key] ? { ...previous, [key]: "" } : previous));
    setOutcome(null);
  };

  const save = async () => {
    const missing = validateProviderFormValues(form, values);
    setErrors(missing);
    if (Object.keys(missing).length > 0) return;
    setSaving(true);
    setOutcome(null);
    try {
      const prepared = form.beforeSave ? await form.beforeSave(values, context.signal) : values;
      context.signal.throwIfAborted();
      const config = mergeProviderFormValues(stored, prepared);
      await saveConfig(config);
      setValues(readProviderFormValues(form, config));
      if (!probe) {
        setOutcome({ tone: "ok", text: "配置已保存" });
        return;
      }
      try {
        setOutcome({ tone: "ok", text: await probe(config) });
      } catch (error) {
        setOutcome({ tone: "danger", text: `配置已保存，但连接失败：${errorText(error)}` });
      }
    } catch (error) {
      if (!context.signal.aborted) setOutcome({ tone: "danger", text: errorText(error) });
    } finally {
      if (!context.signal.aborted) setSaving(false);
    }
  };

  return (
    <div className="min-w-0">
      {header}
      {form.groups.map(group => (
        <section key={group.title} className="mb-6" aria-label={group.title}>
          <div className="px-1 pb-2">
            <h3 className="text-tau-body-lg text-ink-1 font-semibold">{group.title}</h3>
            {group.description && <p className="text-tau-meta text-ink-2">{group.description}</p>}
          </div>
          <Panel pad="none" className="rounded-[14px] p-1.5">
            {group.fields.map(field => {
              const error = errors[field.key];
              const note = [field.description, field.optional ? "可选" : ""]
                .filter(Boolean)
                .join("，");
              return (
                <SettingRow
                  key={field.key}
                  title={field.label}
                  description={
                    error ? <span className="text-danger">{error}</span> : note || undefined
                  }
                >
                  <FieldControl
                    field={field}
                    values={values}
                    invalid={!!error}
                    disabled={saving}
                    signal={context.signal}
                    onChange={value => patch(field.key, value)}
                  />
                </SettingRow>
              );
            })}
          </Panel>
        </section>
      ))}
      {children}
      <div className="flex items-center gap-2 px-1">
        <p
          role={outcome?.tone === "danger" ? "alert" : "status"}
          className={cn(
            "text-tau-meta flex min-w-0 flex-1 items-center gap-1.5",
            outcome?.tone === "danger" ? "text-danger" : "text-ink-2"
          )}
        >
          {saving ? (
            <>
              <LoaderCircle size={14} className="animate-spin" />
              {probe ? "正在保存并测试连接…" : "正在保存…"}
            </>
          ) : outcome ? (
            <>
              {outcome.tone === "ok" ? (
                <CircleCheck size={14} className="text-ok flex-none" />
              ) : (
                <CircleAlert size={14} className="flex-none" />
              )}
              <span className="min-w-0">{outcome.text}</span>
            </>
          ) : dirty ? (
            "有未保存的修改"
          ) : null}
        </p>
        <Button
          variant="ghost"
          disabled={!dirty || saving}
          onClick={() => {
            setValues(baseline);
            onReset?.();
            setErrors({});
            setOutcome(null);
          }}
        >
          还原
        </Button>
        <Button variant="primary" disabled={!dirty && configured} loading={saving} onClick={save}>
          {probe ? "保存并测试" : "保存"}
        </Button>
      </div>
    </div>
  );
}
