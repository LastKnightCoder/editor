# 更新记录

## 0.48.0

- 提供方表单新增 `switch` 字段（取值 "true" / "false"，不参与必填校验）与分组 `link`（https 外部链接，如服务商控制台）。
- `beforeSave` 可抛出 `ProviderFieldError(key, message)`，宿主把错误标在对应字段；新增 `isProviderFieldError`。
- 选项的 `description` 在两端显示：移动对 ≤3 项且带说明的 choice 平铺为整行单选，桌面在字段说明中显示当前选项说明。
- 宿主为 tts、asr、images、video、publish 的 form 渲染并按目标保存；ASR 表单在语音输入设置中显示。
- 新增 `service-choice` 字段（`service: "git.cacheDirectory"`，值与 `labelKey` 显示名一起保存）与字段 `visibleWhen` 条件显示；发布页抽屉内的 form 随抽屉自动保存。

## 0.47.0

- 服务提供方连接配置统一在插件页管理，应用设置只负责选用；声明式 form 扩展到 TTS、ASR、图片、视频与发布。
- 设置分区可声明 models 初始模型目录，文本字段支持 default；账号保存保持现有实例与当前选用分离。

## 0.46.0

- 同步与上传设置改为声明式表单：`settings.register({ target: "sync" | "upload", form })` 声明账号与存储位置分组，字段类型为 `text`、`secret`、`url`、`choice`、`remote-choice`，可选 `beforeSave` 补全或校验。桌面与移动由 Tau 在插件详情 › 设置里渲染、保存与测试，设置页只负责选用服务。
- 新增 `@tau/plugins` 导出 `ProviderForm` 等类型与 `readProviderFormValues`、`validateProviderFormValues`、`providerFormSummary` 等纯函数。
- 适配要求：`PluginSettingsProps` 不再包含 `syncConfig`、`uploadConfig`；存储插件删除自绘的桌面与移动表单，改为声明 `form` 后重新构建。旧版以组件注册的存储设置仍能激活与同步，但 Tau 不再显示其表单，会提示用户更新插件。

## 0.45.0

- 编辑器节点增加 `dataVersion`、精确历史版本声明与显式数据转换；Markdown 和 HTML 导出可按节点数据版本选择实现。
- 源码字段通过 `collaboration.textFields` 声明，使用 `SourceBlockEditor` 的 `element + field` 或 `useTextField` 增量编辑，支持输入法、选区与宿主撤销。
- 正文读取和写入携带 `contracts`，复制未知节点时保留原数据与契约；本机视图状态通过 `view/updateView` 保存。
- 白板作者接口改为稳定身份命令，提供 `updateElementData`、`getTextBinding` 和宿主历史分组；元素数据版本与转换规则和编辑器保持一致。
- 适配要求：源码编辑不再使用 `initValue/onChange` 整段回写；白板不再使用路径操作、`apply` 或 `schemaVersion/migrate`。旧插件须按作者文档适配并重新构建，不能仅更新依赖版本。
- SDK 提供作者契约，运行时仍由匹配的 Tau 客户端提供；白板作者接口仅支持桌面，SDK 发布不会自动转换旧文档或更新用户客户端。

## 0.44.0

- 新增 EditorMetricRule 与静态 editorMetrics 声明，扩展拥有自己的文本字段规则。
- 字数算法与子树遍历统一，桌面进程只接收可序列化规则，移动日记沿用同一结果。
- 空文档判断与字数分离，零字数的媒体、结构块和未知节点不会被自动清理。

## 0.43.0

- 新增统一 ASR 提供方契约、流式会话、取消与最终结果规则。
- 新增标准事件与状态语义的 WebSocket，支持鉴权头、生命周期回收及宿主背压。
- 新增语音识别账号表单与语音输入整理模型用途，桌面和移动共享插件接口。

## 0.42.0

- 元数据按协议提取，多余属性不再阻止构建、安装或宿主请求。
- 编辑器只接收公开字段，保留权限、身份、文件与资源完整性检查。
- 共享身份、文件和元数据解析，移除重复校验、无用途的构建依赖声明与任意文案、列表限制。
- SDK、模板和官方插件共用同一规则，插件接口与业务数据保持。

## 0.41.0

