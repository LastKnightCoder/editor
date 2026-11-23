/** 随工作区保存的界面偏好 */
export interface WorkspacePreferences {
  /** 关掉的内置功能 ID（侧栏 key）；未列出的功能都打开 */
  disabledFeatures: string[];
  /** pending = 新建的工作区还没选用途 */
  onboarding: "pending" | "done";
}
