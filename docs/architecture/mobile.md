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
- `params` + `getId(params)`：按参数身份去重（contentDetail 按 contentId）；`popTo(key, params)` 只认参数身份相同的实例，
  返回是否找到
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
- 左边缘 28px 跟手返回：位移>40% 或速度>0.5px/ms 判定完成/回弹；仅 slideRight 顶层且无 overlay；
  起手点在 `data-no-edge-back` 标记内（编辑器块把手等自带拖拽的控件）时不跟手；栈顶页有声明 `blockEdgeBack` 的返回消费器
  （`useSheetBackDismiss` 一律声明：页内浮层、块选择、拖拽等打开期间必定消费返回）时也不跟手，否则页面被拖出、松手后弹回。
  条件消费的 `useBackHandler`（未保存确认等）不声明，手势照常跟手。页内多级浏览不要用 `useBackHandler` 消费返回来退级
  （拖出的是整页、露出的是上一页），每级做成同一 page 的独立实例：项目详情 `projectDetail` 按 `projectId:itemId` 身份
  每层一个实例，进入子层 push、面包屑跳祖先用 `popTo(key, params)`（栈内没有该层时 `replace`）
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

## 协作网络与身份

协作 REST 经 Rust 网关，实时连接由 WebView 直连产品入口。获取身份时先复用经产品端点来源摘要认可的旧凭据；已有不同身份须双凭据合并，失败保留原文件。当前库的认可来源绑定会改写为产品入口，保证原房间 ID 与正文绑定不变；自托管来源不参与该升级。协议与存储见[协作架构](/docs/architecture/collaboration.md)。

## 预加载与 DevTools

- `navigator.preload(key, params)`：按页面 `data` 声明预取 query 缓存（不挂载组件），
  高概率跳转（首页→详情）提前调用，push 后数据秒显
- `RouterDevTools`（`src/router/devtools/`）：开发模式右下角面板，可视化
  screen/overlay 栈与 query 缓存（总数/stale 数）；生产构建零引入

## 安全区与键盘避让

iOS 与 Android 共用一套模型：外壳贴住可见区，留白只放在滚动内容末尾，每个变量只有一个写入方。

- **写入方**：
  - `--mobile-safe-top/bottom` 取 `max(env(safe-area-inset-*), --native-safe-*)`。`--native-safe-*` 由 Android
    `MainActivity` 按系统栏 + 刘海 insets 注入，兜底不支持 env 安全区的 WebView。
  - `--kb-height`、`--kb-viewport-top`、`--kb-viewport-height` 只由 `KeyboardViewportProvider` 写入。
    Android 原生层只发 `tau:native-kb-height` 事件和 `__TAU_NATIVE_KB_HEIGHT`，iOS 由 `visualViewport` 推算。
  - 页面与组件不直接读 `env()`。
- **可见区**：
  - `viewportTop` 是 `visualViewport.offsetTop`。iOS 弹键盘时可能平移可视视口来露出光标；收键盘后或走原生路径时为 0。
  - `viewportHeight` 是键盘以上的可见高度。
  - `keyboardHeight` 是布局视口底边到键盘顶边的距离，贴键盘的浮层用 `bottom: var(--kb-height)` 定位。
- **派生变量**：
  - `--mobile-screen-safe-bottom`：外壳内的底部安全区，键盘弹出时归零。
  - `--mobile-overlay-bottom`：贴屏幕底、不随键盘收缩的浮层（配件栏、BottomSheet、ActionSheet）的底部避让，
    等于 `max(--kb-height, --mobile-safe-bottom)`，两者不叠加。
- **页面外壳**：二级页根容器带 `.mobile-kb-screen`。它强制 `position: fixed`，`top` 取 `--kb-viewport-top`，
  `height` 取 `--kb-viewport-height`，顶栏（`PageHeader`，自带 `padding-top: safe-top`）因此始终在可见区顶部。
  外壳内部不要再加 `--kb-height`。
