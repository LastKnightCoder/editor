# WebSocket

`context.websocket.connect(url, protocols?, options?)` 同步返回标准 `WebSocket` 接口形状的连接。SDK 0.43.0 对应桌面 0.59.5、移动 0.2.7 的宿主实现；这不代表这些版本已发布。插件无需引入 Node.js `ws`，同一代码用于桌面、Android 与 iOS。

```ts
const socket = context.websocket.connect("wss://api.example.com/stream", [], {
  headers: { Authorization: `Bearer ${token}` },
  signal: taskSignal,
});
socket.binaryType = "arraybuffer";
socket.addEventListener("open", () => socket.send("开始"));
socket.addEventListener("message", event => consume(event.data));
socket.addEventListener("error", () => reportConnectionFailure());
socket.addEventListener("close", event => finish(event.code, event.reason, event.wasClean));
// 完成业务协议后再关闭；close 不能代替 ASR 的结束输入标记。
socket.close(1000, "完成");
```

## 标准语义

- 返回时为 `CONNECTING`；握手成功后进入 `OPEN` 并发送 `open`。`onopen/onmessage/onerror/onclose` 与 `addEventListener/removeEventListener` 均可使用。
- `url`、`readyState`、`protocol`、`extensions`、`bufferedAmount` 只读；实例提供 `CONNECTING/OPEN/CLOSING/CLOSED` 常量。
- `send(string | Blob | ArrayBuffer | ArrayBufferView)` 同步返回 `void`，连接中调用抛 `InvalidStateError`。关闭中或已关闭时丢弃数据；`bufferedAmount` 仍计入该次字节数。缓冲区在调用时复制，异步发送不受调用方后续修改影响。
- `bufferedAmount` 是已接收、尚未交给原生发送层完成的应用字节数，**不是服务器已接收或已识别的证明**。宿主保持消息顺序、限额和发送排空；插件不轮询背压或等待非标准发送 Promise。
- `binaryType` 默认为 `blob`，可改为 `arraybuffer`。文本消息始终为字符串。`message.data` 的类型按投递时的 `binaryType` 决定。
- `close(code?, reason?)` 同步返回 `void`，切换到 `CLOSING`，排空此前的发送后发起关闭握手。关闭码允许 1000 或 3000–4999；原因最多 123 个 UTF-8 字节。错误参数同步抛异常，重复关闭不重复握手。
- 正常关闭传递服务端关闭码、原因与 `wasClean`。握手失败、断线、队列溢出、生命周期取消发送 `error`，随后一次 `close`（1006、空原因、`wasClean: false`）。底层异常不会包含鉴权头或服务器正文。

## 宿主扩展与边界

仅工厂的第三个参数扩展 `headers` 和 `signal`。`protocols` 与标准构造器的第二参数一致。插件停用、工作区失效自动取消所有连接，任务 `signal` 可提前结束单次连接。生命周期取消直接释放连接，不保证发送剩余数据；正常结束使用业务结束标记、等待最终结果，再 `close()`。

网络由原生层执行，不是浏览器的全局构造器实例：不要依赖 `instanceof WebSocket`、浏览器 Cookie、CORS 或浏览器扩展。宿主不自动携带浏览器 Cookie，不重连、不跟随重定向。允许 `wss`，仅本机测试允许 `ws`；`https/http` 转换为对应 WebSocket 协议后应用同一限制。地址禁止凭据和片段。鉴权头禁止换行以及覆盖 Host、Connection、Upgrade、Sec-WebSocket-*；子协议走 `protocols`。

宿主每连接单消息上限 1 MiB，收发各自有界排队（最多 2 MiB），空消息也计入最多 256 条等待消息的限制（移动原生收包队列为 2 条），每宿主窗口最多 32 个连接，握手与关闭排空各限 10 秒。超限使连接失败，不静默丢语音帧、不自动重试带鉴权的请求。

规范依据：[WHATWG WebSockets](https://websockets.spec.whatwg.org/)。此适配遵循上述事件、状态、发送与关闭语义，不宣称实现完整浏览器网络环境或通过全部 Web 平台一致性测试。
