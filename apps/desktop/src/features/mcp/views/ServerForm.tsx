import { useMcpFormsI18n } from "../forms.i18n";
import { configIssueText, configErrorText } from "../serverConfigDisplay";
import type { ServerConfigIssue } from "../serverConfigIssues";
/**
 * 服务器配置表单：添加弹窗「手动填写」与详情抽屉「配置」共用。
 * 参数逐项编辑（回车添加，可含空格路径）；环境变量 / 请求头为键值表，密钥类键名的值默认遮蔽；
 * 「以 JSON 编辑」与表单双向同步，JSON 格式与 `mcpServers` 条目的值一致。
 */

import { useState, type ReactNode } from "react";
import {
  Braces,
  Cloud,
  Eye,
  EyeOff,
  FolderOpen,
  ListChecks,
  Plus,
  Terminal,
  X,
} from "lucide-react";
import { Button, IconButton, Input, Segmented, Textarea, cn } from "@tau/ui";
import { selectDirectoryWithDialog } from "@/commands/extra";
import {
  draftToPayload,
  isSensitiveKey,
  parseServersJson,
  transportToJson,
  validateDraft,
  type KeyValue,
  type ServerDraft,
  type TransportType,
} from "../serverConfig";

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-[5px]">
      <span className="text-tau-sm text-ink-2 font-medium">
        {label}
        {hint && <small className="text-ink-3 ml-1.5 text-[11px] font-normal">{hint}</small>}
      </span>
      {children}
    </div>
  );
}

function ArgsEditor({ args, onChange }: { args: string[]; onChange: (args: string[]) => void }) {
  const { t } = useMcpFormsI18n();
  const [input, setInput] = useState("");
  const commit = () => {
    const value = input.trim();
    if (!value) return;
    onChange([...args, value]);
    setInput("");
  };
  return (
    <div className="border-line-1 bg-surface focus-within:border-accent rounded-tau-sm flex min-h-[34px] flex-wrap items-center gap-1.5 border px-1.5 py-1 transition-[border-color,box-shadow] duration-[160ms] focus-within:shadow-[var(--tau-focus-ring)]">
      {args.map((arg, index) => (
        <span
          key={`${index}-${arg}`}
          className="bg-hover font-tau-mono text-ink-1 inline-flex h-6 max-w-full items-center gap-1 rounded-[7px] pr-0.5 pl-2 text-[12px]"
        >
          <span className="truncate">{arg}</span>
          <IconButton
            aria-label={t("args.remove", { arg })}
            className="text-ink-3 size-5 rounded-[5px]"
            onClick={() => onChange(args.filter((_, i) => i !== index))}
          >
            <X className="size-3" strokeWidth={1.75} />
          </IconButton>
        </span>
      ))}
      <input
        value={input}
        onChange={e => setInput(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Backspace" && !input && args.length > 0) {
            onChange(args.slice(0, -1));
          }
        }}
        onPaste={e => {
          const text = e.clipboardData.getData("text");
          if (!text.includes("\n")) return;
          e.preventDefault();
          onChange([
            ...args,
            ...text
              .split(/\r?\n/)
              .map(s => s.trim())
              .filter(Boolean),
          ]);
        }}
        placeholder={t(args.length === 0 ? "args.empty" : "args.add")}
        className="font-tau-mono text-ink-1 placeholder:text-ink-3 placeholder:font-tau h-6 min-w-[120px] flex-1 bg-transparent px-1 text-[12px] outline-none"
      />
    </div>
  );
}

function SecretInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const { t } = useMcpFormsI18n();
  const [shown, setShown] = useState(false);
  return (
    <div className="flex min-w-0 flex-1 items-center">
      <input
        type={shown ? "text" : "password"}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        className="font-tau-mono text-ink-1 placeholder:text-ink-3 h-[32px] min-w-0 flex-1 bg-transparent px-2.5 text-[12px] outline-none"
      />
      <IconButton
        aria-label={t(shown ? "secret.hide" : "secret.show")}
        className="text-ink-3 mr-1 size-6 rounded-[6px]"
        onClick={() => setShown(v => !v)}
      >
        {shown ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
      </IconButton>
    </div>
  );
}

