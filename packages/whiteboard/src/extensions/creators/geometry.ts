import { v4 as uuid } from "uuid";
import type { ElementCreateSpec } from "../api";
import type { GeometryElement } from "../../plugins/GeometryPlugin";
import { GeometryUtil } from "../../utils";

/** 旧 useCreateGeometry 的元素构造逻辑（纯函数）：字段与旧实现完全一致 */
export function buildGeometryElement(
  rect: { x: number; y: number; width: number; height: number },
  options: Readonly<Record<string, unknown>> | null
): GeometryElement | null {
  if (!options || !options.paths) return null;

  const { cornerRadius, textAlign, ...geometryStyle } = GeometryUtil.getPrevGeometryStyle();
  const geometryType = (options.geometryType as string) || "default";
  const defaultExtraInfo = (options.defaultExtraInfo as Record<string, unknown>) || {};

  return {
    id: uuid(),
    type: "geometry",
    geometryType,
    paths: options.paths as string[],
    extraInfo: {
      ...defaultExtraInfo,
      cornerRadius,
    },
    text: {
      align: textAlign,
      content: [
        {
          type: "paragraph",
          children: [
            {
              type: "formatted",
              text: "",
            },
          ],
        },
      ],
    },
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    ...geometryStyle,
  };
}

/** geometry 创建规格：拖出手势（Shift 等比、Alt 从中心），单击不创建且工具保持 */
export const geometryCreateSpec: ElementCreateSpec = {
  gesture: "drag",
  constrain: "box",
  after: "select",
  build: ctx => buildGeometryElement(ctx.rect, ctx.options),
};
