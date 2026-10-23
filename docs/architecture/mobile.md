# 移动端页面栈架构（router）

## 架构总览

2026-09 重构：页面栈收敛为 **`src/router/`** 独立框架层，页面以 `definePage` 单文件声明。

调研依据：React Navigation（getId 身份/navigate-push 双动词）、Ionic（Will/Did 四相事件）、
Vue KeepAlive（max LRU）、React 19.2 `<Activity>`（官方保活原语）、Android/iOS（生命周期分层）、
Flutter（`await push<T>()` 结果通道）。

```
L5 开发者 API   definePage / usePage / usePageLifecycle / usePageGuard / useBackHandler /
                usePageQuery / usePageStore / navigator(push/pushForResult/finish/goBack)
L4 页面数据     TanStack Query（key 参数化=每实例缓存，refetchOnResume 声明式返回刷新）
                + zustand 工厂 per-instance 页面 store
L3 渲染与生命周期 PageHost/OverlayHost（<Activity> 保活、双页同动转场、边缘手势、生命周期分发）
L2 注册与 Schema definePage 协议 + paramsSchema DSL（编译期类型推导 + 运行时净化）
L1 路由核心     纯函数栈机（src/router/core/，无 React，可单测）
```

## 新建一个页面

```TSX
// features/**/pages/todoDetail.page.tsx（glob 自动注册，无需改任何登记表）
export default definePage({
  key: "todoDetail",
  match: "multi", // single | params(配 getId) | multi
  params: { todoId: paramNumber(), groupId: paramOptional(paramNumber()) },
  data: {
    detail: {
      key: p => ["todo", p.todoId],
      load: p => tauri.getTodoDetail(p.todoId),
      refetchOnResume: "if-stale", // if-stale | always | never
    },
  },
  store: p => ({ draft: "" }), // 页面私有 store（可选）
  canLeave: () => true, // 静态离开守卫（可选）
  component: TodoDetailScreen,
});

// 页面组件内
const { params } = usePage<{ todoId: number }>();
const detail = usePageQuery("detail");
const draft = usePageStore(s => s.draft as string);
usePageLifecycle({ onResume() {}, onPause() {} });
usePageGuard(() => !dirtyRef.current); // 动态守卫
useBackHandler(() => {
  setActive(null);
  return true;
}); // 消费返回（如设置页退二级模块）
```

导航（任意位置）：`getNavigator().push(key, params)`；等待结果：
`const picked = await navigator.pushForResult<R>("cardPicker", {})`，
被打开页 `navigator.finish(result)` / `navigator.cancel()`。

## 页面身份（match 三态）

- `single`：全局一份，重复 push = bringToTop + 更新 params（settings/search/diaryHome/todo/about）
- `params` + `getId(params)`：按参数身份去重（contentDetail 按 contentId）
- `multi`：每次 push 新实例（todoDetail 嵌套）

单例/多例声明在页面注册处（Android launchMode 宿主声明流），调用方不操心。

## 生命周期（三层 + 返回）

| 层     | 事件                                     | 触发                                                                       |
| ------ | ---------------------------------------- | -------------------------------------------------------------------------- |
| 存在级 | onInit / onDestroy                       | 组件首次挂载 / entry 离开栈（由 Host 显式分发，不受 Activity hidden 影响） |
| 显示级 | onEnter/onEntered、onLeave/onLeft        | 转场动画前/后                                                              |
| 恢复级 | onResume / onPause                       | 从上层返回 / 被 screen 覆盖（overlay 打开不触发，同 iOS present）          |
| 返回级 | useBackHandler / usePageGuard / canLeave | 消费返回 / 阻止离开（quickCapture 已用 backHandler 收编系统返回）          |

### 页面位置 × 事件真值表

| 页面位置               | effect 状态                 | onInit/onDestroy       | onPause/onResume | 说明                                        |
| ---------------------- | --------------------------- | ---------------------- | ---------------- | ------------------------------------------- |
| 栈顶（active）         | 挂载                        | —                      | onResume         | 正常交互                                    |
| 紧邻下层（underlay）   | 挂载                        | —                      | onPause          | 转场中可见（视差层）                        |
| 第三层及以下（deeper） | **卸载**（Activity hidden） | —（不触发）            | —（phase 不变）  | 页面内一切 useEffect 在此期间停止、回浅重挂 |
| entry 离开栈（pop）    | 卸载                        | onDestroy              | —                | 真正的销毁                                  |
| LRU 逐出               | 卸载（内容 null）           | 恢复时 onInit 再次触发 | —                | DOM/state 丢失，query 缓存恢复数据          |

