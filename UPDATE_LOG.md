# 更新日志

## v0.3.0

- fix: workflow 脚本修改

## v0.3.1

- feat: 支持多列布局
- fix: 表格输入修复
- fix: 侧边栏无法调整宽度
- fix: 删除自动更新

## v0.3.2

- feat: 支持高亮块

## v0.3.3

- feat: 支持图册

## v0.3.4

- feat: 图册支持轮播模式

## v0.3.5

- feat: 图册支持多列模式

## v0.3.6

- feat: 支持 Tabs 布局
- fix: 表格聚焦优化

## v0.3.7

- fix: 代码块、图片、PreviewWithEditor 删除优化
- fix: 颜色选择 bug 修复
- feat: 优化选择卡片弹窗打开速度
- feat: 获取卡片简介方法优化

## v0.3.8

- feat: 重构卡片编辑组件，为未来支持多窗口铺垫
- feat: 自动保存
- feat: 添加若干快捷键

## v0.3.9

- feat: 支持多窗口编辑

## v0.3.10

- feat: 支持移动卡片到另一侧边栏

## v0.3.11

- feat: 卡片 Tab 支持拖拽排序
- feat: 图册图片支持拖拽排序

## v0.3.12

- feat: 编辑器支持拖拽排序
- feat: 支持跨编辑器拖拽
- feat: 支持表格行拖拽排序

## v0.3.13

- feat: 属性面板支持收起
- feat: 编辑器大小根据容器自适应
- feat: 支持 statusBar
- feat: 关联列表右侧打开查看

## v0.3.14

- fix: 修复 bug，hovering bar 位置不对
- fix: status bar 导致窗口抖动，以及位置会随着滚动发生改变
- fix: block-panel 位置修复，支持拼音关键字
- feat: tabsContainer 也支持拖拽

## v0.4.0

- feat: 支持文档模式
- feat: 文档支持拖拽

## v0.4.1

- feat: 支持动画
- feat: 文档项支持图标
- feat: 显示创建和更新时间
- fix: 文字超长处理

## v0.4.2

- feat: 添加自动更新的能力

## v0.4.3

- feat: 窗口支持圆角
- feat: 背景添加渐变色
- feat: 文档修改为知识库
- feat: 文档编辑器宽度优化

## v0.4.4

- feat: 支持阿里云 OSS
- feat: 图片上传统一

## v0.4.5

- feat: check-list 去掉 Add Paragraph，间距更加合理
- feat: 自定义块支持跟随主题变化
- feat: 发布之前检查类型是否通过

## v0.4.6

- feat: 支持通过阿里云 OSS 同步数据库

## v0.4.7

- feat: Mac 下不监听 resize 事件
- feat: 提供快捷键手动下载
- feat: 上传、下载提示优化

## v0.4.8

- feat: 卡片编辑快捷操作收拢到 statusBar
- feat: 文档支持目录
- feat: 滚动条颜色优化

## v0.4.9

- feat: 支持热力图
- feat: 支持 Ctrl + K 打开命令面板跳转页面

## v0.4.10

- feat: 文档项支持绑定卡片，与卡片内容同步
- fix: 时间显示问题修复

## v0.4.11

- feat: 文档项侧边栏和目录支持动画显示与隐藏

## v0.4.12

- feat: 侧边栏隐藏统一管理
- feat: 文档项支持关联文章，与文章内容、标题同步
- feat: 添加扩展，文档项支持概览所有子项，且支持拖拽
- feat: 编辑器拖拽颜色统一和文档项相同
- fix: 列表编辑修复
- fix: 文档项删除优化，删除的文档若包含当前正在编辑的卡片，将当前编辑区域清空

## v0.4.13

- feat: 编辑时滚动优化
- feat: 文档卡片和文章卡片样式优化
- feat: 文档项支持收起和展开，默认展开一级
- feat: 日记页背景修改为透明

## v0.4.14

- feat: 文档支持选择关联文档

  - 不能选择当前文档，子文档和父文档
  - 相同的目录下禁止有相同的文档，无论是拖动还是选择都会禁止掉