- **滚动末尾留白**：主滚动容器带 `.mobile-page-scroll`，铺满到外壳底边，内容可以从 Home 指示条后面滑过。
  - 末尾用 `::after` 占位（部分 WebView 不把滚动容器的 padding-bottom 计入可滚动区域）。
  - 占位高度 = `--page-bottom-inset`（16px 呼吸 + `--mobile-screen-safe-bottom`）
    - `--mobile-editor-toolbar-occlusion` + `--pan-occluded-bottom`。
  - 遮挡变量由当前显示的配件栏、块操作栏、标注栏、PanContainer 写入根元素，只计栏高，不含安全区。
  - 底部另有常显操作条、由操作条自己承担安全区时，滚动容器加 `data-page-footer`，末尾只留呼吸。
  - 末尾需要越过 FAB 或批量栏时，在滚动容器上覆盖 `--page-bottom-inset`。
  - 不要在外层容器上挂常驻的 padding-bottom。
- **浮层内滚动**：SnapSheet、PanContainer 等不随键盘收缩的浮层，滚动容器用 `.mobile-kb-scroll`
  （或带固定底栏的 `.mobile-fixed-footer-scroll`），留白 = `1rem + --mobile-overlay-bottom + 面板遮挡`。
- **Tab 根页**：带 Dock 的页面用 `.dock-pad`；键盘弹出时 `AppDock` 隐藏。
- **禁止页面缩放**：`index.html` 的 viewport 带 `maximum-scale=1.0, user-scalable=no`。iOS 聚焦字号小于 16px 的
  输入框时会自动放大并平移页面，固定布局整体错位；禁止缩放后各处输入框字号不受此限。
- **iOS 表单辅助栏**：WKWebView 聚焦可编辑区时会出现系统辅助栏（上一个 / 下一个 / 完成）。由
  `src-tauri/src/ios_input_accessory.rs` 在启动时替换 WKContentView 原类的 `inputAccessoryView`，让它返回 nil，
  这样配件栏直接贴住键盘。只能替换原类的方法：如果改成派生子类再切换实例的 isa，WKWebView 的键盘避让会缩小
  布局视口并让整页上滚。
- **验证**：iOS 用 `pnpm dev:ios` 真机检查。Android 用 `pnpm apk` 出包，检查以下几点：
  - 状态栏下顶栏不被遮挡（覆盖 env 不生效的 WebView）；
  - 键盘弹出时正文与配件栏之间没有空带；
  - 滚到底只剩「安全区 + 16px」的留白。

## 编辑器配件栏与键盘预留

编辑页的格式工具是贴住键盘上沿的配件栏 `MobileEditorBottomToolbar`（`features/cards/editorToolbar/`），
动作与选区由 `useMobileEditorToolbarController` 管理，宿主页面只传 controller / portalContainer / readonly / visibleButtons。

- **键盘预留**：`KeyboardViewportProvider` 对外的 `keyboardHeight` / `viewportHeight` 与 `--kb-height` /
  `--kb-viewport-height` 都是有效值 = max(真实键盘, 预留)（`viewportTop` 不受预留影响）；原始值见 `rawKeyboardHeight`，每轮键盘峰值见
  `lastKeyboardHeight`（不足 100px 不记录）。`useKeyboardReservation()` 提供 reserve / releaseWhenKeyboardShown
  （真实键盘升到 0.9 倍预留或 600ms 后释放）/ releaseNow。页面的键盘避让无需感知预留。
