import type { ResourceSyncProgress, SyncVersionResponse } from "../../../types";
import type { SettingModule } from "./types";
import {
  IconCircleHelp,
  IconCloud,
  IconDatabase,
  IconFolder,
  IconMoon,
  ListItem,
} from "./ui";
import {
  getDatabaseSyncSummary,
  getResourceSyncSummary,
} from "./SyncStatusSections";

type OverviewSectionProps = {
  isDark: boolean;
  activeSync: string;
  activeResource: string;
  versions: SyncVersionResponse | null;
  activeDatabase?: string;
  resourceSyncProgress: ResourceSyncProgress;
  onOpenModule: (module: Exclude<SettingModule, null>) => void;
};

function formatProviderName(provider: string): string {
  if (provider === "aliOSS") return "AliOSS";
  if (provider === "webdav") return "WebDAV";
  if (provider === "github") return "Github";
  if (provider === "s3") return "S3";
  if (provider === "local") return "本地";
  return provider || "-";
}

export function OverviewSection(props: OverviewSectionProps) {
  const databaseSyncSummary = getDatabaseSyncSummary(props.versions);
  const resourceSyncSummary = getResourceSyncSummary(
    props.resourceSyncProgress,
  );

  return (
    <div className="space-y-4">
      <div className="list-group">
        <ListItem
          icon={<IconMoon />}
          label="颜色主题"
          value={props.isDark ? "深色" : "浅色"}
          onClick={() => props.onOpenModule("theme")}
        />
        <ListItem
          icon={<IconCircleHelp />}
          label="关于"
          onClick={() => props.onOpenModule("about")}
        />
      </div>

      <div className="list-group">
        <ListItem
          icon={<IconDatabase />}
          label="数据库管理"
          value={props.activeDatabase}
          onClick={() => props.onOpenModule("database")}
        />
      </div>

      <div className="list-group">
        <ListItem
          icon={<IconCloud />}
          label="集成账号"
          onClick={() => props.onOpenModule("integration")}
        />
      </div>

      <div className="list-group">
        <ListItem
          icon={<IconFolder />}
          label="资源存储"
          value={formatProviderName(props.activeResource)}
          onClick={() => props.onOpenModule("resource")}
        />
      </div>

      <div className="list-group">
        <div className="px-4 py-3 text-sm font-medium text-gray-500 dark:text-gray-400">
          同步设置
        </div>
        <ListItem
          icon={<IconCloud />}
          label="WebDAV"
          value={props.activeSync === "webdav" ? "已启用" : ""}
          onClick={() => props.onOpenModule("sync-webdav")}
        />
        <ListItem
          icon={<IconCloud />}
          label="AliOSS"
          value={props.activeSync === "aliOSS" ? "已启用" : ""}
          onClick={() => props.onOpenModule("sync-alioss")}
        />
        <ListItem
          icon={<IconCloud />}
          label="Github"
          value={props.activeSync === "github" ? "已启用" : ""}
          onClick={() => props.onOpenModule("sync-github")}
        />
        <ListItem
          icon={<IconCloud />}
          label="S3"
          value={props.activeSync === "s3" ? "已启用" : ""}
          onClick={() => props.onOpenModule("sync-s3")}
        />
      </div>

      <div className="list-group">
        <div className="px-4 py-3 text-sm font-medium text-gray-500 dark:text-gray-400">
          同步状态
        </div>
        <ListItem
          icon={<IconDatabase />}
          label="数据库同步状态"
          value={databaseSyncSummary}
          onClick={() => props.onOpenModule("sync-status-db")}
        />
        <ListItem
          icon={<IconFolder />}
          label="资源同步状态"
          value={resourceSyncSummary}
          onClick={() => props.onOpenModule("sync-status-resource")}
        />
      </div>
    </div>
  );
}
