// 添加 / 编辑远程 MCP（Streamable HTTP）。请求头值只提交给原生，页面不回读；
// 编辑时请求头留空表示沿用已保存的值。先保存再连接，连接失败停留在本页显示原因。

import {
  mcpTranslator,
  mcpFailureText,
  mcpValidationText,
  useMcpI18n,
  type McpFailure,
  type McpValidationIssue,
} from "./mcp.i18n";
import { useState } from "react";
import { CircleAlert, LoaderCircle, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { GroupLabel } from "../../components/GroupLabel";
import { MobileConfirmDialog } from "../../components/MobileConfirmDialog";
import { PageHeaderTextButton } from "../../components/PageHeader";
import { toast } from "../../components/toast";
import { useAppContext } from "../../app/AppContext";
import { useNavigator } from "../../router";
import { chatCapabilities } from "../../services/aiChat/chatController";
import { connectCustomMcp, mutateCustomMcpServers } from "../../services/aiChat/customMcp";
import { TextField } from "../settings/ai/fields";
import { GroupCard, GroupNote, GroupRow } from "../settings/components/ui";
import { useDiscardGuard } from "../settings/storage/providerPage";
import { useDatabaseName } from "./data";
import { useApplyCustomServers } from "./sources";
import { Banner, CapabilityPage } from "./ui";

/** 每行一个「名称: 值」；空行忽略 */
function parseHeaders(text: string): {
  headers: Record<string, string>;
  error?: McpValidationIssue;
} {
  const headers: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const index = line.indexOf(":");
    const name = index > 0 ? line.slice(0, index).trim() : "";
    if (!name || !/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(name))
      return { headers, error: { kind: "header", fragment: line.trim().slice(0, 24) } };
    headers[name] = line.slice(index + 1).trim();
  }
  return { headers };
}

function validateUrl(value: string): McpValidationIssue | undefined {
  try {
    const url = new URL(value.trim());
    if (!["http:", "https:"].includes(url.protocol)) return { kind: "urlProtocol" };
    if (url.username || url.password) return { kind: "urlCredentials" };
    return undefined;
  } catch {
    return { kind: "urlInvalid" };
  }
}

class McpConnectionFailure extends Error {
  constructor(readonly originalCause: unknown) {
    super(
      originalCause instanceof Error
        ? originalCause.message
        : typeof originalCause === "string"
          ? originalCause
          : "连接失败",
      { cause: originalCause }
    );
  }
}

