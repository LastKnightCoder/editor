/**
 * 内容审阅卡读取当前权限模式；工具执行前的统一审批由主进程 pi 会话宿主负责。
 */

import useSettingStore from "@/stores/useSettingStore";
import { normalizePermissionMode, type ToolPermissionMode } from "./mode";

export const getToolPermissionMode = (): ToolPermissionMode =>
  normalizePermissionMode(useSettingStore.getState().setting.agentPermission?.mode);
