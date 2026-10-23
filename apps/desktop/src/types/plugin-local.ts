import type { DesktopPluginPackage as DevelopmentPluginPackage } from "../../shared/plugin-package";

/** 安装来源：只有插件中心来源参与在线更新与首次自动启用。 */
export type LocalPluginSource =
  | { kind: "zip" }
  | {
      kind: "center";
      releaseId: string;
      pluginId: string;
      version: string;
      sha256: string;
      systemReviewed?: boolean;
      /** 格式 3 保存完整审批清单，安装时与下载包再次对账。 */
      manifest?: import("@tau/plugins/center").CenterManifest;
      apiOrigin?: string;
    };

export interface LocalPluginEntry {
  template?: import("@tau/plugins/template").TemplateManifest;
  /** 独立 Skill 包：不进入插件宿主，安装后其 Skill 即出现在 Skill 页。 */
  skillPackage?: import("@tau/plugins/template").SkillPackageManifest;
  id: string;
  directory: string;
  source?: LocalPluginSource;
  enabled?: boolean;
  artifact?: DevelopmentPluginPackage;
  error?: string;
}

export interface LocalPluginScan {
  directory: string;
  entries: LocalPluginEntry[];
  updates?: LocalPluginUpdate[];
  clientVersion?: string;
}

export interface LocalPluginUpdate {
  id: string;
  pending?: boolean;
  pendingVersion?: string;
  previousVersion?: string;
  error?: string;
  blocked?: boolean;
}
