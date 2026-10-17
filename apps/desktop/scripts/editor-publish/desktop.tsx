import { createRoot } from "react-dom/client";
import { UiProvider } from "@tau/ui";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Editor } from "@tau/editor";
import { initializeContentPlugins } from "../../src/app/plugins/content-plugin-bootstrap";
import { localPluginStateKey } from "../../src/app/plugins/content-plugin-state";
import { getContentKit } from "../../src/services/editorKit";
import { importFromMarkdown, getMarkdown } from "../../src/utils/markdown";
import useDynamicExtensionsStore from "../../src/stores/useDynamicExtensionsStore";
import { customMarkdown } from "./custom-fixture";
import { PluginHost, createMemoryStorage } from "@tau/plugins/host";
import { registerPluginPackage } from "../../src/app/plugins/package-loader";
import { registerPluginSkill } from "../../src/app/plugins/skill-registry";
import { sharedPluginModules } from "../../src/app/plugins/shared-modules";
import { scanLocalPlugins } from "../../src/commands/plugin-local";
import useSkillStore from "../../src/stores/useSkillStore";

async function start() {
  localStorage.setItem(localPluginStateKey("example.portable-counter"), "true");
  localStorage.setItem(localPluginStateKey("tau.custom-block"), "true");
  // 验收只排除与样本无关的数据库和白板业务扩展，不替换正式插件启动与 Kit。
  useDynamicExtensionsStore.setState({ initialized: true, extensions: [] });
  await initializeContentPlugins();
  const host = new PluginHost({
    workspaceId: "verification",
    storage: createMemoryStorage(),
    skills: { register: registerPluginSkill },
  });
  const scan = await scanLocalPlugins();
  const custom = scan.entries.find(entry => entry.id === "tau.custom-block")?.artifact;
  if (!custom) throw new Error("缺少实际自定义组件包");
  registerPluginPackage(host, custom, async () => sharedPluginModules);
  await host.enable(custom.manifest.id);
  await useSkillStore.getState().loadSkills();
  const skill = useSkillStore.getState().getSkillByFolderName("tau.custom-block:authoring");
  if (!skill || skill.source !== "plugin" || !skill.readmeContent?.includes("custom-block"))
    throw new Error("实际插件包 Skill 没有进入技能列表");
  Object.assign(window, { verifiedPluginSkill: { name: skill.name, source: skill.source } });
  const kit = getContentKit();
  if (!kit.elementTypes.includes("example.portable-counter")) throw new Error("桌面插件未装配");
  const value = importFromMarkdown("::portable-counter{value=7}\n\n" + customMarkdown);
  if (!getMarkdown(value).includes(customMarkdown)) throw new Error("自定义块 Markdown 往返失败");
  if (!getMarkdown(value).includes("portable-counter")) throw new Error("插件 codec 未装配");
  const root = document.getElementById("root");
  if (!root) throw new Error("缺少 root");
  createRoot(root).render(
    <UiProvider>
      <DndProvider backend={HTML5Backend}>
        <Editor
          kit={kit}
          initValue={value}
          readonly={false}
          onInit={editor => {
            Object.assign(window, {
              insertPublishedCounter: () => {
                const item = kit.assembly
                  .getBlockPanelItems(editor)
                  .find(item => item.title === "可发布计数块");
                if (!item?.onClick) throw new Error("扩展块菜单缺失");
                item.onClick(editor);
                return editor.children.filter(
                  node => "type" in node && node.type === "example.portable-counter"
                ).length;
              },
            });
          }}
        />
      </DndProvider>
    </UiProvider>
  );
}
void start().catch(error => {
  document.body.dataset.error = String(error);
});