- 插件功能直接使用统一 API 或注册实际扩展，不再填写宿主能力列表、正文节点等级或贡献标记。
- 正文转换、源码编辑、样式编译、媒体、同步和上传沿用现有接口，宿主负责装配。
- 白板服务直接通过 getService/tryGetService 获取，不再重复填写服务依赖表；插件与工作区存储隔离保持。
- 作者清单只保留插件资料、支持平台、最低客户端版本和用户数据权限，新发行拒绝重复声明。

## 0.40.0

- 白板装配信息从构建的实际宿主模块依赖自动生成，作者只保留现有扩展 API 与平台声明。
- 移除白板专属能力标签，安装兼容性沿用平台与最低客户端版本。

## 0.39.0

- 格式 3 支持桌面白板扩展，白板声明自动要求对应宿主能力；移动目标会在加载前拒绝。
- 统一格式可用于仅桌面的服务与业务插件，保留现有插件身份、配置和公开接口。

## 0.38.0

- 同步、资源上传和网络在桌面、Android、iOS 共用同一套 API；宿主决定配置保存、服务选用和任务行为。
- 跨端清单支持稳定的 fetch、sync、upload 功能声明，未具备能力的宿主在加载前拒绝。
- 领域表单继续使用 value/save，支持保留桌面视图与独立移动视图；账号配置按插件独立保存。

## 0.37.0

- 作者清单使用公共 requires/optional 和 editor.elements，构建器生成发行字段与各平台的完整要求。
- 插件环境仅提供 platform 与 coarsePointer/finePointer 输入事实；布局由容器决定，宿主在加载前完成能力检查。
- 能力使用稳定功能名，页面、入口、设置和 Dialog 共用公共契约；可选样式编译通过具体服务访问器处理。
- 格式 3 支持纯 Markdown Skill 与原始清单的博客静态渲染，保留同一包和节点数据，不启动博客中的应用插件生命周期。

- 修复：`entities.update` 只改 `meta` 时报「没有要修改的字段」。

## 0.36.0

- 客户端保留未来可选能力并允许降级，未知必需能力在执行前拒绝；作者和上传仍严格检查能力词表。
- 模板与上传共用跨端版本及移动权限规则，移动端未支持的权限在执行前再次拒绝；新增逐 API 的宿主支持矩阵，随本地 SDK 和模板分发。

- 跨端开发插件可通过统一功能入口注册页面，并订阅布局与输入环境；注销页面会回收关联入口。
- 提供版本化能力词表与独立格式 3 校验，按平台检查版本、必需/可选能力和节点显示/编辑等级；旧生产校验继续拒绝该开发格式。
- 统一模板支持页面与编辑器示例，通过本地 SDK/UI tarball 构建；仅供受控开发接入，生产中心分发未开放。

- 页面可登记离开守卫；宿主共用节点等级投影，配合提交保护拒绝失效或只读写入。

## 0.35.0

- 插件用 `cards.create`、`articles.create`、`documents.create`、`whiteboards.create`、`projects.create` 新建的内容，之后不需要读取权限也能 `describe`、`EntityRef` 显示、`open` 与 `links.add`，与 `pick` 选择和 `app.run` 新建的结果一致。
- 正文输入新增 `{ shareOf: contentRef }`：与本插件的一项内容共用同一份正文，任一处的修改在另一处实时可见，删除其中一处不影响另一处。只能用于 `cards.create`、`articles.create`、`documents.create` 与 `app.run("project.insertDocument")`，来源必须是本插件内容的正文；一份正文只能有一张卡片、一篇文章，已有时报错。
- 发布数据不再包含求索录：数据类型 `quest` 与 `QuestData`、`QuestStatus`、`QuestAnswer`、`QuestMaterial`、`QuestTrail` 已删除，`DataKind`、`ManifestItem.collectionType`、`TimelineItem`、`ListData`、`SearchDocument` 的类型不再有 `quest`，`ListItem` 去掉了 `groupId`、`groupTitle`、`status`、`answerCount` 与 `updateTime`。博客模板不再需要问题页。

## 0.34.0

