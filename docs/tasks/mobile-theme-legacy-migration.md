# 移动端旧主题偏好迁移退役

状态：进行中
目标：存量移动端用户都升级到统一主题的版本后，删除旧偏好迁移代码。

## 背景

移动端主题已与桌面端统一为 `@tau/themes`（见 [mobile.md](/docs/architecture/mobile.md#主题与样式)）。旧版把偏好存在单键 `tau-mobile-theme`（杏子 / 玄夜 / 薄荷 / 海盐 / 跟随系统），统一后的首个版本在首帧脚本前一次性迁移：

| 旧值                                 | 主题族     | 明暗     |
| ------------------------------------ | ---------- | -------- |
| apricot（含更早的 light）            | paper 暖纸 | 浅色     |
| midnight（含更早的 dark / nocturne） | paper 暖纸 | 深色     |
| mint                                 | mint       | 浅色     |
| ocean                                | ocean      | 浅色     |
| system                               | paper 暖纸 | 跟随系统 |

已有新格式偏好时不覆盖；迁移后删除旧键。

决策：玄夜没有同款主题族，用户选择迁到暖纸 · 深色（接受观感变化），不迁墨（ink）。

## 待办

- [ ] 统一主题后的移动端版本发布并完成存量升级后，删除 `apps/mobile/src/theme/legacyThemeMigration.ts` 及其测试，`apps/mobile/vite.config.ts` 只保留 `createThemeBootstrapScript()`；随后删除本文件。

验证：`pnpm --dir apps/mobile test`、`pnpm --dir apps/mobile build`。