- **面板占用键盘位置**：点 Aa（`StylePanel`）或 +（`InsertPanel`）时，先 reserve(面板高度) 再收键盘，面板
  `fixed` 在视口底部、高度 = 预留；回键盘时先聚焦再关面板、按上述条件释放预留，切换期间页面高度不变。
  面板高度取 `resolvePanelHeight`（最近键盘高度，未测到取视口 38%）。插入面板搜索时面板移到键盘上方，
  预留 = max(原面板高度, 键盘 + 220px)；键盘升起前按预计高度（`resolveExpectedKeyboardHeight`）先抬起面板，
  使搜索框聚焦时已在键盘之上，iOS 不会为露出它平移视口。面板容器带 `data-kb-optout`，其中输入框不参与自动露出。
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
  的 `readonly`（切换不重挂载）。顶栏不放编辑入口（只有返回 / 标题 / 宿主操作）：阅读态右下角悬浮按钮 `ReadingModeFab`
  「编辑」在点击内同步切换并聚焦（回上次选区，否则文末），正文下滑时收成圆形图标、上滑或回顶展开，块选择 / 拖拽 / 标注条出现时隐藏；
  正文末尾（滚动容器最后一个子元素的底边）滚进按钮区域时淡出且不可点，因此不写遮挡变量、不为按钮在末尾留白；
  双击正文在同一手势内切换并把光标放到双击处（交互元素除外）；退出编辑是配件栏右端常驻的「完成」（宿主传 `showDoneButton`，
  取代各模式的「收起键盘」，面板 / 表格 / 格式 / 媒体模式下排在该模式右端按钮之后），经 controller 的 `setExitEditingListener` 回阅读态。只读时勾选框忽略点击，由 hook 在点击捕获阶段直接改待办节点，改动照常经
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
  激活期间编辑器包裹元素加 `BLOCK_SELECTION_INSET_CLASS`（左内边距 28px，带过渡），正文右移空出勾选列，勾选圈不贴屏幕边。
  块选择期间 Editor 保持可写（内核块命令按 `getCommandElementPath` 定位、异步命令经 Submission 提交，二者都要求编辑器可写；覆盖层按下时阻止默认行为，正文获得焦点即失焦并清除 DOM 选区，避免弹出键盘），配件栏
  `readonly`；顶栏换成 `BlockSelectionHeader`（取消 / 已选 N 个块 / 全选），底部为离开屏幕边缘的悬浮条 `BlockActionBar`（未选中时只显示
  操作提示，选中后为上移、下移、转换、复制、删除、更多；挂载期间写 `--mobile-editor-toolbar-occlusion` 给滚动容器留白），阅读态标注条与
  `readingSurfaceProps` 不挂载。
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
  面板只有全屏一档、顶边即屏幕顶，顶栏直接用 `PageHeader`（`leading` 放「取消」、`PageHeaderTextButton` 放「完成」），由它承担状态栏安全区；
  块选择顶栏 `BlockSelectionHeader` 同一写法。
  入口：page「⋯」的「整理结构」（`outlineMenuItem`，经 `ContentDetailPage` 的 `actionsRef.openOutline()` 或协作页自身调用）与块选择
  「更多」的宿主项（`BlockActionBar` 的 `onOpenOutline`，打开后退出块选择）；`useOutlineSheet` 打开前退出块选择、编辑态先收键盘，
  不可编辑时提示且打开中的立即关闭。`outlineModel.ts` 为纯模型：会话以打开时的顶层块快照与原始下标排列 `order` 表示，
  `buildOutlineRows` 给出类型、标题级别、首行摘要（最多 40 字，空文本按类型描述）与章节范围（标题到其后第一个同级或更高级标题），
  `visibleUnits` 把折叠标题与整节合为一个单元（嵌套折叠以外层为准），`moveUnit` 整段移动，`applyOrder` 逐位 `Transforms.moveNodes`
  合并为一个撤销步；完成时任一顶层块引用与打开时的快照不同（含块数变化）视为外部改动（协作）已使快照失效，提示后不应用。`usePointerReorder.ts` 是与渲染
  无关的指针拖拽重排引擎（指针捕获、位移计入滚动增量、插入位按被拖项中心越过的中线数、滚动容器上下 64px 内 rAF 自动滚动、取消不回调），
  把手带 `data-pan-ignore-drag="true"` 以免触发抽屉下拉。
