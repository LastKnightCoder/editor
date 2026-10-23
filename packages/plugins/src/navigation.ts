import type { Disposable } from "./contract";
import type { PluginIcon } from "./icons";
import type { PluginPageHandle, PluginPageParams } from "./pages";

export interface PluginNavigationEntry {
  id: string;
  title: string;
  icon?: PluginIcon;
  page: PluginPageHandle;
  params?: PluginPageParams;
}

export interface PluginNavigation {
  /** 功能入口的具体位置由宿主决定，与页面注册分离。 */
  registerEntry(entry: PluginNavigationEntry): Disposable;
}
