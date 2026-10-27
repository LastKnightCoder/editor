import { beforeAll, expect, it } from "vitest";
import useDynamicExtensionsStore from "@/stores/useDynamicExtensionsStore";
import { getContentKit, prepareContentContracts } from "@/services/editorKit";
import { skillRefExtension } from "@/editor-extensions";
import { desktopContentPlugins } from "../../../shared/content-plugins";
import { hostElementGroups } from "../element-definitions";

beforeAll(() => useDynamicExtensionsStore.getState().initExtensions(), 30_000);

it("声明组与界面扩展归属一致：无界面转换与正文编辑器得到同一份契约", async () => {
  const kit = [...getContentKit().extensions, skillRefExtension];
  for (const group of hostElementGroups) {
    const extension = kit.find(item => item.elements?.some(e => e.type === group.elements[0].type));
    if (!extension) continue;
    expect(extension.id).toBe(group.id);
    for (const element of group.elements)
      expect(extension.elements?.find(e => e.type === element.type)).toMatchObject(element);
  }
  const editor = await desktopContentPlugins.prepareEditorContracts(getContentKit().extensions);
  const conversion = await prepareContentContracts();
  for (const [id, contract] of Object.entries(editor.dictionary))
    expect(conversion.dictionary[id]).toEqual(contract);
});