- **媒体（触屏模式）**：`services/editorRegistry` 注册 `IEditorInteraction`（`touch: true`），媒体扩展与网页视图据此改用触屏交互（见
  `packages/editor/src/extensions/media/README.md`）：编辑态单击媒体把 Slate 选区放进该 void，`editingContext` 的 `resolveMediaContext`
  给出 `media` 上下文（优先级在展开选区之后、表格之前；焦点在图片说明 `[data-media-caption]` 内时为说明编辑，与 void 内部编辑器同级）。
  controller 在进入媒体上下文时收起键盘但保持编辑态（`ReactEditor.blur`，文字面板让位），`isToolbarVisible` 对媒体上下文为真；离开时关掉媒体面板。
  配件栏媒体模式由 `mediaAccessory.tsx`（`useMediaAccessory`）渲染：左端类型标签，中段带文字的按钮——图片（尺寸 / 对齐循环 / 裁剪 / 说明 / 替换）、
  视频（尺寸 / 对齐 / 替换）、音频（重命名 / 替换）、行内图片（小 / 中 / 大三档高度、查看、转为大图）、网页（地址 / 高度 / 刷新 / 全屏），右端「⋯」
  （`ActionSheet`：图片的查看大图 / 替代文本 / 复制图片，各类型的块操作与删除；行内图片为删除按钮）与「键盘」（`focusAfterMedia`：光标放到媒体后的
  文本块开头，下一块缺失或为 void 时插入空段落，行内图片放到其后，在点击内同步聚焦）；说明编辑中只留「完成」（blur 说明输入）。弹出系统选择器的菜单项
  在点击内执行（保留用户手势），弹出输入框的项在动作面板退场后执行。尺寸 / 高度是第三种面板 `media`（`MediaPanel`：宽度小 50% / 中 75% / 满宽、对齐、
  图片外观圆角 / 阴影 / 跟随设置；网页高度 240 / 400 / 640），打开时键盘已收起，关闭与返回都不弹键盘。操作集中在 `mediaActions.ts`：复用扩展命令
  （`tau.image.*` / `tau.video.set-align` / `tau.webview.*` / `tau.block.delete`，按 element + path 执行，节点移动后按引用重新定位），宽度档位读写经
  `@tau/editor/extensions/media/runtime`，替换视频 / 音频经 `openLocalMediaPicker(editor, type, element)`，改名 / 改地址 / 插入网页经 `notifier.prompt`。
  「块操作」经 controller 的 `requestBlockSelection` 转给页面登记的块选择（`useEditorBlockSelection` 登记）。白名单项 `context-media` 控制该模式。
  插入面板「高级」组含「网页」。共享播放器在粗指针设备（`useCoarsePointer`）上隐藏音量与画中画、进度圆点常显并加高触控区；视频双击画面左 / 右半边 ±10 秒、
  单击延后 280ms 生效、全屏胶囊收起时点按先唤出、长按加速屏蔽系统菜单、滚出视口自动暂停；音频倍速常显并加 ±15 秒。
- **开发实验页**：`features/editorLab/`（仅开发构建注册，入口 RouterDevTools「editor lab」）用同一套预留与收键盘策略，
  可切换策略并复制键盘、位移、输入法、选区恢复日志，用于真机验证。

## 主题与样式

移动端不自带主题，主题、明暗与色值全部来自 `@tau/themes`，与桌面端同一套（机制见 [design-system.md](/docs/architecture/design-system.md) §2.4）：

