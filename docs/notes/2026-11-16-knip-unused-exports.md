# knip 死导出清单（2026-11-16 快照）

代码风格治理专项的「死导出栅栏」产物。工具已落地：根目录 `knip.json`（已忽略 mockups/e2e/store/docs 等非生产目录），`knip` 已装入 root devDependencies。

## 复现命令

```
npx knip --include exports --no-progress
```

完整原始清单见同目录 `2026-11-16-knip-unused-exports.full.txt`（1242 条）。

## 读数口径（重要）

1242 条**不等于** 1242 个可删符号，已知三类误报源：

1. **框架路由约定**：`apps/analytics/api/*` 的具名导出是 HTTP 端点处理器（按导出名分发），不是死代码。
2. **RPC/消息表**：`apps/browser-extension` 的 `RPC_PASSTHROUGH`、`EXTENSION_PAGE_METHODS` 等常量参与消息协议表，删前要确认协议侧无字符串引用。
3. **测试与 eval 入口**：`*.eval.test.ts` 已在 ignore，但部分符号仅被 eval/测试消费，knip 默认不算生产消费者。

初步判断**真死概率高的区域**（与前期人工调研交叉验证过）：`apps/desktop/src/utils`（约 143 条命中，人工抽验 5 个全部属实）、`packages/whiteboard`（46 条）、`apps/mobile/src`（66 条）。

## 处置建议

- 不做一次性全删。按区域小批量清（每批一个目录），每批先 `rg` 复核消费者清零再删（`web-clip.ts` 事件教训：整文件删除必须枚举全部导出逐个验证）。
- 批次进度（2026-11-16 当日四批）：~~`apps/desktop/src/utils`~~（✅ 63→0）→ ~~`packages/whiteboard`~~（✅ 46→0）→ ~~`apps/mobile/src`~~（✅ 66→0）→ ~~杂项包~~（✅ 68→11，余为 ui 设计系统公共 API 待产品决策、analytics 框架路由约定、跨 mobile 死链 1 条）→ ~~`apps/desktop/src` 其余区域~~（✅ 342→10，余为 namespace-spread 消费等 knip 误报）。全仓条目 1242 → **694**（含 knip.json entry 配置修正消化的误报）。
- 剩余 694 条的构成修正（2026-11-17）：`root/scripts` 与两个 collaboration app 因 knip.json 将其配置为 entry，本就零命中；browser-extension 13 条已清（12 降级 + 1 删除），全仓现为 **688**。剩余主要是 desktop/mobile 深链符号与测试夹具，边际收益递减。
- 误报区域（analytics/browser-extension）在删除批次中单独标注跳过。
- 清完后可将 `npx knip --include exports` 挂进 CI（`quality.mjs`），误报消化前不挂。

## 复核中确认的「假消费者」甄别口径

同名不等于同源：mobile 端同名独立实现、packages/database 本地函数、src-electron 表类自身方法、注释与 HTML 文本提及、mock 依赖字段都不构成消费者——必须以真实 import 语句为准。另有三类特殊消费模式：**namespace-spread 后以 `commands.X` 访问**（bindDatabaseCommands 解构，tsc 可验证）；**框架按导出名分发的路由入口**（analytics api/*、plugin-portal 显式 import 除外）；**barrel 侧死但源文件直连活**（清理 barrel 行即可，源导出保留）。
