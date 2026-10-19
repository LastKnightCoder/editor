import type { PluginServices } from "./services";

let useServices: () => PluginServices | undefined = () => undefined;

/** 宿主绑定 React 上下文，作者只消费 usePluginServices。 */
export function configurePluginServiceAccess(read: typeof useServices) {
  useServices = read;
}

/** 当前插件渲染作用域的服务；博客和无界面宿主不提供服务。 */
export function usePluginServices(): PluginServices | undefined {
  return useServices();
}
