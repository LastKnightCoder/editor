# 视频来源

视频提供方让用户从你接入的视频网站或自建服务（如 NAS）添加视频。启用后，编辑器、白板、项目视频笔记和学习资料的「添加视频」中会出现以你的提供方命名的入口。

插件只需要懂得视频来源本身：识别链接、查询标题和清晰度、给出真实的视频流地址。选择弹窗、下载进度、音视频合并、缓存和播放都由 Tau 完成，插件不传输视频数据。

先读[服务提供方](README.md)了解共同的写法。

## 流程

1. 用户在你的入口粘贴一个链接。
2. Tau 调用 `matches(url)` 确认链接属于你的插件，再调用 `resolve(url)` 获取标题和可选清晰度。
3. 用户选择清晰度，Tau 把这个清晰度的 `ref` 保存到文档中。
4. 需要下载时，Tau 调用 `getPlayback(ref)` 获取当前可用的流地址，下载并缓存。之后离线也能播放。

## 注册

```ts
import type { VideoInstance } from "@tau/plugins";

context.video.register({
  id: context.pluginId,
  name: "我的视频站",
  create: (config): VideoInstance => ({
    matches: url => /^https:\/\/video\.example\.com\/v\//.test(url),
    async resolve(url, signal) {
      const info = await fetchVideoInfo(context, url, signal);
      return {
        title: info.title,
        cover: info.cover,
        variants: info.qualities.map(quality => ({
          label: quality.label,
          ref: { videoId: info.id, quality: quality.id },
        })),
      };
    },
    cacheKey: ref => `${ref.videoId}:${ref.quality}`,
    async getPlayback(ref, signal) {
      const stream = await fetchStreamUrl(context, ref, signal);
      return {
        kind: "file",
        stream: { url: stream.url, headers: { Referer: "https://video.example.com" } },
      };
    },
  }),
});
```

| 方法                       | 说明                                                                                                                                                             |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `matches(url)`             | 同步判断链接是否属于你的来源，**不访问网络**                                                                                                                     |
| `resolve(url, signal)`     | 返回 `{ title, cover?, variants, defaultVariant? }`。`variants` 是可选清晰度，至少一项，每项 `{ label, hint?, ref }`；`defaultVariant` 是默认项的下标，从 0 开始 |
| `cacheKey(ref)`            | 返回稳定的缓存标识，应包含清晰度。已缓存的视频不会再调用 `getPlayback`                                                                                           |
| `getPlayback(ref, signal)` | 每次下载前调用，返回当前可用的播放源，可以是会过期的地址                                                                                                         |

链接属于其他已启用插件时，Tau 会提示用户改用对应的入口。

## ref：可以长期保存的视频引用

用户选中的 `ref` 会原样写进文档和数据库，以后只能靠它找回视频。所以：

- `ref` 必须是可以长期保存的 JSON，例如视频 ID 加清晰度。
- 不要放会过期的地址、Cookie 或 Token。
- 不要使用 `type`、`title`、`thumbnail` 这三个键，它们由 Tau 占用。
- `cacheKey` 也不要用会变的签名地址：账号刷新或地址过期，不应该改变同一个视频、同一清晰度的缓存标识。

## 播放源

`getPlayback` 返回三种之一：

| `kind`    | 结构                                          | 说明                                       |
| --------- | --------------------------------------------- | ------------------------------------------ |
| `file`    | `{ stream }`                                  | 音视频合一的单个文件                       |
| `split`   | `{ video, audio }`                            | 音视频分离的两路流，Tau 分别下载后无损合并 |
| `extract` | `{ url, videoFormat?, audioFormat?, proxy? }` | 交给 Tau 内置的视频解析器下载，见下文      |

`stream` 是 `{ url, headers? }`。需要 Referer、Cookie 等请求头时放在 `headers` 里，Tau 只在下载时使用，不会写入文档或缓存索引。

## 使用内置的视频解析器

对于内置解析器支持的网站，可以先用 `context.services.videoExtractor.probe` 查询可下载的格式，再返回 `kind: "extract"`：

```ts
const probe = await context.services.videoExtractor.probe(url, { signal });
// probe：{ title, cover?, duration?, formats }
// formats 每项：{ id, videoOnly, audioOnly, ext, width, height, fps, bitrate, size, note }
```

根据 `formats` 组织清晰度，`getPlayback` 时返回 `{ kind: "extract", url, videoFormat, audioFormat }`。插件不能自己启动外部程序下载视频。

## 配置表单

账号、Cookie、代理等通过配置表单让用户填写：

```ts
context.settings.register({
  id: "video",
  title: "我的视频站",
  target: "video",
  component: VideoSettings,
});
```

组件收到 `videoConfig`：`value` 和 `save(value)`，每个插件一份配置。保存后，下一次 `create` 就会读到新的值。

## 插件不可用时

- 插件未启用时，已保存的视频显示需要启用插件的提示，数据保留。
- 移动端和发布的站点不运行插件，这些视频在那里只显示说明。

## 测试清单

- 不属于你的链接、没有可用格式的视频。
- 地址过期后重新获取播放源。
- 音视频分离的视频。
- 已缓存的视频离线播放。
- 更新账号配置、取消下载、停用插件。
- 网站限制或认证失败时，返回可读的错误，不要返回无法播放的结果。
