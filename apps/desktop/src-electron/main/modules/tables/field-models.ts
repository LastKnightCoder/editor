import { builtInFieldModels, type AnyConfigFieldModel } from "@tau/database/model";
import { desktopFieldModels } from "@/features/shared/database/desktopFieldModels";

/**
 * 数据表持久化列类型的字段 model 登记（D-130）：内置字段 + 桌面私有字段。
 * 主进程的正文引用收集按各 model 的 contentRefs 声明，不再硬编码列类型。
 * 卡片视图（card-links 等）不经 data_tables 持久化，无需在此登记。
 */
export const dataFieldModels: readonly AnyConfigFieldModel[] = [
  ...builtInFieldModels,
  ...desktopFieldModels,
];