注意：页面被压深（deeper）时组件 effect 被卸载是 React <Activity> 的既定语义——
订阅/定时器等请放到 usePageLifecycle 的对应事件里管理，而非裸 useEffect。

## 保活与数据恢复

- `keepAlive: "keep"`（默认）：`<Activity mode="hidden">`——React state + DOM（滚动/草稿）保留，effect 自动卸载
- `"data"`：非激活即卸载内容；数据留在 query 缓存（重激活 = 缓存秒显 + 后台刷新）。
  "每次全新"语义由页面 data 声明 `staleTime: 0` / `refetchOnResume: "always"` 表达（fresh 已摘除）
- LRU：栈内保活页面上限 10（`MAX_LIVE_SCREENS`），超出卸载最久未访问页 DOM，数据仍在 query 缓存
- 返回时刷新：`refetchOnResume` 声明，取代手写 leftDetailFromPreview effect

## overlay（浮层）

overlay 与 screen 同走 definePage（`layer: "overlay"` + `presentation`）。
可见性规则：**overlay 只在"最新 screen"之上时显示（createdAt 新旧判定）**——
preview 打开 contentDetail 时浮层自动隐藏（状态保留），返回自动恢复，
取代旧的 previewUiSnapshot/previewCardId params 快照机制。

## 返回分发

统一入口 `navigator.goBack(source)`（android/gesture/ui/code）：

1. `useBackHandler 询问栈顶（overlay 优先）：true = 页面已消费`
2. `usePageGuard` / `canLeave` 询问：false = 阻止
3. `window.history.back()/go(-n) 驱动，popstate 恢复栈（浏览器历史为准）`
4. 根页：Android 双击缩小应用（2s 窗口）/ iOS 静默

**history 契约：增长动作 setState + pushState；replace 动作 setState + replaceState（被替换页
不残留浏览器历史）；缩短动作（pop/popTo/popToTop）由 history.back/go(-n) 驱动，深度按
"当前总深度 − 目标态总深度"计算（popTo 到 overlay 目标时，盖在其上的 screen 一并弹掉）。
**

**popstate 恢复走 schema 净化 + 按位置对齐保留 entry id。**

返回链路补充：goBack/pop/finish/cancel 均可等待（返回是否驱动了回退）；结果通道的
settle 在守卫通过后才落账（拒绝路径不残留）；手势提交被拒时自动回弹；窗口关闭请求
在可回退时转为返回、根页放行真正关闭。

## 浮层返回拦截（Sheet 优先关闭）

返回手势必须先关浮层、再弹页面栈。仲裁权 100% 收口在 router，任何组件不得
自行监听返回事件。**通用容器组件已内置拦截**，业务代码零接线：

- `components/BottomSheet` / `components/ActionSheet` / `components/SnapSheet` /
  `components/MobileConfirmDialog` / `features/settings/components/ActionSheet`
  打开时自动消费返回（仅关闭自身），关闭后放行正常弹栈
- MobileConfirmDialog 的返回等同取消（对齐原生 Dialog）；loading 中不拦截
- 浮层打开时动态注册（注册时序 = 打开时序），配合 LIFO 仲裁：
  多浮层叠加"最近打开的先关"，嵌套场景（页面 backHandler → 内层浮层）由内向外退让

```
新增浮层时怎么选？
├─ 能用通用容器 → 直接用（自动获得返回拦截，无需任何接线）
├─ 自建 createPortal 浮层 → 组件内 useSheetBackDismiss(open, dismiss, { confirm })
└─ 有状态保活/结果回传/未保存守卫/深链 → layer: "overlay" 路由页
```

### 路径一：overlay 路由页（有状态浮层的选择）

`layer: "overlay"` 的页面打开即入 history，返回手势天然先关它。范式见
`features/settings/pages/themeSheet.page.tsx`（主题面板）与 `quickCapture.page.tsx`
（含"先冲洗落库再关闭"的 backHandler 用法）：