- fix: 图片概览bug修复
- fix: 列表无线滚动 bug 修复

## v0.4.15

- feat: sidebar 宽度可拖动，所有地方的宽度一致
- feat: 支持字数统计
- feat: 卡片支持标签系统
- fix: sidebar 拖拽和隐藏冲突修复

## v0.4.16

- feat: 卡片管理，右键添加关闭其它卡片
- feat: 编辑文章支持自动保存
- fix: 编辑器添加规范化 paragraph 规则
- fix: PreviewEditor 字体大小

## v0.4.17

- feat: 支持时间统计

## v0.4.18

- feat: 添加笔记分类
- fix: 统计显示 2024
- fix: 时间统计编辑和更新回显
- fix: 关联卡片同步问题修复

## v0.4.19

- feat: 字体颜色支持黑暗模式，对比度更加明显
- feat: 支持小窗创建快捷卡片
- feat: 支持小窗创建快捷时间记录
- feat: 支持快捷键打开小窗

## v0.4.20

- feat: 时间记录日期选择联动
- feat: 关系图谱不显示在单独的路由
- fix: card-link 添加规则，必须在 paragraph 里面
- fix: 卡片列表显示不全
- fix: HoveringBar 层级问题修复
- fix: 时间记录页面侧边栏宽度调整问题

## v0.4.21

- feat: GraphView 宽度自适应
- feat: GraphView 预览支持 CardLink
- feat: 点击图中的节点自动跳转到对应的卡片
- feat: 行内卡片连接点击在另一侧打开
- feat: GraphView 与 CardView 切换时，不会重新计算布局
- feat: 鼠标放置在节点延迟 500ms 才会显示卡片内容
- feat: 列表项支持折叠

## v0.4.22

- feat: 列表收起支持动画
- feat: 无序列表收起时有一个阴影表示可展开
- feat: 字数统计添加数学公式
- fix: MacOS 编译问题
- fix: 远程数据下载检测

## v0.5.0

- feat: UI 重构

## v0.5.1

- feat: 适配黑暗模式
- feat: 为每一个分类显示总数
- feat: 可以统计每个知识库下包含的文档数量
- feat: 体验操作优化

## v0.5.2

- feat: 配色优化
- feat: 支持聚焦模式
- fix: 列表项显示问题修复

## v0.6.0

- feat: 编辑体验优化
- feat: 添加项目功能
- fix: 拖拽线的显示

## v0.6.1

- feat: 可切换数据库

## v0.6.2

- feat: 下划线支持颜色设置
- feat: 卡片支持导出 Markdown

## v0.6.3

- feat: 时间记录支持记录时间，再也不用手动输入了
- feat: 文字选中背景色优化，和微信读书颜色一致
- feat: 去掉 Tikz，减少体积
- feat: 支持项目归档
- feat: 支持删除项目
- fix: 同步远程数据库版本与远程不一致问题

## v0.6.4

- feat: 时间记录支持时间类型
- feat: 日记默认可编辑
- feat: 卡片支持标签搜索能力
- fix: 拖拽 bug，拖拽到其他块上面时顺序不对
- fix: 无法删除第一个列表项
- fix: HoveringBar key 重复问题

## v0.6.5

- feat: 支持文件附件，点击打开文件管理器

## v0.6.6

- feat: 侧边栏支持收起和展开，调整宽度
- feat: 聚焦模式下体验优化
- feat: 文档和项目目录显示优化
- fix: 知识库选中时未高亮
- fix: 日记列表项点击未关闭

## v0.6.7

- feat: 根据项目直接建立卡片

## v0.7.0

- feat: 支持 PDF 高亮标注笔记

## v0.7.1

- fix: Github Actions 编译报错

## v0.7.2

- fix: Github Actions 编译报错，删除 Cargo.lock

## v0.7.3

