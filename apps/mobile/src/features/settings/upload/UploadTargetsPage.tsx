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
import { classifyUploadError } from "../../../services/uploadOutcome";
import { selectPluginProvider } from "../../../services/tauri";
import { GroupCard, GroupRow, LetterTile } from "../components/ui";
import { LOCAL_UPLOAD_ID, useUploadProviders } from "./providers";

export function LocalTile() {
  return (
    <span className="bg-tag-4-soft text-tag-4 grid h-[34px] w-[34px] shrink-0 place-items-center rounded-xl">
      <Smartphone size={17} strokeWidth={1.9} aria-hidden="true" />
    </span>
  );
}

export function UploadTargetsPage() {
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
          ? "之后的新图片会保存在这台手机"
          : `之后的新图片会保存到 ${name}`
      );
    } catch (error) {
      toast.error(classifyUploadError(error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <PortalScope>
      <div className="mobile-kb-screen bg-page fixed inset-0 z-50 flex flex-col">
        <PageHeader title="保存到哪里" onBack={() => navigator.goBack("ui")} />
        <div
          ref={scrollRef}
          className="edge-fade-scroll mobile-page-scroll flex-1 overflow-y-auto px-4"
        >
          <div className="page-enter space-y-1">
            <p className="text-ink-3 text-tau-sm px-[15px] pt-2 leading-relaxed">
              只影响之后插入的图片和附件，已插入的保留原地址。
            </p>
            <GroupLabel>本机</GroupLabel>
            <GroupCard>
              <GroupRow disabled={busy} onClick={() => void select(LOCAL_UPLOAD_ID, "这台手机")}>
                <LocalTile />
                <span className="min-w-0 flex-1">
                  <span className="text-ink-1 text-tau-body block font-medium">这台手机</span>
                  <span className="text-ink-3 text-tau-sm block truncate">
                    离线可用，随资源文件同步到其他设备
                  </span>
                </span>
                {current === LOCAL_UPLOAD_ID && (
                  <Check size={20} className="text-accent shrink-0" aria-label="当前" />
                )}
              </GroupRow>
            </GroupCard>
            <GroupLabel>上传到云端，文档里直接引用网址</GroupLabel>
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
                        <Check size={20} className="text-accent shrink-0" aria-label="当前" />
                      )}
                      {configured ? (
                        <button
                          type="button"
                          aria-label={`${provider.name} 配置`}
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
                <span className="text-accent-text text-tau-body min-w-0 flex-1">添加上传服务</span>
                <ChevronRight size={18} className="text-ink-3 shrink-0" aria-hidden="true" />
              </GroupRow>
            </GroupCard>
          </div>
        </div>
      </div>
    </PortalScope>
  );
}
