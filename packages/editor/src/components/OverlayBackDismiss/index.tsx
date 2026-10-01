import {
  IOverlayBackDismiss,
  type OverlayBackDismissProps,
} from "../../services/overlayBackDismiss";
import React from "react";
import { useOptionalService } from "../../services/hooks";

/** 仅在 open 期间挂载宿主登记器；未提供服务时由浮层的按钮及焦点链关闭。 */
export default function OverlayBackDismiss(props: OverlayBackDismissProps) {
  const adapter = useOptionalService(IOverlayBackDismiss);
  return props.open && adapter ? React.createElement(adapter.Layer, props) : null;
}
