/**
 * 内容类型的展示（类型名 + 图标）。内置类型由各处的元数据表给出；插件内容（plugin-entity）
 * 按插件声明的外观显示，插件停用、卸载宽限期内也一样，只有从未声明过才回落调用方给的通用外观。
 */
import { useCallback, type CSSProperties, type ReactNode } from "react";
import {
  usePluginEntityAppearances,
  usePluginEntityOwner,
  type PluginEntityAppearance,
} from "@/services/plugin-entity-kinds";

/** 与 lucide 图标兼容的图标组件：按 className / size 定尺寸，currentColor 着色 */
export type KindIcon = (props: {
  className?: string;
  size?: number | string;
  strokeWidth?: number | string;
}) => ReactNode;

export interface KindMeta {
  label: string;
  icon: KindIcon;
}

export interface PluginEntitySource {
  pluginId: string;
  kind: string;
}

const PLUGIN_ENTITY = "plugin-entity";
const maskIcons = new Map<string, KindIcon>();

/**
 * 插件图标的 SVG 文本只作 CSS 遮罩（图像上下文不执行脚本、不加载外部资源），
 * 外层仍是 <svg>，父级对 svg 的尺寸与颜色规则照样生效。
 */
function svgMaskIcon(markup: string): KindIcon {
  let icon = maskIcons.get(markup);
  if (!icon) {
    const url = `url("data:image/svg+xml,${encodeURIComponent(markup)}")`;
    const style: CSSProperties = {
      maskImage: url,
      WebkitMaskImage: url,
      maskSize: "contain",
      WebkitMaskSize: "contain",
      maskRepeat: "no-repeat",
      WebkitMaskRepeat: "no-repeat",
      maskPosition: "center",
      WebkitMaskPosition: "center",
    };
    const MaskIcon: KindIcon = ({ className, size = 24 }) => (
      <svg
        aria-hidden
        width={size}
        height={size}
        viewBox="0 0 24 24"
        className={className}
        style={style}
      >
        <rect width="24" height="24" fill="currentColor" />
      </svg>
    );
    icon = MaskIcon;
    maskIcons.set(markup, icon);
  }
  return icon;
}

function toMeta(appearance: PluginEntityAppearance | undefined, fallback: KindMeta): KindMeta {
  if (!appearance) return fallback;
  return {
    label: appearance.label,
    icon: appearance.icon ? svgMaskIcon(appearance.icon) : fallback.icon,
  };
}

/** 列表逐项解析已知来源（如检索结果带的 pluginEntity）的外观，不必为每项建组件 */
export function usePluginEntityMetaResolver(): (
  source: PluginEntitySource | undefined,
  fallback: KindMeta
) => KindMeta {
  const appearanceOf = usePluginEntityAppearances();
  return useCallback(
    (source, fallback) => toMeta(appearanceOf(source?.pluginId, source?.kind), fallback),
    [appearanceOf]
  );
}

/** 只有引用（类型 + ID）时的外观：插件内容先查所属插件与类型，其余类型原样返回 fallback */
export function useEntityKindMeta(
  ref: { kind: string; id: number } | undefined,
  fallback: KindMeta
): KindMeta {
  const owner = usePluginEntityOwner(ref?.kind === PLUGIN_ENTITY ? ref.id : undefined);
  const resolve = usePluginEntityMetaResolver();
  return resolve(owner ?? undefined, fallback);
}
