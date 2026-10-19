# 博客发布提供方

需要 SDK 0.21.0 及包含博客发布能力的客户端。提供方只在渲染进程注册和执行，网络使用 `context.fetch`。本地导出由宿主提供，不注册本地发布插件。

在 activate 中调用 `context.publish.register({ id: context.pluginId, name, create(config) })`。create 返回文件式或快照式实例，配置是本轮固定的 JSON 副本。提供方 ID 必须等于所属插件 ID。

两种实例都实现 `describe(signal)` 与 `checkConnection(signal)`；describe 返回 `identity`、`basePath`、可选 `publicUrl`。identity 是不含密钥的物理目标稳定身份，不随插件版本、模板、Token 或提交方式变化。basePath 以斜杠开头和结尾，根路径为 `/`。

文件式实例声明 `mode: "files"`，实现 `uploadFile(path, Uint8Array, signal)` 与 `deleteFile(path, signal)`，可用 `concurrency` 声明 1–32 的上限。方法成功返回 void，失败抛出异常。宿主负责增量、重试、依赖先行和入口后置、旧资源清理，不把远端目录当成可任意删除的文件清单。

快照式实例声明 `mode: "snapshot"`，实现 `publish(snapshot, signal)`。snapshot 包含本轮临时 id、待上传文件的路径和摘要及删除路径。只有远端确认整轮提交后才返回；失败抛异常，不返回部分成功。可选 dispose 在会话关闭时回收连接。

Git 快照使用 `context.services.git.publishSnapshot({ publicationId: snapshot.id, remote, branch, author: { name, email }, authentication: { username, password }, cacheId? }, { signal })`。remote 只接受不含凭据的 HTTPS 地址；认证通过任务通道使用，不写入 remote URL。publicationId 仅在所属窗口本轮发布中有效，不能用于读取任意本地文件。需要缓存目录时调用 `context.services.git.selectCacheDirectory({})`，由宿主选择并返回 `{ id, label }`；只保存 id 和展示用 label，不传入任意 cwd 或 shell 命令。

配置视图使用 `context.settings.register({ id, title, target: "publish", component })`。组件接收 `PluginSettingsProps.publishConfig` 的 value 与 save，保存成功后再提交表单值，不用按工作区隔离的 context.storage 保存账号。普通插件详情页提供前往博客发布页的入口。

离开发布页继续运行；停用、切库和发起窗口关闭使旧会话失效。每次请求都传递 signal，错误信息不得包含凭据。新安装默认停用，插件缺失或未启用时宿主保留用户配置及选择，不自动切换其他目标。