- 新增统一的正文输入 `PluginContentInput`，三选一：`{ markdown }`、`{ nodes }`（编辑器节点，格式完整保留）、`{ copyOf: contentRef }`（Tau 内部整份复制已有正文，只需要目标的写入权限）。
- `cards.create`、`articles.create` 的正文字段由 `markdown` 改为 `content`；`entities.create` 新增可选的 `content` 作为初始正文。
- `content.edit` 的 `append`、`prepend`、`replaceAll` 改为 `{ op, content }`；`replaceText` 不变，仍为 `{ op, find, markdown }`。
- `content.read({ format: "nodes" })` 返回 `schemaVersion`，`nodes` 的类型为 `Descendant[]`，可原样写回。新增导出 `EDITOR_NODE_SCHEMA_VERSION` 与 `CONTENT_INPUT_LIMITS`。
- `nodes` 只校验结构，未知节点类型原样保存；结构不对时报错并给出节点路径。
- 引用类型新增 `project`、`notebook`、`material`（划线、PDF 标注、剪藏）、`chat-session`、`plugin-entity`，`pick` 与 `open` 均支持。
- 新增 `context.app.describe(refs)`：批量取引用的最新标题与是否已删除。用户在 `pick` 中选择过的内容与本插件自己的内容不需要权限，其余需要对应类型的读取权限，未获准时返回 `denied` 与所需权限，不弹窗。
- 新增组件 `EntityRef`：由 Tau 显示引用的图标、类型名、标题与删除状态，点击打开；未获准时显示「允许访问」。
- 新增读取权限 `whiteboards:read`、`projects:read`、`notebooks:read`、`materials:read`、`chats:read`（对话只含标题等信息，不含消息内容）；新增导出 `PLUGIN_ENTITY_READ_PERMISSIONS`。
- 新增 `context.data.whiteboards`（读取、新建、修改标题 / 说明 / 标签，新建时带一张空白画板页，画板内容不开放）与 `context.data.projects`（读取、新建空项目、修改标题 / 归档 / 置顶），权限 `whiteboards:read/write`、`projects:read/write`。
- 新增 `projects.tree(id)`（项目文档目录，挂在多处的文档在多处列出，引用卡片 / 文章的条目带 `ref`）、`documents.create`（挂在根目录或某篇文档下）与 `documents.move`（同一项目内，`from` 指明移动哪一处，`index` 为移动后的序号）；`documents:write` 现在也包括新建与移动。
- 白板、项目、项目文档支持 `delete`，权限 `whiteboards:delete`、`projects:delete`、`documents:delete`，用户可在插件详情页 7 天内恢复。项目只能删除空项目；项目文档从所有挂载处删除，有子文档时拒绝，视频笔记不能由插件删除。
- 新增只读的 `context.data.notebooks`（信息与 `resources(id)` 资料清单，不含说明、本机路径与资料转换后的文字）、`context.data.materials`（划线、PDF 标注、剪藏的原文、想法、出处与网址，已删除的不返回）与 `context.data.chats`（对话的标题、场景、消息数与时间，不含消息内容），权限分别为 `notebooks:read`、`materials:read`、`chats:read`。三者的 `query` 不支持 `tag`。
- `context.app.run` 改为用户关闭界面后才返回，并带结果：新建类返回新内容的引用，用户取消返回 `null`，导出、演示、协作没有结果。同一时间只能打开一个界面，前一个未关闭时抛错（原为替换前一个）。新增导出类型 `PluginAppActionResults`。
- 新增动作 `card.create`：打开 Tau 的新建卡片窗口，预填 `content`（`PluginContentInput`）与 `tags`，用户保存后返回 `{ kind: "card", id }`；不需要数据权限。
- 新增动作 `project.insertDocument`：打开 Tau 的「插入到项目」窗口，由用户选择项目与位置，把 `content` 复制为新的项目文档（可带 `title`），返回 `{ kind: "document", id }`；不需要数据权限。
- 新增动作 `notebook.create`：由用户确认后新建 Notebook，`sources` 作为资料一次性带入（有正文的内容成为笔记资料，划线与 PDF 标注合并、剪藏各一份，其他类型不带入），`from` 记为来源并显示在 Notebook 页顶部；返回 `{ kind: "notebook", id }`。新增导出 `PLUGIN_NOTEBOOK_FROM_KINDS`。
- 新增动作 `chat.start`：在对话页（默认）或右侧停靠栏开一个新对话，`prompt` 预填进输入框，`context`（卡片、文章、项目文档）作为引用插入，由用户发送；用户发出第一条消息后返回 `{ kind: "chat-session", id }`，没发送就离开时返回 `null`。新增导出 `PLUGIN_CHAT_CONTEXT_KINDS`。
- `context.app.open(ref, options?)` 新增打开位置与定位：`placement` 为 `page`（默认）、`window`（独立编辑窗口，卡片、文章、项目文档）或 `dock`（右侧停靠栏，主对话）；`at: { block }` 滚动到正文第几个顶层块（卡片、文章、项目文档、日记、插件内容）。不支持的组合抛错。新增导出类型 `PluginOpenOptions`、`PluginContentLocation`。
- `ContentEditor` 与 `ContentPreview` 新增 `kit`：`full`（默认，与卡片详情相同）或 `compact`（精简套件，不含内容链接、文件附件、白板块、数据库块与文档待办，适合简短内容）。新增导出类型 `ContentEditorKit`。
- 页面的 `pageContext` 新增 `isActive()`（本页是否为当前显示的页面）与 `registerDismiss(dismiss)`（登记自制浮层的关闭函数，用户按 Esc 时先关最后登记的浮层，只在页面显示时生效）。
- 业务事件新增 `whiteboard.*`、`project.*`、`notebook.*`（增删改资料也算 `updated`）、`material.*`（划线、PDF 标注、剪藏）与 `chat.*`（收到新消息也算 `updated`），均带 `id`，分别需要 `whiteboards:read`、`projects:read`、`notebooks:read`、`materials:read`、`chats:read`。
- 新增本插件内容的事件 `entity.created`、`entity.updated`（含正文修改）、`entity.deleted`：只发给创建它的插件，不需要权限，事件带 `kind`（内容类型）。`PluginDomainEvent` 新增可选字段 `kind`。
- `entities.registerKind` 新增 `indexes`：声明可用于查询的 `meta` 字段及类型（`string`、`number`、`boolean`），写入时这些字段的值须为声明的类型或 `null`。
- `entities.query` 新增 `where`（等于、不等于、`in`、大小比较，`null` 表示没有值）、`titleContains` 与 `orderBy`（最多两项，可用 `createdAt`、`updatedAt`、`title` 或声明的字段）；新增 `entities.count`。游标改为不透明字符串，只适用于同一组条件与排序。新增导出类型 `PluginWhere`、`PluginFieldCondition`、`PluginOrderBy`、`PluginIndexes` 等。
- 修复：`entities.query()` 不带参数时报「没有要修改的字段」。
- 新增 `context.records`：插件内部的结构化数据，按集合保存 JSON（`registerCollection({ name, indexes })`、`insert`、`get`、`query`、`count`、`update`、`delete`），筛选与排序写法与 `entities.query` 相同；不需要权限，删除不进「最近删除」，卸载后与插件内容一样保留 7 天。新增事件 `record.created / updated / deleted`（带 `collection`，只发给本插件），`PluginDomainEvent` 新增可选字段 `collection`。
- 修复：插件经 `context.entities` 写入引起的 `entity.*` 事件，`origin` 现在为本插件，可以据此忽略自己写入引起的事件。
- 新增 `context.links`：从本插件的内容指向任意引用的有序关联（`add`、`list`、`remove`、`reorder`），带 `role` 与少量 `data`，显示在目标的脉络里。目标须是插件能看到的内容（与 `describe` 相同），删除插件内容时关联随之进入「最近删除」，关联变化发来源内容的 `entity.updated`。
- `app.run` 新建类动作（`card.create`、`project.insertDocument`、`notebook.create`、`chat.start`）的结果与 `pick` 选中的内容一样，之后不需要读取权限就能读标题、显示与关联。
- 被插件内容关联的卡片、文章、项目文档在脉络的「被关联」里列出这些内容，按插件声明的类型名与图标显示，插件停用后照样显示；手机上的脉络也会列出（只显示）。
- 新增 `context.transaction(async tx => …)`：回调里对本插件内容、记录与关联的写入在回调结束后一次提交，任何一条失败全部不生效。`tx.entities.create` 与 `tx.records.insert` 立即返回 ID，可在同一事务里使用；修改与删除的 `expectedRevision` 可省略（省略即无条件写入）。最多 500 条写入。
- `sidebar.registerItem` 改为返回句柄，新增 `update({ badge, children, action })`：条目右侧的角标、条目下方的子项（色点、计数、右键菜单、接收拖放）与子项末尾的一行动作（如「新建分组」）。子项在条目的页面显示时展开，点击以子项的 `params` 打开页面。新增 `sidebar.dragType(type)` 生成本插件的拖拽类型，子项只接收本插件拖出的数据。新增导出类型 `PluginSidebarItemHandle`、`PluginSidebarChild`、`PluginSidebarItemUpdate` 等。
- 新增 `context.home.registerPanel({ id, title, component, size })`：在首页放一块面板，Tau 画外框与标题，组件只渲染正文（返回 `null` 时整块不显示）。`size` 为 `wide`（默认，占整行）或 `compact`（宽度足够时并排）。新面板排在末尾，用户可在首页的编辑模式里拖动调整位置或隐藏；插件停用后消失，重新启用回到原位置。新增导出类型 `PluginHomePanelDefinition`、`PluginHomePanelProps`。
- 新增 `context.actions.register({ id, title, icon, targets, run })`：在卡片、文章、项目文档的「⋯」菜单里加一项，排在 Tau 自己的菜单项之后、删除之前；用户点击时 `run` 收到对象的引用，这个对象之后与 `pick` 选中的一样不需要读取权限就能显示与关联。只在主窗口出现。新增导出 `PLUGIN_ACTION_TARGET_KINDS` 与类型 `PluginActionDefinition`、`PluginActionTarget`。
- 对象动作新增目标 `material`（PDF 标注的工具条与标注列表、网页剪藏的「⋯」菜单）与 `chat-message`（对话消息动作行末尾的「⋯」，收到所在会话、消息记录 ID、角色与正文，会话登记为选择过的引用）。`run` 的参数随 `targets` 收窄。新增导出类型 `PluginActionTargetOf`、`PluginActionEntityTarget`、`PluginChatMessageTarget`。
- 对象动作新增目标 `text`：用户在命令面板输入文字后，「记录」组末尾出现「动作标题：输入的文字」，回车时 `run` 收到 `{ kind: "text", text }`。新增导出类型 `PluginTextTarget`。
- `context.materials.actions` 不再包含「转为问题」，只有 Tau 自己的动作，也不包含其他插件注册的对象动作。
- 新增 `context.views.registerEntityPanel({ id, kinds, component })`：在卡片、文章、项目文档详情的正文上方放一小块内容，组件收到 `context` 与对象引用 `target`，返回 `null` 时不占位；读内容仍按权限。新增导出 `PLUGIN_ENTITY_PANEL_KINDS` 与类型 `PluginEntityPanelDefinition`、`PluginEntityPanelProps`、`PluginEntityPanelTarget`。

