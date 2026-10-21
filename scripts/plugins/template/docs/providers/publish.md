# 博客发布

发布提供方让用户把 Tau 生成的博客站点发布到你接入的目标，比如对象存储、静态托管服务或 Git 仓库。Tau 负责生成站点文件、计算增量、重试和清理旧文件；插件只负责把文件送到远端。

先读[服务提供方](README.md)了解共同的写法。开发博客模板或独立站点请看[站点数据](../site-data.md)。

## 两种发布方式

| 方式     | `mode`       | 适合                                   | 需要实现                   |
| -------- | ------------ | -------------------------------------- | -------------------------- |
| 逐个文件 | `"files"`    | 对象存储、支持单文件上传的托管服务     | `uploadFile`、`deleteFile` |
| 整体快照 | `"snapshot"` | Git 仓库等需要一次性提交全部变化的目标 | `publish`                  |

## 注册

```ts
import type { PublishInstance } from "@tau/plugins";

context.publish.register({
  id: context.pluginId,
  name: "我的存储",
  create: (config): PublishInstance => {
    const settings = parseConfig(config);
    return {
      mode: "files",
      concurrency: 8,
      async describe(signal) {
        return {
          identity: `my-storage:${settings.bucket}`,
          basePath: "/",
          publicUrl: settings.publicUrl,
        };
      },
      async checkConnection(signal) {
        const response = await context.fetch(settings.endpoint, { method: "HEAD", signal });
        return response.ok;
      },
      async uploadFile(path, content, signal) {
        const response = await context.fetch(`${settings.endpoint}/${path}`, {
          method: "PUT",
          body: content,
          signal,
        });
        if (!response.ok) throw new Error(`上传 ${path} 失败：${response.status}`);
      },
      async deleteFile(path, signal) {
        const response = await context.fetch(`${settings.endpoint}/${path}`, {
          method: "DELETE",
          signal,
        });
        if (!response.ok && response.status !== 404)
          throw new Error(`删除 ${path} 失败：${response.status}`);
      },
    };
  },
});
```

### 两种方式都要实现的方法

| 方法                      | 说明                                                                           |
| ------------------------- | ------------------------------------------------------------------------------ |
| `describe(signal)`        | 返回发布目标的信息，见下表                                                     |
| `checkConnection(signal)` | 检查目标能否访问，返回 `true` 或 `false`；网络、认证错误可以直接抛出可读的错误 |
| `dispose()`               | 可选。发布结束时释放连接                                                       |

| `describe` 返回的字段 | 说明                                                                              |
| --------------------- | --------------------------------------------------------------------------------- |
| `identity`            | 发布目标的稳定标识，如存储桶名加路径。不含凭据，也不随插件版本、模板或 Token 变化 |
| `basePath`            | 站点的根路径，以 `/` 开头和结尾，根目录就是 `/`                                   |
| `publicUrl`           | 可选。站点的公开访问地址                                                          |

### 逐个文件

| 成员                                | 说明                                             |
| ----------------------------------- | ------------------------------------------------ |
| `uploadFile(path, content, signal)` | 上传一个文件，`content` 是 `Uint8Array`          |
| `deleteFile(path, signal)`          | 删除一个文件。文件已经不存在时视为成功，便于重试 |
| `concurrency`                       | 可选。并发上限，1 至 32                          |

`path` 是站点内的相对路径。拼接远端地址时保留路径结构并正确编码，不要拼成 Shell 命令。

### 整体快照

| 成员                        | 说明                                           |
| --------------------------- | ---------------------------------------------- |
| `publish(snapshot, signal)` | 提交本轮全部变化，远端确认整体提交成功后才返回 |

`snapshot` 包含本轮的临时 `id`、待上传的文件（`path` 与 `hash`）和待删除的路径。失败时抛出异常，不要返回部分成功。

## Git 仓库

发布到 Git 仓库时，不需要自己实现 Git 协议，使用 Tau 提供的服务：

```ts
async publish(snapshot, signal) {
  await context.services.git.publishSnapshot(
    {
      publicationId: snapshot.id,
      remote: "https://github.com/yourname/blog.git",
      branch: "main",
      author: { name: "Your Name", email: "you@example.com" },
      authentication: { username: "x-access-token", password: settings.token },
      cacheId: settings.cacheId,
    },
    { signal }
  );
}
```

- `remote` 只接受不含凭据的 HTTPS 地址，凭据通过 `authentication` 传入。
- `publicationId` 只在本轮发布中有效。
- 需要本地缓存目录加快发布时，调用 `context.services.git.selectCacheDirectory({})`，由用户选择目录，返回 `{ id, label }`；用户取消时返回 `null`。只保存 `id` 和用于显示的 `label`，作为 `cacheId` 传入。

## 配置表单

```ts
context.settings.register({
  id: "publish",
  title: "我的存储",
  target: "publish",
  component: PublishSettings,
});
```

组件收到 `publishConfig`：`value` 和 `save(value)`。表单显示在「站点设置 · 发布目标」的卡片里，位于 Tau 的连接状态和「服务」行之后。为了和周围的界面一致：

- **按行排列**：每行左侧是 64px 宽的标签，右侧是控件；行高至少 46px，内边距 `8px 12px`，行与行之间用 `--tau-line-2` 的顶部边线分隔。标签字号用 `--tau-text-meta`，颜色用 `--tau-ink-2`。
- **不要再包一层卡片或标题**。
- **自动保存**：不提供「保存」和「测试连接」按钮，测试连接与完成由 Tau 提供。用户停止输入约 600ms 或输入框失焦时调用 `save`，组件卸载前保存未提交的修改。Tau 回写的配置与你最近一次保存的值相同时，不要覆盖用户正在输入的内容。
- 辅助操作（如「读取仓库列表」）放在对应输入框的尾部；不常用的选项收进「高级选项」折叠区。
- `save` 失败时，在表单末行显示错误，保留用户输入。

## 注意事项

- 用户离开发布页后，发布会在后台继续；插件停用、切换工作区或发起发布的窗口关闭时，本轮发布会中止。
- 每个请求都传入 `signal`，检查 `response.ok`。不要吞掉异常后返回成功，否则 Tau 会误以为文件已经发布。
- Token 不要出现在 `identity`、公开地址、错误信息、README 和日志里。
- `create` 同步返回实例，连接和上传放在各个异步方法里。
- 新安装的发布插件默认停用。插件缺失或未启用时，Tau 会保留用户的配置和选择，不会自动切换到其他目标。

## 测试清单

用真实的远端验证成功之后，再声称支持该目标。至少覆盖：配置保存失败、连接失败、重复发布、远端文件已存在或已删除、用户取消、插件停用、切换工作区，以及快照提交中途失败后的重试。