```TSX
function ThemeSheetScreen() {
  const navigator = useNavigator();
  return (
    // 默认 backDismiss：返回手势经组件退场缓冲（先播动画、动画完成后才 onClose → goBack）
    <BottomSheet open title="主题" onClose={() => void navigator.goBack("ui")}>
      <ThemeSection />
    </BottomSheet>
  );
}
export default definePage({
  key: "settings-theme",
  layer: "overlay",
  match: "single",
  params: {},
  component: ThemeSheetScreen,
});
```

- `open` 恒为 `true`：显隐由"栈中是否存在该 entry"决定（OverlayHost 实现），组件卸载即关闭
- **常规主体面板用默认 ****`backDismiss`**：`BottomSheet`/`ActionSheet` 内置退场缓冲，
  所有关闭请求（遮罩/返回手势/下拉）先播完退场动画才回调 onClose——返回手势消费后
  handler 即注销，延迟执行的 goBack 不会与拦截互喂死锁，且返回关闭与遮罩关闭一样
  有完整动画
- 需要在返回前做自定义处理（如 quickCapture 冲洗落库）时才传 `backDismiss={false}`，
  并用页面 `useBackHandler` 表达返回语义——此路径返回直接弹栈，无组件退场动画
- 未保存提醒 → `usePageGuard`；结果回传 → `pushForResult`/`finish`；进程恢复/深链白拿

### 路径二：useSheetBackDismiss（自建浮层 / 需要 confirm 拦截）

```TSX
const [typeSheetOpen, setTypeSheetOpen] = useState(false);
useSheetBackDismiss(typeSheetOpen, () => setTypeSheetOpen(false), {
  confirm: () => shouldConfirm(), // 可选：返回 false 吞掉返回、保留浮层（未保存提醒）
});
```

hook 可在任意宿主使用：页面树外（rootContent/AppDock 等无 PageInstanceContext 的
场景）静默跳过，行为退化为不拦截。

编辑器跨端浮层不直接引用移动端 router：源码全屏与行内公式使用
`@tau/editor/api` 的 `OverlayBackDismiss`。移动端服务注册稳定的
`MobileEditorOverlayDismiss` Layer，在浮层所在页面上下文调用本 hook；
关闭或卸载时注销。契约归 editor，不经 shared，也不新增返回监听。
缺少页面上下文时同样不拦截，仍可使用浮层自身关闭入口；这不表示其他编辑器浮层已全部接线。

### 仲裁语义

- 同一页面可注册多个 backHandler（`registerBackHandler` 返回注销函数，精确移除自身）
- **LIFO**：`useBackHandler`（页面级，挂载时静态注册）先入链，浮层的动态注册
  按打开时序后入链 → 仲裁时浮层先答，"最近打开的先关"
- 返回仲裁只询问按 `createdAt` 判定的真正顶部 entry；被更新 screen 覆盖的旧 overlay
  已隐藏，不应拦截 screen 的返回。仍处于顶部时，Sheet 消费器按注册时序 LIFO 先关闭浮层。
- 返回防抖以微任务窗口计（`historyBackInFlightRef`）：真实用户两次手势间隔
  宏任务，不受影响；**测试中连续两次 ****`goBack`**** 之间需 ****`await act(async () => { await Promise.resolve(); })`****
  排空微任务**，否则第二次撞防抖被丢弃（见 router 集成测试"返回仲裁"用例）

## 手势与转场

- 双页同动：push 时栈顶滑入 + 下层 25% 视差；pop 反向（AnimatePresence exit）
- 左边缘 28px 跟手返回：位移>40% 或速度>0.5px/ms 判定完成/回弹；仅 slideRight 顶层且无 overlay
- 转场编排集中在 `PageHost`，页面组件不写 motion

## 常见陷阱

- 页面组件必须由 PageHost 渲染（页面 hooks 依赖 PageInstanceContext）
- params 必须可 JSON 序列化且通过 schema 校验（进 history 快照）；UI 瞬态放页面 store
- query key 首位约定：`["card", cardId]`（删除/分类变更经 getQueryClient().invalidateQueries 失效）
- `usePageQuery` 的 resume 刷新依赖 phase 变化，Activity hidden 下 effect 会卸载重启（语义正确）
- navigator 引用稳定（useMemo []），模块级 `getNavigator()` 可在组件外使用
- 页面级浮层（如编辑底部工具栏）不要无脑 `createPortal(document.body)`：body 上脱离页面容器的
  transform，转场时页面在滑而浮层定在视口不动，返回后会滞留到页面卸载才消失。页面型宿主应传
  `portalContainer`（`MobileEditorBottomToolbar` 已支持）挂进页面根容器；浮层型宿主（SnapSheet 内）
  保持默认 body，避免被浮层容器的 transform 错位