- feat: 链接编辑优化
- feat: 添加新的行内文本样式
- feat: 支持窗口阴影
- feat: 支持资源缓存到本地
- feat: 将 PDF 下载到本地，下次优先本地加载，提升速率
- feat: 本地 PDF 由全量读取渲染改为及时渲染，提升加载速度
- fix: MacOS PDF 无法打开的问题
- fix: PDF 加载错误展示，操作工具栏 UI 优化
- fix: 图片 CDN 链接处理去除
- fix: 图片预览点击遮罩可以关掉预览
- fix: 日记左右截取问题
- fix: 图片选择本地文件上传和粘贴上传保持一致，且修复后缀名问题
- optimize: 代码优化

## v0.7.4

- feat: 图册支持粘贴网页图片
- feat: 图册多选上传可查看进度
- feat: 日记图册更宽修复
- feat: 有序列表缩进优化
- feat: 所有图片均支持本地缓存优化
- fix: 样式文本图标替换
- fix: 跨域资源下载

## v0.7.5

- feat: 侧边栏管理
- feat: Rust 各功能插件化
- feat: 优化各页面布局
- feat: 各页面大纲展示优化
- fix: Windows 下小窗口无法显示修复

## v0.8.0

- feat: 支持白板功能

  - 几何图形
  - 箭头
  - 富文本
  - 图片
  - 卡片
  - 撤销、重做

- feat: 支持粘贴本地文件

## v0.8.1

- fix: 选择、移动过程中禁止选中文本
- fix: 点击已选中的富文本元素后，无法编辑
- fix: 图形内文本保存
- fix: LocalImage 适配本地图片

## v0.8.2

- feat: 文章支持修改封面，UI 优化
- feat: 文章上传限制图片大小，图片太大太多有性能问题
- feat: 支持曲线箭头
- feat: PDF 宽度自适应
- feat: PDF 记住上次浏览的页数
- feat: 文件上传进行图片压缩，
- fix: 文章全屏高度处理
- optimize: 文章模块代码优化

## v0.8.3

- fix: 去掉图像压缩，正式包无法打开

## v0.9.0

- feat: UI 重构

## v0.9.1

- feat: Tabs 组件编辑优化
- feat: Titlebar 显示优化，侧边支持收起
- feat: 白板支持设置组件属性
- fix: 白板图片粘贴优化

## v0.9.2

- feat: 添加参考线和吸附能力
- fix: 偶现打开编辑面板后操作无反应

## v0.9.3

- feat: 编辑器支持插入音频，且支持 TTS
- feat: 接入豆包声音复制模型
- feat: 支持 AI 对话，可配置 Open AI 和豆包模型
- feat: 项目支持 AI 剪藏页面

## v0.9.4

- feat: 支持右边栏 AI 对话
- feat: 自动选择上一次对话
- feat: 支持流式输出
- feat: 支持删除对话
- feat: 使用 GPT 3.5 Turbo 来总结对话标题
- feat: 对话栏 UI 优化
- feat: 接入 AI 搜索
- fix: Mermaid 渲染问题修复
- fix: EditText 组件在输入中文时回车问题，提供更多方法

## v0.9.5

- feat: AI 搜索 UI 及输入体验优化
- feat: 白板支持复制、剪切和粘贴
- feat: 白板支持批量删除，撤销时可全部恢复
- feat: 编辑器和白板支持视频
- fix: 右侧侧边栏打开时无动画
- fix: PDF 视图宽度自适应
- fix: / 输入提示优化

## v0.9.6

- feat: 导出 Markdown 脱离编辑器
- feat: AI 续写

## v0.9.7

- fix: workflow build error

## v0.9.8

- feat: 日记支持今日总结插件，统计今日更新的卡片和文章
- fix: AI 续写插入代码块崩溃，稳定性提升
- fix: 项目为空时无法新建项目
- fix: 标签搜索不需要输入完整的标签名，输入部分即可

## v0.9.9

- feat: 代码块样式优化
- fix: Mac 侧边栏显示问题
- fix: 时间记录滚动不加载问题
- fix: 切换文章时，标题不更新问题
- fix: 项目切换时标题不更新

