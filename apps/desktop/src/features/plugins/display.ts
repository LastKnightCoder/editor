import type { PluginInfo } from "@tau/plugins/host";
import type { PluginContributionKind } from "@tau/plugins/host";
import type { PluginSystemAccess, PluginCategory } from "@tau/plugins/package";
import type { PluginSourceKind, StaticPackageKind, InstalledPlugin, VersionNote } from "./model";
import { pluginTranslator, type PluginMessageKey } from "./i18n";
const t = pluginTranslator.t;

/** 详情页的显示顺序与文案，按实际注册的稳定类型统计。 */
export const CONTRIBUTION_LABELS: Record<PluginContributionKind, string> = {
  get page() {
    return t("contribution.page");
  },
  get sidebar() {
    return t("contribution.sidebar");
  },
  get navigation() {
    return t("contribution.navigation");
  },
  get command() {
    return t("contribution.command");
  },
  get settings() {
    return t("contribution.settings");
  },
  get sync() {
    return t("contribution.sync");
  },
  get upload() {
    return t("contribution.upload");
  },
  get asr() {
    return t("contribution.asr");
  },
  get tts() {
    return t("contribution.tts");
  },
  get images() {
    return t("contribution.images");
  },
  get embeddings() {
    return t("contribution.embeddings");
  },
  get video() {
    return t("contribution.video");
  },
  get publish() {
    return t("contribution.publish");
  },
  get mcp() {
    return t("contribution.mcp");
  },
  get chat() {
    return t("contribution.chat");
  },
  get skill() {
    return t("contribution.skill");
  },
  get ai() {
    return t("contribution.ai");
  },
  get editor() {
    return t("contribution.editor");
  },
  get whiteboard() {
    return t("contribution.whiteboard");
  },
  get excerpts() {
    return t("contribution.excerpts");
  },
  get home() {
    return t("contribution.home");
  },
  get action() {
    return t("contribution.action");
  },
  get "entity-panel"() {
    return t("contribution.entity-panel");
  },
  get "notebook-output"() {
    return t("contribution.notebook-output");
  },
};
export const SYSTEM_ACCESS_LABELS: Record<PluginSystemAccess, string> = {
  get filesystem() {
    return t("access.filesystem");
  },
  get network() {
    return t("access.network");
  },
  get process() {
    return t("access.process");
  },
};
export const SOURCE_LABELS: Record<PluginSourceKind, string> = {
  get center() {
    return t("source.center");
  },
  get zip() {
    return t("source.zip");
  },
};
export const STATE_LABELS: Record<PluginInfo["state"], string> = {
  get disabled() {
    return t("state.disabled");
  },
  get activating() {
    return t("state.activating");
  },
  get active() {
    return t("state.active");
  },
  get deactivating() {
    return t("state.deactivating");
  },
  get failed() {
    return t("state.failed");
  },
  get "restart-required"() {
    return t("state.restart-required");
  },
};
export const STATIC_PACKAGE_LABELS: Record<StaticPackageKind, { kind: string; state: string }> = {
  template: {
    get kind() {
      return t("static.template.kind");
    },
    get state() {
      return t("static.template.state");
    },
  },
  skills: {
    get kind() {
      return t("static.skills.kind");
    },
    get state() {
      return t("static.skills.state");
    },
  },
};

export function categoryLabel(id: PluginCategory): string {
  return t(`category.${id}` as PluginMessageKey);
}
export function installedPluginError(plugin: InstalledPlugin): string | undefined {
  return plugin.errorCode === "cleanup-unconfirmed" ? t("error.cleanupUnconfirmed") : plugin.error;
}
export function versionNote(note: VersionNote, locale: string): string {
  if (note.kind === "requires-app") return t("version.requiresApp", { version: note.version });
  if (note.kind === "published")
    return t("version.published", {
      date: new Intl.DateTimeFormat(locale, {
        year: "numeric",
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }).format(new Date(note.date + "T00:00:00Z")),
    });
  return t(`version.${note.kind}`);
}
