# 插件通知能力

SDK 0.28.0 与包含此接口的客户端通过激活上下文提供 `context.notifications`，旧客户端可先检查该属性是否存在。本接口属于渲染端 `PluginContext`，独立后台可经既有后台事件通知渲染插件，再由渲染插件调用；应用退出后不会继续发送。

```ts
const notification = context.notifications.send({
  title: "同步完成",
  body: "本次更新了 12 条内容。",
  mode: "auto",
  tone: "ok",
});

// 需要提前撤销时调用；停用或切库时宿主也会自动回收。
await notification.dispose();
```

| mode           | 行为                                                       |
| -------------- | ---------------------------------------------------------- |
| `auto`（默认） | 插件所在窗口聚焦时进入应用内通知栈，失焦时进入独立通知窗口 |
| `in-app`       | 固定进入插件所在窗口的通知栈，不主动聚焦窗口               |
| `system`       | 固定进入 Tau 独立通知窗口，不使用操作系统原生通知          |

分流发生在发送时；发送后切换窗口焦点不会搬移通知。Web 预览没有独立窗口，沿平台既有规则退化为应用内展示。

标题必填，最多 200 字符；正文可选，最多 5000 字符。`tone` 支持 `neutral`、`ok`、`danger`，默认 `neutral`。`sticky: true` 保持显示直到用户处理、关闭或插件撤销。来源标签固定为插件名称，不接受插件伪造来源或指定全局通知 ID。

可传 `actions`（最多两个按钮，最多一个 `primary: true`）：

```ts
context.notifications.send({
  title: "扫描完成",
  body: "点击查看结果。",
  sticky: true,
  actions: [
    {
      label: "查看结果",
      primary: true,
      onClick: async () => {
        await resultsPage.open();
      },
    },
  ],
});
```

按钮回调返回 Promise 时显示执行中状态，失败在通知内展示；可用 `resolvedText` 指定成功后的结果文案。独立通知窗口通过现有桥接在来源窗口执行回调。通知撤销或插件失活后，旧回调拒绝执行；已经开始的异步业务仍应遵循 `context.signal`。

发送不需要业务数据权限或即时用户手势，适用于异步任务完成提示。`send` 返回的是已提交给通知路由的句柄，不是用户已看到通知的回执；主进程不可用时沿 `appNotify` 的既有策略放弃推送。
