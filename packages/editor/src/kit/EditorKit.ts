import paragraphExtension from "../extensions/paragraph";
import { elementTypesOf, toEditorExtension, type AnyExtension } from "../api/legacy";
import type { EditorExtension } from "../api/extension";
import { createServiceRegistry, createChildRegistry } from "../services/registry";
import type { ServiceRegistration, ServiceRegistry } from "../services/registry";
import { IThemeService } from "../services/tokens";
import type { ThemeService } from "../theme/ThemeService";
import { ExtensionAssembly } from "./ExtensionAssembly";

/**
 * EditorKit：宿主显式声明「这个编辑器由什么组成」（docs/editor-refactor ER-004）。
 *
 * 一个 kit 创建一次、可给多个编辑器复用：扩展的插件、快捷键、工具条条目与 type 分发表
 * 在 kit 上预计算并缓存。需要个别差异时用 `kit.extend()` 派生，不做隐式合并。
 */
export interface EditorKit {
  readonly registry: ServiceRegistry;
  readonly extensions: readonly EditorExtension[];
  /** 本 kit 能渲染的元素类型；跨端覆盖测试（CONTENT_ELEMENT_TYPES）按它断言 */
  readonly elementTypes: readonly string[];
  /** 内部用：扩展的预计算结果（插件、快捷键、工具条、type 分发表） */
  readonly assembly: ExtensionAssembly;
  /** 派生：追加扩展或覆盖服务；同 type 扩展需显式 override */
  extend(options: EditorKitExtendOptions): EditorKit;
}

export interface EditorKitOptions {
  /** 元素与功能扩展；同元素类型重复会报错，除非 `override: true` */
  extensions?: readonly AnyExtension[];
  /** 平台能力与 UI 插槽 */
  services?: ServiceRegistration[];
  /** 主题服务；等价于注册 IThemeService，缺省时编辑器读 DOM */
  theme?: ThemeService;
  /** 允许后来的扩展按 type 覆盖先前的功能扩展；核心段落不可替换。 */
  override?: boolean;
}

export interface EditorKitExtendOptions {
  extensions?: readonly AnyExtension[];
  services?: ServiceRegistration[];
  theme?: ThemeService;
  override?: boolean;
}

const themeRegistration =
  (theme: ThemeService): ServiceRegistration =>
  register =>
    register(IThemeService, theme);

/**
 * 合并扩展；元素类型或扩展 id 重复且未声明 override 时报错，避免静默覆盖。
 * override 时，贡献被新扩展全部覆盖的旧扩展整体移除；只覆盖了一部分的保留，同类型由后者生效。
 */
const mergeExtensions = (
  base: readonly EditorExtension[],
  added: readonly AnyExtension[],
  override: boolean
): EditorExtension[] => {
  let merged = [...base];
  for (const raw of added) {
    const extension = toEditorExtension(raw);
    const types = new Set(elementTypesOf(extension));
    if (extension.id === paragraphExtension.id || types.has("paragraph")) {
      throw new Error("[editor] paragraph 是核心基础，不能重复注册或覆盖");
    }
    const clashes = merged.filter(
      existing =>
        existing.id === extension.id || elementTypesOf(existing).some(type => types.has(type))
    );
    if (clashes.length && !override) {
      const type = elementTypesOf(clashes[0]).find(t => types.has(t));
      throw new Error(
        `[editor] 扩展${type ? `类型 "${type}"` : ` "${extension.id}"`} 重复注册。` +
          `要替换已有实现请显式声明 override: true`
      );
    }
    if (
      clashes.some(
        existing =>
          existing.id !== extension.id &&
          (existing.marks?.length || existing.layers?.length) &&
          elementTypesOf(existing).every(type => types.has(type))
      )
    ) {
      throw new Error(
        "[editor] 覆盖元素会移除同扩展的标记贡献或根 UI；请按扩展 id 显式替换整个扩展"
      );
    }
    merged = merged.filter(
      existing =>
        !clashes.includes(existing) ||
        (existing.id !== extension.id && elementTypesOf(existing).some(type => !types.has(type)))
    );
    merged.push(extension);
  }
  return merged;
};

/**
 * 扩展实例的稳定标识：派生 kit 要按「扩展实例集合」缓存，不能按数组身份缓存。
 * 宿主常在 render 里写 `extensions={[a, b]}`，数组每次都是新的，但实例没变——
 * 这时必须返回同一个派生 kit，否则编辑器会被重建（原 PluginOptimizer 也是这么做的）。
 * 扩展对象本身就是稳定标识，按对象集合计键。
 */
const instanceIds = new WeakMap<EditorExtension, string>();
let instanceCounter = 0;
const instanceKey = (extensions: readonly AnyExtension[]): string =>
  extensions
    .map(raw => {
      const extension = toEditorExtension(raw);
      let id = instanceIds.get(extension);
      if (!id) {
        id = `${extension.id}#${++instanceCounter}`;
        instanceIds.set(extension, id);
      }
      return id;
    })
    .join(",");

const createKit = (
  registry: ServiceRegistry,
  extensions: EditorExtension[],
  /**
   * 沿用已有装配结果。装配只取决于扩展集合，所以「只覆盖服务」的派生 kit 必须与原 kit
   * 共享它：内核按 `assembly.plugins` 的数组身份决定是否重建 Slate editor，换一份等价的
   * 新数组就会把整个编辑器（连同 mermaid、codemirror 等块组件）重挂载一次。
   */
  inherited?: ExtensionAssembly
): EditorKit => {
  const assembly = inherited ?? new ExtensionAssembly(extensions);
  // 只追加扩展（不覆盖服务）的派生结果按实例集合缓存
  const derivedByExtensions = new Map<string, EditorKit>();
  return {
    registry,
    extensions,
    elementTypes: assembly.elementTypes,
    assembly,
    extend(options) {
      const registrations = [
        ...(options.services ?? []),
        ...(options.theme ? [themeRegistration(options.theme)] : []),
      ];
      const onlyExtensions = registrations.length === 0 && !!options.extensions;
      const cacheKey = onlyExtensions
        ? `${options.override ? "o" : "s"}|${instanceKey(options.extensions!)}`
        : null;
      if (cacheKey) {
        const cached = derivedByExtensions.get(cacheKey);
        if (cached) return cached;
      }
      const nextRegistry = registrations.length
        ? createChildRegistry(registry, ...registrations)
        : registry;
      const nextExtensions = options.extensions
        ? mergeExtensions(extensions, options.extensions, options.override ?? false)
        : extensions;
      const derived = createKit(
        nextRegistry,
        nextExtensions,
        nextExtensions === extensions ? assembly : undefined
      );
      if (cacheKey) derivedByExtensions.set(cacheKey, derived);
      return derived;
    },
  };
};

/** 核心只提供基础段落，产品功能由调用方显式选择。 */
export function createEditorKit(options: EditorKitOptions = {}): EditorKit {
  const registrations = [
    ...(options.services ?? []),
    ...(options.theme ? [themeRegistration(options.theme)] : []),
  ];
  return createKit(
    createServiceRegistry(...registrations),
    mergeExtensions([paragraphExtension], options.extensions ?? [], options.override ?? false)
  );
}
