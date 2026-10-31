/* eslint-disable react-refresh/only-export-components -- 表单视图与同域的存储绑定 hook 一起导出 */
/**
 * 声明式提供方设置（插件详情 › 设置）：渲染为一张设置卡片，字段分组是卡内小节。
 * 在插件设置分区内经 useSettingsDraft 交给宿主的悬浮保存条与离开确认；分区外（无草稿控制器）保存栏在卡脚。
 * 配置存哪里、保存后是否测试、卡头显示什么，由调用方传入的绑定决定；
 * 同步与资源存储的绑定见 useStorageBinding（保存不改变当前选用）。
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CircleAlert, CircleCheck, Image, LoaderCircle, RefreshCw } from "lucide-react";
import {
  isProviderFieldError,
  isProviderFormComplete,
  providerFormFields,
  useSettingsDraft,
  mergeProviderFormValues,
  patchProviderFormValues,
  readProviderFormValues,
  validateProviderFormValues,
  type JsonValue,
  type PluginContext,
  type ProviderForm,
  type SettingsDraftChange,
} from "@tau/plugins";
import { Button, cn } from "@tau/ui";
import { StatusChip } from "@/features/settings/components/StatusChip";
import useSettingStore, { EImageBed, ESync } from "@/stores/useSettingStore";
import { useSyncProviderSwitch } from "@/hooks/useSyncProviderSwitch";
import {
  probeRemoteDatabaseVersion,
  saveProviderConfig,
  selectUploadTarget,
} from "@/services/storage-providers";
import { ProviderFormFields } from "./ProviderFormFields";
import { SettingsCard, SettingsCardHeader, SettingsCardIcon } from "./SettingsCard";

type Values = Record<string, string>;
type Outcome = { tone: "ok" | "danger"; text: string } | null;

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** 离开确认里的修改清单：密钥只说改了，选项显示选项名 */
function describeChanges(form: ProviderForm, baseline: Values, values: Values) {
  const changes: SettingsDraftChange[] = [];
  for (const field of providerFormFields(form)) {
    if (values[field.key] === baseline[field.key]) continue;
    if (field.type === "secret") {
      changes.push({ label: field.label });
      continue;
    }
    const show = (source: Values) => {
      const value = source[field.key] ?? "";
      if (field.type === "choice")
        return field.options.find(option => option.value === value)?.label ?? value;
      if (field.type === "switch") return value === "true" ? "开" : "关";
      if (field.type === "service-choice") return value ? source[field.labelKey] || value : "默认";
      return value;
    };
    changes.push({ label: field.label, from: show(baseline), to: show(values) });
  }
  return changes;
}

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

function CapabilityHeader({
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
    <SettingsCardHeader
      icon={
        <SettingsCardIcon
          icon={Icon}
          className={target === "sync" ? "bg-tag-2-soft text-tag-2" : "bg-tag-4-soft text-tag-4"}
        />
      }
      title={target === "sync" ? "同步服务" : "资源存储"}
      status={current && <StatusChip tone="ok">使用中</StatusChip>}
      description={
        current
          ? target === "sync"
            ? "数据库与资源文件正同步到这里"
            : "新插入的图片与附件上传到这里"
          : configured
            ? "配置已保存，尚未使用"
            : "填写下方配置并保存后可使用"
      }
      actions={
        <>
          {!current && (
            <Button
              size="sm"
              disabled={!configured}
              loading={switcher.probing === pluginId}
              loadingText="连接中…"
              onClick={() =>
                target === "sync"
                  ? void switcher.request(pluginId, name)
                  : selectUploadTarget(pluginId)
              }
            >
              {target === "sync" ? "设为同步服务" : "设为上传目标"}
            </Button>
          )}
          {switcher.dialog}
        </>
      }
    />
  );
}

/** 表单与宿主存储的连接：读已存配置、写回配置，可选的保存后测试与头部卡片。 */
export interface ProviderFormBinding {
  stored: JsonValue | undefined;
  persist(config: JsonValue): Promise<void>;
  /** 保存成功后执行（如连接测试），返回结果行文案；抛错时提示「已保存，但…」 */
  afterSave?(config: JsonValue): Promise<string>;
  /** 保存中的进度文案 */
  savingText?: string;
  saveLabel?: string;
  /** 卡头（选用状态、账号身份等），见 SettingsCardHeader */
  header?: ReactNode;
  /** 自动保存（停止输入片刻、离开时落盘），不显示保存栏；所在容器自带「修改自动保存」语义时使用 */
  autoSave?: boolean;
  /** 字段布局，见 ProviderFormFields */
  layout?: "rows" | "inline";
}

const AUTO_SAVE_DELAY = 600;

export function useStorageBinding(
  target: "sync" | "upload",
  pluginId: string,
  name: string,
  form: ProviderForm
): ProviderFormBinding {
  const stored = useStoredConfig(target, pluginId);
  return {
    stored,
    persist: config => saveProviderConfig(target, pluginId, config),
    afterSave:
      target === "sync"
        ? async config => {
            const remote = await probeRemoteDatabaseVersion(pluginId, config);
            return remote.version > 0
              ? `连接正常 · 云端已有数据库 v${remote.version}`
              : "连接正常 · 云端还没有这个数据库，首次同步会上传";
          }
        : undefined,
    savingText: target === "sync" ? "正在保存并测试连接…" : undefined,
    saveLabel: target === "sync" ? "保存并测试" : undefined,
    header: (
      <CapabilityHeader
        target={target}
        pluginId={pluginId}
        name={name}
        configured={isProviderFormComplete(form, stored)}
      />
    ),
  };
}

