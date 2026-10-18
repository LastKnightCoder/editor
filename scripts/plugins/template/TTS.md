# 语音提供方

需要 SDK 0.13.0 和包含语音插件能力的 Tau 0.59.0 客户端。

在activate中调用context.tts.register({id: context.pluginId, name, create})。create(config, modelId)同步创建任务实例，固定该账号配置和模型，不发送网络请求。每个插件可对应多个用户账号，不能用插件全局变量保存“当前API Key”。

| 方法或字段                                         | 职责                                                                                |
| -------------------------------------------------- | ----------------------------------------------------------------------------------- |
| getVoices(signal)                                  | 返回id、name、type（system/cloned/custom）、可选description组成的音色数组           |
| synthesize({text,voiceId,options},signal)          | 返回{audio:Uint8Array,mime:string}；options仅含speed、volume、pitch                 |
| cloneVoice({file,requestedId?,name?},signal)，可选 | 每次一个{name,mimeType,content}参考文件，返回实际创建的音色；不返回上传文件ID或void |
| textInstructions，可选                             | 当前模型的合成文本规则；供宿主播客脚本使用，缺省为纯文本                            |

请求使用context.fetch并传入方法收到的signal。服务商超时用AbortSignal.any组合，不能覆盖取消信号；退避等待也须取消，不把AbortError当作可重试错误。

配置通过settings.register的target:"tts"挂载。组件接收ttsConfig.instanceId、value、models和save(value,models)，只保存当前账号，不自动选为默认，不覆盖同插件其他账号。模型项为{id,label?}；用户可填写自定义模型。保存失败保留表单并显示错误，不另存一份凭据到context.storage。

需要公开上传参考音频时调用context.upload.uploadRemote(file,{signal})，复用用户选定的远端上传配置。本地模式明确报错；MiniMax自有文件上传不需要图床。不要自行选择用户的上传插件、读取上传凭据或修改桶权限。

主进程只转发数据和提供宿主能力。插件在主窗口渲染进程执行，不使用Node后台入口。宿主负责音频播放、合并和保存；插件不直接写笔记或文件。
