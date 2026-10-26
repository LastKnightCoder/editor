/**
 * 声明式提供方表单的字段区：按插件声明的分组渲染 SettingsGroup 式面板，
 * 字段按类型选择控件（密钥 / 文本 / 地址 / 选择 / 远程选择 / 开关）。
 * 只负责展示与改值，保存与选用由 ProviderFormView 的绑定决定。
 */

import { useRef, useState } from "react";
import { ExternalLink, Eye, EyeOff } from "lucide-react";
import {
  isProviderFieldVisible,
  type PluginContext,
  type ProviderChoiceField,
  type ProviderChoiceOption,
  type ProviderField,
  type ProviderForm,
  type ProviderRemoteChoiceField,
  type ProviderServiceChoiceField,
} from "@tau/plugins";
import { createContext, useContext, type ReactNode } from "react";
import {
  Button,
  IconButton,
  Input,
  Panel,
  Segmented,
  Select,
  SettingRow,
  Switch,
  cn,
} from "@tau/ui";
import { openExternal } from "@/commands/extra";

type Values = Record<string, string>;

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));
/** 控件宽度：行式布局定宽 300px 与其它设置行右缘对齐，堆叠布局铺满 */
const FieldWidthContext = createContext("w-[300px] max-w-full");
const useFieldWidth = () => useContext(FieldWidthContext);

/** 选项少且都短时平铺为分段器，否则用下拉 */
function prefersSegmented(field: ProviderChoiceField) {
  return (
    field.options.length <= 3 &&
    field.options.every(option => (option.label ?? option.value).length <= 8)
  );
}

function SecretInput(props: {
  label: string;
  value: string;
  invalid: boolean;
  disabled: boolean;
  placeholder?: string;
  onChange(value: string): void;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className={`relative ${useFieldWidth()}`}>
      <Input
        className="font-tau-mono pr-8"
        aria-label={props.label}
        aria-invalid={props.invalid}
        type={visible ? "text" : "password"}
        value={props.value}
        placeholder={props.placeholder}
        autoComplete="off"
        spellCheck={false}
        disabled={props.disabled}
        onChange={event => props.onChange(event.target.value)}
      />
      <div className="absolute inset-y-0 right-1 flex items-center">
        <IconButton
          className="size-6"
          aria-label={visible ? "隐藏" : "显示"}
          onClick={() => setVisible(value => !value)}
        >
          {visible ? <EyeOff size={14} /> : <Eye size={14} />}
        </IconButton>
      </div>
    </div>
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
      className={useFieldWidth()}
      aria-label={props.field.label}
      aria-invalid={props.invalid}
      status={props.invalid ? "error" : undefined}
      searchable
      creatable
      disabled={props.disabled}
      placeholder={props.field.placeholder ?? "请选择"}
      emptyText={state === "loading" ? "正在加载…" : state === "error" ? error : "无可选项"}
      value={value || null}
      options={merged.map(option => ({
        value: option.value,
        label: option.label ?? option.value,
      }))}
      onOpenChange={open => {
        if (open) void load();
      }}
      onValueChange={props.onChange}
    />
  );
}

/** 宿主服务选择：值由服务给出，显示名一起写入；可恢复为宿主默认（清空）。 */
function ServiceChoice(props: {
  field: ProviderServiceChoiceField;
  values: Values;
  disabled: boolean;
  context: PluginContext;
  onChange(key: string, value: string): void;
}) {
  const { field } = props;
  const [error, setError] = useState("");
  const value = props.values[field.key] ?? "";
  const label = props.values[field.labelKey] ?? "";
  const choose = async () => {
    setError("");
    try {
      const picked = await props.context.services.git.selectCacheDirectory({});
      if (!picked) return;
      props.onChange(field.key, picked.id);
      props.onChange(field.labelKey, picked.label);
    } catch (issue) {
      setError(errorText(issue));
    }
  };
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <span
        className={`text-tau-meta max-w-[180px] min-w-0 truncate ${value ? "text-ink-1" : "text-ink-3"} ${error ? "text-danger" : ""}`}
        title={error || label || undefined}
      >
        {error || (value ? label || value : (field.placeholder ?? "默认"))}
      </span>
      <Button size="sm" variant="secondary" disabled={props.disabled} onClick={() => void choose()}>
        选择…
      </Button>
      {value && (
        <Button
          size="sm"
          variant="ghost"
          disabled={props.disabled}
          onClick={() => {
            props.onChange(field.key, "");
            props.onChange(field.labelKey, "");
          }}
        >
          恢复默认
        </Button>
      )}
    </div>
  );
}

