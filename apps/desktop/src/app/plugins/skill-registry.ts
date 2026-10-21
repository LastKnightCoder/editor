import type { Skill } from "@/types/skill";

/**
 * 包内 Skill 由主进程从插件目录列出；插件 Skill 随插件启停，这里按本窗口插件宿主的启用状态过滤。
 * Skill 包不含代码，安装后即可用，不经过此闸门。
 */
let isPluginActive: (pluginId: string) => boolean = () => false;
const gateListeners = new Set<() => void>();
const packageListeners = new Set<() => void>();

const subscribe = (listeners: Set<() => void>, listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const isPackageSkillAvailable = (skill: Skill) =>
  skill.source !== "plugin" || (skill.pluginId !== undefined && isPluginActive(skill.pluginId));

export function setPluginSkillGate(gate: (pluginId: string) => boolean) {
  isPluginActive = gate;
  notifyPluginSkillGateChanged();
}

/** 插件启停：只需重新过滤已列出的 Skill。 */
export const notifyPluginSkillGateChanged = () => gateListeners.forEach(listener => listener());
/** 插件包安装、更新或卸载：需要重新列出 Skill。 */
export const notifyPluginPackagesChanged = () => packageListeners.forEach(listener => listener());

export const subscribePluginSkillGate = (listener: () => void) =>
  subscribe(gateListeners, listener);
export const subscribePluginPackages = (listener: () => void) =>
  subscribe(packageListeners, listener);
