# SettingRow 迁移任务清单

## 状态：进行中

本任务旨在解决同步插件改造后设置表单间距不一致的问题，通过将 `SettingRow` 组件导出到 `@tau/ui`，让插件使用统一的布局规范。

## 已完成

### 主仓库侧（桌面端）

- [x] 将 `SettingRow` 组件从 `apps/desktop` 移至 `packages/ui/src/patterns/SettingRow.tsx`
- [x] 同时移动 `ROW_DIVIDER` 常量到 `SettingRow` 模块中
- [x] 在 `packages/ui/src/index.ts` 中导出 `SettingRow` 和 `ROW_DIVIDER`
- [x] 更新 desktop 端的旧文件为重导出（带 @deprecated 标记）
- [x] 移除 `PluginSettingsView` 中的临时 CSS 适配层
- [x] 更新 `@tau/plugins` 版本号到 0.30.0
- [x] 类型检查通过
- [x] 创建迁移指南文档
- [x] 创建示例代码
- [x] 创建 SDK 发布记录

### 文档

- [x] `docs/plugin-system/插件设置表单SettingRow迁移指南.md`
- [x] `scripts/plugins/examples/sync-settings-example.tsx`
- [x] `docs/plugin-system/SDK-0.30.0发布记录.md`
- [x] `docs/plugin-system/SettingRow迁移任务清单.md`（本文件）

## 待完成

### 主仓库侧

- [ ] 构建并测试桌面端应用
  - [ ] 验证非插件的同步方式（如果还有）布局正常
  - [ ] 验证其他使用 `SettingRow` 的设置页未受影响
- [ ] 发布新版 SDK（如需公开发布）
- [ ] 更新插件模板（如有）

### 插件仓库侧

需要在各插件独立仓库中完成迁移：

#### tau.sync-oss

- [ ] 更新依赖 `@tau/plugins` 到 0.30.0
- [ ] 修改设置组件使用 `SettingRow`
- [ ] 本地测试通过
- [ ] 更新版本号 0.1.1 → 0.2.0
- [ ] 构建并发布新版 ZIP
- [ ] 更新主仓库 distribution.json（如有）

#### tau.sync-webdav

- [ ] 更新依赖 `@tau/plugins` 到 0.30.0
- [ ] 修改设置组件使用 `SettingRow`
- [ ] 本地测试通过
- [ ] 更新版本号 0.1.0 → 0.2.0
- [ ] 构建并发布新版 ZIP
- [ ] 更新主仓库 distribution.json（如有）

#### tau.sync-github

- [ ] 更新依赖 `@tau/plugins` 到 0.30.0
- [ ] 修改设置组件使用 `SettingRow`
- [ ] 本地测试通过
- [ ] 更新版本号 0.1.0 → 0.2.0
- [ ] 构建并发布新版 ZIP
- [ ] 更新主仓库 distribution.json（如有）

#### tau.sync-s3

- [ ] 更新依赖 `@tau/plugins` 到 0.30.0
- [ ] 修改设置组件使用 `SettingRow`
- [ ] 本地测试通过
- [ ] 更新版本号 0.2.0 → 0.3.0
- [ ] 构建并发布新版 ZIP
- [ ] 更新主仓库 distribution.json（如有）

### 其他可能受影响的插件

根据实际情况评估是否需要迁移：

- [ ] TTS 插件（如有自定义设置）
- [ ] 图片生成插件（如有自定义设置）
- [ ] 发布插件（如有自定义设置）
- [ ] 资源上传插件（如有自定义设置）

## 验证清单

### 视觉验证

- [ ] 字段间距与原生设置页一致
- [ ] 分隔线正确显示（内收 12px）
- [ ] 字段标签左对齐，控件右对齐
- [ ] Input 宽度统一（260px）
- [ ] 最小行高 56px
- [ ] 圆角正确

### 功能验证

- [ ] 表单交互正常（输入、选择、保存）
- [ ] 错误提示正常显示
- [ ] 配置保存成功
- [ ] 同步功能正常工作
- [ ] 已有测试通过

## 插件仓库地址

- OSS: https://github.com/LastKnightCoder/tau-plugin-oss
- WebDAV: https://github.com/LastKnightCoder/tau-plugin-webdav
- GitHub: https://github.com/LastKnightCoder/tau-plugin-github (待确认)
- S3: https://github.com/LastKnightCoder/tau-plugin-s3 (待确认)

## 注意事项

1. **向后兼容**：旧版插件仍可正常工作，但布局可能不一致
2. **分阶段迁移**：可以先迁移一个插件验证方案，再批量迁移其他插件
3. **版本号**：插件版本号建议 minor bump（0.1.x → 0.2.0）
4. **依赖**：确保 `peerDependencies` 中 `@tau/ui` 版本匹配
5. **测试**：迁移后务必本地测试，确保功能和视觉都正确

## 完成标准

- [ ] 所有同步插件（OSS/WebDAV/GitHub/S3）完成迁移
- [ ] 新版插件在桌面端设置页显示正常
- [ ] 布局与原生设置页完全一致
- [ ] 所有相关测试通过
- [ ] 用户确认视觉效果满意
- [ ] 文档更新完成

## 相关 Issue/PR

（待补充）

## 更新日志

- 2024-XX-XX: 主仓库侧完成，等待插件仓库迁移
