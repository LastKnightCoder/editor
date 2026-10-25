# 商店提交材料

Chrome 应用商店与 Edge 加载项商店后台各栏的填写内容，按后台页面顺序排列。隐私政策正文在官网 `apps/website/content/docs/browser-companion-privacy.md`，改动扩展的数据流向时两边一起改。

## 商品详情

**名称**：Tau 伴读

**简短说明**（Chrome 限 132 字符）：

> 在网页上高亮、批注、记页面笔记，并用 Tau 里配置的模型对当前网页提问。需配合 Tau 桌面端使用。

**类别**：工作效率（Productivity）

**语言**：中文（简体）

**详细说明**：

```text
Tau 伴读是 Tau 桌面端的浏览器搭档：读网页时随手标记、写下想法、向 AI 提问，内容都保存到你电脑上的 Tau 里。

【选中即标注】
选中网页文字，用五种颜色高亮，或写一条批注。标注不改动网页本身，下次打开同一网页会自动还原。

【对这页提问】
在面板里直接问「这篇讲了什么」「这段怎么理解」。回答会标出原文出处，点编号即可跳回对应段落。AI 使用的是你在 Tau 里配置的模型。

【页面笔记】
边读边写，笔记可以一键存成 Tau 里的一张卡片，并附上来源链接。

【伴读库】
所有标注过的网页汇总在一处，可按站点筛选、浏览全部标注。

【隐私】
扩展只和你电脑上运行的 Tau 通信（127.0.0.1），不连接任何外部服务器，不含统计或追踪代码。只有在你提问时，Tau 才会把相关网页内容发给你自己配置的模型服务。Tau 没有运行时，标注照常保存在浏览器里，连上后自动同步。

【使用前】
需要先安装 Tau 桌面端（https://taunote.app）。首次使用时，Tau 会弹出授权窗口，核对两边显示的校验码后允许即可。

快捷键：Alt+J 打开 / 关闭伴读面板，Alt+Shift+J 打开伴读库。
```

**图片素材**（`pnpm --filter browser-extension store:shots` 生成到 `store/output/`）：

| 后台栏位                    | 文件                                  | 尺寸     |
| --------------------------- | ------------------------------------- | -------- |
| 商店图标                    | `public/icon/128.png`                 | 128×128  |
| 屏幕截图（按顺序上传）      | `01-highlight.png` … `05-connect.png` | 1280×800 |
| 小型宣传图块（Chrome 必填） | `promo-small.png`                     | 440×280  |
| 顶部宣传图块（选填）        | `promo-marquee.png`                   | 1400×560 |

**官方网址**：https://taunote.app

**隐私权政策网址**：https://taunote.app/docs/browser-companion-privacy/

## 隐私权做法（Chrome「隐私权」页）

### 单一用途说明

```text
在用户正在阅读的网页上提供阅读辅助：高亮与批注网页文字、记录页面笔记、针对当前网页向 AI 提问。所有内容保存到用户本机的 Tau 桌面应用中。
```

### 权限理由

**storage**

```text
在浏览器本地保存：用户对每个网页的高亮与批注（Tau 桌面端未运行时先存于本地，连上后同步）、页面笔记草稿、与本机 Tau 配对的凭据，以及悬浮球位置等界面偏好。数据只保存在本地，不会发送到任何外部服务器。
```

**主机权限（<all_urls>）**

```text
扩展的核心功能是对用户正在阅读的任意网页进行标注，无法预先知道用户会在哪些网站上使用：
1. 内容脚本需要在网页上显示悬浮球、选区工具条和伴读面板，并用 CSS Custom Highlight API 绘制高亮（不修改网页 DOM）；
2. 用户再次打开某个网页时，需要读取页面文字来重新定位并还原此前的高亮，这一步必须在页面加载时自动完成，因此无法改用 activeTab；
3. 用户向 AI 提问时，需要读取当前网页的正文作为回答依据。
页面文字只在本机用于定位标注；只有用户主动提问时，正文才会经本机的 Tau 发给用户自己配置的模型服务。扩展不会在后台抓取或上传网页。
```