- 编辑器扩展只接受文档列出的字段，带其他字段（例如 `marks`、`decorations`）的扩展会在加载或注册时报错，不再被悄悄使用。

## 0.33.0

- 新增媒体组件 `MediaImage`、`MediaVideo`、`MediaAudio`：节点里的本地路径、远程地址和共享文档资源按 Tau 自带图片、视频、音频块的方式解析和缓存。
- 新增 `useResource(url, { kind })`，自己绘制媒体时取得可加载的地址；`useResourceUpload()` 把文件存进用户当前的资源存储并返回地址，只读编辑器与博客中为 `undefined`。
- 新增 `useMediaAppearance()`，读取用户设置（博客中为发布设置）的媒体默认圆角与阴影。
- 新增 `useElement(element)`：读写当前节点（`readOnly`、`update`、`remove`），外框里的块还能取得 `selected`、`select()`、`openMenu(position)`。`useInlineSource` 建在它之上。
- 节点声明新增 `frame`：void 块的公共外框，提供点选描边、右键菜单、选中时删除与声明的按键命令、末尾「添加段落」；声明后 `render` 只渲染内容。
- 新增块属性条 `BlockToolbar`、`BlockToolbarButton`、`BlockToolbarGap`，外观与自带图片块一致。
- 新增 `useMediaViewer(element)`，打开文档图片查看器并定位到该节点的第几张图。
- `@tau/ui` 新增 `Sortable`，用指针事件拖动排序，手柄支持方向键。
- 节点声明新增 `resources`：写明节点里哪些字段是图片、视频、音频或文件。导出打包、共享给协作者时上传本地文件、灯箱与 EPUB 取图都只按这份声明找资源；声明随笔记库保存。

