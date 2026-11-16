# 测试治理专项：全仓审计与 P0/P1 清理（2026-11-16）

> 一次性审计快照。裁决已沉淀至 [/docs/decisions.md](/docs/decisions.md)「工作方式」节；P2 遗留清单见文末，完成后本文件可删。

## 背景与方法

用户感知「很多测试意义不大：为极小的点写测试、写死了值」。8 个分区子 agent 按统一口径（A 琐碎低价值 / B 重复实现 / C 写死值脆性 / D 过度 mock / E 守护对账-保留 / F 高价值-保留 / G 巨型文件 / H flaky）审查 1631/1653 个测试文件（约 26.4 万行）。

## 总体结论

问题呈「少数集中的口袋，非系统性腐烂」：F+E 类占各区 60-80%；A-D 类问题文件约 100-130 个（6-8%），高度集中在 UI 层（desktop 功能层、ui/primitives、mobile cards）。全仓零快照滥用、零永久 skip、mock 普遍打在边界而非被测核心。

各分区详情略（本次会话记录留存于任务历史），核心数字：

| 区域               | 文件/行数   | 主要问题                                                |
| ------------------ | ----------- | ------------------------------------------------------- |
| desktop 主进程     | 299 / 59.0k | eval 脚本混入 ×13、electron mock 样板 ×135、3355 行巨型 |
| desktop 功能层     | 271 / 37.1k | textContent 文案断言 368 处、mock hooks+纯文案          |
| mobile             | 221 / 43.7k | 类名断言 ~25 处、skipIf 构建产物依赖 ×2                 |
| whiteboard+数据包  | 181 / 34.8k | wall-clock 断言 13 处、undo/redo 双文件重复             |
| desktop 渲染核心层 | 185 / 25.5k | 常量断言散点、3 秒性能门禁                              |
| editor 家族        | 177 / 23.9k | 887 行巨型、真实 sleep flaky                            |
| UI/主题/AI+杂项    | 130 / 22.5k | primitives 类名断言 40 处、tag 抄色板                   |
| plugins 生态       | 167 / 17.6k | 三胞胎复制、版本号写死                                  |

## 本次已执行清理（P0+P1，41 文件 +38/-957）

- **删除 11 个整文件**：desktop 4（codeBlockUtils / menuItems / chat-input-placeholder / useMarginFit）、ui loadingOverlay、contracts setting.test、plugins 三胞胎 source-binding ×3（删前均 rg 确认零引用）
- **删除常量/透传/注册表断言用例**：chat-retry、code-block-languages、registry、languages、normalizeEditorContent、mediaWidth、index-recovery-yield（3 个同构用例，保留 2 个真实行为用例）
- **删除性能断言与残留**：whiteboard path-transform 两个 describe（-340 行）、undo-redo 计时用例、diff 计时断言、desktop knowledge-map 3 秒门禁；performance.now/Date.now/Math.random/console.log/heapUsed 复核清零
- **文案/类名断言重写**：VoiceSection、PublishView（删 21 处文案断言）、CacheSection（改结构级）、tag（删七色抄表）、input（删全部类名断言）、Button（仅留 loading+cn 覆盖）、mobile 6 文件 24 行类名断言（保留 aria/行为断言）
- **写死值动态化**：themes node-import 改 `listThemes().length` 对账；weight/expense minAppVersion 改「两端一致+格式合法」
- **附带修复**：AboutSection 既有文案漂移失败（更新至当前文案）、useMarginFit.ts 过时守护注释清理、contracts package.json 加 `--passWithNoTests`（唯一测试删除后防止 `pnpm -r test` 中断）
- **跳过**：mochi Showcase.test.tsx（审查误判，实际含真实行为断言，保留正确）

## 验证

- 受影响测试定向全绿：editor 203+88、whiteboard 2584（utils 全目录）、desktop 217/218→修复后 218、mobile 86、ui 24、themes 1、plugins 各包（tikz 10 / html 9 / abc 9 / weight 43 / expense 32）、主进程 index-recovery-yield 2
- 类型检查：desktop、ui、themes、editor 全过；whiteboard/mobile 因 `packages/markdown/src/positionMapper.ts:146` 既有 `findLast` 类型错误失败（markdown 包本次未动，与治理无关，未处理）
- lint：0 错误（100 警告均为既有 non-null 断言风格提示）

## P2 结构治理（已执行，全部完成）

