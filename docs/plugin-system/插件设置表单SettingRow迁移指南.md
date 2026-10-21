# 插件设置表单 SettingRow 迁移指南

## 背景

在 SDK 0.30.0 中，我们将桌面端的 `SettingRow` 组件导出到了 `@tau/ui`，以便插件可以使用统一的设置行布局规范。

之前插件直接使用 `Input`、`FormField` 等组件渲染设置表单，导致与桌面端原生设置页的布局不一致（间距、分隔线等）。

## 变更内容

### 新增导出

`@tau/ui` 现在导出：

- `SettingRow`: 设置行组件，提供标准的左右布局（左侧标题+说明，右侧控件）
- `ROW_DIVIDER`: 行分隔样式常量（供自定义行使用）

### 布局规范

`SettingRow` 提供：

- 最小高度 56px (`min-h-14`)
- 水平内边距 12px (`px-3`)
- 垂直内边距 11px (`py-[11px]`)
- 相邻行之间的 `line-2` 弱分隔线（内收 12px）
- 圆角 `rounded-tau-sm`

## 迁移步骤

### 1. 更新依赖

确保插件的 `package.json` 使用 SDK 0.30.0+：

```json
{
  "peerDependencies": {
    "@tau/plugins": ">=0.30.0",
    "@tau/ui": ">=0.30.0"
  }
}
```

### 2. 修改设置组件

#### 迁移前（不推荐）

```tsx
import { Input, Button } from "@tau/ui";

export function OSSSettings({ syncConfig }) {
  const [config, setConfig] = useState(syncConfig.value);

  return (
    <div className="space-y-4">
      <div>
        <label>Bucket</label>
        <Input
          value={config.bucket}
          onChange={e => setConfig({ ...config, bucket: e.target.value })}
        />
      </div>
      <div>
        <label>Region</label>
        <Input
          value={config.region}
          onChange={e => setConfig({ ...config, region: e.target.value })}
        />
      </div>
      <Button onClick={() => syncConfig.save(config)}>保存同步配置</Button>
    </div>
  );
}
```

#### 迁移后（推荐）

```tsx
import { SettingRow, Input, Button } from "@tau/ui";

export function OSSSettings({ syncConfig }) {
  const [config, setConfig] = useState(syncConfig.value);

  return (
    <>
      <SettingRow title="Bucket">
        <Input
          className="w-[260px]"
          aria-label="Bucket"
          value={config.bucket}
          onChange={e => setConfig({ ...config, bucket: e.target.value })}
        />
      </SettingRow>

      <SettingRow title="Region">
        <Input
          className="w-[260px]"
          aria-label="Region"
          value={config.region}
          onChange={e => setConfig({ ...config, region: e.target.value })}
        />
      </SettingRow>

      <SettingRow title="Access Key ID" description="从阿里云控制台获取">
        <Input
          className="w-[260px]"
          type="password"
          aria-label="Access Key ID"
          value={config.accessKeyId}
          onChange={e => setConfig({ ...config, accessKeyId: e.target.value })}
        />
      </SettingRow>

      <SettingRow title="">
        <Button onClick={() => syncConfig.save(config)}>保存同步配置</Button>
      </SettingRow>
    </>
  );
}
```

### 3. 关键改动点

1. **包裹每个字段**：用 `<SettingRow>` 包裹每个表单字段
2. **标题放 title**：字段标签放在 `title` prop 中
3. **可选说明**：需要说明时使用 `description` prop
4. **控件在 children**：Input/Select 等控件作为 children 传入
5. **建议宽度**：Input 建议添加 `className="w-[260px]"` 保持统一宽度
6. **aria-label**：为无障碍和测试，Input 应添加 `aria-label`
7. **按钮也包裹**：保存按钮也建议放在 SettingRow 中（title 传空字符串）

### 4. 移除外层容器

迁移后**不需要**外层的 `<div className="space-y-4">` 等容器，直接返回多个 `<SettingRow>` 即可（使用 Fragment `<>` 包裹）。

## 受影响的插件

需要迁移的同步/上传插件：

- [ ] `tau.sync-oss` (v0.1.1 → v0.2.0)
- [ ] `tau.sync-webdav` (v0.1.0 → v0.2.0)
- [ ] `tau.sync-github` (v0.1.0 → v0.2.0)
- [ ] `tau.sync-s3` (v0.2.0 → v0.3.0)

其他可能受影响的插件（如果有自定义设置表单）：

- TTS 插件
- 图片生成插件
- 发布插件

## 验证

迁移后应验证：

1. **视觉一致性**：与桌面端其他设置页的行布局一致
2. **间距正确**：字段之间有分隔线，内边距合适
3. **响应式**：Input 宽度适当，不过宽或过窄
4. **测试通过**：原有的表单交互测试仍然通过

## 参考

- `SettingRow` 源码：`packages/ui/src/patterns/SettingRow.tsx`
- 桌面端使用示例：`apps/desktop/src/features/settings/sections/SyncSection.tsx`（查看 WebDAV/GitHub 等非插件方式的字段布局）

## 发布流程

1. 在插件仓库中更新依赖到 SDK 0.30.0
2. 按上述方式修改设置组件
3. 本地测试通过后，更新版本号（minor bump）
4. 构建并发布新版 ZIP
5. 更新主仓库的 `plugins/distribution.json`（如果有）