## 数据层现状（2026-09 补全）

- **cards**：`useCardsQuery` 内部 `useInfiniteQuery`（key 按搜索条件参数化），
  "加载更多" = fetchNextPage；对外接口不变，条件变化/失效由 query 语义驱动
- **todo**：`useTodoStore` 读路径（groups/systemGroups/stats/items）走
  `queryClient.fetchQuery`（并发去重 + 30s 缓存），mutation 后统一
  `invalidateQueries(["todo"])`；store 保留 UI 态（filters/activeGroupId）与 action 编排
- **diary**：同模式，key 空间 `["diary", "entries"]`
- query key 命名空间约定：`["card", id]` / `["todo", ...]` / `["diary", ...]` / `["cards", 条件]`
- 测试注意：store 测试 beforeEach 需 `getQueryClient().clear()` 防跨用例缓存污染

## 预加载与 DevTools

- `navigator.preload(key, params)`：按页面 `data` 声明预取 query 缓存（不挂载组件），
  高概率跳转（首页→详情）提前调用，push 后数据秒显
- `RouterDevTools`（`src/router/devtools/`）：开发模式右下角面板，可视化
  screen/overlay 栈与 query 缓存（总数/stale 数）；生产构建零引入

## 编辑器配件栏与键盘预留

编辑页的格式工具是贴住键盘上沿的配件栏 `MobileEditorBottomToolbar`（`features/cards/editorToolbar/`），
动作与选区由 `useMobileEditorToolbarController` 管理，宿主页面只传 controller / portalContainer / readonly / visibleButtons。

- **键盘预留**：`KeyboardViewportProvider` 对外的 `keyboardHeight` / `viewportHeight` 与 `--kb-height` /
  `--kb-viewport-height` 都是有效值 = max(真实键盘, 预留)；原始值见 `rawKeyboardHeight`，每轮键盘峰值见
  `lastKeyboardHeight`（不足 100px 不记录）。`useKeyboardReservation()` 提供 reserve / releaseWhenKeyboardShown
  （真实键盘升到 0.9 倍预留或 600ms 后释放）/ releaseNow。页面的键盘避让无需感知预留。
- **面板占用键盘位置**：点 Aa（`StylePanel`）或 +（`InsertPanel`）时，先 reserve(面板高度) 再收键盘，面板
  `fixed` 在视口底部、高度 = 预留；回键盘时先聚焦再关面板、按上述条件释放预留，切换期间页面高度不变。
  面板高度取 `resolvePanelHeight`（最近键盘高度，未测到取视口 38%）。插入面板搜索时面板移到键盘上方，
  预留 = max(原面板高度, 键盘 + 220px)。
- **收键盘策略**：`keyboardSwap.ts` 封装 `blur`（默认）与 `inputmode`（`inputmode="none"` 保留焦点）两种。
- **面板态的动作**：面板打开期间编辑器已失焦，controller 的动作作用于打开时保存的 `panelSelection` 且不聚焦，
  执行后选区写回 `panelSelection`；需要输入浮层的动作（链接、批注）先回键盘再执行。点正文 = 只关面板，
  选区落在点击处。
- **上下文识别**：`editorToolbar/editingContext.ts` 的 `useEditingContext` 在 controller 内按「void 内部编辑器 > 展开选区 >
  表格 > 通用」给出 `editingContext`。void 内部编辑器靠 document `focusin` / `focusout`（后者等一帧再判）读 activeElement：
  `.code-block-shiki-input` → code（带 textarea / uuid / language），`.ed-preview-codemirror` 内 → block-math / mermaid，Slate 外
  `input[data-inline-math-input]` 且选区在 inline-math 内 → inline-math；节点须经 `toSlateNode` + `findPath` 回到本编辑器确认归属，只读时不识别。
  焦点在 void 内部编辑器时 Slate 失焦但配件栏保持可见（白名单关掉对应上下文时按通用模式渲染）。表格与格式模式的左端标签点击 =
  `dismissEditingContext`，按上下文 key（表格为 `table:<路径>`）记录退回，光标离开该上下文即恢复；代码块标签打开语言选择，
  公式 / 流程图标签为不可点的静态标签。
