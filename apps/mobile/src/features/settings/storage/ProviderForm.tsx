// 存储服务配置表单（移动）：按插件声明的分组渲染，行即输入框、上标签下值；
// 选择类字段推入全屏选择层，不用居中弹窗或下拉浮层。保存由服务页决定时机。

import { useEffect, useRef, useState } from "react";
import { Check, ChevronRight, CircleAlert, Eye, EyeOff, LoaderCircle, Search } from "lucide-react";
import {
  patchProviderFormValues,
  type ProviderChoiceField,
  type ProviderChoiceOption,
  type ProviderField,
  type ProviderForm,
  type ProviderRemoteChoiceField,
} from "@tau/plugins";
import { GroupLabel } from "../../../components/GroupLabel";
import { PageHeader } from "../../../components/PageHeader";
import { useBackHandler } from "../../../router";
import { GroupCard } from "../components/ui";

type Values = Record<string, string>;

const FIELD_ROW =
  "relative block px-[14px] py-2.5 [&+&]:before:absolute [&+&]:before:left-[14px] [&+&]:before:right-0 [&+&]:before:top-0 [&+&]:before:h-px [&+&]:before:bg-line-1";

function FieldLabel(props: { field: ProviderField; error?: string }) {
  return (
    <span className={`text-tau-sm block ${props.error ? "text-danger" : "text-ink-3"}`}>
      {props.field.label}
      {props.field.optional && " · 可选"}
    </span>
  );
}

function FieldError(props: { error?: string }) {
  if (!props.error) return null;
  return <span className="text-danger text-tau-sm mt-0.5 block">{props.error}</span>;
}

function TextFieldRow(props: {
  field: ProviderField;
  value: string;
  error?: string;
  disabled: boolean;
  onChange(value: string): void;
}) {
  const [visible, setVisible] = useState(false);
  const secret = props.field.type === "secret";
  return (
    <label className={FIELD_ROW}>
      <FieldLabel field={props.field} error={props.error} />
      <span className="flex min-h-[28px] items-center gap-2">
        <input
          aria-label={props.field.label}
          aria-invalid={!!props.error || undefined}
          value={props.value}
          type={secret && !visible ? "password" : props.field.type === "url" ? "url" : "text"}
          inputMode={props.field.type === "url" ? "url" : undefined}
          placeholder={props.field.placeholder}
          disabled={props.disabled}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          className="input-text text-ink-1 placeholder:text-ink-3 min-w-0 flex-1 bg-transparent outline-none"
          onChange={event => props.onChange(event.currentTarget.value)}
        />
        {secret && (
          <button
            type="button"
            aria-label={visible ? "隐藏" : "显示"}
            className="text-ink-3 -mr-1 grid h-8 w-8 place-items-center"
            onClick={event => {
              event.preventDefault();
              setVisible(value => !value);
            }}
          >
            {visible ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        )}
      </span>
      <FieldError error={props.error} />
    </label>
  );
}

function optionLabel(field: ProviderChoiceField | ProviderRemoteChoiceField, value: string) {
  if (field.type === "choice")
    return field.options.find(option => option.value === value)?.label ?? value;
  return value;
}

function ChoiceFieldRow(props: {
  field: ProviderChoiceField | ProviderRemoteChoiceField;
  value: string;
  error?: string;
  disabled: boolean;
  onOpen(): void;
}) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      className={`${FIELD_ROW} active:bg-hover w-full text-left`}
      onClick={props.onOpen}
    >
      <FieldLabel field={props.field} error={props.error} />
      <span className="flex min-h-[28px] items-center gap-2">
        <span
          className={`text-tau-body min-w-0 flex-1 truncate ${props.value ? "text-ink-1" : "text-ink-3"}`}
        >
          {props.value
            ? optionLabel(props.field, props.value)
            : (props.field.placeholder ?? "请选择")}
        </span>
        <ChevronRight size={18} className="text-ink-3 shrink-0" aria-hidden="true" />
      </span>
      <FieldError error={props.error} />
    </button>
  );
}

