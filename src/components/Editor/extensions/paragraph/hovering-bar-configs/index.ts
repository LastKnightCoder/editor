import markConfigs from "./marks";
import colorConfigs from "./color";
import highlightConfigs from "./highlight";

// 直接导出一个合并好的数组，避免每次导入时重新创建数组
const mergedConfigs = [...markConfigs, ...colorConfigs, ...highlightConfigs];

export default mergedConfigs;
