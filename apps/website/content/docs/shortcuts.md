记住几组快捷键，日常操作可以不碰鼠标。本页按场景列出电脑版的快捷键：在 macOS 上用 <kbd>⌘</kbd>，在 Windows 上用 <kbd>Ctrl</kbd>；<kbd>⌥</kbd> 对应 Windows 的 <kbd>Alt</kbd>，<kbd>⇧</kbd> 对应 <kbd>Shift</kbd>。

::demo{name="shortcuts" caption="在本页按下任意快捷键，表中对应的一行会亮起来；可以按分组查看、搜索操作名，或在右上角切换系统"}

一时想不起快捷键时，按 <kbd>⌘K</kbd>（Windows 上为 <kbd>Ctrl+K</kbd>）打开命令面板，输入操作名称也能找到大部分功能。

## 全局

这些快捷键在任何页面都可以用。

| 操作                   | macOS                          | Windows                                |
| ---------------------- | ------------------------------ | -------------------------------------- |
| 搜索或跳转（命令面板） | <kbd>⌘K</kbd> 或 <kbd>⌘P</kbd> | <kbd>Ctrl+K</kbd> 或 <kbd>Ctrl+P</kbd> |
| 打开或关闭设置         | <kbd>⌘,</kbd>                  | <kbd>Ctrl+,</kbd>                      |
| 打开或收起 AI 对话栏   | <kbd>⌘J</kbd>                  | <kbd>Ctrl+J</kbd>                      |
| 在当前页面查找         | <kbd>⌘F</kbd>                  | <kbd>Ctrl+F</kbd>                      |
| 弹出速记卡片窗口       | <kbd>⌘⇧N</kbd>                 | <kbd>Ctrl+Shift+N</kbd>                |
| 后退 / 前进            | <kbd>⌥←</kbd> / <kbd>⌥→</kbd>  | <kbd>Alt+←</kbd> / <kbd>Alt+→</kbd>    |
| 关闭弹窗、面板等浮层   | <kbd>Esc</kbd>                 | <kbd>Esc</kbd>                         |

:::tip{title="Tau 没在前台也能速记"}
<kbd>⌘⇧N</kbd> 是系统级快捷键：在浏览器或其他软件里看到值得记下的内容，按一下就能弹出速记窗口，写完继续回去做原来的事。
:::

命令面板里还有两个小技巧：输入「卡片:」「文章:」等前缀可以只搜某一类内容；输入「待办:」或「日程:」后接内容，比如「待办: 明天 17:00 交周报」，回车即可直接记下，不必先打开待办页。

光标在输入框或编辑器里时，<kbd>⌥←</kbd> / <kbd>⌥→</kbd> 留给系统移动光标，不会触发后退和前进。

## 编辑器

在卡片、文章、项目文档和日记里写作时使用。完整的编辑说明见 [编辑器基础](/docs/editor/)。

### 文字格式

| 操作             | macOS          | Windows                 |
| ---------------- | -------------- | ----------------------- |
| 粗体             | <kbd>⌘B</kbd>  | <kbd>Ctrl+B</kbd>       |
| 斜体             | <kbd>⌘I</kbd>  | <kbd>Ctrl+I</kbd>       |
| 下划线           | <kbd>⌘U</kbd>  | <kbd>Ctrl+U</kbd>       |
| 删除线           | <kbd>⌘⇧S</kbd> | <kbd>Ctrl+Shift+S</kbd> |
| 高亮             | <kbd>⌘M</kbd>  | <kbd>Ctrl+M</kbd>       |
| 行内代码         | <kbd>⌘E</kbd>  | <kbd>Ctrl+E</kbd>       |
| 插入链接         | <kbd>⌘L</kbd>  | <kbd>Ctrl+L</kbd>       |
| 行内公式         | <kbd>⌘⇧E</kbd> | <kbd>Ctrl+Shift+E</kbd> |
| 给选中文字加批注 | <kbd>⌘⇧M</kbd> | <kbd>Ctrl+Shift+M</kbd> |
| 退出当前文字格式 | <kbd>Esc</kbd> | <kbd>Esc</kbd>          |

选中文字再按 <kbd>⌘⇧E</kbd>，选中的内容会直接变成公式；不选文字时则插入一个空公式。光标处带着粗体、高亮等格式时按 <kbd>Esc</kbd>，接下来输入的文字就不再带格式。

### 段落与结构

