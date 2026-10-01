import type { ComponentType } from "react";
import { createServiceId } from "@tau/shared/service-contract";

export interface OverlayBackDismissProps {
  open: boolean;
  onDismiss: () => void;
}
export interface OverlayBackDismissAdapter {
  /** 在当前编辑器所在的页面上下文登记退场；不渲染 UI，不监听全局按键。 */
  Layer: ComponentType<OverlayBackDismissProps>;
}
export const IOverlayBackDismiss = createServiceId<OverlayBackDismissAdapter>(
  "tau.host.overlay-back-dismiss"
);