### 是否使用远程代码

选「否，我并未使用远程代码」。

```text
所有 JavaScript 都打包在扩展内，不加载或执行任何远程脚本。扩展唯一的网络连接是到本机 Tau 桌面应用的 WebSocket（ws://127.0.0.1:24678/browser），只传输 JSON 数据。
```

### 数据使用

勾选以下类别（宁可多报，不要漏报）：

| 类别                                                                           | 勾选 | 原因                                                                 |
| ------------------------------------------------------------------------------ | ---- | -------------------------------------------------------------------- |
| 网站内容（文字、图片、超链接等）                                               | ✔    | 标注的原文片段；提问时发给用户配置的模型的网页正文                   |
| 网络历史记录                                                                   | ✔    | 保存标注时一并记录该网页的地址与标题（只记有标注、笔记或提问的网页） |
| 个人身份信息、健康信息、财务和付款信息、身份验证信息、个人通讯、位置、用户活动 | ✘    | 不收集                                                               |

三项声明全部勾选：

- 不会出于已获批准的用途之外的目的向第三方出售或传输用户数据；
- 不会为实现与产品单一用途无关的目的而使用或转移用户数据；
- 不会为确定信用度或实现贷款而使用或转移用户数据。

## 给审核员的测试说明

Chrome 填在「测试说明」（Test instructions），Edge 填在「认证说明」（Notes for certification）。审核员通常是英文读者，中英文都附上。

```text
【中文】
本扩展是 Tau 桌面应用（免费，macOS / Windows）的配套扩展。标注功能无需 Tau 即可测试；对话与同步需要 Tau。

A. 不安装 Tau 也能测试的功能
1. 打开任意文章类网页（例如 https://en.wikipedia.org/wiki/Forgetting_curve）。
2. 页面右侧会出现圆形悬浮球「τ」。选中一段文字，弹出工具条，点任一颜色即可高亮；点「批注」可写批注。
3. 刷新页面，高亮会自动还原。
4. 点击悬浮球（或按 Alt+J）打开面板，「标注」页签列出本页全部标注；按 Alt+Shift+J 打开伴读库。
（未连接 Tau 时，面板会提示「没有找到 Tau」，这是预期行为，标注保存在浏览器本地。）

B. 连接 Tau 后的功能
1. 从 https://taunote.app 下载并安装 Tau，启动后保持运行（无需注册账号）。
2. 在网页上打开伴读面板，Tau 会弹出授权窗口，两边显示同一个 4 位校验码，点「允许连接」。
3. 「对话」页签需要在 Tau「设置」里先配置一个 AI 模型（需要模型服务商的 API Key）；配置后即可对当前网页提问。
4. 标注会同步进 Tau，可在 Tau 中查看。

扩展只连接 ws://127.0.0.1:24678（本机的 Tau），不访问任何外部服务器。

【English】
This extension is a companion to the Tau desktop app (free, macOS / Windows). Highlighting works without Tau; chat and sync require Tau.

A. Without Tau
1. Open any article page (e.g. https://en.wikipedia.org/wiki/Forgetting_curve).
2. A round "τ" button appears at the right edge. Select text to show the toolbar; click a color to highlight, or "批注" (Annotate) to add a note.
3. Reload the page: highlights are restored automatically.
4. Click the "τ" button (or press Alt+J) to open the panel; the "标注" (Annotations) tab lists all highlights on the page. Alt+Shift+J opens the Library.
(Without Tau the panel shows "没有找到 Tau" (Tau not found). This is expected; highlights are kept in local extension storage.)

B. With Tau
1. Download and install Tau from https://taunote.app and keep it running (no account required).
2. Open the panel on any page. Tau shows an authorization dialog; both sides display the same 4-digit code. Click "允许连接" (Allow).
3. The "对话" (Chat) tab requires an AI model configured in Tau Settings (an API key from a model provider). Once configured, you can ask questions about the current page.
4. Highlights sync into Tau and can be viewed there.

The extension only connects to ws://127.0.0.1:24678 (the local Tau app) and never contacts external servers.
```
