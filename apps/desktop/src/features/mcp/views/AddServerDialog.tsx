import { useMcpFormsI18n } from "../forms.i18n";
import { configIssueText, configErrorText } from "../serverConfigDisplay";
/**
 * 添加 MCP 服务器弹窗：手动填写 / 粘贴 JSON（可一次导入多个）。
 * 保存后由 tools 层自动连接，弹窗关闭并打开新服务器的详情。
 */

import { useMemo, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { Button, Checkbox, Dialog, DialogBody, Segmented, Textarea } from "@tau/ui";
import useMCPStore from "@/stores/useMCPStore";
import {
  emptyDraft,
  parseServersJson,
  validateDraft,
  type ImportEntry,
  type ServerDraft,
} from "../serverConfig";
import { importServers, saveServer } from "../useMcpServers";
import { ServerForm } from "./ServerForm";

type AddTab = "form" | "json";

const JSON_PLACEHOLDER = `{
  "mcpServers": {
    "playwright": { "command": "npx", "args": ["-y", "@playwright/mcp@latest"] },
    "context7": { "url": "https://mcp.context7.com/mcp" }
  }
}`;

function JsonImport({
  text,
  onTextChange,
  selected,
  onSelectedChange,
}: {
  text: string;
  onTextChange: (text: string) => void;
  selected: Set<number>;
  onSelectedChange: (selected: Set<number>) => void;
}) {
  const { t } = useMcpFormsI18n();
  const existing = useMCPStore(s => s.customServers);
  const { entries, error } = useMemo((): { entries: ImportEntry[]; error?: Error } => {
    if (!text.trim()) return { entries: [] };
    try {
      return { entries: parseServersJson(text) };
    } catch (e) {
      return { entries: [], error: e instanceof Error ? e : new Error(String(e)) };
    }
  }, [text]);
  const names = new Set(existing.map(s => s.name));

  return (
    <div className="flex flex-col gap-2">
      <span className="text-tau-sm text-ink-3">{t("import.hint")}</span>
      <Textarea
        value={text}
        onChange={e => {
          onTextChange(e.target.value);
          onSelectedChange(new Set());
        }}
        placeholder={JSON_PLACEHOLDER}
        spellCheck={false}
        rows={9}
        aria-invalid={error ? true : undefined}
        className="font-tau-mono text-[12px] leading-[1.7]"
        data-autofocus
      />
      {error && <span className="text-tau-sm text-danger">{configErrorText(error, t)}</span>}
      {entries.length > 0 && (
        <ul className="flex flex-col gap-0.5">
          {entries.map((entry, index) => {
            const ok = !entry.error;
            const overwrite = ok && names.has(entry.draft.name);
            return (
              <li
                key={index}
                className="text-tau-meta hover:bg-hover flex items-center gap-2.5 rounded-[9px] px-2 py-1.5"
              >
                <Checkbox
                  aria-label={t("import.select", {
                    name: entry.draft.name || t("import.untitled"),
                  })}
                  disabled={!ok}
                  checked={ok && !selected.has(index)}
                  onChange={e => {
                    const next = new Set(selected);
                    if (e.target.checked) next.delete(index);
                    else next.add(index);
                    onSelectedChange(next);
                  }}
                />
                <span className="font-tau-mono text-[12.5px]">
                  {entry.draft.name || t("import.untitled")}
                </span>
                <span className="text-tau-micro text-ink-3 border-line-1 rounded-[5px] border px-1.5">
                  {entry.draft.type === "stdio" ? "stdio" : "http"}
                </span>
                <span className="flex-1" />
                {entry.error ? (
                  <span className="text-danger inline-flex items-center gap-1">
                    <TriangleAlert className="size-3.5" />
                    {configIssueText(entry.error, t)}
                  </span>
                ) : (
                  overwrite && <span className="text-warn">{t("import.overwrite")}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function AddServerDialog({
  open,
  onOpenChange,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 保存成功：单个服务器时带上 id，调用方可打开其详情 */
  onAdded: (serverId?: string) => void;
}) {
  const { t, locale } = useMcpFormsI18n();
  const [tab, setTab] = useState<AddTab>("form");
  const [draft, setDraft] = useState<ServerDraft>(emptyDraft);
  const [jsonText, setJsonText] = useState("");
  /** 导入列表里被取消勾选的下标 */
  const [unchecked, setUnchecked] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setTab("form");
    setDraft(emptyDraft());
    setJsonText("");
    setUnchecked(new Set());
  };

  const importable = useMemo(() => {
    try {
      return jsonText.trim()
        ? parseServersJson(jsonText).filter((e, i) => !e.error && !unchecked.has(i))
        : [];
    } catch {
      return [];
    }
  }, [jsonText, unchecked]);

  const formError = validateDraft(draft);

  const submit = async () => {
    setSaving(true);
    try {
      if (tab === "json") {
        await importServers(importable.map(e => e.draft));
        onAdded();
      } else {
        onAdded(await saveServer(draft));
      }
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      onAfterClose={reset}
      title={t("add.title")}
      width={720}
      impact={t("add.impact")}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {t("action.cancel")}
          </Button>
          <Button
            variant="primary"
            loading={saving}
            disabled={tab === "json" ? importable.length === 0 : Boolean(formError)}
            onClick={() => void submit()}
          >
            {tab === "json"
              ? t("add.import", {
                  count: importable.length,
                  number: importable.length.toLocaleString(locale),
                })
              : t("add.save")}
          </Button>
        </>
      }
    >
      <DialogBody>
        <Segmented
          label={t("add.method")}
          size="sm"
          value={tab}
          onValueChange={(v: AddTab) => setTab(v)}
          className="mb-4"
        >
          <Segmented.Item value="form" label={t("add.form")} />
          <Segmented.Item value="json" label={t("add.json")} />
        </Segmented>

        <div className="h-[440px] overflow-y-auto pr-1">
          {tab === "form" && <ServerForm draft={draft} onChange={setDraft} />}
          {tab === "json" && (
            <JsonImport
              text={jsonText}
              onTextChange={setJsonText}
              selected={unchecked}
              onSelectedChange={setUnchecked}
            />
          )}
        </div>
      </DialogBody>
    </Dialog>
  );
}
