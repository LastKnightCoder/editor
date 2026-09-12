# slate-react Android 光标修复与补丁维护指南

> 2026-09 排查记录沉淀。问题：Android 真机上，点击工具栏加粗后输入文字，光标不随输入前进（停在原地）。
> 最终修复位于 `patches/slate-react@0.126.4.patch`，本文同时记录失败的排查路径、根因证据链、以及补丁的标准迭代流程。

## 一、问题现象

- 仅 Android 真机复现（桌面浏览器正常）；
- 操作路径：编辑器内放好光标 → 点工具栏 **B（加粗）** → 输入中文（如"的"）；
- 症状演进：最初光标直接消失（Slate selection 存在、DOM `rangeCount === 0`）；加了"保光标"补丁后光标可见，但**输入文字后光标不跟随移动**；
- 普通输入（不带 mark、不触发叶子分裂）一切正常——这是关键线索。

## 二、根因（附日志证据）

带 mark 的文字插入会把 Slate 文本叶子**分裂成三段**：`[0,0]` 前段纯文本 / `[0,0+1]` 粗体"的" / 后段纯文本。此后 slate-react 上游 flush 流程里有两处用**旧叶子坐标 + 字长**做算术，全部失效：

1. pending action 的 `newPoint = { path: 旧path, offset: 旧offset + text.length }` → `[0,0]@128`，而该叶子分裂后只有 127 字符，**越界坐标**，`toDOMRange` 持续抛错，布局副作用永远无法把光标推到 DOM；
2. `rangeRef`（affinity: forward）恢复停在分裂边界**之前**（`[0,0]@127`，即"的"的前面）；
3. 唯一正确的值是 `Editor.insertText` 刚执行完那一瞬间的 Slate 原生选区（`[0,1]@1`，"的"后面），但它随即被上述两个恢复逻辑覆盖。

真机日志（`__TAU_SLATE_DEBUG` 开启后）完整呈现了这条链：

```text
flush:start        selection=[0,0]@127, marks={bold:true}          ← 按下 B
flush              at=[0,0]@128  diff={start:127,text:"的"}        ← 上游算出越界 newPoint
flush:insert       selection=[0,0]@127                            ← insertText 前
schedule-reassert  anchorOffset=1                                  ← 我们的捕获值 [0,1]@1（正确！）
flush:start        selection=[0,0]@128                            ← performAction 把模型写成越界值
toDOMRange-failed  anchorOffset=128 ×3                             ← 越界坐标无法转 DOM Range
reassert-caret     attempt=1/2, anchorOffset=1                     ← 双重重推把正确位置写回 DOM
flush:start        selection=[0,1]@1                               ← 模型收敛到"的"后面 ✓
```

## 三、修复方案（补丁内容）

补丁对 slate-react 的 `createAndroidInputManager.flush` 做了三处修改（三份 dist 产物同步）：

1. **正确位置捕获**：diff 循环内 `Editor.insertText` 执行后立即记录 `intendedFromInsert = editor.selection`——这是叶子分裂后唯一可信的坐标；
2. **延迟双重重推**：flush 内应用过 diff 且不在 composition 中时，记录 `intendedFromInsert`，在 rAF（attempt 1）与 120ms 后（attempt 2）各把该位置 `setBaseAndExtent` 写回 DOM 一次——对抗 Android IME 事后重放自己的过期光标（上游 action 路径本来就有同款双推，diff 路径缺失）；重推位置**必须用步骤 1 捕获的值**；
3. **条件化 `onDOMSelectionChange.flush()`**：DOM 有选区（`rangeCount > 0`）时保持上游行为；为 0 时（工具栏交互后丢光标的场景）跳过并同步 `IS_FOCUSED`，避免把空选区读进模型。

另有：`setDomSelection` 在 `toDOMRange` 失败时不再无条件 `removeAllRanges()`（保留原生光标，Slate 无选区时才清除），以及全套 JSON 序列化的 `debug()` 日志（`__TAU_SLATE_DEBUG === true` 时输出）。

## 四、失败的排查路径（教训）

| #   | 尝试                                                              | 假设                                      | 为什么失败                                                                                                                                       |
| --- | ----------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | 跳过 `onDOMSelectionChange.flush()` + `toDOMRange` 失败时保留光标 | DOM 选区丢失时 flush 会用空选区污染 Slate | 光标可见了，但输入后无人推进 DOM 光标——只治了"消失"，没治"不跟随"                                                                                |
| 2   | 补 `IS_FOCUSED` 同步 + 条件化 flush                               | 焦点标志为 false 会阻断布局副作用推送     | 真机复现依旧——推送本来就在发生，是被**错误坐标**阻塞（toDOMRange 越界抛错）而非被标志拦截                                                        |
| 3   | flush 尾部加 rAF+setTimeout 双重重推                              | IME 重放过期光标，需要双推对抗            | 补丁被旁路：中文输入常走 **diff+action 混合路径**，flush 在 `performAction(); return;` 提前返回，**永远到不了尾部**                              |
| 4   | 重推移到提前 return 之前                                          | 修正 #3 的位置问题                        | 重推目标捕获过早（在 rangeRef 恢复之后、performAction 之前），拿到过期值 127，反而把模型拖回原地——日志实锤后改为 insertText 后捕获，**一次成功** |

核心教训：**每轮只信真机日志，不信推理**。#2、#3、#4 的假设在代码阅读层面都自洽，只有日志能证伪。另外 Tauri 的 console 桥接不序列化对象参数（全打 `[object Object]`），patch 内日志必须自带 `JSON.stringify`。

## 五、pnpm patch 机制与规范流程

补丁由三处协作（改动需成对提交）：