- **CSS**：`src/styles.css` 引入 `@tau/themes/tokens.css`（6 主题族 × 深浅数据块 + 尺度层）与 `@tau/themes/tailwind.css`（语义类名 `bg-page / text-ink-1 / bg-tag-1-soft …`）；自身只定义布局变量（安全区、键盘、Dock 尺寸、边缘渐隐）、由 `--tau-*` 派生的组件变量（`--dock-bg`、`--topbar-fade-*`、`--ring-track`、`--heat-*`）和移动端尺度词（`rounded-card / rounded-bento / ease-bounce`）。
- **运行时**：`vite.config.ts` 注入 `createThemeBootstrapScript()` 首帧脚本；`AppShell` 调 `initThemeRuntime()`；组件读明暗用 `useThemeStore(s => s.mode)`，切换用 `setTheme / setAppearance`（`@tau/themes/react`）。偏好键 `tau-theme` / `tau-appearance` 与桌面同格式。
- **设置**：`features/settings/components/ThemeSection.tsx` 明暗三档 × 主题族列表，预览直接读各主题 token。
- **字号档位**：`src/styles.css` 的 `:root` 覆盖 `@tau/themes` 的 9 档 `--tau-text-*`（桌面密度正文 13px 不适合手机），`text-tau-*` 语义类随之取移动端值：
  hero 28 / title-lg 22 / title 17 / body-lg 17 / body 16 / meta 14 / sm 13 / micro 12 / tiny 11。`body` 基准字号取 body 档。
  新代码用 `text-tau-*`，同一角色同一档：时间 sm、标签 chip micro、列表行与按钮 body、说明 meta。
- **编辑器阅读正文**：`.mobile-card-editor-content` 取 body-lg 档（17px / 1.75），内容详情页（卡片、日记、文章、项目文档）、卡片列表预览（`CardItem`）、速记、日程备注、协作编辑与插件说明共用，列表与详情同字号；编辑器内标题块用 `em` 跟随。同一类名下段间距为 0.8em，行内代码去描边、0.84em、7% 墨色淡底（覆盖编辑器包的桌面默认样式）。
- **内容详情页外观**：`ContentDetailPage` 根容器为纸面（`bg-surface` + `.mobile-paper-page`，后者把 `--topbar-fade-*` 改为表面色），与卡片库里的卡片同底色。脉络入口是元信息行末尾的胶囊（`context/ContextBadge`，关联数为 0 或首次加载未完成时不渲染；关联卡片属于脉络「连接」分区，不另设区块）；页尾只有轻标签（`TagChips` 的 `soft` 变体，品牌淡底小方块）。脉络浮层里点条目先关浮层再跳转，浮层的全局 touchmove 拦截不会留在下层保活页上。
- **输入框规范**：
  - 输入文字字号 16px（`--mobile-input-font-size`），这是手机端可读下限，也是 iOS 不自动放大的阈值。
  - 表单输入用 `.input-base`：最小高 44px（`--mobile-input-min-height`），底色页面色，聚焦时 accent 描边。它放在
    `@layer components`，调用处可以用工具类覆盖底色、圆角、内边距，但不要覆盖字号和高度。
  - 搜索统一用 `components/SearchField`：40px 胶囊，图标 18，自带清空按钮。`tone` 按所在底色选：放在页面底上用
    `surface`，放在卡片或面板里用 `page`。
  - 无外框的就地输入（标签草稿、闪卡选项、答题区）加 `.input-text`，只统一字号。
  - 例外：就地编辑跟随展示态字号，包括日程、待办、文档标题，标签胶囊，以及闪卡填空的行内输入。
- **守护**：`src/theme/__tests__/themeVocabulary.test.ts` 扫描源码，禁止旧移动端主题变量/类名、`[data-theme]` 自建主题块与重定义 `--tau-*`（字号档位 `--tau-text-*` 除外）。

## 同步与图片附件（设置）

同步入口为设置「数据 · 同步」，上传入口为「数据 · 图片与附件」。前者保留状态卡、版本检查、数据库切换、整库覆盖和资源文件进度；后者保留目的地卡、本地保存、压缩开关和最近上传结果。数据库成功后继续触发资源文件同步；资源仍只增不删，失败保留真实错误。

