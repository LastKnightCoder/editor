import type { PluginSkill } from "@tau/plugins";
import type { Skill } from "@/types/skill";

const skills = new Map<string, Skill>();
const listeners = new Set<() => void>();
export const pluginSkills = () => [...skills.values()];
export const subscribePluginSkills = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export function registerPluginSkill(pluginId: string, definition: PluginSkill) {
  const folderName = `${pluginId}:${definition.id}`;
  const skill: Skill = {
    folderName,
    name: definition.name,
    description: definition.description,
    path: `plugin://${folderName}`,
    source: "plugin",
    readmeContent: definition.content,
    defaultInvocation: definition.invocation ?? "auto",
    fileCount: 1,
  };
  skills.set(folderName, skill);
  listeners.forEach(listener => listener());
  return {
    dispose() {
      if (skills.get(folderName) !== skill) return;
      skills.delete(folderName);
      listeners.forEach(listener => listener());
    },
  };
}
