import { Shapes } from "lucide-react";
import {
  Board,
  ContextMenuContext,
  PluginContextMenuItem,
  ECreateBoardElementType,
  SketchFillStyle,
} from "../types";
import Geometry from "../components/Geometry";
import { CommonPlugin, CommonElement } from "./CommonPlugin";
import { Descendant } from "slate";
import { geometryItems } from "../components/Toolbar/Geometry/config";
import { transformPath } from "../utils";

export interface GeometryElement extends CommonElement {
  type: "geometry";
  geometryType: string;
  theme?: "light" | "dark";
  color?: string;
  fill?: string;
  fillOpacity?: number;
  stroke?: string;
  strokeWidth?: number;
  strokeOpacity?: number;
  /** 手绘模式下的填充样式（D-106）；普通模式一律按实色渲染，缺省 solid */
  fillStyle?: SketchFillStyle;
  paths: string[];
  extraInfo?: Record<string, any>;
  text: {
    align: "left" | "center" | "right";
    content: Descendant[];
  };
}

export class GeometryPlugin extends CommonPlugin {
  name = "geometry";

  constructor() {
    super();
  }

  getContextMenu(context: ContextMenuContext): PluginContextMenuItem[] {
    const { targetElements } = context;
    const items: PluginContextMenuItem[] = [];

    // 场景1: 右键空白区域 → 添加「创建形状」菜单
    if (targetElements.length === 0) {
      items.push({
        key: "create-geometry",
        label: "形状",
        icon: <Shapes size={14} />,
        priority: 100,
        children: geometryItems.map((item, index) => ({
          key: `create-geometry-${item.geometryType}`,
          label: item.name,
          icon: (
            <svg width={14} height={14} viewBox="0 0 16 16" style={{ overflow: "visible" }}>
              {item.paths.map((path, pathIndex) => {
                const pathString = transformPath(path, 16, 16);
                return (
                  <path
                    d={pathString}
                    key={pathIndex}
                    fill="none"
                    strokeWidth="2"
                    stroke="currentColor"
                  />
                );
              })}
            </svg>
          ),
          priority: index,
          onSelect: (ctx: ContextMenuContext) => {
            ctx.board.createOptions = {
              ...item,
              geometryType: item.geometryType,
              defaultExtraInfo: item.defaultExtraInfo || {},
            };
            ctx.board.currentCreateType = ECreateBoardElementType.Geometry;
          },
        })),
        onSelect: () => {},
      });
    }

    return items;
  }

  render(_board: Board, { element }: { element: GeometryElement }) {
    return (
      <Geometry
        key={element.id}
        element={element}
        onResizeStart={this.onResizeStart.bind(this)}
        onResize={this.onResize.bind(this)}
        onResizeEnd={this.onResizeEnd.bind(this)}
      />
    );
  }
}

export default GeometryPlugin;
