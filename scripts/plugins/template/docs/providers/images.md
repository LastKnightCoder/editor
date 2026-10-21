# 图片生成

图片提供方让用户用你接入的模型生成图片，或基于参考图编辑图片。

先读[服务提供方](README.md)了解共同的写法。

## 注册

```ts
context.images.register({
  id: context.pluginId,
  name: "我的图片服务",
  create: (config, modelId) => ({
    async generate({ prompt, options }, signal) {
      // 调用服务商接口，返回图片
      return [{ name: "image.png", mimeType: "image/png", content: bytes }];
    },
    async edit({ prompt, options, images }, signal) {
      // 基于参考图编辑
      return [{ name: "edited.png", mimeType: "image/png", content: bytes }];
    },
  }),
});
```

`create(config, modelId)` 用一个账号的配置和模型创建实例，不发起网络请求。和语音一样，用户可以添加多个账号。

实例至少实现一个方法，没实现的方法在 Tau 中不会显示对应入口：

| 方法                                        | 说明                     |
| ------------------------------------------- | ------------------------ |
| `generate({ prompt, options }, signal)`     | 根据文字生成图片         |
| `edit({ prompt, options, images }, signal)` | 基于一张或多张参考图编辑 |

输入和输出的图片都是 `{ name, mimeType, content: Uint8Array }`，输出可以额外附带 `revisedPrompt`（服务商改写后的提示词）。

## 参数

`options` 包含 `size`、`quality`、`outputFormat`（`png`、`jpeg`、`webp`）、`background`、`count`，都是可选的。

- 只把用户显式设置的参数传给服务商。
- 服务商不支持某个参数时，抛出错误说明，不要悄悄忽略；也不要通过多次调用来凑够 `count`。

## 限制

- 支持 PNG、JPEG、WebP。
- 单次最多 16 张；输入、输出的总大小各不超过 128 MiB。
- 服务商返回的是临时下载地址时，由插件下载成字节再返回。下载其他域名的文件时，不要带上服务商的 API 凭据。

## 配置表单

```ts
context.settings.register({
  id: "images",
  title: "我的图片服务",
  target: "images",
  component: ImageSettings,
});
```

组件收到 `imageConfig`：`instanceId`（正在编辑的账号）、`value`、`modelId`，以及 `save(value, modelId)`。模型 ID 由你的表单让用户填写。只编辑当前这一个账号，不要把它当成全局的当前账号。

## 职责划分

协议、鉴权、超时、重试和轮询由插件负责；文件解析、上传到用户的资源存储、插入正文由 Tau 负责。插件停用或用户取消时，进行中的任务会被取消，迟到的结果被丢弃；但远端已经开始的任务和产生的费用无法撤回。