| 操作                | macOS                            | Windows                               |
| ------------------- | -------------------------------- | ------------------------------------- |
| 插入代码块          | <kbd>⌘\`</kbd>                   | <kbd>Ctrl+\`</kbd>                    |
| 标题升一级 / 降一级 | <kbd>⌥=</kbd> / <kbd>⌥-</kbd>    | <kbd>Alt+=</kbd> / <kbd>Alt+-</kbd>   |
| 列表缩进 / 退回一级 | <kbd>Tab</kbd> / <kbd>⇧Tab</kbd> | <kbd>Tab</kbd> / <kbd>Shift+Tab</kbd> |
| 上移 / 下移列表项   | <kbd>⌘↑</kbd> / <kbd>⌘↓</kbd>    | <kbd>Ctrl+↑</kbd> / <kbd>Ctrl+↓</kbd> |
| 撤销 / 重做         | <kbd>⌘Z</kbd> / <kbd>⌘⇧Z</kbd>   | <kbd>Ctrl+Z</kbd> / <kbd>Ctrl+Y</kbd> |
| 全选                | <kbd>⌘A</kbd>                    | <kbd>Ctrl+A</kbd>                     |

在普通段落上按 <kbd>⌥=</kbd> 会变成六级标题，连按几次升到需要的级别；六级标题再按 <kbd>⌥-</kbd> 就回到普通段落。

### 表格

| 操作                  | 按键                             |
| --------------------- | -------------------------------- |
| 移到右边 / 左边的格子 | <kbd>Tab</kbd> / <kbd>⇧Tab</kbd> |
| 跳到下一行的同一列    | <kbd>Enter</kbd>                 |
| 移到上方 / 下方的格子 | <kbd>↑</kbd> / <kbd>↓</kbd>      |

在最后一格按 <kbd>Tab</kbd> 会自动新增一行。

### 不用修饰键的输入

有些操作只需输入一个字符：

| 输入             | 作用                                         |
| ---------------- | -------------------------------------------- |
| `/`              | 打开插入菜单，插入表格、图片、提示块等       |
| `@` 或 `[[`      | 引用一张卡片、一篇文章或项目文档             |
| `#`、`-`、`>` 等 | 行首输入后按空格，转成标题、列表、引用等格式 |

## AI 对话

| 操作                     | macOS          | Windows                     |
| ------------------------ | -------------- | --------------------------- |
| 发送消息                 | <kbd>⌘↵</kbd>  | <kbd>Ctrl+Enter</kbd>       |
| AI 回答时插话            | <kbd>⌘⇧↵</kbd> | <kbd>Ctrl+Shift+Enter</kbd> |
| 引用卡片、文章或项目文档 | 输入 `@`       | 输入 `@`                    |
| 点名一个 Skill           | 输入 `$`       | 输入 `$`                    |

插话的内容会在 AI 当前这一步结束后交给它，不用等整段回答完。更多用法见 [AI 对话与洞见](/docs/ai/)。

## 白板

在白板画布上使用（正在编辑文字时这些键不生效）。

| 操作                  | macOS                             | Windows                                   |
| --------------------- | --------------------------------- | ----------------------------------------- |
| 撤销 / 重做           | <kbd>⌘Z</kbd> / <kbd>⌘⇧Z</kbd>    | <kbd>Ctrl+Z</kbd> / <kbd>Ctrl+Y</kbd>     |
| 全选                  | <kbd>⌘A</kbd>                     | <kbd>Ctrl+A</kbd>                         |
| 删除选中的元素        | <kbd>Delete</kbd> 或 <kbd>⌫</kbd> | <kbd>Delete</kbd> 或 <kbd>Backspace</kbd> |
| 放大 / 缩小           | <kbd>⌘=</kbd> / <kbd>⌘-</kbd>     | <kbd>Ctrl+=</kbd> / <kbd>Ctrl+-</kbd>     |
| 全览 / 回到原来的视角 | <kbd>Z</kbd>                      | <kbd>Z</kbd>                              |
| 适应全部 / 适应选中   | <kbd>⇧1</kbd> / <kbd>⇧2</kbd>     | <kbd>Shift+1</kbd> / <kbd>Shift+2</kbd>   |
| 缩放到 100%           | <kbd>⇧0</kbd>                     | <kbd>Shift+0</kbd>                        |

按一次 <kbd>Z</kbd> 看整张白板，再按一次回到刚才的位置，适合在细节和全局之间来回切换。

选中思维导图的节点后：

| 操作                  | 按键                                                                                |
| --------------------- | ----------------------------------------------------------------------------------- |
| 添加子节点            | <kbd>Tab</kbd>                                                                      |
| 在下方 / 上方添加同级 | <kbd>Enter</kbd> / <kbd>⇧Enter</kbd>                                                |
| 编辑节点文字          | <kbd>空格</kbd>，编辑完按 <kbd>Enter</kbd>                                          |
| 在节点之间移动        | 方向键                                                                              |
| 上移 / 下移节点       | <kbd>⌘↑</kbd> / <kbd>⌘↓</kbd>（Windows 上为 <kbd>Ctrl+↑</kbd> / <kbd>Ctrl+↓</kbd>） |
| 删除节点              | <kbd>Delete</kbd> 或 <kbd>⌫</kbd>                                                   |

演示时，用 <kbd>→</kbd> / <kbd>↓</kbd> 翻到下一页，<kbd>←</kbd> / <kbd>↑</kbd> 返回上一页，<kbd>F</kbd> 全屏，<kbd>Esc</kbd> 退出演示。详见 [白板](/docs/whiteboard/)。

## 阅读 PDF

| 操作                | 按键                                                 |
| ------------------- | ---------------------------------------------------- |
| 上一页 / 下一页     | <kbd>←</kbd> / <kbd>→</kbd>                          |
| 加书签              | <kbd>B</kbd>                                         |
| 双页显示            | <kbd>D</kbd>                                         |
| 显示 / 隐藏页边批注 | <kbd>M</kbd>                                         |
| 向右旋转            | <kbd>R</kbd>                                         |
| 抓手工具            | <kbd>H</kbd>，或按住 <kbd>空格</kbd> 临时拖动        |
| 框选区域            | 按住 <kbd>⌥</kbd>（Windows 上为 <kbd>Alt</kbd>）拖动 |
| 查找                | <kbd>⌘F</kbd>（Windows 上为 <kbd>Ctrl+F</kbd>）      |
| 保存批注            | <kbd>⌘↵</kbd>（Windows 上为 <kbd>Ctrl+Enter</kbd>）  |

更多阅读功能见 [收集与阅读](/docs/reading/)。

## 待办、日记与番茄

这些单键快捷键只在对应页面生效，光标在输入框里时不会触发。

| 页面     | 操作                  | 按键                                            |
| -------- | --------------------- | ----------------------------------------------- |
| 待办     | 定位到快速添加框      | <kbd>⌘/</kbd>（Windows 上为 <kbd>Ctrl+/</kbd>） |
| 日记     | 定位到搜索框          | <kbd>/</kbd>                                    |
| 日记     | 直接开始写            | 按任意字母键                                    |
| 番茄专注 | 开始第几个预设        | <kbd>1</kbd>–<kbd>9</kbd>                       |
| 番茄专注 | 暂停 / 继续           | <kbd>空格</kbd>                                 |
| 番茄专注 | 进入沉浸模式          | <kbd>I</kbd>                                    |
| 漫步     | 随机换一条            | <kbd>空格</kbd>                                 |
| 漫步     | 前后浏览过的内容      | <kbd>←</kbd> / <kbd>→</kbd>                     |
| 数据库   | 详情里上一条 / 下一条 | <kbd>K</kbd> / <kbd>J</kbd>                     |

## 闪卡复习

| 操作                         | 按键                                                |
| ---------------------------- | --------------------------------------------------- |
| 新建闪卡（闪卡页）           | <kbd>N</kbd>                                        |
| 显示答案 / 提交              | <kbd>空格</kbd> 或 <kbd>Enter</kbd>                 |
| 选择选项                     | <kbd>A</kbd>–<kbd>F</kbd>                           |
| 评分：忘记、模糊、记得、轻松 | <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> <kbd>4</kbd> |
| 选择推荐评分                 | <kbd>空格</kbd> 或 <kbd>Enter</kbd>                 |
| 编辑当前卡片                 | <kbd>E</kbd>                                        |
| 暂停当前卡片                 | <kbd>S</kbd>                                        |
| 撤销上一张的评分             | <kbd>⌘Z</kbd>（Windows 上为 <kbd>Ctrl+Z</kbd>）     |
| 结束复习                     | <kbd>Esc</kbd>                                      |

判断题按 <kbd>A</kbd> 表示「对」、<kbd>B</kbd> 表示「错」。详见 [闪卡复习](/docs/flashcards/)。
