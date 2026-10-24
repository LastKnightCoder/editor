import { assertLocalId } from "@tau/plugins/package";
import type { DesktopPluginPackage as DevelopmentPluginPackage } from "../../../shared/plugin-package";

interface ContentStartupSnapshot {
  artifacts: DevelopmentPluginPackage[];
  errors: Record<string, string>;
}

/** 主进程初始化时按已保存的启用列表取一次快照，所有窗口与后台线程共用。 */
export class PluginContentStartup {
  private snapshot?: Promise<ContentStartupSnapshot>;
  constructor(
    private readonly read: (id: string) => Promise<DevelopmentPluginPackage | undefined>
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
    return { artifacts, errors };
  }
}
