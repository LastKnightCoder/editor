import { builtInAggregateDefinitions } from "./aggregate";
import { AggregateRegistry } from "./aggregateRegistry";

/** 仅登记内置 9 个算子的缺省注册表：组件脱离 Database 树独立渲染（如测试）时的缺省值 */
export const builtInAggregateRegistry = new AggregateRegistry();
builtInAggregateRegistry.registerAll(builtInAggregateDefinitions);
