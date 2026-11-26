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
import {
  companionScopeMeta,
  clientLabel,
  formatClientTime,
  rejectionText,
} from "@/features/browser-companion/labels";
import {
  browserCompanionTranslator,
  useBrowserCompanionI18n,
} from "@/features/browser-companion/i18n";
import { SettingsGroup } from "../components/SettingsGroup";

const QUERY_KEY = ["browser-companion", "snapshot"];

export function BrowserExtensionSection() {
  const { t, locale } = useBrowserCompanionI18n();
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
        <SettingRow title={t("settings.accept")} description={t("settings.acceptHint")}>
          <Switch
            aria-label={t("settings.accept")}
            checked={data.acceptNew}
            onCheckedChange={accept => void setAcceptNewBrowserClients(accept)}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("settings.authorized")}>
        {data.clients.length ? (
          data.clients.map(client => (
            <ClientRow key={client.clientId} client={client} online={online.has(client.clientId)} />
          ))
        ) : (
          <p className="text-tau-meta text-ink-3 px-4 py-3.5">{t("settings.empty")}</p>
        )}
      </SettingsGroup>

      {data.rejections.length > 0 && (
        <SettingsGroup title={t("settings.rejections")}>
          <ul className="px-4 py-2">
            {data.rejections.map(item => (
              <li
                key={`${item.clientId}-${item.at}`}
                className="text-tau-meta text-ink-2 flex items-center gap-3 py-1.5"
              >
                <span className="min-w-0 flex-1 truncate">
                  {item.label} · {rejectionText(item, t)}
                </span>
                <time className="text-tau-sm text-ink-3 font-mono">
                  {formatClientTime(item.at, locale, t)}
                </time>
              </li>
            ))}
          </ul>
        </SettingsGroup>
      )}
    </>
  );
}

function ClientRow({ client, online }: { client: BrowserClientView; online: boolean }) {
  const { t, locale } = useBrowserCompanionI18n();
  const toggleTools = () => {
    const optional: CompanionScope[] = client.scopes.includes("tools") ? [] : ["tools"];
    void setBrowserClientScopes(client.clientId, [...REQUIRED_SCOPES, ...optional]);
  };
  const revoke = async () => {
    await revokeBrowserClient(client.clientId);
    toast.success(
      browserCompanionTranslator.t("settings.revoked", { client: clientLabel(client.info) })
    );
  };
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="border-line-1 text-ink-2 grid size-9 flex-none place-items-center rounded-[10px] border">
        <Globe size={16} strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-ink-1 font-medium">{clientLabel(client.info)}</div>
        <div className="text-tau-meta text-ink-3">
          {online
            ? t("settings.online")
            : t("settings.active", { time: formatClientTime(client.lastSeenAt, locale, t) })}{" "}
          ·{" "}
          {t("settings.authorizedAt", {
            date: new Date(client.createdAt).toLocaleDateString(locale),
          })}
        </div>
        <div className="text-tau-meta text-ink-2 mt-1.5 flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate">
            {REQUIRED_SCOPES.map(scope => companionScopeMeta(scope, t).label).join(
              t("list.separator")
            )}
          </span>
          <label className="flex flex-none items-center gap-2">
            {companionScopeMeta("tools", t).label}
            <Switch
              aria-label={t("settings.clientTools", {
                client: clientLabel(client.info),
                scope: companionScopeMeta("tools", t).label,
              })}
              checked={client.scopes.includes("tools")}
              onCheckedChange={toggleTools}
            />
          </label>
        </div>
      </div>
      <Button variant="secondary" onClick={() => void revoke()}>
        {t("settings.revoke")}
      </Button>
    </div>
  );
}