## v0.10.0

- feat: 迁移到 Electron
- feat: 支持文章嵌入
- feat: 嵌入支持批量操作
- feat: 白板箭头支持居中连接
- feat: 白板参考线重写，支持拖拽和缩放
- feat: 项目支持白板
- feat: 白板属性设置器重构，更加美观和易用
- feat: UI 改版
- feat: 支持 DeepSeek R1
- feat: 首页添加数据统计，数量和字数，最近编辑
- feat: 历史数据落表，可查看历史笔记数量及字数变化趋势
- feat: 项目文档支持子项列表
- feat: 附件支持上传文档到云端
- feat: 卡片、文章、项目支持 Markdown 导入
- feat: 箭头曲线支持精确选中
- feat: 数据库异步方法全部修改为同步
- feat: 上传 wal 和 shm 文件，防止同步数据库导致数据库损坏
- feat: 支持删除数据库
- feat: 代码块 UI 优化
- fix: 若干 bug 修复

## v0.11.0

- feat: 设置弹窗修改为页面，可用区域更大
- feat: 编辑器支持外部设置主题，适配不同主题色
- feat: 为白板添加网格
- feat: 白板设置其添加设置适配宽度，并且修复适配高度需要点击两次的问题
- feat: 白板支持按住 Ctrl键多选元素
- feat: 添加白板选择弹窗，支持在项目中直接选择白板
- feat: 白板添加全览能力，可全览所有元素或指定元素
- feat: 添加项目和知识库置顶能力，项目归档显示优化
- feat: 添加多种箭头支持支持，支持正交箭头
- feat: 白板中的图片可以添加描述
- feat: 编辑器中支持白板插件
- feat: 优化几何图形设置器代码框架，可定制程度高，灵活支持多种几何图形
- feat: 几何图形支持草图风格
- feat: 支持全文检索
- feat: 文章编辑页支持封面修改以及拖拽
- feat: 添加文档演示能力，可全屏演示文档
- feat: 优化任务列表的各种操作，已经完全可用
- feat: 无序列表和有序列表支持参考线
- feat: 向量知识库支持卡片、文章、项目和知识库所有的文档索引管理，同时支持全文索引和向量索引
- feat: 支持白板演示
- chore: 为项目添加 eslint，husky，lint-staged,prettier, commit-lint 等工程能力
- fix: 项目文档列表和知识库文档列表滚动问题修复
- fix: 若干 bug 修复

## v0.12.0

- feat: 演示模式添加关闭 icon 和回到顶部 icon
- feat: 支持选择草图风格
- feat: 支持设置大语言模型支持的特性
- feat: 编辑器标题可折叠内容
- feat: 代码块可全屏编辑
- feat: 数据库表格初版实现
- feat: 卡片列表，搜索列表，侧边栏性能优化
- feat: 知识库支持置顶
- feat: callout 之间可以互相转换
- feat: 优化对话列表渲染性能
- feat: 添加 ContainerCol 解决 Col 只对窗口响应式的问题
- feat: 支持单独对卡片，文章，项目，知识库打开新窗口，并且支持窗口间的数据同步
- feat: 支持直接打开 Markdown 文件，Typora 编辑体验
- feat: 优化 Markdown 导出，与前端代码无关，Electron Node 端也可以使用
- feat: 添加右侧栏支持查看卡片、文章、项目、知识库，且保持数据同步
- feat: 卡片、文章、项目、知识库调整为多路由
- feat: UI 改版升级
- feat: 支持配置自定义嵌入模型，索引数据库功能优化
- feat: 支持视频笔记
- refactor: 富文本内容存储底层数据库表调整，卡片、文章、项目、知识库同步数据更高效合理
- refactor: 重构数据同步方案
- fix: 知识库输入卡顿问题
- fix: 选择数据库或创建数据库配置文件不更新问题
- fix: 修复在编辑器中 tab 导航问题
- fix: 边距等适配字体大小
- fix: 编辑器内白班内容随编辑器滚动问题
- fix: 若干 bug 修复

