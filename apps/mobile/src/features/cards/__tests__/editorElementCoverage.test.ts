/**
 * mobile 的 content 场景 kit 必须覆盖跨端清单里的全部业务元素类型（docs/editor-refactor P10）。
 * 少一个，含该块的内容在 mobile 上只显示通用的「无法显示」占位（ER-006）。
 */
import { describe, expect, it } from "vitest";
import { CONTENT_ELEMENT_TYPES } from "@tau/shared";
import { prepareContentContract } from "@tau/db-schema/content-contracts";
import { BUILTIN_CONTENT_RESOURCES } from "@tau/db-schema/content-resources";
import { mobileContentPlugins } from "../../../app/plugins/content";
import { getMobileContentKit, getMobileFlashcardKit } from "../../../services/editorKit";

describe("mobile content 场景的元素覆盖", () => {
  it("闪卡按挖空能力缓存，保持完整基础功能且不混入正文专有块", () => {
    const blank = getMobileFlashcardKit();
    const plain = getMobileFlashcardKit({ blanks: false });
    expect(getMobileFlashcardKit()).toBe(blank);
    expect(getMobileFlashcardKit({ blanks: false })).toBe(plain);
    expect(blank.elementTypes).toContain("flashcard-blank");
    expect(plain.elementTypes).not.toContain("flashcard-blank");
    for (const kit of [blank, plain]) {
      expect(kit.elementTypes).not.toContain("database");
      expect(kit.assembly.commands.get("tau.mark.bold")).toBeDefined();
      expect(kit.assembly.commands.get("tau.preview.edit")).toBeDefined();
    }
  });
  it("覆盖 CONTENT_ELEMENT_TYPES 的每一项", () => {
    const types = getMobileContentKit().elementTypes;
    for (const required of CONTENT_ELEMENT_TYPES) {
      expect(types, `mobile 缺少 ${required}，该块只会显示通用占位`).toContain(required);
    }
  });

  it.each([
    ["正文", getMobileContentKit],
    ["闪卡", getMobileFlashcardKit],
  ] as const)("%s 的全部节点都有可解析的当前契约", async (_scene, getKit) => {
    const kit = getKit();
    const catalog = await mobileContentPlugins.prepareEditorContracts(kit.extensions);
    for (const type of kit.elementTypes) {
      const current = catalog.current(type);
      expect(current, `${type} 缺少版本契约`).toBeDefined();
      expect(catalog.resolve({ type, tauContract: current?.id })).toBe(current);
    }
  });

  it.each([
    ["content-link", "inline", false],
    ["file-attachment", "block", true],
    ["whiteboard", "block", true],
    ["database", "block", true],
    ["flashcard-blank", "inline", false],
  ] as const)("可解析桌面端保存的 %s v1 节点", async (type, kind, isVoid) => {
    const persisted = await prepareContentContract(`host.${type}`, {
      type,
      dataVersion: 1,
      kind,
      isVoid,
      resources: type === "file-attachment" ? BUILTIN_CONTENT_RESOURCES[type] : undefined,
    });
    const kit = type === "flashcard-blank" ? getMobileFlashcardKit() : getMobileContentKit();
    const catalog = await mobileContentPlugins.prepareEditorContracts(kit.extensions);
    const resolved = catalog.resolve({ type, tauContract: persisted.id });
    expect(resolved, `${type} 的跨端契约不匹配`).toBeDefined();
    expect(resolved?.access).toBe("edit");
    expect(resolved?.contract).toEqual(persisted.contract);
    expect(resolved?.element.render).toBeTypeOf("function");
  });

  it("场景 kit 保留已拆扩展并复用实例", () => {
    const kit = getMobileContentKit();
    expect(getMobileContentKit()).toBe(kit);
    for (const id of [
      "tau.mark.bold",
      "tau.header.promote",
      "tau.transform.to.bulleted-list",
      "tau.preview.edit",
    ])
      expect(kit.assembly.commands.get(id), id).toBeDefined();
    expect(kit.assembly.commandHotkeys.some(entry => entry.hotkey.key === "mod+b")).toBe(true);
    expect(kit.assembly.hoveringBarElements.length).toBeGreaterThan(0);
    expect(kit.extensions.filter(extension => extension.id === "tau.preview-menu")).toHaveLength(1);
    for (const type of ["mermaid", "plantuml"]) expect(kit.elementTypes).toContain(type);
    expect(kit.elementTypes).not.toContain("abc");
    expect(kit.elementTypes).not.toContain("html-block");
    expect(kit.elementTypes).not.toContain("html-inline");
    expect(kit.elementTypes).not.toContain("tikz");
    expect(kit.elementTypes).not.toContain("typst");
  });
});
