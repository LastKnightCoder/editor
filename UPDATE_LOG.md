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
- fix: EditText 组件在输入中文时回车问题

## v0.9.5

- feat: 搜索 UI 即输入体验优化