- **模式**：通用模式（+ / Aa / 待办 / 列表 / 缩进 / 关联内容 / 图片 / 撤销）；展开选区为格式模式（行内样式，「格式」标签
  点击折叠选区）；光标在表格为表格模式（下方插行 / 右侧插列 / 删行 / 删列 / 对齐循环，「⋯」用 `ActionSheet` 列移动行列与
  删除表格；菜单打开期间动作作用于打开时保存的选区，关闭时恢复选区并聚焦），动作见 `tableActions.ts`；焦点在代码块 textarea 为代码块模式（语言标签点击打开
  常用语言 / 完整语言两级 `ActionSheet`，经 `tau.code-block.set-language` 设置后在点击内回焦；中段按语言族给符号键，见
  `codeBlockInput.ts`：单字符键与 Tab 在 textarea 上派发 keydown 交给代码块组件处理，组件未处理的键与多字符键以原生 value
  setter + input 事件插入并替换选区，长按 Tab 450ms 反缩进；「收起键盘」blur textarea 后回阅读态）；焦点在块公式 / 行内公式 /
  流程图源码编辑器为公式（Sigma「公式」）/ 流程图（Workflow「流程图」）模式（中段为 `sourceEditorInput.ts` 的
  `MATH_SYMBOL_KEYS` / `MERMAID_SYMBOL_KEYS`，模板键带 `cursorOffset`，如 `\frac{}{}` 光标落在第一个括号内；块公式与流程图经
  `insertSourceText` 取 `.CodeMirror` 包裹元素上的 CodeMirror 5 实例 `replaceSelection` 并回焦，`PreviewWithEditor` 为
  react-codemirror2 `UnControlled`，change 事件经组件 onChange 防抖 500ms 写回节点，源码编辑器失焦时立即落库；行内公式 input 与代码块 textarea 共用
  `insertIntoTextControl`；「收起键盘」blur 当前焦点后回阅读态）。`visibleButtons` 以 `AccessoryItemId` 同时过滤配件栏与
  Aa 面板，表格 / 代码块 / 公式 / 流程图模式受 `context-table` / `context-code` / `context-math` / `context-mermaid` 控制。
- **阅读态**：`features/cards/readingMode/useReadingMode` 管理编辑态，宿主把 `forcedReadonly || !editing` 传给 Editor 与配件栏
  的 `readonly`（切换不重挂载）。顶栏 `ReadingModeHeaderButton`「编辑」在点击内同步切换并聚焦（回上次选区，否则文末）；
  双击正文在同一手势内切换并把光标放到双击处（交互元素除外）；「完成」与配件栏「收起键盘」都回阅读态——后者经
  controller 的 `setExitEditingListener`。只读时勾选框忽略点击，由 hook 在点击捕获阶段直接改待办节点，改动照常经
  `onChange` 保存；`forcedReadonly`（协作建立中 / 协作只读）时隐藏「编辑」且不改正文。详情页与协作编辑页
  `CollabEditorPage` 同一接法；初始态在内容首次就绪时定一次：空文档或「打开文档时」偏好为直接编辑则进编辑并聚焦。
  偏好存 setting.json 的 `editor.openMode`（`read` 缺省 / `edit`），`hooks/useEditorOpenMode` 经设置桥读取，
  设置入口为设置页「编辑器 · 打开文档时」；`ContentDetailPage` 的 `openInEditMode` 只作强制覆盖。
  阅读态选中文字时底部浮出标注条 `ReadingSelectionBar`（高亮、批注、摘录成卡片、关联卡片）：slate-react 只读时不同步
  DOM 选区，由 `useReadingSelection` 监听 `selectionchange` 自行换算为 Slate Range（展开防抖 150ms）；高亮在只读下直接写
  marks，批注 / 关联卡片经 `enterEditingWithSelection` 在点击内同步进入编辑并选中后执行配件栏动作，摘录经
  `createQuickCard` 建卡；不可编辑（`forcedReadonly`）时不显示。
