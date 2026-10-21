# SDK 0.30.0 发布记录

## 发布时间

2024-XX-XX

## 主要变更

### 新增 SettingRow 组件支持

为了让插件设置表单与桌面端原生设置页保持一致的布局规范，本版本将 `SettingRow` 组件从桌面端导出到 `@tau/ui`。

#### 变更内容

**新增导出：**

- `@tau/ui` 新增 `SettingRow` 组件
- `@tau/ui` 新增 `ROW_DIVIDER` 常量

**组件规范：**

- 最小高度：56px
- 内边距：水平 12px，垂直 11px
- 分隔线：相邻行之间使用 `line-2` 弱分隔线（内收 12px）
- 圆角：`rounded-tau-sm`

#### 使用方式

```tsx
import { SettingRow, Input } from '@tau/ui';

export function MySyncSettings({ syncConfig }) {
  return (
    <>
      <SettingRow title="Bucket" description="对象存储桶名称">
        <Input
          className="w-[260px]"
          aria-label="Bucket"
          value={config.bucket}
          onChange={...}
        />
      </SettingRow>

      <SettingRow title="Region">
        <Input
          className="w-[260px]"
          aria-label="Region"
          value={config.region}
          onChange={...}
        />
      </SettingRow>
    </>
  );
}
```

## 受影响的插件

建议以下插件迁移到新的 `SettingRow` 布局：

### 同步插件

- tau.sync-oss
- tau.sync-webdav
- tau.sync-github
- tau.sync-s3

### 其他插件

- 任何有自定义设置表单的插件（TTS、上传、发布等）

## 迁移指南

详见：[插件设置表单SettingRow迁移指南.md](./插件设置表单SettingRow迁移指南.md)

## 向后兼容

本版本**向后兼容**旧版插件，未使用 `SettingRow` 的插件仍可正常工作。

但为了保持 UI 一致性，建议插件作者尽快迁移到新的布局规范。

## 参考

- 示例代码：`scripts/plugins/examples/sync-settings-example.tsx`
- `SettingRow` 源码：`packages/ui/src/patterns/SettingRow.tsx`
- 桌面端使用示例：`apps/desktop/src/features/settings/sections/SyncSection.tsx`

## Breaking Changes

无

## 依赖更新

- `@tau/ui`: 新增 `SettingRow` 和 `ROW_DIVIDER` 导出