## 0.32.0

- 插件 Skill 改为包内目录：在插件项目根目录放 `skills/<id>/SKILL.md`，可附带参考资料和脚本，构建时打进插件包并写入 manifest 的 `skills` 与文件摘要。名称、描述与调用方式取自 SKILL.md 的 front matter。
- `definePlugin` 的 `skills` 字段与 `PluginSkill` 类型已移除，已有插件请把正文移到 `skills/<id>/SKILL.md` 后重新构建。
- 新增独立 Skill 包：manifest 不写 `main`、只声明 `skills`，经插件中心分发，安装后在 Skill 页直接可用。
- 带脚本的 Skill 与本机后台一样需要插件中心人工审核后才能上架。
- 插件分类新增 `skill`。

## 0.31.1

- 修复：数据客户端读取 0.31.0 生成的站点清单时报「站点数据缺失」。客户端改为校验 `site.fields`，不再要求已移除的 `site.description`。

## 0.31.0

- 模板 manifest 新增 `template.siteFields`：声明模板需要的站点字段（文本、多行、链接、下拉、开关），用户在发布页「站点设置」中填写，宿主校验后按声明渲染。
- 发布数据的 `site.fields` 提供这些字段的取值；`site.description` 与首页的 `hero` 已移除，需要站点描述的模板请声明同名字段并自行渲染介绍区。
- 字段声明格式与取值规则见 PUBLISH-DATA.md「数据分布」：只输出已声明的键，未填写或类型不符时取 `default`。