| 文件                                          | 角色                                                  |
| --------------------------------------------- | ----------------------------------------------------- |
| `patches/slate-react@0.126.4.patch`           | 补丁本体（标准 git diff 格式），唯一需要进 git 的产物 |
| `pnpm-workspace.yaml` → `patchedDependencies` | 声明"安装 slate-react@0.126.4 时先打此补丁"           |
| `pnpm-lock.yaml`                              | 记录补丁文件内容的 SHA-256，保证可重现                |

`pnpm install` 时 pnpm 从 store 取原版 → 应用补丁 → 存入 `.pnpm/slate-react@0.126.4_patch_h_<哈希>/`（哈希后缀源于补丁内容，改一个字节就换目录）→ 应用软链指向它。**直接改 node_modules 只是临时生效**，重装即丢；必须重新生成 patch 文件并 `pnpm install` 更新 lockfile 哈希，否则 `--frozen-lockfile` 的 CI 会挂。

### 迭代补丁的标准流程（官方，推荐）

```bash
pnpm patch slate-react@0.126.4
# pnpm 会打印一个可编辑目录（已含当前补丁效果），直接改其中的 dist/index.es.js 等

pnpm patch-commit <上一步打印的目录>
# 自动：生成 diff 写入 patches/、更新 pnpm-workspace.yaml 与 pnpm-lock.yaml
```

验证：`node --check node_modules/.pnpm/slate-react@0.126.4_patch_h_*/node_modules/slate-react/dist/index.es.js`。

### 本次实际用的手工流程（在旧补丁基础上迭代时）

```bash
# 纯净原版与已打补丁版在 .pnpm 下各有一份（无 patch 后缀的目录是纯净版）
P=node_modules/.pnpm/slate-react@0.126.4_react-d_*/node_modules/slate-react
L=node_modules/.pnpm/slate-react@0.126.4_patch_h_*/node_modules/slate-react

# 1. 直接改 $L/dist/{index.es.js,index.js,slate-react.js}（Vite 实际只用 index.es.js，
#    另两份是为保持一致），node --check 校验语法
# 2. 对比生成补丁（注意 git diff --no-index 有差异时退出码为 1，不能断 && 链）
mkdir -p .tmp/o/dist .tmp/n/dist && cp $P/dist/* .tmp/o/dist/ && cp $L/dist/* .tmp/n/dist/
git -c core.autocrlf=false diff --no-index .tmp/o/dist .tmp/n/dist > new.patch || true
sed -i 's|a/.tmp/o/dist/|a/dist/|g; s|b/.tmp/n/dist/|b/dist/|g' new.patch
# 3. 隔离目录验证可干净应用
mkdir -p .tmp/v/dist && cp $P/dist/* .tmp/v/dist/ && (cd .tmp/v && git apply --check ../../new.patch)
# 4. 落盘 + 重装
cp new.patch patches/slate-react@0.126.4.patch && rm -rf .tmp new.patch && pnpm install
```

手工流程的坑（本次都踩过）：

- **三份 dist 产物必须同步改**——上一轮会话的补丁把 UMD 版（`dist/slate-react.js`）打错了位置，吞掉了 `setBaseAndExtent` 与 `scrollSelectionIntoView`，该文件语法一直是坏的（Vite 只用 es 版所以未暴露）；
- CJS 版是 `slate.`/`slateDom.` 前缀，es 版是裸导入名，UMD 版是 tab 缩进 + 本地变量——同一段修改三种写法；
- patch 头部的 `a/dist/... b/dist/...` 路径前缀要归一化；
- 换行符保持 LF（生成 diff 时加 `-c core.autocrlf=false`）。

## 六、如何验证与调试

补丁内置日志门控：`globalThis.__TAU_SLATE_DEBUG === true` 时输出 `[slate-react-debug]` 前缀的 JSON 日志。开启方式：在 `apps/mobile/src/main.tsx` 里临时加

```ts
(globalThis as typeof globalThis & { __TAU_SLATE_DEBUG?: boolean }).__TAU_SLATE_DEBUG = true;
```

> 注意：`tauri android build --debug` 只调试 Rust 侧，前端仍是生产构建，`import.meta.env.DEV` 为 false——**不能用 DEV 门控**，排查时须无条件置 true，结束后删除（默认已保持删除状态，未设即静默零开销）。

抓日志：

```bash
adb logcat -c && adb logcat -v time | grep --line-buffered "slate-react-debug"
```

关键日志节点：`flush:start`（flush 入口选区/marks/pendingDiffs）、`flush`（上游的 action+diffs，`at` 字段即 newPoint）、`flush:insert`（插入前）、`schedule-reassert`（重推目标，`anchorOffset` 必须是插入后的新叶子坐标）、`reassert-caret`（每次写回 DOM）、`selection-sync:push` / `selection-sync:toDOMRange-failed`（布局副作用的 DOM 推送成败）。

回归验证要点：① 加粗后输入中文，光标跟随；② 连续输入多字；③ 不加粗直接输入（正常路径不回退）；④ 列表/引用等块级工具栏操作后输入。

## 七、维护注意事项

- **升级 slate-react 版本会使补丁失效**：`patchedDependencies` 按精确版本匹配，升级后条目不再命中（pnpm 会警告），且 dist 上下文变化会导致 apply 失败。升级流程：改 `pnpm-workspace.yaml` 中补丁路径与版本 → 重新走官方 patch 流程重放三处修改 → 真机回归第 6 节要点；
- 修复本质是绕过上游的坐标算术缺陷，理想出路是**提 issue/PR 给 slate 上游**（`insertText` 后以原生选区为准，或在 action newPoint 计算处感知叶子分裂），合入后即可移除本补丁；
- 补丁内所有调试代码零开销（标志未设时 `debug()` 直接返回），无需为"生产干净"单独维护两版补丁。