- **块选择模式**：`features/cards/blockSelection/`，只作用于顶层块（`editor.children` 下标），接入 `ContentDetailPage` 与
  `CollabEditorPage`（公共状态经 `useEditorBlockSelection`）。入口：编辑态当前块左侧把手 `BlockHandle`（编辑器聚焦、通用或格式模式、
  无面板时显示在光标所在顶层块首行左侧，点击进入并选中该块；长按 300ms 提起拖拽，长按期间移动超过 8px 取消）；page 的「⋯」菜单项「选择块」（`blockSelectionMenuItem`，
  经 `ContentDetailPage` 的 `actionsRef.enterBlockSelection()` 或协作页自身调用，阅读态与编辑态都可用，进入后选中 0 个）。阅读态长按
  留给系统选词，不进入块选择。进入时先经阅读态 `exitEditing` 收键盘。`useBlockSelection` 持有激活与升序选中下标，激活期间以
  `useSheetBackDismiss` 让返回 = 退出，块数变化裁剪越界下标，不可编辑（`forcedReadonly` / 协作只读）时不可进入且立即退出。
  块选择期间 Editor 保持可写（内核块命令按 `getCommandElementPath` 定位、异步命令经 Submission 提交，二者都要求编辑器可写；覆盖层按下时阻止默认行为，正文获得焦点即失焦并清除 DOM 选区，避免弹出键盘），配件栏
  `readonly`；顶栏换成 `BlockSelectionHeader`（取消 / 已选 N 个块 / 全选），底部为 `BlockActionBar`（上移、下移、转换、复制、删除、
  更多；挂载期间写 `--mobile-editor-toolbar-occlusion` 给滚动容器留白），阅读态标注条与 `readingSurfaceProps` 不挂载。
  转换与更多的菜单来自内核聚合的扩展菜单声明（`@tau/editor/api` 的 `resolveElementMenu`，条目带贡献来源 `owner`），由 `blockMenu.ts`
  求值：转换取 `tau.transform` 的子项，多选按 key 取交集，执行时逐块按元素引用重新求值、自后向前调用同 key 的 `onSelect`，合并为一个
  撤销步并保持选择；更多仅单选可用，按菜单分隔线分组，排除操作栏已有的 `tau.block.move-up/move-down/copy/delete` 与 `tau.transform`，
  禁用项不显示，危险项置底，`owner` 不是 `tau.*` / `host.*` / `editor` 的项归入插件组（副文案「插件 · 来源」），有子项的进入二级
  `ActionSheet`（选项点击登记动作、面板退场后执行，每级面板独立挂载），并追加宿主项「创建副本」；内核剪切项改由宿主 `cutBlocks`
  执行并退出块选择。`BlockSelectionLayer` 渲染在
  编辑器外层 `relative` 包裹内，不改编辑器 DOM：按 `ReactEditor.toDOMNode` 测量各块（`measureBlocks.ts`，文档 / 选择变化与
  ResizeObserver 触发重算）绘制高亮与勾选圈，覆盖正文与左右边距的点击面拦截全部点击，按点击纵坐标切换所在块（空隙归最近的块）。
  块操作在 `blockOps.ts` 用 Slate Transforms 实现（内核块命令只作用于单个 element）：移动整组一位（不连续块各自与相邻未选块互换，
  到边界不可移动）、删除（删空补空段落）、复制（`@tau/editor/api` 的 `copyNodeToClipboard` 接受节点数组）、剪切（写剪贴板成功后按
  节点引用删除）、在末个选中块后插入副本（`cloneBlockWithFreshIdentity`：递归换新 `uuid`，勾选项清除 `taskId` 与实例状态，块内引用
  如 tabs 的 `tabKey` / `activeKey` 不变）；多步改动经 `HistoryEditor.withNewBatch` 合并为一个撤销步，删除后 toast「撤销」即 `editor.undo()`。
- **编辑器内拖拽块**：`blockSelection/useBlockDrag.ts` 在把手长按时经 controller `dismissKeyboard()` 收键盘但保持编辑态，按开始时的块测量
  （换算到正文滚动容器内容坐标）驱动 `usePointerReorder` 的 `startDragAt`，只在顶层块之间移动；`BlockDragLayer` 与 `BlockSelectionLayer`
  同级，画原位置虚线占位、克隆块浮层（去掉 contenteditable / data-slate-*，原块 DOM 拖拽期间透明）与插入线，正文其他块不让位。拖拽中
  配件栏隐藏、把手保持挂载以维持指针捕获、返回 = 取消；落下经 `moveBlockTo` 作为一个撤销步移动，光标放到该块开头且不聚焦。