export function McpServerPage(props: { serverId?: string }) {
  const { t } = useMcpI18n();
  const navigator = useNavigator();
  const client = useQueryClient();
  const databaseName = useDatabaseName();
  const applyServers = useApplyCustomServers();
  const saved = useAppContext().syncSettings.safeSetting?.mcpServers?.find(
    server => server.id === props.serverId
  );
  const [name, setName] = useState(saved?.name ?? "");
  const [url, setUrl] = useState(saved?.url ?? "");
  const [headerText, setHeaderText] = useState("");
  const [errors, setErrors] = useState<{
    name?: McpValidationIssue;
    url?: McpValidationIssue;
    headers?: McpValidationIssue;
  }>({});
  const [failure, setFailure] = useState<McpFailure | null>(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const isNew = !saved;
  const dirty = isNew
    ? !!(name.trim() || url.trim() || headerText.trim())
    : name !== saved.name || url !== saved.url || !!headerText.trim();
  const guard = useDiscardGuard(dirty && !saving, () => {
    setName(saved?.name ?? "");
    setUrl(saved?.url ?? "");
    setHeaderText("");
  });

  if (props.serverId && !saved) {
    return (
      <CapabilityPage title={t("server.remote")}>
        <p className="text-ink-3 text-tau-meta px-8 py-16 text-center">{t("server.missing")}</p>
      </CapabilityPage>
    );
  }

  const save = async () => {
    const parsed = parseHeaders(headerText);
    const next = {
      name: name.trim()
        ? name.trim().length > 64
          ? { kind: "nameLong" as const }
          : undefined
        : { kind: "nameRequired" as const },
      url: validateUrl(url),
      headers: parsed.error,
    };
    setErrors(next);
    if (next.name || next.url || next.headers) return;
    setSaving(true);
    setFailure(null);
    const id = saved?.id ?? crypto.randomUUID().slice(0, 18);
    try {
      const servers = await mutateCustomMcpServers({
        kind: "upsert",
        server: { id, name: name.trim(), url: url.trim() },
        ...(headerText.trim() || isNew ? { headers: parsed.headers } : {}),
      });
      applyServers(servers);
      const stored = servers.find(server => server.id === id);
      const service = await chatCapabilities(databaseName);
      if (stored?.enabled) {
        const state = await connectCustomMcp(service, databaseName, stored).catch(error => {
          throw new McpConnectionFailure(error);
        });
        if (state.status !== "connected") throw new McpConnectionFailure(state.error);
        toast.success(mcpTranslator.t("connected", { count: state.toolIds.length }));
      }
      void client.invalidateQueries({ queryKey: ["ai-capabilities"] });
      setHeaderText("");
      void navigator.goBackBypassed("ui");
    } catch (error) {
      setFailure(
        error instanceof McpConnectionFailure
          ? { kind: "connect", cause: error.originalCause }
          : { kind: "save", cause: error }
      );
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!saved) return;
    try {
      applyServers(await mutateCustomMcpServers({ kind: "remove", id: saved.id }));
      setRemoving(false);
      void navigator.goBackBypassed("ui");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : mcpTranslator.t("error.delete"));
    }
  };

  const headerPlaceholder = saved?.headerNames.length
    ? t("headers.saved", { names: saved.headerNames.join("、") })
    : "Authorization: Bearer …";

  return (
    <CapabilityPage
      title={isNew ? t("addRemote") : saved.name}
      onBack={guard.request}
      actions={
        <PageHeaderTextButton disabled={saving || (!isNew && !dirty)} onClick={() => void save()}>
          {saving ? (
            <LoaderCircle size={16} className="animate-spin" aria-label={t("connecting")} />
          ) : isNew ? (
            t("add")
          ) : (
            t("save")
          )}
        </PageHeaderTextButton>
      }
    >
      <p className="text-ink-3 text-tau-sm px-[15px] pt-2 leading-relaxed">{t("server.hint")}</p>
      {failure && (
        <Banner
          tone="error"
          icon={<CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />}
          title={t("connection.failed")}
        >
          {t("server.savedFailure", { reason: mcpFailureText(failure) })}
        </Banner>
      )}
      <GroupLabel>{t("server.title")}</GroupLabel>
      <GroupCard>
        <TextField
          label={t("server.name")}
          value={name}
          placeholder={t("server.namePlaceholder")}
          error={errors.name ? mcpValidationText(errors.name) : undefined}
          onChange={setName}
        />
        <TextField
          label={t("server.url")}
          inputMode="url"
          value={url}
          placeholder="https://example.com/mcp"
          error={errors.url ? mcpValidationText(errors.url) : undefined}
          onChange={setUrl}
        />
      </GroupCard>
      <GroupLabel tone={errors.headers ? "warn" : "ink"}>
        {errors.headers ? mcpValidationText(errors.headers) : t("headers.optional")}
      </GroupLabel>
      <div className="setting-group">
        <textarea
          aria-label={t("headers.title")}
          value={headerText}
          placeholder={headerPlaceholder}
          rows={3}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          className="text-ink-1 placeholder:text-ink-3 text-tau-sm block w-full resize-none bg-transparent px-3.5 py-3 font-mono outline-none"
          onChange={event => setHeaderText(event.currentTarget.value)}
        />
      </div>
      <GroupNote>{t("headers.hint")}</GroupNote>

      {!isNew && (
        <div className="pt-6">
          <GroupCard>
            <GroupRow onClick={() => setRemoving(true)}>
              <Trash2 size={17} className="text-danger shrink-0" aria-hidden="true" />
              <span className="text-danger text-tau-body flex-1">{t("server.delete")}</span>
            </GroupRow>
          </GroupCard>
        </div>
      )}
      {guard.sheet}
      <MobileConfirmDialog
        open={removing}
        title={t("delete.title")}
        description={t("delete.hint")}
        confirmText={t("delete")}
        danger
        onCancel={() => setRemoving(false)}
        onConfirm={() => void remove()}
      />
    </CapabilityPage>
  );
}
