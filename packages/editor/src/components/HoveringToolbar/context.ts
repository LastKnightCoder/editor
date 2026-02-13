import React from "react";

export type HoveringSubmenuTrigger = "hover" | "click";

export interface IHoveringBarContext {
  isHoveringBarShow: boolean;
  isCompact: boolean;
  submenuTrigger: HoveringSubmenuTrigger;
}

export const HoveringBarContext = React.createContext<IHoveringBarContext>({
  isHoveringBarShow: false,
  isCompact: false,
  submenuTrigger: "hover",
});
