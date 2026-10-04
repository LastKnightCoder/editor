import type { CodeBlockController } from "../types";

/** 已挂载代码块编辑器的运行时注册表（按块 uuid），供命令与菜单读取 */
export const codeBlockMap = new Map<string, CodeBlockController>();

/** 代码块组件的运行时动作（按块 uuid），供菜单命令触发组件内状态 */
export const codeBlockActionsMap = new Map<string, { editFilename: () => void }>();
