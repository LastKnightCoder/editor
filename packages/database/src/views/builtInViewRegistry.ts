import { ViewRegistry } from "./ViewRegistry";
import { builtInViewDefinitions } from "./builtInViews";

/** 仅注册内置四视图的缺省注册表：组件脱离 Database 树独立渲染（如测试）时的 viewRegistry 缺省值 */
export const builtInViewRegistry = new ViewRegistry();
builtInViewRegistry.registerAll(builtInViewDefinitions);