- **整理结构**：`features/cards/outline/`，底部全屏 `SnapSheet` 中按顶层块重排，「完成」时作为一个撤销步写入，「取消」/ 下拉 / 返回丢弃。
  入口：page「⋯」的「整理结构」（`outlineMenuItem`，经 `ContentDetailPage` 的 `actionsRef.openOutline()` 或协作页自身调用）与块选择
  「更多」的宿主项（`BlockActionBar` 的 `onOpenOutline`，打开后退出块选择）；`useOutlineSheet` 打开前退出块选择、编辑态先收键盘，
  不可编辑时提示且打开中的立即关闭。`outlineModel.ts` 为纯模型：会话以打开时的顶层块快照与原始下标排列 `order` 表示，
  `buildOutlineRows` 给出类型、标题级别、首行摘要（最多 40 字，空文本按类型描述）与章节范围（标题到其后第一个同级或更高级标题），
  `visibleUnits` 把折叠标题与整节合为一个单元（嵌套折叠以外层为准），`moveUnit` 整段移动，`applyOrder` 逐位 `Transforms.moveNodes`
  合并为一个撤销步；完成时任一顶层块引用与打开时的快照不同（含块数变化）视为外部改动（协作）已使快照失效，提示后不应用。`usePointerReorder.ts` 是与渲染
  无关的指针拖拽重排引擎（指针捕获、位移计入滚动增量、插入位按被拖项中心越过的中线数、滚动容器上下 64px 内 rAF 自动滚动、取消不回调），
  把手带 `data-pan-ignore-drag="true"` 以免触发抽屉下拉。
- **开发实验页**：`features/editorLab/`（仅开发构建注册，入口 RouterDevTools「editor lab」）用同一套预留与收键盘策略，
  可切换策略并复制键盘、位移、输入法、选区恢复日志，用于真机验证。

## 主题与样式

移动端不自带主题，主题、明暗与色值全部来自 `@tau/themes`，与桌面端同一套（机制见 [design-system.md](/docs/architecture/design-system.md) §2.4）：

- **CSS**：`src/styles.css` 引入 `@tau/themes/tokens.css`（6 主题族 × 深浅数据块 + 尺度层）与 `@tau/themes/tailwind.css`（语义类名 `bg-page / text-ink-1 / bg-tag-1-soft …`）；自身只定义布局变量（安全区、键盘、Dock 尺寸、边缘渐隐）、由 `--tau-*` 派生的组件变量（`--dock-bg`、`--topbar-fade-*`、`--ring-track`、`--heat-*`）和移动端尺度词（`rounded-card / rounded-bento / ease-bounce`）。
- **运行时**：`vite.config.ts` 注入 `createThemeBootstrapScript()` 首帧脚本；`AppShell` 调 `initThemeRuntime()`；组件读明暗用 `useThemeStore(s => s.mode)`，切换用 `setTheme / setAppearance`（`@tau/themes/react`）。偏好键 `tau-theme` / `tau-appearance` 与桌面同格式。
- **设置**：`features/settings/components/ThemeSection.tsx` 明暗三档 × 主题族列表，预览直接读各主题 token。
- **守护**：`src/theme/__tests__/themeVocabulary.test.ts` 扫描源码，禁止旧移动端主题变量/类名、`[data-theme]` 自建主题块与重定义 `--tau-*`。

## 测试

`src/router/__tests__/`：栈机/净化纯函数单测 + RouterProvider/PageHost 集成测试
（push/pop/keep-alive/生命周期/结果通道/popstate）+ 页面数据层测试。

jsdom 中 motion 退出动画按真实时间播放，测试用条件轮询等待最终状态。

## 插件宿主

正常 AppShell 按数据库作用域挂载插件宿主，“我的”消费语义入口，通用页面/设置页走本 router 的身份、保活、返回与守卫。包事务、私有 KV、正文快照和公共源码组件见[跨端插件宿主](/docs/architecture/plugin-portability.md)。

plugins 页使用 single 身份与 tab 参数，默认打开商店，也可进入已安装管理；pluginStoreDetail 按 pluginId 保活，展示目标平台、版本历史和纯文本介绍。安装面板消费原生选版和安装阶段，不生成虚假百分比。中心安装任务存放在应用 QueryClient 对应的 MobileCenterInstallStore；页面订阅/退订不取消任务，只有显式取消操作终止它。

普通正文的插入面板消费已装配插件的 blockPanel 贡献，复用面板选区和键盘预留协议；能力分级及过滤见[跨端插件宿主](/docs/architecture/plugin-portability.md)。插件中心页面与开发验证入口也消费 @tau/themes，不保留旧移动主题变量或类名。
