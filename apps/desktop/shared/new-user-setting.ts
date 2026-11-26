/** 只用于首次创建设置。旧设置缺少背景开关时沿用原有的开启状态。 */
export const NEW_USER_SETTING = {
  appearance: { backdrop: { enabled: false } },
} as const;
