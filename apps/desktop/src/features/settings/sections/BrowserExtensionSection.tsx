/**
 * 浏览器扩展：「Tau 伴读」扩展的连接授权。已授权的浏览器可调整可选权限或撤销（撤销即断开）；
 * 关闭「接受新的连接请求」后，未授权的扩展发起连接直接被拒绝、不弹窗。
 */
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Globe } from "lucide-react";
import { Button, SettingRow, Switch, toast } from "@tau/ui";
import { REQUIRED_SCOPES, type CompanionScope } from "@tau/shared/browser-companion";
import { off, on } from "@/electron";
import {
  getBrowserCompanionSnapshot,
  revokeBrowserClient,
  setAcceptNewBrowserClients,
  setBrowserClientScopes,
} from "@/commands/browser-companion";
import type { BrowserClientView } from "@/types/browser-companion";
import { SCOPE_LABELS, clientLabel } from "@/features/browser-companion/labels";
import { SettingsGroup } from "../components/SettingsGroup";

const QUERY_KEY = ["browser-companion", "snapshot"];

const formatTime = (time: number) => {
  const minutes = Math.round((Date.now() - time) / 60_000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)} 小时前`;
  return new Date(time).toLocaleDateString();
};

export function BrowserExtensionSection() {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: QUERY_KEY, queryFn: getBrowserCompanionSnapshot });

  useEffect(() => {
    const refresh = () => void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    on("browser-companion:changed", refresh);
    return () => off("browser-companion:changed", refresh);
  }, [queryClient]);

  if (!data) return null;
  const online = new Set(data.online);

  return (
    <>
      <SettingsGroup>
        <SettingRow
          title="接受新的连接请求"
          description="关闭后，未授权的浏览器发起连接会被直接拒绝，不弹窗"
        >
          <Switch
            aria-label="接受新的连接请求"
            checked={data.acceptNew}
            onCheckedChange={accept => void setAcceptNewBrowserClients(accept)}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title="已授权">
        {data.clients.length ? (
          data.clients.map(client => (
            <ClientRow key={client.clientId} client={client} online={online.has(client.clientId)} />
          ))
        ) : (
          <p className="text-tau-meta text-ink-3 px-4 py-3.5">
            还没有授权的浏览器。装好「Tau 伴读」扩展后，打开任意网页的面板即可发起连接。
          </p>
        )}
      </SettingsGroup>

      {data.rejections.length > 0 && (
        <SettingsGroup title="最近拒绝">
          <ul className="px-4 py-2">
            {data.rejections.map(item => (
              <li
                key={`${item.clientId}-${item.at}`}
                className="text-tau-meta text-ink-2 flex items-center gap-3 py-1.5"
              >
                <span className="min-w-0 flex-1 truncate">
                  {item.label} · {item.reason}
                </span>
                <time className="text-tau-sm text-ink-3 font-mono">{formatTime(item.at)}</time>
              </li>
            ))}
          </ul>
        </SettingsGroup>
      )}
    </>
  );
}

function ClientRow({ client, online }: { client: BrowserClientView; online: boolean }) {
  const toggleTools = () => {
    const optional: CompanionScope[] = client.scopes.includes("tools") ? [] : ["tools"];
    void setBrowserClientScopes(client.clientId, [...REQUIRED_SCOPES, ...optional]);
  };
  const revoke = async () => {
    await revokeBrowserClient(client.clientId);
    toast.success(`已撤销 ${clientLabel(client.info)} 的授权，连接已断开`);
  };
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="border-line-1 text-ink-2 grid size-9 flex-none place-items-center rounded-[10px] border">
        <Globe size={16} strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-ink-1 font-medium">{clientLabel(client.info)}</div>
        <div className="text-tau-meta text-ink-3">
          {online ? "在线" : `${formatTime(client.lastSeenAt)}活跃`} · 授权于{" "}
          {new Date(client.createdAt).toLocaleDateString()}
        </div>
        <div className="text-tau-meta text-ink-2 mt-1.5 flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate">
            {REQUIRED_SCOPES.map(scope => SCOPE_LABELS[scope].label).join("、")}
          </span>
          <label className="flex flex-none items-center gap-2">
            {SCOPE_LABELS.tools.label}
            <Switch
              aria-label={`${clientLabel(client.info)}：${SCOPE_LABELS.tools.label}`}
              checked={client.scopes.includes("tools")}
              onCheckedChange={toggleTools}
            />
          </label>
        </div>
      </div>
      <Button variant="secondary" onClick={() => void revoke()}>
        撤销
      </Button>
    </div>
  );
}