## v0.13.0

- feat: 通过快捷键 mod + n 打卡快捷卡片窗口
- feat: 窗口缩放功能
- feat: 搜索重构，全文搜索和向量搜索合并
- feat: 选择窗口重构，统一所有选择文档的地方为统一组件
- feat: 卡片置顶功能
- feat: 白板路由重构
- feat: 默认进行全文索引，无需手动全文搜索
- feat: light-gallery 替换为自定义图片预览
- feat: 编辑器添加批注扩展
- feat: 高亮背景使用 CSS Houdini 实现
- feat: 本地文件不写死 home 地址，而是使用 ~，方便跨平台迁移
- feat: 支持编辑白板信息
- feat: 白板多元素支持布局
- feat: 添加小组件功能，支持查看闪念笔记，每日回顾，最近编辑，和未回答问题
- feat: 编辑器添加问题扩展
- feat: 优化右侧栏 Tabs 样式
- feat: Markdown front-matter 解析支持
- feat: 支持 Webview 组件，编辑器添加 Webview 扩展，项目支持 Webview 文档，支持剪藏页面内容，白板支持 Webview 元素
- feat: 单独窗口支持目录
- feat: 编辑器支持图片裁剪
- fix: 时间记录周和月选择修复
- fix: 窗口聚焦监听收集为一处
- fix: 编辑器工具栏 hovering bar 样式修复
- fix: 若干样式和体验 bug 修复

## v0.13.1

- feat: 多编辑器同步优化，不需要聚焦到内容才能保存，以及优化同步时的闪烁和聚焦问题
- feat: 侧边支持新建卡片和文章，侧边卡片支持编辑标签
- feat: 项目和知识库编辑标题回车不同步的问题修复
- feat: 卡片列表添加全部的分类
- feat: 卡片列表页的标签列表支持拖拽调整宽度
- feat: 白板批量操作代码优化
- feat: 编辑器支持行内 HTML 和行内图片
- fix: 侧边无法上传资源
- fix: 从答案创建卡片后卡片列表没有刷新
- fix: 无法批注 bug 修复
- chore: 删除编辑器扩展中关于导出 Markdown 的代码

## v0.13.2

- feat: 支持列表项反缩进
- feat: 支持快捷键移动列表项
- feat: 自动合并连续的相同类型列表
- feat: 思维导根节点支持吸附
- feat: 思维导图支持收起和展开
- feat: 思维导图支持快捷键调整位置
- feat: 思维导图支持左右布局
- feat: 新增 Frame 组件
- feat: 思维导图支持拖拽调整位置
- fix: 拖动结束后未及时清除参考线
- fix: 最近编辑项目文档获取错误
- fix: 对话时可以滚动到上部

## v0.13.3

- feat: 元素粘贴优化
- feat: 使用 express 静态服务器，支持视频流式传输
- feat: 取消 OpenAI 的特殊地位
- fix: 支持拖拽到根节点的左侧
- fix: 拖拽元素到 Frame 上时会丢失箭头关系
- fix: 解散 Frame 时撤销状态不对
- fix: 标题大小、粗细和间距
- fix: 编辑思维导图左侧的节点时，节点向左扩展
- fix: 获取软件版本无限请求问题
- fix: 多元素布局适配 Frame 和思维导图
- fix: 多元素复制，包含 children 的元素复制
- fix: 移动前面元素到后面时路径错误

## v0.13.4

- feat: 去掉 OpenAI 的特殊地位，根据功能选择模型
- feat: 对话 UI 优化
- feat: 支持多模态对话
- feat: 支持 RAG 知识库增强，回答中引用参考的内容
- feat: 设置页添加标题栏
- feat: 添加 emoji 扩展
- feat: 自动清理一个月没更新的闪念卡片
- fix: HTML Block 不正确的上间距

## v0.14.0

