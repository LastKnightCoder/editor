// 添加 / 编辑远程 MCP（Streamable HTTP）。请求头值只提交给原生，页面不回读；
// 编辑时请求头留空表示沿用已保存的值。先保存再连接，连接失败停留在本页显示原因。

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
function parseHeaders(text: string): { headers: Record<string, string>; error?: string } {
  const headers: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const index = line.indexOf(":");
    const name = index > 0 ? line.slice(0, index).trim() : "";
    if (!name || !/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(name))
      return { headers, error: `请求头格式应为「名称: 值」：${line.trim().slice(0, 24)}` };
    headers[name] = line.slice(index + 1).trim();
  }
  return { headers };
}

function validateUrl(value: string) {
  try {
    const url = new URL(value.trim());
    if (!["http:", "https:"].includes(url.protocol)) return "只支持 http 或 https 地址";
    if (url.username || url.password) return "地址里不能带用户名和密码，凭据请放在请求头";
    return undefined;
  } catch {
    return "请输入完整地址，例如 https://example.com/mcp";
  }
}

export function McpServerPage(props: { serverId?: string }) {
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
  const [errors, setErrors] = useState<{ name?: string; url?: string; headers?: string }>({});
  const [failure, setFailure] = useState<string | null>(null);
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
      <CapabilityPage title="远程 MCP">
        <p className="text-ink-3 text-tau-meta px-8 py-16 text-center">
          服务器不存在，可能已被删除。
        </p>
      </CapabilityPage>
    );
  }

  const save = async () => {
    const parsed = parseHeaders(headerText);
    const next = {
      name: name.trim()
        ? name.trim().length > 64
          ? "名称不超过 64 个字符"
          : undefined
        : "请填写名称",
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
          throw new Error(error instanceof Error ? error.message : "连接失败");
        });
        if (state.status !== "connected") throw new Error(state.error ?? "连接失败");
        toast.success(`已连接，发现 ${state.toolIds.length} 个工具`);
      }
      void client.invalidateQueries({ queryKey: ["ai-capabilities"] });
      setHeaderText("");
      void navigator.goBackBypassed("ui");
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "保存失败");
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
      toast.error(error instanceof Error ? error.message : "删除失败");
    }
  };

  const headerPlaceholder = saved?.headerNames.length
    ? `已保存 ${saved.headerNames.join("、")}，留空不修改`
    : "Authorization: Bearer …";

  return (
    <CapabilityPage
      title={isNew ? "添加远程 MCP" : saved.name}
      onBack={guard.request}
      actions={
        <PageHeaderTextButton disabled={saving || (!isNew && !dirty)} onClick={() => void save()}>
          {saving ? (
            <LoaderCircle size={16} className="animate-spin" aria-label="连接中" />
          ) : isNew ? (
            "添加"
          ) : (
            "保存"
          )}
        </PageHeaderTextButton>
      }
    >
      <p className="text-ink-3 text-tau-sm px-[15px] pt-2 leading-relaxed">
        手机端只支持 Streamable HTTP 地址，不能启动本地命令。保存后会立即连接并发现工具。
      </p>
      {failure && (
        <Banner
          tone="error"
          icon={<CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />}
          title="连接失败"
        >
          {failure}。配置已保存，可以修改后重试。
        </Banner>
      )}
      <GroupLabel>服务器</GroupLabel>
      <GroupCard>
        <TextField
          label="名称"
          value={name}
          placeholder="例如：团队知识库"
          error={errors.name}
          onChange={setName}
        />
        <TextField
          label="地址"
          inputMode="url"
          value={url}
          placeholder="https://example.com/mcp"
          error={errors.url}
          onChange={setUrl}
        />
      </GroupCard>
      <GroupLabel tone={errors.headers ? "warn" : "ink"}>
        {errors.headers ?? "请求头（可选）"}
      </GroupLabel>
      <div className="setting-group">
        <textarea
          aria-label="请求头"
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
      <GroupNote>
        每行一个「名称: 值」。请求头只保存在这台手机上，不随数据库同步，保存后不再显示值。
      </GroupNote>

      {!isNew && (
        <div className="pt-6">
          <GroupCard>
            <GroupRow onClick={() => setRemoving(true)}>
              <Trash2 size={17} className="text-danger shrink-0" aria-hidden="true" />
              <span className="text-danger text-tau-body flex-1">删除服务器</span>
            </GroupRow>
          </GroupCard>
        </div>
      )}
      {guard.sheet}
      <MobileConfirmDialog
        open={removing}
        title="删除这个 MCP 服务器？"
        description="删除后对话里不再能用它的工具，已保存的请求头一并清除。"
        confirmText="删除"
        danger
        onCancel={() => setRemoving(false)}
        onConfirm={() => void remove()}
      />
    </CapabilityPage>
  );
}