服务列表由当前插件会话的同步/上传注册表生成。syncProvider/uploadProvider 按插件 ID 区分页面，挂载插件通过 settings.register 声明的组件；未启用或未安装时保留已保存配置，并提供插件中心入口。服务名称来自注册声明，宿主没有服务商配置分支。服务页以局部 PortalScope 承载插件浮层，UiHostProvider 将 Dialog 返回交给当前 Page；页面隐藏时浮层随作用域隐藏，不遗留到其他页面。

表单的 syncConfig/uploadConfig.value 为该插件的完整配置，save 经固定工作区的原生配置命令只保存，不改变选用状态。同步服务选用先探测云端，有已有数据时按原流程确认；上传选用保留真实上传与回读测试，地址不可读时禁止使用。测试文件使用宿主唯一命名，可能在远端留下小型测试图片；不要求插件实现固定对象覆盖。选用复验测试时的配置，字段变化后必须重新确认。作者不感知这些宿主行为。

各插件独立管理账号、仓库/存储桶和路径，不保留集成账号页面。旧账号经升级复制到各使用者，之后不联动；具体包事务、配置升级和执行边界见[跨端插件宿主](/docs/architecture/plugin-portability.md)。凭据不放主库 plugin_kv。

字段压缩继续使用 imageBed.enableCompression，控制 WebView 预压缩与原生图片处理；本地 resources 保存和缩略图、远端资源缓存仍由原生提供。上传结果按真实插件 ID 记录，切换目的地后不展示旧服务的结果。资源同步列表每次展示 30 条，继续使用既有筛选与停止/重试操作。

## 插件宿主

正常 AppShell 按数据库作用域挂载插件宿主，“我的”消费语义入口，通用页面/设置页走本 router 的身份、保活、返回与守卫。包事务、私有 KV、正文快照和公共源码组件见[跨端插件宿主](/docs/architecture/plugin-portability.md)。

插件会话异步启动，不阻塞首屏；阶段广播、编辑器 kit 的读/写两种取法与「立即生效」见[跨端插件宿主](/docs/architecture/plugin-portability.md)的移动宿主小节。

插件域页面统一用 `PluginPageShell`（全站 PageHeader 顶栏）。plugins 页使用 single 身份与 tab 参数（商店 / 已安装文字标签），右上角搜索经共享的 `components/PageHeaderSearch` 横向展开，关键词在当前标签内生效；商店为全宽列表行，右侧 `StoreActionButton` 按「获取 / 下载中（点按取消）/ 校验中 / 待生效 / 已安装 / 更新 / 不可用 / 重试」投影商店主动作与应用级安装任务；已安装为开关 + 状态行，顶部 `PluginChangesBanner` 汇总已保存未生效的变更并提供「立即生效」。pluginDetail 按 pluginId 保活，商店资料与已安装管理合一：头部为图标、状态、启停开关与同源的大号主按钮，下面是统计行、一句话兼容结论与「介绍 / 设置 / 权限 / 版本」分段标签（介绍按 `@tau/plugins/document` 清洗后用编辑器只读渲染；设置内嵌通用插件设置组件，同步/上传设置进入对应宿主服务页；权限只读展示声明的权限、本会话登记的贡献与安全提示；版本含历史、更新日志与兼容性详情），⋯ 菜单承载取消待生效、恢复上一版、清除数据与卸载；插件中心没有记录时只展示本机信息。安装面板消费原生选版和安装阶段，不生成虚假百分比。中心安装任务存放在应用 QueryClient 对应的 MobileCenterInstallStore；页面订阅/退订不取消任务，只有显式取消操作终止它。

普通正文的插入面板消费已装配插件的 blockPanel 贡献，复用面板选区和键盘预留协议；能力分级及过滤见[跨端插件宿主](/docs/architecture/plugin-portability.md)。插件中心页面与开发验证入口也消费 @tau/themes，不保留旧移动主题变量或类名。

数据库、资源及会话文件的跨端对象布局、分块预算和首次使用边界见[宿主分块同步](/docs/architecture/storage-sync.md)。
