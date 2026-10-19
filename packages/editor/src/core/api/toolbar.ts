import { useContext } from "react";
import {
  HoveringBarContext,
  type IHoveringBarContext,
} from "../components/HoveringToolbar/context";

/** 工具条贡献读取当前展示状态，不取得 Provider 或内部可写状态。 */
export function useToolbarState(): Readonly<IHoveringBarContext> {
  return useContext(HoveringBarContext);
}