function ChoiceControl(props: {
  field: ProviderChoiceField;
  value: string;
  invalid: boolean;
  disabled: boolean;
  onChange(value: string): void;
}) {
  const { field } = props;
  const width = useFieldWidth();
  if (prefersSegmented(field))
    return (
      <Segmented
        label={field.label}
        size="md"
        value={props.value}
        disabled={props.disabled}
        onValueChange={props.onChange}
      >
        {field.options.map(option => (
          <Segmented.Item
            key={option.value}
            value={option.value}
            label={option.label ?? option.value}
          />
        ))}
      </Segmented>
    );
  return (
    <Select
      className={width}
      aria-label={field.label}
      status={props.invalid ? "error" : undefined}
      disabled={props.disabled}
      value={props.value || null}
      options={field.options.map(option => ({
        value: option.value,
        label: option.label ?? option.value,
      }))}
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
  context: PluginContext;
  onChange(value: string): void;
  onPatch(key: string, value: string): void;
}) {
  const { field } = props;
  const width = useFieldWidth();
  const value = props.values[field.key] ?? "";
  if (field.type === "service-choice")
    return (
      <ServiceChoice
        field={field}
        values={props.values}
        disabled={props.disabled}
        context={props.context}
        onChange={props.onPatch}
      />
    );
  if (field.type === "secret")
    return (
      <SecretInput
        label={field.label}
        value={value}
        placeholder={field.placeholder}
        invalid={props.invalid}
        disabled={props.disabled}
        onChange={props.onChange}
      />
    );
  if (field.type === "switch")
    return (
      <Switch
        aria-label={field.label}
        checked={value === "true"}
        disabled={props.disabled}
        onCheckedChange={checked => props.onChange(String(checked))}
      />
    );
  if (field.type === "choice")
    return (
      <ChoiceControl
        field={field}
        value={value}
        invalid={props.invalid}
        disabled={props.disabled}
        onChange={props.onChange}
      />
    );
  if (field.type === "remote-choice") return <RemoteChoice {...props} field={field} />;
  return (
    <Input
      wrapperClassName={width}
      className={field.type === "url" ? "font-tau-mono" : undefined}
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

function GroupLink({ link }: { link: { label: string; url: string } }) {
  return (
    <Button
      size="sm"
      variant="ghost"
      icon={ExternalLink}
      onClick={() => void openExternal(link.url)}
    >
      {link.label}
    </Button>
  );
}

/** 嵌入行：度量同发布抽屉的组内行（64px 标签 + 控件，行间 line-2），说明在控件下方 */
function InlineRow({
  field,
  error,
  note,
  children,
}: {
  field: ProviderField;
  error?: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <div className="border-line-2 grid min-h-[46px] grid-cols-[64px_minmax(0,1fr)] items-center gap-3 border-t px-3 py-2">
      <span className="text-tau-meta text-ink-2 break-words">{field.label}</span>
      <div className="flex min-w-0 flex-col gap-1">
        {children}
        {(error || note) && (
          <span className={cn("text-tau-micro", error ? "text-danger" : "text-ink-3")}>
            {error ?? note}
          </span>
        )}
      </div>
    </div>
  );
}

/** 字段行说明：错误优先；选择字段附上当前选项的说明，可选字段标注「可选」。 */
function fieldNote(field: ProviderField, value: string) {
  const option =
    field.type === "choice"
      ? field.options.find(item => item.value === value)?.description
      : undefined;
  const optional =
    field.type !== "switch" && field.type !== "service-choice" && field.optional ? "可选" : "";
  return [field.description, option, optional].filter(Boolean).join("，") || undefined;
}

export function ProviderFormFields({
  form,
  values,
  errors,
  disabled,
  context,
  layout = "rows",
  onChange,
}: {
  form: ProviderForm;
  values: Values;
  errors: Readonly<Record<string, string>>;
  disabled: boolean;
  context: PluginContext;
  /**
   * rows：设置页的分组面板 + 左标题右控件；
   * inline：嵌进宿主已有的分组容器（发布抽屉），不再套面板，行为窄标签 + 整宽控件
   */
  layout?: "rows" | "inline";
  onChange(key: string, value: string): void;
}) {
  return (
    <FieldWidthContext.Provider value={layout === "inline" ? "w-full" : "w-[300px] max-w-full"}>
      {form.groups.map(group => {
        const visible = group.fields.filter(field => isProviderFieldVisible(field, values));
        if (!visible.length) return null;
        if (layout === "inline")
          return visible.map(field => (
            <InlineRow
              key={field.key}
              field={field}
              error={errors[field.key]}
              note={fieldNote(field, values[field.key] ?? "")}
            >
              <FieldControl
                field={field}
                values={values}
                invalid={!!errors[field.key]}
                disabled={disabled}
                signal={context.signal}
                context={context}
                onChange={value => onChange(field.key, value)}
                onPatch={onChange}
              />
            </InlineRow>
          ));
        return (
          <section key={group.title} className="mb-6 last:mb-0" aria-label={group.title}>
            <div className="flex items-end gap-3 px-1 pb-2">
              <div className="min-w-0 flex-1">
                <h3 className="text-tau-body-lg text-ink-1 font-semibold">{group.title}</h3>
                {group.description && (
                  <p className="text-tau-meta text-ink-2">{group.description}</p>
                )}
              </div>
              {group.link && <GroupLink link={group.link} />}
            </div>
            <Panel pad="none" className="rounded-[14px] p-1.5">
              {visible.map(field => {
                const error = errors[field.key];
                const note = fieldNote(field, values[field.key] ?? "");
                const control = (
                  <FieldControl
                    field={field}
                    values={values}
                    invalid={!!error}
                    disabled={disabled}
                    signal={context.signal}
                    context={context}
                    onChange={value => onChange(field.key, value)}
                    onPatch={onChange}
                  />
                );
                const description = error ? <span className="text-danger">{error}</span> : note;
                return (
                  <SettingRow key={field.key} title={field.label} description={description}>
                    {control}
                  </SettingRow>
                );
              })}
            </Panel>
          </section>
        );
      })}
    </FieldWidthContext.Provider>
  );
}