function KeyValueEditor({
  pairs,
  onChange,
  keyPlaceholder,
  addLabel,
}: {
  pairs: KeyValue[];
  onChange: (pairs: KeyValue[]) => void;
  keyPlaceholder: string;
  addLabel: string;
}) {
  const { t } = useMcpFormsI18n();
  const update = (index: number, patch: Partial<KeyValue>) =>
    onChange(pairs.map((pair, i) => (i === index ? { ...pair, ...patch } : pair)));
  return (
    <div className="flex flex-col gap-1.5">
      {pairs.map((pair, index) => (
        <div
          key={index}
          className="border-line-1 bg-surface focus-within:border-accent rounded-tau-sm flex items-center border transition-[border-color,box-shadow] duration-[160ms] focus-within:shadow-[var(--tau-focus-ring)]"
        >
          <input
            value={pair.key}
            onChange={e => update(index, { key: e.target.value })}
            placeholder={keyPlaceholder}
            autoComplete="off"
            className="font-tau-mono text-ink-1 placeholder:text-ink-3 h-[32px] w-[38%] min-w-0 bg-transparent px-2.5 text-[12px] outline-none"
          />
          <span className="bg-line-1 h-4 w-px shrink-0" />
          {isSensitiveKey(pair.key) ? (
            <SecretInput
              value={pair.value}
              onChange={value => update(index, { value })}
              placeholder={t("pair.value")}
            />
          ) : (
            <input
              value={pair.value}
              onChange={e => update(index, { value: e.target.value })}
              placeholder={t("pair.value")}
              autoComplete="off"
              className="font-tau-mono text-ink-1 placeholder:text-ink-3 h-[32px] min-w-0 flex-1 bg-transparent px-2.5 text-[12px] outline-none"
            />
          )}
          <IconButton
            aria-label={t("pair.remove")}
            className="text-ink-3 mr-1 size-6 shrink-0 rounded-[6px]"
            onClick={() => onChange(pairs.filter((_, i) => i !== index))}
          >
            <X className="size-3.5" strokeWidth={1.75} />
          </IconButton>
        </div>
      ))}
      <Button
        variant="ghost"
        size="sm"
        icon={Plus}
        className="self-start"
        onClick={() => onChange([...pairs, { key: "", value: "" }])}
      >
        {addLabel}
      </Button>
    </div>
  );
}

function JsonEditor({
  draft,
  onChange,
}: {
  draft: ServerDraft;
  onChange: (draft: ServerDraft) => void;
}) {
  const { t } = useMcpFormsI18n();
  const [text, setText] = useState(() =>
    JSON.stringify(transportToJson(draftToPayload(draft).transport), null, 2)
  );
  const [error, setError] = useState<ServerConfigIssue | Error | null>(null);
  const apply = (value: string) => {
    setText(value);
    try {
      const [entry] = parseServersJson(value);
      // 名称与描述以表单为准（粘贴的完整 mcpServers 带名称时补上空名称）
      const next = {
        ...entry.draft,
        name: draft.name || entry.draft.name,
        description: draft.description || entry.draft.description,
      };
      const invalid = validateDraft({ ...next, name: next.name || "_" });
      if (invalid) {
        setError(entry.error && entry.error.code !== "nameRequired" ? entry.error : invalid);
        return;
      }
      onChange(next);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    }
  };
  return (
    <div className="flex flex-col gap-1.5">
      <Textarea
        value={text}
        onChange={e => apply(e.target.value)}
        spellCheck={false}
        rows={10}
        aria-invalid={error ? true : undefined}
        className="font-tau-mono text-[12px] leading-[1.7]"
      />
      <span className={cn("text-tau-micro", error ? "text-danger" : "text-ink-3")}>
        {error
          ? error instanceof Error
            ? configErrorText(error, t)
            : configIssueText(error, t)
          : t("json.hint")}
      </span>
    </div>
  );
}

