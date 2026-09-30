import markConfigs from "./marks";
import colorConfigs from "./color";

// 直接导出一个合并好的数组，避免每次导入时重新创建数组
const mergedConfigs = [...markConfigs, ...colorConfigs];

export default mergedConfigs;