- feat: PDF 文本高亮结构重写
- feat: PDF 分解为列表页和详情页
- feat: PDF 支持侧边栏，显示缩略图，目录和高亮，支持缩略图和目录的缓存
- feat: 支持导出卡片、文章、知识库、项目文档为图片
- feat: 支持进度管理功能

## v0.14.1

- feat: 支持上传本地 PDF
- feat: 目标管理 UI 优化
- feat: PDF 支持评论标注
- feat: 表格修改后自动聚焦
- feat: 添加箭头虚线和动画效果
- optimize: useGridLayout 修改为 grid 布局，速度更快
- fix: PDF 笔记位置修复
- fix: 对话未创建时 UI 不渲染问题修复
- fix: 更新卡片时时间未更新

## v0.14.2

- feat: 视频笔记支持 Bilibili 视频
- feat: 视频笔记支持 Youtube 视频
- feat: 对话支持开启思考
- feat: 对话支持中断
- feat: 支持编辑已有的标签
- feat: 白板支持侧边栏
- fix: 合并相同连续列表报错
- fix: 构建超内存问题
- fix: 项目文档网页标题 tip 问题
- fix: 多维度嵌入指定设置的维度
- fix: 白板侧边栏颜色
- fix: 思维导图颜色
- fix: 思维导图在不可见的情况下被意外拖动
- fix: 导入 Markdown 时块级图片被转化为了行内图片
- fix: 打开 Markdown 文件时不打开主应用，且全屏

## v0.15.0

- feat: 支持数据表格
- feat: 添加注解插件
- fix: EditText 粘贴时未触发 onChange 方法

## v0.15.1

- feat: 支持删除数据行
- feat: 支持编辑已有的 Option
- feat: 项目和文章侧边栏可调整大小
- feat: 数据表格添加图片插件
- feat: 数据表格添加附件插件
- feat: 数据表格添加进度插件
- feat: 数据表格添加富文本插件
- feat: 支持 Detail 块的导入与导出
- feat: 支持脚注的导入与导出
- fix: 表格头图标渲染
- fix: 修复行内图片地址问题
- fix: 修复拖动项目到正在打开的项目文档时失败的问题
- fix: 多选新建 Option 问题

## v0.16.0

- feat: 添加任务清单页面

## v0.16.1

- feat: 可以从数据表格及任务清单中创建的文档建立卡片
- feat: 替换关闭展开指示器
- feat: 设置修改为弹窗
- feat: 编辑器支持 typst 插件
- feat: 图片支持调整大小，裁剪完善
- fix: 白板制作演示序列自适应屏幕

## v0.16.2

- feat: 数据表格支持多视图
- feat: 数据表格支持分组
- feat: 数据表格支持排序
- feat: 数据表格支持筛选
- feat: 代码块支持收起，并可调整高度
- feat: 编辑器内视频支持 bilibili 和 youtube
- feat: 白板视频支持 bilibili 和 youtube
- feat: 图片支持添加描述
- fix: 选中的知识库添加文档时会丢失
- fix: 评分组件离开后未恢复自身的值

## v0.16.3

- feat: 支持多页面数据同步系统
- feat: 用户设置多页面实时同步
- feat: 图片添加对齐属性
- feat: bilibili 视频支持分 p 视频
- feat: 添加问题管理页面
- feat: 迁移进度管理页面
- feat: 音视频自动记录上次播放位置
- feat: 支持添加快捷方式
- feat: 全量注入 Tailwind CSS
- fix: 小组件添加问题
- chore: 修改应用名称为 Tau

## v0.16.4

- feat: 添加番茄专注
- feat: 支持 Notion 视频
- feat: 支持 Notion 文档的同步
- fix: Windows 关闭窗口无法退出应用

## v0.17.0

- feat: 添加日历
- feat: 专注时长要求必须大于五分钟
- feat: 番茄钟和日历关联
- feat: 支持日历分组管理
- feat: 支持通过 @ 关联文档
- feat: 支持压缩图片为 webp
- feat: Markdown 支持文件目录，支持直接打开文件夹
