// 同步中心：状态卡回答「数据库同步了没」，拇指区一个主按钮（同步数据库后顺带同步资源文件），
// 服务 / 数据库 / 资源文件 / 整库覆盖下沉为普通行。资源文件跟随同一个同步服务。

import { useEffect, useState } from "react";
import {
  ChevronRight,
  CircleCheck,
  Cloud,
  CloudDownload,
  CloudOff,
  CloudUpload,
  Database,
  Image as ImageIcon,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import type {
  ResourceSyncActionResponse,
  ResourceSyncProgress,
  ResourceSyncStatusFile,
  SettingCompat,
  SyncActionResponse,
  SyncVersionResponse,
} from "../../../types";
import { GroupLabel } from "../../../components/GroupLabel";
import { toast } from "../../../components/toast";
import { useNavigator, usePageLifecycle } from "../../../router";
import type { SettingModuleKey } from "../components/types";
import { GroupCard, GroupRow, LetterTile } from "../components/ui";
import { ActionButton } from "../storage/fields";
import { useSyncProviders } from "./providers";
import { countResources, resourceBadge } from "./resourceState";
import { resolveSyncErrorMessage } from "./syncErrors";
import {
  deriveSyncHero,
  formatRelativeTime,
  readLastSyncTime,
  type SyncHeroState,
  type SyncTone,
} from "./syncState";

export type SyncCenterProps = {
  setting: SettingCompat | null;
  versions: SyncVersionResponse | null;
  isSyncing: boolean;
  activeDatabase: string | null;
  onCheckVersions: () => Promise<SyncVersionResponse>;
  onSyncUpload: () => Promise<SyncActionResponse>;
  onSyncDownload: () => Promise<SyncActionResponse>;
  resourceProgress: ResourceSyncProgress | null;
  resourceStatusFile: ResourceSyncStatusFile | null;
  onResourceSyncRefresh: () => Promise<void>;
  onResourceSyncStart: () => Promise<ResourceSyncActionResponse>;
  onOpenModule: (module: SettingModuleKey) => void;
};

const BADGE_TONE = {
  info: "bg-info-soft text-info",
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger",
} as const;

const ORB_TONE: Record<SyncTone, string> = {
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  run: "bg-info-soft text-info",
  error: "bg-danger-soft text-danger",
  idle: "bg-accent-soft text-accent-text",
};

function HeroIcon(props: { icon: SyncHeroState["icon"] }) {
  const common = { size: 34, strokeWidth: 1.9, "aria-hidden": true } as const;
  switch (props.icon) {
    case "check":
      return <CircleCheck {...common} />;
    case "upload":
      return <CloudUpload {...common} />;
    case "download":
      return <CloudDownload {...common} />;
    case "sync":
      return <RefreshCw {...common} className="animate-spin [animation-duration:1.6s]" />;
    case "error":
      return <CloudOff {...common} />;
    default:
      return <Cloud {...common} />;
  }
}

function SyncHero(props: {
  hero: SyncHeroState;
  lastSyncText: string | null;
  versions: SyncVersionResponse | null;
}) {
  return (
    <section className="setting-group px-[18px] pt-6 pb-4 text-center">
      <span
        className={`mx-auto mb-3 grid h-[76px] w-[76px] place-items-center rounded-full ${ORB_TONE[props.hero.tone]}`}
      >
        <HeroIcon icon={props.hero.icon} />
      </span>
      <h2 className="text-ink-1 text-tau-title-lg font-extrabold tracking-tight">
        {props.hero.title}
      </h2>
      <p className="text-ink-2 text-tau-sm mt-1 leading-relaxed">{props.hero.description}</p>
      {props.lastSyncText && (
        <p className="text-ink-2 text-tau-sm leading-relaxed">上次同步 {props.lastSyncText}</p>
      )}
      {props.versions && (
        <p className="text-ink-3 text-tau-sm mt-3 flex justify-center gap-3.5 tabular-nums">
          <span>本机 v{props.versions.localVersion}</span>
          <span>云端 v{props.versions.remoteVersion}</span>
          <span className="truncate">{props.versions.databaseName}</span>
        </p>
      )}
    </section>
  );
}

/** 当前服务未配置：直接给服务选择，而不是一张空状态卡 */
function FirstRunView(props: { setting: SettingCompat; onOpenProvider: (id: string) => void }) {
  const providers = useSyncProviders();
  const navigator = useNavigator();
  return (
    <div className="space-y-1">
      <section className="setting-group px-[18px] pt-6 pb-5 text-center">
        <span className="bg-accent-soft text-accent-text mx-auto mb-3 grid h-[76px] w-[76px] place-items-center rounded-full">
          <Cloud size={34} strokeWidth={1.9} aria-hidden="true" />
        </span>
        <h2 className="text-ink-1 text-tau-title-lg font-extrabold tracking-tight">
          在多台设备间同步
        </h2>
        <p className="text-ink-2 text-tau-sm mt-1 leading-relaxed">
          选择一个你自己的存储服务，数据只存在你的空间里
        </p>
      </section>
      {props.setting.sync.plugin?.id && (
        <p className="text-ink-3 text-tau-meta px-4">原有配置已保留，请安装并启用对应服务。</p>
      )}
      <GroupLabel>选择存储服务</GroupLabel>
      <GroupCard>
        {providers.map(provider => (
          <GroupRow key={provider.id} onClick={() => props.onOpenProvider(provider.id)}>
            <LetterTile letter={provider.tile.letter} className={provider.tile.className} />
            <span className="min-w-0 flex-1">
              <span className="text-ink-1 text-tau-body block font-medium">{provider.name}</span>
              <span className="text-ink-3 text-tau-sm block truncate">
                {provider.isConfigured(props.setting)
                  ? "已配置，未启用"
                  : provider.summary(props.setting)}
              </span>
            </span>
            <ChevronRight size={16} className="text-ink-3" aria-hidden="true" />
          </GroupRow>
        ))}
        <GroupRow onClick={() => navigator.push("plugins", { tab: "store" })}>
          去插件中心添加同步服务
        </GroupRow>
      </GroupCard>
    </div>
  );
}

export function SyncCenterSection(props: SyncCenterProps) {
  const navigator = useNavigator();
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const providers = useSyncProviders();
  const provider = providers.find(item => item.id === props.setting?.sync.plugin?.id);
  const configured = Boolean(props.setting && provider?.isConfigured(props.setting));
  const syncing = props.isSyncing || submitting;
  const busy = syncing || checking;

  const check = async (options?: { silent?: boolean }) => {
    if (!configured || busy) return;
    setChecking(true);
    // 资源账本与数据库版本并行刷新；资源侧失败只影响那一行的徽标，不打断数据库检查
    void props.onResourceSyncRefresh().catch(() => undefined);
    try {
      await props.onCheckVersions();
      setErrorMessage(null);
    } catch (error) {
      const message = resolveSyncErrorMessage(error, "检查云端失败，请检查网络与服务配置");
      setErrorMessage(message);
      if (!options?.silent) toast.error(message);
    } finally {
      setChecking(false);
    }
  };

  // 进入与从服务页返回时各检查一次：服务或配置可能刚被改过
  useEffect(() => {
    void check({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configured, props.setting?.sync.plugin?.id, props.setting?.sync.plugin?.configurations]);
  usePageLifecycle({ onResume: () => void check({ silent: true }) });

  const hero = deriveSyncHero({
    versions: props.versions,
    syncing,
    checking,
    errorMessage,
  });

  const runPrimary = async () => {
    if (hero.primaryAction === "check") {
      await check();
      return;
    }
    setSubmitting(true);
    try {
      let direction = hero.primaryAction;
      if (direction === "smart") {
        const latest = await props.onCheckVersions();
        direction = latest.localVersion >= latest.remoteVersion ? "upload" : "download";
      }
      const result =
        direction === "upload" ? await props.onSyncUpload() : await props.onSyncDownload();
      setErrorMessage(null);
      toast.success(result.message || (direction === "upload" ? "上传完成" : "下载完成"));
      // 数据库完成后顺带同步资源文件；它在后台跑，失败会体现在「资源文件」行上
      void props.onResourceSyncStart().catch(() => undefined);
    } catch (error) {
      const message = resolveSyncErrorMessage(error, "同步失败");
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const openProvider = (providerId: string) => navigator.push("syncProvider", { providerId });

  if (!props.setting) {
    return null;
  }
  if (!provider || !configured) {
    return (
      <div className="page-enter">
        <FirstRunView setting={props.setting} onOpenProvider={openProvider} />
      </div>
    );
  }

  const databaseName = props.versions?.databaseName ?? props.activeDatabase;
  const lastSyncTime = databaseName ? readLastSyncTime(databaseName) : null;
  const lastSyncText = lastSyncTime ? formatRelativeTime(lastSyncTime, Date.now()) : null;
  const resourceCounts = countResources(props.resourceStatusFile);
  const badge = resourceBadge(props.resourceProgress, resourceCounts);

  return (
    <div className="page-enter space-y-1">
      <SyncHero hero={hero} lastSyncText={lastSyncText} versions={props.versions} />

      <div className="flex gap-2.5 pt-3">
        {hero.tone === "error" && (
          <ActionButton
            label={`检查 ${provider.name} 配置`}
            emphasis={false}
            busy={false}
            disabled={busy}
            onClick={() => openProvider(provider.id)}
          />
        )}
        <ActionButton
          label={hero.primaryLabel}
          emphasis={hero.primaryEmphasis || hero.tone === "error"}
          busy={syncing || (checking && hero.primaryAction === "check")}
          disabled={busy}
          onClick={() => void runPrimary()}
        />
      </div>

      <GroupLabel>同步到</GroupLabel>
      <GroupCard>
        <GroupRow onClick={() => navigator.push("syncProviders", {})} disabled={syncing}>
          <LetterTile letter={provider.tile.letter} className={provider.tile.className} />
          <span className="min-w-0 flex-1">
            <span className="text-ink-1 text-tau-body block font-medium">{provider.name}</span>
            <span className="text-ink-3 text-tau-sm block truncate">
              {syncing ? "同步中不可切换" : provider.summary(props.setting)}
            </span>
          </span>
          <ChevronRight size={16} className="text-ink-3" aria-hidden="true" />
        </GroupRow>
      </GroupCard>

      <GroupLabel>内容</GroupLabel>
      <GroupCard>
        <GroupRow onClick={() => props.onOpenModule("databases")} disabled={syncing}>
          <span className="bg-tag-3-soft text-tag-3 grid h-[34px] w-[34px] shrink-0 place-items-center rounded-xl">
            <Database size={17} strokeWidth={1.9} aria-hidden="true" />
          </span>
          <span className="text-ink-1 text-tau-body min-w-0 flex-1 font-medium">数据库</span>
          <span className="text-ink-3 text-tau-meta max-w-[45%] truncate">
            {props.activeDatabase}
          </span>
          <ChevronRight size={16} className="text-ink-3" aria-hidden="true" />
        </GroupRow>
        <GroupRow onClick={() => props.onOpenModule("sync-status-resource")}>
          <span className="bg-tag-4-soft text-tag-4 grid h-[34px] w-[34px] shrink-0 place-items-center rounded-xl">
            <ImageIcon size={17} strokeWidth={1.9} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="text-ink-1 text-tau-body block font-medium">资源文件</span>
            <span className="text-ink-3 text-tau-sm block truncate">
              {resourceCounts.total > 0 ? `${resourceCounts.total} 个` : "图片与附件"}
            </span>
          </span>
          {badge && (
            <span
              className={`text-tau-micro shrink-0 rounded-full px-2 py-0.5 font-semibold ${BADGE_TONE[badge.tone]}`}
            >
              {badge.text}
            </span>
          )}
          <ChevronRight size={16} className="text-ink-3" aria-hidden="true" />
        </GroupRow>
      </GroupCard>

      <GroupLabel>更多</GroupLabel>
      <GroupCard>
        <GroupRow onClick={() => props.onOpenModule("sync-overwrite")} disabled={syncing}>
          <span className="bg-tag-5-soft text-tag-5 grid h-[34px] w-[34px] shrink-0 place-items-center rounded-xl">
            <ShieldAlert size={17} strokeWidth={1.9} aria-hidden="true" />
          </span>
          <span className="text-ink-1 text-tau-body min-w-0 flex-1 font-medium">整库覆盖</span>
          <ChevronRight size={16} className="text-ink-3" aria-hidden="true" />
        </GroupRow>
      </GroupCard>
    </div>
  );
}
