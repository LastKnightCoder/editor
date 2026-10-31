import { describe, expect, it, vi } from "vitest";
import { createDefaultEditorSlots } from "@tau/editor/extensions/media/slots";
import { IEditorSlots } from "@tau/editor/extensions/media/services";
import type { ServiceRegistration } from "@tau/editor";
import type { Element } from "slate";
import { defineElement, defineExtension } from "@tau/editor/api";
import { IFileService, IResourceService } from "@tau/shared/host-services";
import {
  verifyCodeStepEditing,
  verifyVoidBehavior,
  voidFixtures,
} from "../../../../../packages/editor/test-support/void-behavior";

vi.mock("../editorRegistry", () => ({
  desktopEditorServices: (register => {
    register(IEditorSlots, createDefaultEditorSlots());
    register(IFileService, {
      select: async () => [],
      readText: async () => "",
      getBaseName: path => path,
      getHomeDir: async () => "/",
      convertFileSrc: async path => path,
    });
    register(IResourceService, { upload: async () => "" });
  }) satisfies ServiceRegistration,
}));
vi.mock("@/services/editorServiceImplementations", () => ({ desktopImportFromMarkdown: () => [] }));
vi.mock("@/stores/useSettingStore", () => ({
  default: {
    getState: () => ({ setting: { appearance: {} } }),
    subscribe: () => () => undefined,
  },
}));

import { getDescriptionKit } from "../editorKit";
import { fileAttachmentExtension } from "@/editor-extensions";
import { hostElementGroups } from "@/editor-extensions/element-definitions";

const fixtures = voidFixtures.filter(
  node => !["file-attachment", "whiteboard", "database"].includes(node.type)
);

describe("桌面端真实扩展的 void 编辑行为", () => {
  it("测试覆盖底座全部 void 声明", () => {
    const types = getDescriptionKit()
      .extensions.flatMap(extension => extension.elements ?? [])
      .filter(element => element.isVoid)
      .map(element => element.type)
      .sort();
    expect(fixtures.map(node => node.type).sort()).toEqual(types);
  });
  it.each(fixtures)("$type：进入编辑、恢复光标、输入与撤销", async fixture => {
    await verifyVoidBehavior(getDescriptionKit(), fixture);
  });
  it("分步代码编辑只修改当前步骤，撤销后仍可恢复光标", async () => {
    await verifyCodeStepEditing(getDescriptionKit());
  });
  it("附件真实渲染器支持光标恢复与撤销", async () => {
    const fixture = voidFixtures.find(node => node.type === "file-attachment");
    if (!fixture) throw new Error("缺少附件夹具");
    await verifyVoidBehavior(
      getDescriptionKit().extend({ extensions: [fileAttachmentExtension] }),
      fixture
    );
  });
  it.each(hostElementGroups.filter(group => "isVoid" in group.elements[0]))(
    "$id：宿主声明的通用光标行为",
    async group => {
      const definition = group.elements[0];
      const extension = defineExtension({
        id: group.id,
        elements: [
          defineElement({
            ...definition,
            render: ({ attributes, children }) =>
              definition.kind === "inline" ? (
                <span {...attributes}>{children}</span>
              ) : (
                <div {...attributes}>{children}</div>
              ),
          }),
        ],
      });
      const fixture =
        voidFixtures.find(node => node.type === definition.type) ??
        ({
          type: definition.type,
          children: [{ type: "formatted", text: "" }],
        } as unknown as Element);
      await verifyVoidBehavior(getDescriptionKit().extend({ extensions: [extension] }), fixture);
    }
  );
});