export function ProviderFormView({
  form,
  context,
  binding,
  children,
  changed = false,
  onReset,
}: {
  form: ProviderForm;
  context: PluginContext;
  binding: ProviderFormBinding;
  /** 字段小节之后、卡脚之前的宿主小节（如账号的模型列表），随同一次保存提交 */
  children?: ReactNode;
  /** 宿主控件有未保存的修改 */
  changed?: boolean;
  onReset?(): void;
}) {
  const { stored } = binding;
  const storedKey = JSON.stringify(stored ?? null);
  // 已存配置变化（保存成功、同步回写）后以新值为基线
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const baseline = useMemo(() => readProviderFormValues(form, stored), [form, storedKey]);
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

  // 自动保存时串行写入：进行中再次触发只记一次，结束后按最新值补写
  const inFlight = useRef(false);
  const again = useRef(false);
  const valuesRef = useRef(values);
  valuesRef.current = values;

  // 写入并返回结果文案；字段错误标在字段上后抛出，由调用方显示
  const commit = async (values: Values): Promise<string> => {
    let prepared: Values;
    try {
      prepared = form.beforeSave ? { ...(await form.beforeSave(values, context.signal)) } : values;
    } catch (error) {
      if (isProviderFieldError(error)) setErrors({ [error.key]: error.message });
      throw error;
    }
    context.signal.throwIfAborted();
    const config = mergeProviderFormValues(stored, prepared);
    await binding.persist(config);
    context.signal.throwIfAborted();
    // 保存期间用户继续输入时保留输入，基线随已存配置更新
    if (valuesRef.current === values) setValues(readProviderFormValues(form, config));
    if (!binding.afterSave) return "配置已保存";
    try {
      return await binding.afterSave(config);
    } catch (error) {
      throw new Error(`配置已保存，但连接失败：${errorText(error)}`, { cause: error });
    }
  };

  const save = async () => {
    if (inFlight.current) {
      again.current = true;
      return;
    }
    const values = valuesRef.current;
    // 自动保存允许保存未填完的草稿，完整性由所在页面的连接检测说明
    const missing = binding.autoSave ? {} : validateProviderFormValues(form, values);
    setErrors(missing);
    if (Object.keys(missing).length > 0) return;
    inFlight.current = true;
    setSaving(true);
    setOutcome(null);
    try {
      setOutcome({ tone: "ok", text: await commit(values) });
    } catch (error) {
      if (!context.signal.aborted && !isProviderFieldError(error))
        setOutcome({ tone: "danger", text: errorText(error) });
    } finally {
      inFlight.current = false;
      if (!context.signal.aborted) setSaving(false);
      if (again.current && !context.signal.aborted) {
        again.current = false;
        void saveRef.current();
      }
    }
  };

  const reset = () => {
    setValues(baseline);
    onReset?.();
    setErrors({});
    setOutcome(null);
  };

  // 插件设置分区内：保存条、⌘S 与离开确认由宿主承担
  const missing = validateProviderFormValues(form, values);
  const errorCount = Object.keys(missing).length;
  const draft = useSettingsDraft({
    dirty: !binding.autoSave && dirty,
    errors: errorCount,
    changes: [...describeChanges(form, baseline, values), ...(changed ? [{ label: "模型" }] : [])],
    saveLabel: binding.saveLabel,
    savingText: binding.savingText,
    onInvalid: () => setErrors(missing),
    save: () => commit(valuesRef.current),
    reset,
  });

  // 自动保存：值变化后防抖落盘，卸载时冲掉未到期的修改；校验未过时等用户补全
  const saveRef = useRef(save);
  saveRef.current = save;
  const pendingRef = useRef(false);
  pendingRef.current = dirty;
  useEffect(() => {
    if (!binding.autoSave || !dirty) return;
    const timer = setTimeout(() => void saveRef.current(), AUTO_SAVE_DELAY);
    return () => clearTimeout(timer);
  }, [binding.autoSave, dirty, values]);
  useEffect(
    () => () => {
      if (binding.autoSave && pendingRef.current) void saveRef.current();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const fields = (
    <ProviderFormFields
      form={form}
      values={values}
      errors={errors}
      disabled={(saving || !!draft?.saving) && !binding.autoSave}
      context={context}
      layout={binding.layout}
      onChange={patch}
    />
  );
  if (binding.autoSave)
    return (
      <div className="min-w-0">
        {binding.header}
        {fields}
        {outcome?.tone === "danger" && (
          <p
            role="alert"
            className="text-tau-meta text-danger border-line-2 flex items-center gap-1.5 border-t px-3 py-2"
          >
            <CircleAlert size={14} className="flex-none" />
            <span className="min-w-0">{outcome.text}</span>
          </p>
        )}
      </div>
    );

  if (draft)
    return (
      <SettingsCard
        header={binding.header}
        footer={
          // 默认值已可用但从未保存：没有改动不会出现保存条，这里给一个保存入口
          stored === undefined &&
          !dirty &&
          errorCount === 0 && (
            <div className="flex items-center gap-2">
              <p className="text-tau-meta text-ink-2 min-w-0 flex-1">尚未保存，保存后即可使用</p>
              <Button variant="primary" loading={draft.saving} onClick={() => void draft.save()}>
                {binding.saveLabel ?? "保存"}
              </Button>
            </div>
          )
        }
      >
        {fields}
        {children}
      </SettingsCard>
    );

  const saveBar = (
    <div className="flex items-center gap-2">
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
            {binding.savingText ?? "正在保存…"}
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
      <Button variant="ghost" disabled={!dirty || saving} onClick={reset}>
        还原
      </Button>
      <Button variant="primary" disabled={!dirty && configured} loading={saving} onClick={save}>
        {binding.saveLabel ?? "保存"}
      </Button>
    </div>
  );
  return (
    <SettingsCard header={binding.header} footer={saveBar}>
      {fields}
      {children}
    </SettingsCard>
  );
}