## 0.29.0

- 页面组件新增 `pageContext.register(provider)`：通过现有 `get_current_context` 向 AI 提供当前页面状态，返回任意有限 JSON，业务内容与形状完全由作者决定。
- 只读取当前页面实例，支持状态更新、保活恢复和注销；停用、卸载及切库时自动清理，提供器异常不影响其他上下文。
- 页面操作继续由作者通过已有 MCP 注册能力提供，通知等已发布能力保持可用。

## 0.28.0

- 新增 `context.notifications.send`：发送应用内通知、独立窗口通知，或默认按来源窗口焦点自动分流。
- 支持标题、正文、语义、常驻与最多两个操作按钮；来源显示插件名称。
- 返回 `Disposable` 撤销单条通知，停用、激活失败及切库时自动回收，旧按钮回调失效。

## 0.27.0

- 新增通用 `context.ai.requestCapability(name)`，开放应用全部 12 项大模型功能分配。每项声明 `ai:<能力名>` 并由用户独立授权，返回 `chat/stream` 客户端，不需要另配模型或声明自定义 AI 功能。
- 闪卡 AI 制作使用此通用入口，权限为 `ai:flashcardGeneration`；不再要求传入 `feature`。支持在 user 消息中附带图片，图片不进入用量审计。
- 宿主模型仍经插件额度、并发限制与用量审计执行；撤销闪卡 AI 权限会取消在途请求，应用未配模型或分配变化时明确失败。
- 插件自定义 AI 的原有声明、授权与模型分配保持独立；闪卡读写权限和 `contentRef` 来源校验沿用 0.26.0。

## 0.26.0

- 新增 `context.flashcards`：查询与创建卡组、创建闪卡、宿主制卡窗口、AI 草稿与自动保存；直接读写经 `flashcards:read/write` 授权。
- 插件 AI 制卡使用声明的 AI 功能及用户分配的模型，受插件授权、额度与用量审计约束。宿主制卡窗口要求用户操作，保存由用户确认。
- 现有正文引用使用不透明 `contentRef`，校验正文身份及读取权限；停用、切库取消在途任务，自动保存保留已提交结果。

## 0.25.0

