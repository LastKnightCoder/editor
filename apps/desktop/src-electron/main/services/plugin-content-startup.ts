import { assertLocalId } from "@tau/plugins/package";
import type { ContentMetricRule } from "@tau/db-schema/content-metrics";
import type { DesktopPluginPackage as DevelopmentPluginPackage } from "../../../shared/plugin-package";

interface ContentStartupSnapshot {
  artifacts: DevelopmentPluginPackage[];
  errors: Record<string, string>;
}

export interface ContentPluginInspection {
  editor: boolean;
  whiteboard: boolean;
  metrics: readonly ContentMetricRule[];
}

export interface ContentPluginInspectionBatch {
  results: Record<string, ContentPluginInspection>;
  errors: Record<string, string>;
}

/** 主进程初始化时按已保存的启用列表取一次快照，所有窗口与后台线程共用。 */
export class PluginContentStartup {
  private snapshot?: Promise<ContentStartupSnapshot>;
  constructor(
    private readonly read: (id: string) => Promise<DevelopmentPluginPackage | undefined>,
    private readonly inspect?: (
      artifacts: readonly DevelopmentPluginPackage[]
    ) => Promise<ContentPluginInspectionBatch>
  ) {}
  async uses(id: string): Promise<boolean> {
    return (await this.snapshot)?.artifacts.some(artifact => artifact.manifest.id === id) ?? false;
  }
  get(ids: string[]): Promise<ContentStartupSnapshot> {
    if (!Array.isArray(ids)) return Promise.reject(new Error("内容插件列表无效"));
    return (this.snapshot ??= this.load(ids));
  }
  private async load(ids: string[]): Promise<ContentStartupSnapshot> {
    const artifacts: DevelopmentPluginPackage[] = [];
    const errors: Record<string, string> = Object.create(null);
    for (const id of new Set(ids)) {
      try {
        assertLocalId(id);
        const artifact = await this.read(id);
        if (!artifact) continue;
        if (artifact.manifest.id !== id) throw new Error("插件目录与清单身份不一致");
        artifacts.push(artifact);
      } catch (error) {
        errors[id] = error instanceof Error ? error.message : String(error);
      }
    }
    if (!this.inspect) return { artifacts, errors };
    let inspection: ContentPluginInspectionBatch;
    try {
      inspection = await this.inspect(artifacts);
    } catch (error) {
      for (const artifact of artifacts)
        errors[artifact.manifest.id] = error instanceof Error ? error.message : String(error);
      return { artifacts: [], errors };
    }
    Object.assign(errors, inspection.errors);
    return {
      artifacts: artifacts.filter(artifact => {
        const result = inspection.results[artifact.manifest.id];
        return result?.editor === true || result?.whiteboard === true;
      }),
      errors,
    };
  }
}