export function ServerForm({
  draft,
  onChange,
  identityReadOnly = false,
}: {
  draft: ServerDraft;
  onChange: (draft: ServerDraft) => void;
  identityReadOnly?: boolean;
}) {
  const { t } = useMcpFormsI18n();
  const [jsonMode, setJsonMode] = useState(false);
  const set = <K extends keyof ServerDraft>(key: K, value: ServerDraft[K]) =>
    onChange({ ...draft, [key]: value });
  const stdio = draft.type === "stdio";

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("field.name")}>
          <Input
            value={draft.name}
            readOnly={identityReadOnly}
            onChange={e => set("name", e.target.value)}
            placeholder={t("field.nameHint")}
            data-autofocus
          />
        </Field>
        <Field label={t("field.description")} hint={t("field.optional")}>
          <Input
            value={draft.description}
            readOnly={identityReadOnly}
            onChange={e => set("description", e.target.value)}
            placeholder={t("field.descriptionHint")}
          />
        </Field>
      </div>

      <div className="flex items-end justify-between gap-3">
        <Field label={t("field.transport")}>
          <Segmented
            label={t("field.transport")}
            size="sm"
            value={draft.type}
            onValueChange={(value: TransportType) => set("type", value)}
            disabled={jsonMode}
          >
            <Segmented.Item value="stdio" icon={Terminal} label={t("field.stdio")} />
            <Segmented.Item value="streamable-http" icon={Cloud} label={t("field.http")} />
          </Segmented>
        </Field>
        <Button
          variant="ghost"
          size="sm"
          icon={jsonMode ? ListChecks : Braces}
          aria-pressed={jsonMode}
          onClick={() => setJsonMode(v => !v)}
        >
          {t(jsonMode ? "form.back" : "form.json")}
        </Button>
      </div>

      {jsonMode ? (
        <JsonEditor draft={draft} onChange={onChange} />
      ) : stdio ? (
        <>
          <Field label={t("field.command")} hint={t("field.commandHint")}>
            <Input
              className="font-tau-mono"
              value={draft.command}
              onChange={e => set("command", e.target.value)}
              placeholder="npx"
            />
          </Field>
          <Field label={t("field.args")}>
            <ArgsEditor args={draft.args} onChange={args => set("args", args)} />
          </Field>
          <Field label={t("field.env")} hint={t("field.envHint")}>
            <KeyValueEditor
              pairs={draft.env}
              onChange={env => set("env", env)}
              keyPlaceholder={t("field.name")}
              addLabel={t("field.addEnv")}
            />
          </Field>
          <Field label={t("field.cwd")} hint={t("field.optional")}>
            <div className="flex gap-2">
              <Input
                className="font-tau-mono"
                value={draft.cwd}
                onChange={e => set("cwd", e.target.value)}
                placeholder={t("field.cwdHint")}
              />
              <Button
                variant="secondary"
                icon={FolderOpen}
                aria-label={t("field.chooseCwd")}
                onClick={async () => {
                  const dir = await selectDirectoryWithDialog();
                  if (dir) set("cwd", dir);
                }}
              />
            </div>
          </Field>
        </>
      ) : (
        <>
          <Field label="URL">
            <Input
              className="font-tau-mono"
              value={draft.url}
              onChange={e => set("url", e.target.value)}
              placeholder="https://example.com/mcp"
            />
          </Field>
          <Field label={t("field.headers")} hint={t("field.headersHint")}>
            <KeyValueEditor
              pairs={draft.headers}
              onChange={headers => set("headers", headers)}
              keyPlaceholder={t("field.name")}
              addLabel={t("field.addHeader")}
            />
          </Field>
        </>
      )}
    </div>
  );
}