- 新增独立本机后台：格式 2 插件声明 `backend`，通过 `@tau/plugins/backend` 的 `defineBackend` 注册方法，界面经 `context.backend.call/subscribe` 调用与订阅。支持按需或随作用域启动、取消、受监督的外部工具与本机执行授权；构建脚本生成双入口及完整性摘要，详见 BACKEND.md。普通插件继续使用格式 1。
- 新增业务数据只读接口：`context.data` 读取卡片、文章、项目文档、待办与日程，`context.content.read` 按 `contentRef` 读取正文（Markdown 或编辑器节点）。查询按时间范围、标签筛选并分页。
- 新增权限：manifest `permissions` 声明可申请的上限（`cards:read`、`articles:read`、`documents:read`、`todos:read`、`calendar:read`），首次调用时由用户选择「仅这次」「始终允许」或「拒绝」。未获准时抛出 `PluginPermissionError`；`context.permissions` 可查询状态与一次申请多项。
- 新增 `context.events.on`：卡片、文章、项目文档的创建 / 更新 / 删除，待办与日程的集合级变化，以及同步下载后的 `workspace.reset`。事件不携带数据，需要对应读取权限才会送达。
- 新增写入：卡片与文章的新建、修改、删除，项目文档的标题与标签，待办与日程的新建、修改、完成、删除；`context.content.edit` 追加、插入或替换正文。修改与删除需传入读取时的 `revision`，数据已被别处修改时抛出 `PluginConflictError`。插件删除的内容用户可在 7 天内恢复。
- 权限词表增加 `*:write` 与 `*:delete`；事件增加 `origin`，可识别由插件写入的变化。
- 新增 `context.app.pick` 与 `context.app.open`：用 Tau 的搜索窗口让用户选择卡片、文章、项目文档、日记、白板、待办或日程，并打开它们的页面。用户亲手选择即可引用，不需要数据权限；只能在用户操作后调用。
- 新增正文组件 `ContentEditor` 与 `ContentPreview`：在插件页面嵌入与卡片详情相同的编辑器（协作、已安装的编辑器扩展、文档待办都生效），或只读显示正文开头几块。按所属内容的读取 / 写入权限放行，未授权时由用户点击「允许访问」后再询问。
- 新增 `context.app.run`：把卡片、文章、项目文档的正文交给 Tau 导出（Markdown、图片、PDF、EPUB）、全屏演示或发起协作共享，界面与卡片详情中的相同。只能在用户操作后调用，不需要数据权限。
- 新增 `context.entities`：插件创建自己的内容（如周记），每项带一份正文，用 `ContentEditor` 编辑或 `context.content` 读写，不需要业务数据权限。卸载插件后内容保留 7 天，期间重新安装可找回。插件内容可被全局搜索与 AI 检索找到，点击结果按 `registerKind` 声明的 `open` 打开插件页面；`ContentEditor` 增加 `at`，打开到命中处。声明 `mentionable` 的类型可在正文中用 @ 引用；`context.entities.backlinks` 列出引用了它的卡片、文章与项目文档（只含已获准读取的类型）。
- `context.entities.registerKind` 增加 `icon`，与侧边栏图标同一写法；新增 `PluginIcon` / `PluginIconProps`，`PluginSidebarIcon` / `PluginSidebarIconProps` 保留为同义名。插件内容在搜索、@ 面板、正文中的引用、脉络与漫步里按声明的类型名与图标显示，插件停用或卸载后的 7 天内同样如此。
- 新增 `context.entities.delete`：删除插件自己的内容及正文，用户可在插件详情页 7 天内恢复，恢复后 ID 与正文不变。
- `context.storage` 的数据改为保存在笔记库里，随云同步；升级后首次启动自动迁移本机已有的数据，单个值不超过 1 MB。
- 权限约束的是 SDK 接口；插件仍与应用运行在同一环境，不提供安全隔离。

## 0.24.0

- 移除 `PluginServices.typst`：宿主不再内置 Typst 编译服务（原生二进制约 37 MB/平台随之从安装包移除）。Typst 排版由 `tau.typst` 插件 v0.2.0 以 WebAssembly 引擎在渲染进程本地完成，首次使用联网下载编译组件与字体并长期缓存。
- 旧版 `tau.typst` 插件（0.1.x）在新宿主上不再能实时编译，已保存的排版缓存与源码照常显示。

## 0.23.1

- 修正 FFprobe 升级说明中已删除类型的名称为 `MediaInfo`，接口与 0.23.0 相同。

## 0.23.0

- 移除 `PluginServices.ffmpeg.probe` 及其媒体信息类型，宿主不再随包分发 FFprobe；`ffmpeg.run` 保留。
- 视频页面标题、时长和格式查询继续使用 `services.videoExtractor.probe`，该接口由宿主视频解析器提供，不是本地媒体探测接口的替代品。
- 作者模板升级到本版 SDK，补齐博客发布、独立站点数据接入与升级说明，并修正服务文档中的已移除接口。

## 0.22.0

