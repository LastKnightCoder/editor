// 同步服务列表：点已配置的行即切换（先探测云端），点 ⓘ 进服务页修改配置；未配置的行整行进服务页。

import { useRef } from "react";
import { Check, ChevronRight, Info, LoaderCircle, Plus } from "lucide-react";
import { PortalScope } from "@tau/ui";
import { GroupLabel } from "../../../components/GroupLabel";
import { PageHeader } from "../../../components/PageHeader";
import { useAppContext } from "../../../app/AppContext";
import { useEdgeFade } from "../../../hooks/useScrollState";
import { useNavigator } from "../../../router";
import { GroupCard, GroupRow, LetterTile } from "../components/ui";
import { useSyncProviders } from "./providers";
import { useSyncSwitch } from "./useSyncSwitch";

export function SyncProvidersPage() {
  const app = useAppContext();
  const navigator = useNavigator();
  const scrollRef = useRef<HTMLDivElement>(null);
  useEdgeFade(scrollRef);
  const providers = useSyncProviders();
  const switcher = useSyncSwitch();
  const setting = app.syncSettings.safeSetting;
  const current = setting?.sync.active === "plugin" ? setting.sync.plugin?.id : undefined;
  const open = (providerId: string) => navigator.push("syncProvider", { providerId });

  return (
    <PortalScope>
      <div className="mobile-kb-screen bg-page fixed inset-0 z-50 flex flex-col">
        <PageHeader title="同步服务" onBack={() => navigator.goBack("ui")} />
        <div
          ref={scrollRef}
          className="edge-fade-scroll mobile-page-scroll flex-1 overflow-y-auto px-4"
        >
          <div className="page-enter space-y-1">
            <p className="text-ink-3 text-tau-sm px-[15px] pt-2 leading-relaxed">
              同一时间只同步到一个服务。点选切换，点 ⓘ 修改配置。
            </p>
            <GroupLabel>已安装</GroupLabel>
            <GroupCard>
              {setting &&
                providers.map(provider => {
                  const configured = provider.isConfigured(setting);
                  const isCurrent = provider.id === current;
                  return (
                    <GroupRow
                      key={provider.id}
                      disabled={!!switcher.probing}
                      onClick={() =>
                        !configured
                          ? open(provider.id)
                          : isCurrent
                            ? undefined
                            : void switcher.request(provider.id, provider.name)
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
                      {switcher.probing === provider.id ? (
                        <LoaderCircle
                          size={18}
                          className="text-ink-3 animate-spin"
                          aria-hidden="true"
                        />
                      ) : isCurrent ? (
                        <Check size={20} className="text-accent shrink-0" aria-label="当前" />
                      ) : null}
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
                <span className="text-accent-text text-tau-body min-w-0 flex-1">添加同步服务</span>
                <ChevronRight size={18} className="text-ink-3 shrink-0" aria-hidden="true" />
              </GroupRow>
            </GroupCard>
          </div>
        </div>
        {switcher.sheet}
      </div>
    </PortalScope>
  );
}
