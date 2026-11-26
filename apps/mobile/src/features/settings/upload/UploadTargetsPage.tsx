import { storageTranslator, useStorageI18n, storageErrorText } from "../storage/i18n";
/* eslint-disable react-refresh/only-export-components -- LocalTile 与「图片与附件」页共用 */
// 上传位置列表：「这台手机」与上传服务同组单选；点已配置的行即切换，点 ⓘ 进服务页修改配置。

import { useRef, useState } from "react";
import { Check, ChevronRight, Info, Plus, Smartphone } from "lucide-react";
import { PortalScope } from "@tau/ui";
import { GroupLabel } from "../../../components/GroupLabel";
import { PageHeader } from "../../../components/PageHeader";
import { toast } from "../../../components/toast";
import { useAppContext } from "../../../app/AppContext";
import { useEdgeFade } from "../../../hooks/useScrollState";
import { useNavigator } from "../../../router";
import {
  enqueueProviderConfigWrite,
  mergeProviderSettings,
} from "../../../services/provider-config";

import { selectPluginProvider } from "../../../services/tauri";
import { GroupCard, GroupRow, LetterTile } from "../components/ui";
import { LOCAL_UPLOAD_ID, useUploadProviders } from "./providers";

export function LocalTile() {
  useStorageI18n();
  return (
    <span className="bg-tag-4-soft text-tag-4 grid h-[34px] w-[34px] shrink-0 place-items-center rounded-xl">
      <Smartphone size={17} strokeWidth={1.9} aria-hidden="true" />
    </span>
  );
}

export function UploadTargetsPage() {
  useStorageI18n();
  const app = useAppContext();
  const navigator = useNavigator();
  const scrollRef = useRef<HTMLDivElement>(null);
  useEdgeFade(scrollRef);
  const providers = useUploadProviders();
  const [busy, setBusy] = useState(false);
  const setting = app.syncSettings.safeSetting;
  const current =
    setting?.imageBed.active === "local" ? LOCAL_UPLOAD_ID : setting?.imageBed.plugin?.id;
  const open = (providerId: string) => navigator.push("uploadProvider", { providerId });

  const select = async (providerId: string, name: string) => {
    if (!setting || busy || providerId === current) return;
    setBusy(true);
    try {
      await enqueueProviderConfigWrite(async () => {
        const config =
          providerId === LOCAL_UPLOAD_ID
            ? null
            : (providers.find(item => item.id === providerId)?.stored(setting) ?? null);
        const saved = await selectPluginProvider(
          setting.database.active,
          "upload",
          providerId,
          config
        );
        app.syncSettings.updateSetting(previous => mergeProviderSettings(previous, saved));
      });
      toast.success(
        providerId === LOCAL_UPLOAD_ID
          ? storageTranslator.t("feedback.local")
          : storageTranslator.t("feedback.selected", { name })
      );
    } catch (error) {
      toast.error(storageErrorText(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PortalScope>
      <div className="mobile-kb-screen bg-page fixed inset-0 z-50 flex flex-col">
        <PageHeader
          title={storageTranslator.t("target.title")}
          onBack={() => navigator.goBack("ui")}
        />
        <div
          ref={scrollRef}
          className="edge-fade-scroll mobile-page-scroll flex-1 overflow-y-auto px-4"
        >
          <div className="page-enter space-y-1">
            <p className="text-ink-3 text-tau-sm px-[15px] pt-2 leading-relaxed">
              {storageTranslator.t("target.hint")}
            </p>
            <GroupLabel>{storageTranslator.t("target.local")}</GroupLabel>
            <GroupCard>
              <GroupRow
                disabled={busy}
                onClick={() => void select(LOCAL_UPLOAD_ID, storageTranslator.t("phone.title"))}
              >
                <LocalTile />
                <span className="min-w-0 flex-1">
                  <span className="text-ink-1 text-tau-body block font-medium">
                    {storageTranslator.t("phone.title")}
                  </span>
                  <span className="text-ink-3 text-tau-sm block truncate">
                    {storageTranslator.t("target.localHint")}
                  </span>
                </span>
                {current === LOCAL_UPLOAD_ID && (
                  <Check
                    size={20}
                    className="text-accent shrink-0"
                    aria-label={storageTranslator.t("destination.current")}
                  />
                )}
              </GroupRow>
            </GroupCard>
            <GroupLabel>{storageTranslator.t("target.cloud")}</GroupLabel>
            <GroupCard>
              {setting &&
                providers.map(provider => {
                  const configured = provider.isConfigured(setting);
                  return (
                    <GroupRow
                      key={provider.id}
                      disabled={busy}
                      onClick={() =>
                        configured ? void select(provider.id, provider.name) : open(provider.id)
                      }
                    >
                      <LetterTile
                        letter={provider.tile.letter}
                        className={provider.tile.className}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="text-ink-1 text-tau-body block font-medium">
                          {provider.name}
                        </span>
                        <span className="text-ink-3 text-tau-sm block truncate">
                          {provider.summary(setting)}
                        </span>
                      </span>
                      {provider.id === current && (
                        <Check
                          size={20}
                          className="text-accent shrink-0"
                          aria-label={storageTranslator.t("destination.current")}
                        />
                      )}
                      {configured ? (
                        <button
                          type="button"
                          aria-label={storageTranslator.t("target.settings", {
                            name: provider.name,
                          })}
                          className="text-accent-text -mr-1 grid h-9 w-9 shrink-0 place-items-center"
                          onClick={event => {
                            event.stopPropagation();
                            open(provider.id);
                          }}
                        >
                          <Info size={20} aria-hidden="true" />
                        </button>
                      ) : (
                        <ChevronRight
                          size={18}
                          className="text-ink-3 shrink-0"
                          aria-hidden="true"
                        />
                      )}
                    </GroupRow>
                  );
                })}
              <GroupRow onClick={() => navigator.push("plugins", { tab: "store" })}>
                <span className="bg-page text-ink-2 grid h-[34px] w-[34px] shrink-0 place-items-center rounded-xl">
                  <Plus size={17} aria-hidden="true" />
                </span>
                <span className="text-accent-text text-tau-body min-w-0 flex-1">
                  {storageTranslator.t("destination.add")}
                </span>
                <ChevronRight size={18} className="text-ink-3 shrink-0" aria-hidden="true" />
              </GroupRow>
            </GroupCard>
          </div>
        </div>
      </div>
    </PortalScope>
  );
}
