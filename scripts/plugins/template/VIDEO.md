# 视频提供方

需要 SDK 0.22.0 和支持该能力的客户端。通过 `context.video.register({ id: context.pluginId, name, create })` 注册，每个插件一个提供方。视频来源可以是视频网站，也可以是自建的视频服务（如 NAS）。

启用后，编辑器、白板、项目视频笔记和学习资料的「添加视频」中会出现以 `name` 命名的入口。用户从该入口粘贴视频链接，客户端先用 `matches` 确认链接属于本插件，再调用 `resolve`。

插件只负责视频来源本身的知识：识别链接、查询标题与可选清晰度、给出真实的流地址和所需请求头。选择弹窗、下载进度、合并音视频、缓存和播放都由客户端完成，插件不提供这些界面，也不传输视频字节。

## 实例

`create(config)` 按当前插件配置同步创建实例，不发网络请求。实例需要实现四个方法：

- `matches(url)`：同步判断链接是否属于本来源，不访问网络。链接属于其他已启用插件时，客户端会提示用户改用对应入口。
- `resolve(url, signal)`：返回 `{ title, cover?, variants, defaultVariant? }`。`variants` 是可选清晰度（至少一项），每项为 `{ label, hint?, ref }`。
- `cacheKey(ref)`：返回稳定的缓存身份，应包含清晰度。视频已缓存时客户端不再调用 `getPlayback`，可以离线播放。
- `getPlayback(ref, signal)`：每次缓存前现取播放源，可以返回会过期的直链。

## 视频引用

用户选中的 `ref` 原样写入文档和数据库，以后只能通过它找回视频。它必须是可长期保存的 JSON，例如视频 ID 加清晰度，不要放会过期的直链、Cookie 或令牌。`type`、`title`、`thumbnail` 三个键由客户端占用，引用中不要使用。

## 播放源

`getPlayback` 返回以下三种之一：

- `{ kind: "file", stream }`：单个音视频合一的文件。
- `{ kind: "split", video, audio }`：音视频分离的流，客户端分别下载后无损合并。
- `{ kind: "extract", url, videoFormat?, audioFormat?, proxy? }`：交给客户端内置的视频解析器下载，格式 ID 来自 `context.services.videoExtractor.probe`。

`stream` 为 `{ url, headers? }`。需要 Referer、Cookie 等请求头时放在 `headers` 中，客户端只在下载时使用，不写入文档或缓存索引。网络请求使用 `context.fetch` 并传入方法的 signal，它可以设置这些请求头。

## 视频解析服务

`context.services.videoExtractor.probe(url, { proxy?, signal? })` 返回 `{ title, cover?, duration?, formats }`，`formats` 每项包含 `id`、`videoOnly`、`audioOnly`、`ext`、`width`、`height`、`fps`、`bitrate`、`size`、`note`。插件根据格式列表组织清晰度，再返回 `kind: "extract"` 的播放源；插件不能自行启动外部程序。

## 配置

账号、Cookie 或代理通过 `context.settings.register({ id, title, target: "video", component })` 注册配置视图，挂载在「设置 · 账号与连接 · 在线视频」。组件接收 `PluginSettingsProps.videoConfig`：`value` 和 `save(value)`，每个插件一份配置，保存后下一次调用 `create` 即读到新值。保存失败时保留草稿，成功后才提示已保存。

插件停用或调用方取消时，进行中的请求会收到取消信号，迟到的结果被丢弃。插件未启用时，已保存的视频显示需要启用插件的提示，原数据保留。移动端和发布站点不运行插件，插件提供的视频在那里只显示说明。

## 注册与验证

注册放在 `activate` 中，实例的四个方法由来源适配实现，并使用 SDK 类型检查返回值：

```ts
import type { JsonValue, PluginContext, VideoInstance } from "@tau/plugins";

export function registerVideoSource(
  context: PluginContext,
  createSource: (config: JsonValue) => VideoInstance
) {
  return context.video.register({
    id: context.pluginId,
    name: "我的视频来源",
    create: createSource,
  });
}
```

在 manifest 中声明 `categories: ["video"]`，便于用户从插件中心筛选；分类本身不注册提供方。解析输入、网络响应与持久化的 ref 都要校验；`defaultVariant` 是从 0 开始的索引，缺省时宿主使用第一项。不要把 `cacheKey` 简化为本次的签名直链，账号刷新或直链过期不应改变同一视频清晰度的缓存身份。

验证应覆盖：来源不匹配、格式为空、链接过期后重新取源、音视频分离、已缓存时离线播放、账号更新、取消与停用。单文件流须能由宿主直接下载；需要视频解析器处理的页面使用 `kind: "extract"`。具体网站的限制与认证失败由插件返回可读错误，不返回虚假的可播放结果。

SDK 0.23.0 删除的是 `services.ffmpeg.probe` 本地媒体探测，`services.videoExtractor.probe` 保留；区别与 FFmpeg 转换接口见 [SERVICES.md](SERVICES.md)。
