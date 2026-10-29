import type { ComponentType } from "react";
import type { Disposable, PluginContext } from "./contract";

/** compact：有最小宽度、可伸展，宽度足够时与其他紧凑面板并排；wide：占整行 */
export type PluginHomePanelSize = "compact" | "wide";

export interface PluginHomePanelProps {
  readonly context: PluginContext;
}

/** 面板标题行右侧的入口，如「查看账本」 */
export interface PluginHomePanelAction {
  title: string;
  run(): void | Promise<void>;
}

export interface PluginHomePanelDefinition {
  id: string;
  /** 面板标题，也是「显示已隐藏的面板」里的名称 */
  title: string;
  /** 面板正文；返回 null 时整块不显示 */
  component: ComponentType<PluginHomePanelProps>;
  /** 缺省为 wide */
  size?: PluginHomePanelSize;
  /** 可选，由宿主画在标题行右侧 */
  action?: PluginHomePanelAction;
}

/** 宿主收到的定义：size 已补成缺省值，action 缺省为 null */
export type RegisteredHomePanelDefinition = Readonly<
  Required<Omit<PluginHomePanelDefinition, "action">> & {
    action: Readonly<PluginHomePanelAction> | null;
  }
>;

export interface PluginHome {
  /** 面板出现在首页：新面板排在末尾，位置由用户调整；插件停用后消失，重新启用回到原位置 */
  registerPanel(definition: PluginHomePanelDefinition): Disposable;
}
