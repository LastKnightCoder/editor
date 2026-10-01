import markConfigs from "./marks.tsx";
import colorConfigs from "./color.ts";

// 直接导出一个合并好的数组，避免每次导入时重新创建数组
const mergedConfigs = [...markConfigs, ...colorConfigs];

export default mergedConfigs;
