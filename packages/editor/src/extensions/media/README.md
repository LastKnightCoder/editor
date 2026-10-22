# 媒体扩展

`@tau/editor/extensions/media` 拥有 image、inline-image、audio、video 的完整功能：元素声明、渲染、命令、ingest、插入工具、媒体浮层、外观、类型和 Markdown codec。媒体渲染只消费 `@tau/editor/api` 的公开能力；核心不反向导入本模块。

```ts
import { createEditorKit } from "@tau/editor";
import { mediaExtensions } from "@tau/editor/extensions/media";
import { IEditorSlots } from "@tau/editor/extensions/media/services";
import { createDefaultEditorSlots } from "@tau/editor/extensions/media/slots";
import { IResourceService, type ResourceService } from "@tau/editor/host-services";

export function createMediaKit(upload: ResourceService["upload"]) {
  return createEditorKit({
    extensions: mediaExtensions,
    services: [
      register => register(IEditorSlots, createDefaultEditorSlots()),
      register => register(IResourceService, { upload }),
    ],
  });
}
```

段落和文本由核心提供，不需要再次安装 paragraph。默认 Editor 已封装浏览器 DnD；使用显式 kit 的高级场景继续由应用提供其既有 DndProvider。需要宿主图片外观时，在已安装组合上用 `createImageExtensions(options)` 显式覆盖 image。图册由独立插件 `tau.image-gallery` 提供。

推荐安装完整 mediaExtensions。命名元素实例供宿主组合和覆盖使用；部分组合需要保留关联元素（图片 ingest 会产出 inline-image），共享图片预览和 URL 弹窗需要同时安装一次 mediaUiExtension。核心不会自动补齐这些领域能力。

| 入口          | 用途                                                                               |
| ------------- | ---------------------------------------------------------------------------------- |
| 根入口        | 完整组合、单个扩展、外观工厂、插入函数及本地文件/网络地址入口                      |
| `/services`   | 媒体 Provider、操作、外观及 Image/Video/Audio 插槽的 token 和类型；运行时不加载 UI |
| `/slots`      | 原生默认插槽和读取当前媒体插槽的 hook                                              |
| `/types`      | 元素类型、外观类型、图库模式；通过公开 ElementMap 增强登记类型                     |
| `/appearance` | 图片圆角/阴影选项与样式计算，供宿主设置界面消费                                    |
| `/markdown`   | 纯 mediaMarkdownCodecs，宿主显式加入自己的处理器                                   |

IEditorSlots 保留原标识，但只属于媒体领域；默认插槽可被宿主原生播放器替换。图片/图库组件及上传入口消费共用 IResourceService，上传成功返回文档可存储的地址；IFileService 用于宿主文件相关操作。媒体 Provider 等能力未注册时不出现对应业务入口，基础段落编辑器不需要这些服务。

媒体 UI 随 mediaExtensions 安装一次，通过核心 layers 挂载；只读时不挂插入弹窗。图片预览、URL、图库设置、裁剪、业务操作及行内上传浮层经 OverlayBackDismiss 接宿主仲裁。同页多编辑器按 owner 区分共享浮层，关闭/卸载/Activity 隐藏清理归属。

多文件先插入完整批占位再上传，避免异步期间选区移动或首个段落被替换后丢文件。图片按 uuid、音视频按 pathRef 定位；目标删除或替换后不会回填其他占位。音视频粘贴失败补段落，拖放失败保留占位并结束上传态。原地上传结束会完成回调并释放引用；文件取消的回调依赖浏览器支持 cancel 事件。

Markdown 的单图段落提升归本模块的 normalizeFor.paragraph。图片链接、加粗图片和提升后的位置映射存在已记录的历史限制，见仓库 ER-033；此包迁移未宣称修复这些编解码行为。