/** 全屏选择层：勾选列表 + 搜索；远程选项在本层加载与重试，可改为手动输入。 */
function ChoiceScreen(props: {
  field: ProviderChoiceField | ProviderRemoteChoiceField;
  values: Values;
  signal: AbortSignal;
  onPick(value: string): void;
  onClose(): void;
}) {
  const { field } = props;
  const remote = field.type === "remote-choice";
  const [options, setOptions] = useState<readonly ProviderChoiceOption[]>(
    field.type === "choice" ? field.options : []
  );
  const [state, setState] = useState<"idle" | "loading" | "error">(remote ? "loading" : "idle");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [manual, setManual] = useState(false);
  const [draft, setDraft] = useState(props.values[field.key] ?? "");
  const request = useRef(0);
  useBackHandler(() => {
    props.onClose();
    return true;
  });

  const load = async () => {
    if (field.type !== "remote-choice") return;
    const current = ++request.current;
    setState("loading");
    try {
      const result = await field.load(props.values, props.signal);
      if (current !== request.current) return;
      setOptions(result);
      setState("idle");
    } catch (issue) {
      if (current !== request.current) return;
      setError(issue instanceof Error ? issue.message : "加载失败");
      setState("error");
    }
  };
  useEffect(() => {
    const pending = request;
    void load();
    return () => {
      pending.current++;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = props.values[field.key] ?? "";
  const keyword = query.trim().toLowerCase();
  const visible = keyword
    ? options.filter(option =>
        `${option.value} ${option.label ?? ""} ${option.description ?? ""}`
          .toLowerCase()
          .includes(keyword)
      )
    : options;

  return (
    <div className="mobile-kb-screen bg-page fixed inset-0 z-[60] flex flex-col">
      <PageHeader title={`选择${field.label}`} onBack={props.onClose} />
      <div className="mobile-page-scroll flex-1 overflow-y-auto px-4">
        {manual ? (
          <>
            <GroupLabel>手动输入</GroupLabel>
            <GroupCard>
              <label className={FIELD_ROW}>
                <span className="text-tau-sm text-ink-3 block">{field.label}</span>
                <input
                  aria-label={field.label}
                  autoFocus
                  value={draft}
                  autoCapitalize="off"
                  autoCorrect="off"
                  autoComplete="off"
                  spellCheck={false}
                  className="input-text text-ink-1 min-h-[28px] w-full bg-transparent outline-none"
                  onChange={event => setDraft(event.currentTarget.value)}
                />
              </label>
            </GroupCard>
            <button
              type="button"
              disabled={!draft.trim()}
              className="bg-accent text-ink-inverse text-tau-body mt-4 h-12 w-full rounded-[14px] font-semibold disabled:opacity-50"
              onClick={() => props.onPick(draft.trim())}
            >
              使用「{draft.trim() || field.label}」
            </button>
          </>
        ) : (
          <>
            {options.length > 6 && (
              <div className="bg-surface text-ink-3 mt-1 flex h-10 items-center gap-2 rounded-xl px-3">
                <Search size={17} aria-hidden="true" />
                <input
                  aria-label={`搜索${field.label}`}
                  value={query}
                  placeholder={`搜索${field.label}`}
                  className="input-text text-ink-1 placeholder:text-ink-3 min-w-0 flex-1 bg-transparent outline-none"
                  onChange={event => setQuery(event.currentTarget.value)}
                />
              </div>
            )}
            <GroupLabel>{field.description ?? "可选项"}</GroupLabel>
            <GroupCard>
              {state === "loading" ? (
                <div className="setting-row">
                  <LoaderCircle size={18} className="text-ink-3 animate-spin" aria-hidden="true" />
                  <span className="text-ink-2 text-tau-body">正在加载…</span>
                </div>
              ) : state === "error" ? (
                <button type="button" className="setting-row" onClick={() => void load()}>
                  <CircleAlert size={18} className="text-danger shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="text-danger text-tau-body block">{error}</span>
                    <span className="text-ink-3 text-tau-sm block">点按重试</span>
                  </span>
                </button>
              ) : visible.length === 0 ? (
                <div className="setting-row">
                  <span className="text-ink-3 text-tau-body">
                    {keyword ? "没有匹配的项" : "暂无可选项"}
                  </span>
                </div>
              ) : (
                visible.map(option => (
                  <button
                    key={option.value}
                    type="button"
                    className={
                      FIELD_ROW + " active:bg-hover flex w-full items-center gap-3 text-left"
                    }
                    onClick={() => props.onPick(option.value)}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="text-ink-1 text-tau-body block truncate">
                        {option.label ?? option.value}
                      </span>
                      {option.description && (
                        <span className="text-ink-3 text-tau-sm block truncate">
                          {option.description}
                        </span>
                      )}
                    </span>
                    {option.value === selected && (
                      <Check size={20} className="text-accent shrink-0" aria-label="已选" />
                    )}
                  </button>
                ))
              )}
            </GroupCard>
            {remote && (
              <>
                <div className="mt-4" />
                <GroupCard>
                  <button type="button" className="setting-row" onClick={() => setManual(true)}>
                    <span className="text-accent-text text-tau-body">手动输入{field.label}</span>
                  </button>
                </GroupCard>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function MobileProviderForm(props: {
  form: ProviderForm;
  values: Values;
  errors: Readonly<Record<string, string>>;
  disabled: boolean;
  signal: AbortSignal;
  onChange(values: Values, key: string): void;
}) {
  const [choosing, setChoosing] = useState<ProviderChoiceField | ProviderRemoteChoiceField | null>(
    null
  );
  const patch = (key: string, value: string) =>
    props.onChange(patchProviderFormValues(props.form, props.values, key, value), key);
  return (
    <>
      {props.form.groups.map(group => (
        <section key={group.title} aria-label={group.title}>
          <GroupLabel>{group.title}</GroupLabel>
          <GroupCard>
            {group.fields.map(field =>
              field.type === "choice" || field.type === "remote-choice" ? (
                <ChoiceFieldRow
                  key={field.key}
                  field={field}
                  value={props.values[field.key] ?? ""}
                  error={props.errors[field.key]}
                  disabled={props.disabled}
                  onOpen={() => setChoosing(field)}
                />
              ) : (
                <TextFieldRow
                  key={field.key}
                  field={field}
                  value={props.values[field.key] ?? ""}
                  error={props.errors[field.key]}
                  disabled={props.disabled}
                  onChange={value => patch(field.key, value)}
                />
              )
            )}
          </GroupCard>
          {group.description && (
            <p className="text-ink-3 text-tau-sm px-[15px] pt-[7px] leading-relaxed">
              {group.description}
            </p>
          )}
        </section>
      ))}
      {choosing && (
        <ChoiceScreen
          field={choosing}
          values={props.values}
          signal={props.signal}
          onClose={() => setChoosing(null)}
          onPick={value => {
            patch(choosing.key, value);
            setChoosing(null);
          }}
        />
      )}
    </>
  );
}
