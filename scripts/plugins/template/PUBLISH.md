# 博客发布提供方

需要 SDK 0.21.0 及包含博客发布能力的客户端。提供方只在渲染进程注册和执行，网络使用 `context.fetch`。本地导出由宿主提供，不注册本地发布插件。

在 activate 中调用 `context.publish.register({ id: context.pluginId, name, create(config) })`。create 返回文件式或快照式实例，配置是本轮固定的 JSON 副本。提供方 ID 必须等于所属插件 ID。

两种实例都实现 `describe(signal)` 与 `checkConnection(signal)`；describe 返回 `identity`、`basePath`、可选 `publicUrl`。identity 是不含密钥的物理目标稳定身份，不随插件版本、模板、Token 或提交方式变化。basePath 以斜杠开头和结尾，根路径为 `/`。

`checkConnection` 返回 `Promise<boolean>`，只检查目标可访问性；网络或认证失败可以抛出可读错误。以下注册结构可放在插件的 `activate` 内，实际存储协议由 `createTarget` 实现：

```ts
import type { JsonValue, PluginContext, PublishInstance } from "@tau/plugins";

export function registerPublisher(
  context: PluginContext,
  createTarget: (config: JsonValue) => PublishInstance
) {
  return context.publish.register({
    id: context.pluginId,
    name: "我的发布目标",
    create: createTarget,
  });
}
```

文件式实例声明 `mode: "files"`，实现 `uploadFile(path, Uint8Array, signal)` 与 `deleteFile(path, signal)`，可用 `concurrency` 声明 1–32 的上限。方法成功返回 void，失败抛出异常。宿主负责增量、重试、依赖先行和入口后置、旧资源清理，不把远端目录当成可任意删除的文件清单。

快照式实例声明 `mode: "snapshot"`，实现 `publish(snapshot, signal)`。snapshot 包含本轮临时 id、待上传文件的路径和摘要及删除路径。只有远端确认整轮提交后才返回；失败抛异常，不返回部分成功。可选 dispose 在会话关闭时回收连接。

Git 快照使用 `context.services.git.publishSnapshot({ publicationId: snapshot.id, remote, branch, author: { name, email }, authentication: { username, password }, cacheId? }, { signal })`。remote 只接受不含凭据的 HTTPS 地址；认证通过任务通道使用，不写入 remote URL。publicationId 仅在所属窗口本轮发布中有效，不能用于读取任意本地文件。需要缓存目录时调用 `context.services.git.selectCacheDirectory({})`，由宿主选择并返回 `{ id, label }`；只保存 id 和展示用 label，不传入任意 cwd 或 shell 命令。

配置视图使用 `context.settings.register({ id, title, target: "publish", component })`。组件接收 `PluginSettingsProps.publishConfig` 的 value 与 save，保存成功后再提交表单值，不用按工作区隔离的 context.storage 保存账号。普通插件详情页提供前往博客发布页的入口。

离开发布页继续运行；停用、切库和发起窗口关闭使旧会话失效。每次请求都传递 signal，错误信息不得包含凭据。新安装默认停用，插件缺失或未启用时宿主保留用户配置及选择，不自动切换其他目标。

## 配置与错误处理

`publishConfig` 是可选属性，组件先检查它是否存在，再读取 `value: JsonValue` 并校验字段。`await publishConfig.save(value)` 成功后再提示；失败保留当前输入。配置随用户选择的提供方保存，不将 Token 写入 `identity`、公开 URL、README 或日志。

文件路径由宿主给出，是发布站点内的相对路径。适配具体远端接口时保留路径语义并正确编码，不拼成 shell 命令。使用 `context.fetch` 时检查 `response.ok`，每次请求都传入本轮 signal；不吞掉异常后返回成功，否则宿主会误记为已发布。删除操作应能处理文件已经不存在的重试。

`selectCacheDirectory` 在用户取消时返回 `null`，不要把它当成失败或自行构造缓存 ID。`create(config)` 同步返回实例，连接和发布任务放入对应异步方法，不在创建实例时发起后台请求。

## 验证

至少覆盖：配置保存失败、连接失败、重复发布、远端文件已存在或已删除、用户取消、插件停用、切换工作区，以及快照提交中途失败后重试。用真实远端验证成功之后，才能声称支持该发布目标；SDK 类型检查不验证远端协议。

发布目标插件负责把文件送到远端，独立站点读取数据与模板构建见 [PUBLISH-DATA.md](PUBLISH-DATA.md)。