- 新增 `context.video.register`，接入视频来源（视频网站、自建服务器等）：插件识别链接、解析标题与清晰度，返回播放源描述（单文件、音视频分离或交给宿主解析器），下载、缓存与播放由宿主完成。
- 视频账号与代理配置通过 `settings.register({ target: "video" })` 注册，接收每个插件一份的 `videoConfig`。
- 新增 `services.videoExtractor.probe`，查询视频页面的标题与可下载格式；新增插件分类 `video`（在线视频）。

## 0.21.0

- 新增 context.publish 发布提供方、publishConfig 配置表单和文件式／快照式提交协议，本地导出仍由宿主提供。
- 新增受控 Git 快照发布与缓存目录选择服务，插件不获得任意命令或宿主文件访问。
- 插件分类新增博客发布。

## 0.20.0

- manifest 支持 `categories`（插件中心分类）与 `keywords`（目录搜索），门户上传严格校验，客户端忽略未知值。
- 博客模板包（`template` 分支）同样支持分类与关键词，只含静态站点产物，不能同时声明代码插件入口。
- publish-data：站点级数据（`settings`、`collections`、`cardTagTree`、`projectTrees`）改为只在清单中出现；内容文件新增 `links`，只含本文用到且已发布的站内链接目标。
- publish-client：`readData` 随正文带回清单的 `settings`；检索引擎按索引缓存，不再每次查询重建。

## 0.19.0

- 补齐 publish-data 类型、publish-client 纯数据客户端及 publish-artifacts 协议校验/定义求值入口；数据与产物声明不连带载入 Editor/React/UI 类型。
- 普通 SDK/UI 根入口保持类型与 Tau 注入约定；通用源码组件契约与实现由 Editor 公开入口维护，既有源码宿主适配只负责接线。
- 保留 master 0.18.0 的图片插件及全部已插件化接口。

## 0.18.0

- 新增 `context.images.register`，按账号配置与模型创建图片生成或编辑实例，返回图片字节和实际 MIME。
- 图片配置视图通过 `settings.register({ target: "images" })` 注册，接收当前账号的 `imageConfig`；保存按实例隔离，不使用共享凭据。
- 图片插件在主窗口渲染进程执行，跨窗口调用、上传、取消和停用共用任务生命周期；保留 TTS 与上传等既有接口。

## 0.17.0

- 新增通用行内源码 API：useInlineSource、insertInlineSource 和 InlineSourceBoundary，复用宿主 Slate 实例与浏览器行内边界处理。
- 行内源码更新和删除遵守只读、卸载/停驻、目标替换及编辑器提交守卫；不修改 useSourceBlock、EditorKit 或已有节点格式。
- 保留已有 TTS、上传、聊天、独立服务入口与 TikZ 服务移除边界；客户端版本不变。

## 0.16.0

- 新增独立 `usePluginServices()`，由插件渲染运行时提供已有编译与转换服务；博客及无服务的宿主返回 undefined。
- 服务按当前窗口和工作区绑定取消与失效保护，静态编辑器组件无需调用 activate；原有 context.services 保持不变。
- 不修改 useSourceBlock、EditorKit、文档节点协议或编译接口；保留 TTS、上传、聊天工具展示及 TikZ 服务删除边界。

## 0.15.0

- 新增 `context.chat.registerToolRenderer`，按本插件 MCP ID 与原始工具名异步登记 React 工具渲染器，激活成功后发布，停用、重载或切库时回收。
- 本地工具支持 `{ content, render: { version, data } }`，展示数据沿 pi 会话保存并支持历史回放；保留默认展示、宿主审批及失败/取消语义。
- 渲染器仅匹配绑定工具，组件接收独立执行快照；修复异常订阅中断回收及审批/重试恢复状态的终态收敛。
- 保留 0.13.0 的 TTS、资源上传接口及 0.14.0 移除 TikZ 服务的边界；UI 包无需升级。

## 0.14.0

- 移除 `PluginServices.tikz` 和 `context.services.tikz.compile`。TikZ 编译、字体与文档块由独立插件 tau.tikz 提供，宿主不再保留编译实现或转发入口。
- 插件作者如需 TikZ 绘图，应由自己的插件携带实现；其他宿主编译与转换服务保持不变。
- 保留 0.13.0 的 TTS、资源上传及其生命周期接口。
