/**
 * 白板手绘算法与导图配色：engine/ 是 packages/whiteboard 对应纯函数的副本（同一元素同一种子，笔触与软件一致）。
 * 白板包不对外导出这些内部模块、仓库边界检查也禁止按源码路径引用，所以这里复制一份；软件改了笔触或配色算法时要手动同步：
 * engine/{geometry,ink,levels,random,shape,arrow,types}.ts ← packages/whiteboard/src/utils/sketch/
 * engine/dash.ts ← utils/dash.ts，engine/MindThemeUtil.ts ← utils/MindThemeUtil.ts，engine/mind-themes.ts ← constants/mind-themes.ts，
 * engine/sketchTypes.ts ← types/sketch.ts、types/arrow.ts 里用到的类型。
 */
export { sketchShape } from "./engine/shape";
export { sketchArrow } from "./engine/arrow";
export { hashSeed } from "./engine/random";
export { EMarkerType } from "./engine/sketchTypes";
export type { SketchPath } from "./engine/types";
export { MindThemeUtil } from "./engine/MindThemeUtil";