1. **巨型拆分（用例守恒）**：`manager-node-document`（3355 行→4 主题文件+mocks/helpers，55/69 双口径守恒，联动更新 dev-content-verification.md 与 stress 脚本路径）；`mobileEditorToolbarController`（1299→5 文件+helper，30 守恒）；`define-extension`（887→316+10 个 v2-behaviors.test.tsx 归位各扩展，35 守恒）；whiteboard `normalized` 删 5 个实质重复（-170 行）；portal 迁移对账拆出 `portal.migrations.test.ts`（46 守恒）
2. **eval 迁出**：15 个文件（13 eval + 2 helper）迁至 `apps/desktop/src-electron/eval/`；主 config exclude + 新增 `vitest.eval.config.ts`（vitest 3.2.7 被 exclude 文件无法显式运行，故双配置）
3. **mock 收敛**：正规 `__mocks__` 机制（`apps/desktop/__mocks__/electron.ts` + 模块同目录 `__mocks__/video-note-index-queue.ts`），收敛 59 处 electron + 79 处 vniq 标准样板；84 个真变体保留
4. **flaky 治理**：source-view 7 处真实 sleep→fake timers（用例时长 5020ms→209ms）；desktop 5 处固定 10ms settle→0ms 宏任务/waitFor（2 处判定为轮询步长不构成 flaky，不动）
5. **skipIf 冒烟核实**：结论——仓库无任何 CI 配置、插件 dist 入 gitignore 永不入库，weight 冒烟当前即静默跳过（manifest 0.2.6 vs dist 0.2.3）；已加显式 console.warn
6. **mobile 归位**：hoveringToolbarLayout / floatingSubmenu 迁至 `packages/editor/src/core/components/HoveringToolbar/__tests__/`
7. **whiteboard 管线契约化**：9 处（实际多于审查估计的 5 处）手工复刻生产管线改为断言 applyOperations 返回值的公共模式；:687-741"贴输出"用例改写为可推导契约。额外证实：原复刻管线与生产实际管线并不一致（transformValidOperations 包裹 vs 生产 filter→sort→clone），即"测试同步腐化"已成事实
8. **小项**：tools/index 精简 5→3（保架构守护断言）；mcp/calendar/mutation 补 false 侧对照（2→3）

P2 验证：desktop tsc 全绿；各区域 vitest 全绿（collaboration 153 passed、editor 461 中 460+1 既有失败、whiteboard 2579、mobile 183+30、portal 50、modules/**tests** 失败均经 HEAD 对照归因为既有）；oxlint 零新增。

## 遗留问题（2026-11-16 收尾修复后更新）

已修复（均为测试漂移或最小源码修复，验证全绿）：

- ~~expense 冒烟 2 个断言漂移~~ → 按当前契约 `{title, run}` 修写
- ~~table 热键数量断言 5 vs 6~~ → 改 `key → command id` 结构性映射断言（`1ff60b908` 引入第 6 热键）
- ~~markdown `positionMapper.ts:146` findLast 类型错误~~ → 改从尾向头等价遍历（三包 lib 止于 ES2022，未动 tsconfig）；whiteboard/mobile tsc 恢复 exit 0
- ~~content-events / content-ai-queue / content-insights / reflection 四个 HEAD 即失败~~ → 逐一 git 定位漂移提交（护栏扫描范围、thinkingLevel 契约、归纳措辞移入提示词）并按新契约修写，28 用例全绿

仍遗留：

- ~~weight-plugin 同款旧契约断言~~ → 已于同日修复：本地构建 0.2.6 zip 产物让冒烟真跑（失败精确复现），断言按 expense 同款修法改为 `{title:"查看"} + typeof run` 结构断言，weight+expense 共 6 用例全绿（dist 产物入 gitignore，仅本地存在）
- 环境债：无 CI，插件 zip 冒烟无执行保证。建流水线时参考以下清单（未实施，属基建决策）：
  1. checkout 需 `submodules: recursive`（plugins/* 均为 submodule）；`pnpm install` 后跑 `pnpm lint` + `pnpm check`（desktop tsc）+ `pnpm -r test`（eval 已 exclude 不收集、contracts 已 passWithNoTests）
  2. mobile 插件宿主冒烟依赖构建产物：需在 `plugins/tau-plugin-expense`、`plugins/tau-plugin-weight` 目录各自 `pnpm build`（plugins 不在 pnpm workspace，须进目录执行）生成 dist zip 后再跑 mobile 测试；dist 入 gitignore，CI 不可缓存时每次重建
  3. 建议建 CI 时把两组冒烟的 zipPath 门控从"warn + skip"升级为"缺产物即 fail"（warn 已就位，改判定即可），杜绝隐性覆盖空洞
  4. 已知噪声预案：`ensure-node-sqlite.mjs` 的 ABI 恢复在连续多次 vitest 间有竞态（单次运行无碍）；desktop `modules/__tests__` 大目录在 CPU 受限时偶发超时（content-self-heal 曾复现），CI 建议给足核数或对超时用例设一次 retry
