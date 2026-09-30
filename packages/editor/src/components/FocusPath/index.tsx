import { createContext, useContext, type ReactElement } from "react";
import { useSlateSelector, type RenderElementProps } from "slate-react";

import { FOCUS_PATH_ATTR, FOCUS_UNIT_ATTR, focusRoleOf } from "./focusPath";

/** 本编辑器是否开启聚焦模式；开关变化经 Context 穿透 Slate 的元素 memo */
export const FocusModeContext = createContext(false);

/**
 * 聚焦标记作为渲染输出：元素订阅自己在聚焦路径上的角色（按节点身份，见 focusRoleOf），写进 Slate 的 attributes
 * （元素组件把 attributes 展开到根节点）。角色只在变化时引起该元素重渲染，
 * 其他原因的重渲染（输入、协作同步）也不会丢标记。
 */
export function FocusAttributes({
  props,
  render,
}: {
  props: RenderElementProps;
  render: (props: RenderElementProps) => ReactElement;
}) {
  const enabled = useContext(FocusModeContext);
  const role = useSlateSelector(editor =>
    enabled ? focusRoleOf(editor, props.element, editor.selection?.focus.path) : null
  );
  if (!role) return render(props);
  const attributes = {
    ...props.attributes,
    [FOCUS_PATH_ATTR]: "",
    ...(role === "unit" ? { [FOCUS_UNIT_ATTR]: "" } : null),
  };
  return render({ ...props, attributes });
}
