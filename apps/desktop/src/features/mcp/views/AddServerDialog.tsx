/**
 * 添加 MCP 服务器弹窗：手动填写 / 粘贴 JSON（可一次导入多个）。
 * 保存后由 tools 层自动连接，弹窗关闭并打开新服务器的详情。
 */

import { useMemo, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { Button, Checkbox, Dialog, Segmented, Textarea } from "@tau/ui";
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
  const existing = useMCPStore(s => s.customServers);
  const { entries, error } = useMemo((): { entries: ImportEntry[]; error?: string } => {
    if (!text.trim()) return { entries: [] };
    try {
      return { entries: parseServersJson(text) };
    } catch (e) {
      return { entries: [], error: (e as Error).message };
    }
  }, [text]);
  const names = new Set(existing.map(s => s.name));

  return (
    <div className="flex flex-col gap-2">
      <span className="text-tau-sm text-ink-3">
        兼容 Claude Desktop / Cursor 的 mcpServers 与 VS Code 的 servers 格式，可一次导入多个
      </span>
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
      {error && <span className="text-tau-sm text-danger">{error}</span>}
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
                  aria-label={`导入 ${entry.draft.name || "未命名"}`}
                  disabled={!ok}
                  checked={ok && !selected.has(index)}
                  onChange={e => {
                    const next = new Set(selected);
                    if (e.target.checked) next.delete(index);
                    else next.add(index);
                    onSelectedChange(next);
                  }}
                />
                <span className="font-tau-mono text-[12.5px]">{entry.draft.name || "未命名"}</span>
                <span className="text-tau-micro text-ink-3 border-line-1 rounded-[5px] border px-1.5">
                  {entry.draft.type === "stdio" ? "stdio" : "http"}
                </span>
                <span className="flex-1" />
                {entry.error ? (
                  <span className="text-danger inline-flex items-center gap-1">
                    <TriangleAlert className="size-3.5" />
                    {entry.error}
                  </span>
                ) : (
                  overwrite && <span className="text-warn">同名服务器已存在，将覆盖</span>
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
      title="添加 MCP 服务器"
      width={720}
      impact="MCP 服务器可以在本机执行命令，只添加信任的来源"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            variant="primary"
            loading={saving}
            disabled={tab === "json" ? importable.length === 0 : Boolean(formError)}
            onClick={() => void submit()}
          >
            {tab === "json" ? `导入 ${importable.length} 个` : "保存并连接"}
          </Button>
        </>
      }
    >
      <Segmented
        label="添加方式"
        size="sm"
        value={tab}
        onValueChange={(v: AddTab) => setTab(v)}
        className="mb-4"
      >
        <Segmented.Item value="form" label="手动填写" />
        <Segmented.Item value="json" label="粘贴 JSON" />
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
    </Dialog>
  );
}
