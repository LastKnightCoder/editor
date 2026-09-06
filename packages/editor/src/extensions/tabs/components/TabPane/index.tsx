import { useContext } from "react";
import type { CSSProperties } from "react";
import type { RenderElementProps } from "slate-react";

import type { TabPaneElement } from "../../../types";
import { TabsActiveContext } from "../../context";

interface ITabPaneProps extends RenderElementProps {
  element: TabPaneElement;
}

/**
 * 单个 Tab 的内容容器：Tab 的真实内容作为其 children 留在父编辑器文档树内。
 * 非激活 Tab 用绝对定位铺底 + 不可见（保活隐藏）而非 display:none，
 * 保证内部布局测量（图片、异步组件、content-visibility 分块）在切换回来时仍然正确。
 */
const TabPane = (props: ITabPaneProps) => {
  const { attributes, element, children } = props;
  const activeKey = useContext(TabsActiveContext);
  const isActive = element.tabKey === activeKey;

  const style: CSSProperties = isActive
    ? { position: "relative" }
    : {
        position: "absolute",
        inset: 0,
        visibility: "hidden",
        pointerEvents: "none",
      };

  return (
    <div {...attributes} style={style} data-tab-key={element.tabKey}>
      {children}
    </div>
  );
};

export default TabPane;
