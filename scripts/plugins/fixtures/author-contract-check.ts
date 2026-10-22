// 此文件只注入独立作者验证工程，不随公开模板分发。
import {
  ContentEditor,
  ContentPreview,
  EntityRef,
  defineEditorElement,
  EDITOR_NODE_SCHEMA_VERSION,
  PLUGIN_NOTEBOOK_FROM_KINDS,
  PLUGIN_CHAT_CONTEXT_KINDS,
  type EditorElementRenderProps,
  type PluginOpenOptions,
  type ContentEditorKit,
} from "@tau/plugins";
import { createElement } from "react";
import type {
  PluginContext,
  PluginExcerptItem,
  PluginExcerptSource,
  PluginOwnEntityQuery,
  PluginPageContext,
  PluginLink,
  PluginPageProps,
  PluginRecord,
  PluginSidebarChild,
  PluginHomePanelProps,
  PluginActionTargetOf,
  PluginEntityPanelProps,
  PluginSidebarItemHandle,
} from "@tau/plugins";

export function checkPageContextContract({ pageContext }: PluginPageProps) {
  const api: PluginPageContext = pageContext;
  const structured = api.register(() => ({ custom: ["任意字段", 42, true] }));
  void structured.dispose();
  const text = api.register(() => "任意文本");
  void text.dispose();
  const active: boolean = api.isActive();
  const drawer = api.registerDismiss(() => console.log("关闭抽屉", active));
  void drawer.dispose();
}

export function checkSidebarContract(context: PluginContext) {
  const page = context.pages.register({ id: "groups", title: "分组", component: () => null });
  const item: PluginSidebarItemHandle = context.sidebar.registerItem({
    id: "groups",
    title: "分组",
    page,
  });
  const child: PluginSidebarChild = {
    id: "g1",
    title: "读书",
    params: { group: "g1" },
    tone: "blue",
    count: 3,
    menu: [
      { title: "编辑分组", run: () => page.open({ edit: "g1" }) },
      { title: "删除分组", danger: true, run: async () => undefined },
    ],
    onDrop: { type: "question", run: (data: string) => console.log("移动", data) },
  };
  item.update({ badge: 2, children: [child], action: { title: "新建分组", run: () => {} } });
  item.update({ badge: null, action: null });
  const type: string = context.sidebar.dragType("question");
  void type;
  void item.dispose();
}

export function checkHomePanelContract(context: PluginContext) {
  const Week = ({ context: ctx }: PluginHomePanelProps) =>
    ctx.pluginId ? createElement("p", null, "本周阅读") : null;
  const panel = context.home.registerPanel({
    id: "week",
    title: "本周阅读",
    component: Week,
    size: "compact",
  });
  void panel.dispose();
}

export function checkActionsContract(context: PluginContext) {
  const action = context.actions.register({
    id: "to-question",
    title: "转为问题",
    targets: ["card", "article", "document"],
    run: async target => {
      const [info] = await context.app.describe([target]);
      void info;
    },
  });
  void action.dispose();
  const fromMessage = (target: PluginActionTargetOf<"chat-message" | "material">) => {
    if (target.kind === "chat-message") {
      const text: string = target.text;
      void context.app.describe([target.session]).then(() => text);
    } else {
      void context.app.describe([target]);
    }
  };
  context.actions.register({
    id: "from-message",
    title: "记下",
    targets: ["chat-message", "material"],
    run: fromMessage,
  });
  context.actions.register({
    id: "from-text",
    title: "记为问题",
    targets: ["text"],
    run: target => void target.text.trim(),
  });
}

export function checkEntityPanelContract(context: PluginContext) {
  const Related = ({ context: ctx, target }: PluginEntityPanelProps) =>
    target.kind === "document" ? null : createElement("p", null, ctx.pluginId, target.id);
  const panel = context.views.registerEntityPanel({
    id: "related",
    kinds: ["card", "article", "document"],
    component: Related,
  });
  void panel.dispose();
}

export function checkNotificationsContract(context: PluginContext) {
  return context.notifications.send({
    title: "任务完成",
    mode: "auto",
    actions: [{ label: "查看", onClick: () => undefined }],
  });
}

export function checkTTSContract(context: PluginContext) {
  const handle = context.tts.register({
    id: context.pluginId,
    name: "语音",
    create: () => ({
      getVoices: async () => [],
      synthesize: async () => ({ audio: new Uint8Array(), mime: "audio/wav" }),
    }),
  });
  void context.upload.uploadRemote(
    { name: "voice.wav", mimeType: "audio/wav", content: new Uint8Array() },
    { signal: context.signal }
  );
  return handle;
}

export async function checkChatContract(context: PluginContext) {
  context.mcp.register({
    id: "chat",
    name: "展示数据",
    tools: [
      {
        name: "query",
        description: "查询",
        inputSchema: { type: "object" },
        execute: () => ({ content: "文本", render: { version: 1, data: { count: 1 } } }),
      },
    ],
  });
  const handle = await context.chat.registerToolRenderer({
    mcpId: "chat",
    toolName: "query",
    component: props => (props.dataVersion === 1 ? props.execution.output : props.renderDefault()),
  });
  await handle.dispose();
}

export async function checkServices(context: PluginContext) {
  const { nodes } = await context.services.markdown.deserialize("# 标题");
  await context.services.markdown.serialize(nodes);
  await context.services.markdown.render("**文字**");
  await context.services.tailwind.compile({ source: '<div class="p-4" />', language: "tsx" });
  const file = { name: "input.wav", data: new Blob() };
  await context.services.ffmpeg.run(
    {
      files: [file],
      args: ["-i", "input.wav", "out.wav"],
      outputs: [{ name: "out.wav", mimeType: "audio/wav" }],
    },
    { onProgress: progress => void progress.time }
  );
  await context.services.videoExtractor.probe("https://example.com/video", {
    signal: context.signal,
  });
}

export async function checkDataContract(context: PluginContext) {
  await context.permissions.request(["cards:read", "cards:write"]);
  const cards = await context.data.cards.query({ limit: 10 });
  for (const card of cards.items) {
    await context.data.cards.update(card.id, { pinned: true }, { expectedRevision: card.revision });
  }
  context.register(
    context.events.on(["card.updated", "workspace.reset"], event => {
      if (event.origin.kind === "plugin") void event.origin.pluginId;
    })
  );
  context.register(
    context.events.on(["whiteboard.updated", "material.deleted", "chat.created"], event => {
      void event.id;
    })
  );
  context.register(
    context.events.on("entity.deleted", event => {
      if (event.kind === "note") void event.id;
    })
  );
  const selected = await context.app.pick({
    kinds: ["card", "document", "material", "chat-session", "notebook"],
    multiple: true,
  });
  if (selected[0]) await context.app.open(selected[0].ref);
  for (const state of await context.app.describe(selected.map(item => item.ref))) {
    if (state.status === "ok") void state.title;
    else if (state.status === "denied" && state.permission)
      await context.permissions.request([state.permission]);
  }
  if (selected[0]) createElement(EntityRef, { target: selected[0].ref, openable: false });
  context.register(
    context.entities.registerKind({
      kind: "note",
      label: "笔记",
      open: { page: "note", params: entity => ({ id: entity.id }) },
      mentionable: true,
      indexes: { status: "string", rank: "number" },
    })
  );
  const rankedQuery: PluginOwnEntityQuery = {
    kind: "note",
    where: { status: { ne: "done", in: ["open", null] }, rank: { gte: 1 } },
    titleContains: "示例",
    orderBy: [{ field: "rank", direction: "desc" }, { field: "createdAt" }],
    limit: 20,
  };
  const ranked = await context.entities.query(rankedQuery);
  if (ranked.cursor) await context.entities.query({ ...rankedQuery, cursor: ranked.cursor });
  const total: number = await context.entities.count({ kind: "note", where: { status: null } });
  void total;
  context.register(
    context.records.registerCollection({ name: "groups", indexes: { sortIndex: "number" } })
  );
  const group: PluginRecord = await context.records.insert("groups", {
    title: "读书",
    sortIndex: 1,
  });
  const groups = await context.records.query("groups", {
    where: { sortIndex: { gte: 0 } },
    orderBy: { field: "sortIndex", direction: "desc" },
  });
  await context.records.update(
    "groups",
    group.id,
    { ...group.data, title: "阅读" },
    { expectedRevision: group.revision }
  );
  if (groups.items[0])
    await context.records.delete("groups", groups.items[0].id, {
      expectedRevision: groups.items[0].revision,
    });
  void (await context.records.count("groups"));
  context.register(
    context.events.on("record.deleted", event => {
      if (event.collection === "groups") void event.id;
    })
  );
  const entity = await context.entities.create({
    kind: "note",
    key: "example",
    content: { markdown: "# 示例" },
  });
  const link: PluginLink = await context.links.add(
    entity.id,
    { kind: "card", id: "1" },
    { role: "material", data: { at: 1 } }
  );
  const linked = await context.links.list(entity.id, { role: "material" });
  await context.links.reorder(
    entity.id,
    linked.map(item => item.id)
  );
  await context.links.remove(link.id);
  const committed: { id: string } = await context.transaction(async tx => {
    const question = await tx.entities.create({ kind: "note", key: "tx", title: "事务" });
    await tx.links.add(question.id, { kind: "card", id: "1" }, { role: "material" });
    const event = await tx.records.insert("groups", { title: "轨迹" });
    await tx.records.update("groups", event.id, { title: "改" });
    await tx.entities.update(entity.id, { title: "改" }, { expectedRevision: entity.revision });
    await tx.links.reorder(question.id, [link.id]);
    await tx.links.remove(link.id);
    await tx.records.delete("groups", event.id);
    await tx.entities.delete(question.id);
    return question;
  });
  void committed.id;
  const content = await context.content.read(entity.contentRef, { format: "nodes" });
  if (content?.nodes) {
    const nodeVersion: number | undefined = content.schemaVersion;
    void (nodeVersion === EDITOR_NODE_SCHEMA_VERSION);
    await context.content.edit(
      entity.contentRef,
      { op: "append", content: { nodes: content.nodes } },
      { expectedRevision: content.revision }
    );
  }
  await context.data.cards.create({ content: { copyOf: entity.contentRef }, tags: ["示例"] });
  const board = await context.data.whiteboards.create({ title: "示例", tags: ["示例"] });
  await context.data.whiteboards.update(
    board.id,
    { description: "" },
    { expectedRevision: board.revision }
  );
  const project = await context.data.projects.create({ title: "示例" });
  const projects = await context.data.projects.query({ sort: "created", limit: 1 });
  void (projects.items[0]?.documentCount === project.documentCount);
  await context.app.open({ kind: "whiteboard", id: board.id });
  const tree = await context.data.projects.tree(project.id);
  const doc = await context.data.documents.create({
    projectId: project.id,
    ...(tree?.[0] ? { parentId: tree[0].documentId } : {}),
    title: "示例",
    content: { markdown: "正文" },
  });
  const { revision } = await context.data.documents.move(
    doc.id,
    { projectId: project.id, from: tree?.[0]?.documentId ?? null, to: null, index: 0 },
    { expectedRevision: doc.revision }
  );
  await context.data.documents.delete(doc.id, { expectedRevision: revision });
  await context.data.projects.delete(project.id, { expectedRevision: project.revision });
  await context.data.whiteboards.delete(board.id, { expectedRevision: board.revision });
  const notebooks = await context.data.notebooks.query({ sort: "created", limit: 1 });
  const resources = notebooks.items[0]
    ? await context.data.notebooks.resources(notebooks.items[0].id)
    : null;
  const fromRefs = resources?.flatMap(resource => resource.from ?? []) ?? [];
  await context.app.describe(fromRefs);
  const material = await context.data.materials.get("excerpt:1");
  if (material) console.log(material.kind, material.quote, material.source, material.url);
  const chats = await context.data.chats.query({ updatedAfter: 0 });
  for (const chat of chats.items) console.log(chat.scene, chat.messageCount);
  createElement(ContentEditor, { contentRef: entity.contentRef, at: "example" });
  createElement(ContentPreview, { contentRef: entity.contentRef, maxBlocks: 2 });
  const compact: ContentEditorKit = "compact";
  createElement(ContentEditor, { contentRef: entity.contentRef, kit: compact });
  createElement(ContentPreview, { contentRef: entity.contentRef, kit: compact });
  await context.app.run("content.export", { ref: entity.contentRef, format: "markdown" });
  const created = await context.app.run("card.create", {
    content: { copyOf: entity.contentRef },
    tags: ["示例"],
  });
  if (created) await context.app.open(created);
  const inserted = await context.app.run("project.insertDocument", {
    content: { copyOf: entity.contentRef },
    title: entity.title,
  });
  if (inserted?.kind === "document") await context.app.describe([inserted]);
  const notebook = await context.app.run("notebook.create", {
    title: entity.title,
    sources: [{ kind: "plugin-entity", id: entity.id }],
    from: { kind: "plugin-entity", id: entity.id },
  });
  if (notebook) await context.data.notebooks.resources(notebook.id);
  if (PLUGIN_NOTEBOOK_FROM_KINDS.includes("card")) console.log("card 可作为来源");
  const chat = await context.app.run("chat.start", {
    prompt: `围绕「${entity.title}」聊聊`,
    context: cards.items.slice(0, 1).map(card => ({ kind: "card" as const, id: card.id })),
    placement: "dock",
  });
  if (chat && PLUGIN_CHAT_CONTEXT_KINDS.includes("card"))
    await context.app.open(chat, { placement: "dock" });
  const located: PluginOpenOptions = { at: { block: 0 } };
  await context.app.open({ kind: "plugin-entity", id: entity.id }, located);
  await context.entities.backlinks(entity.id);
  await context.entities.delete(entity.id, { expectedRevision: entity.revision });
}

export async function checkFlashcardContract(context: PluginContext) {
  await context.permissions.request([
    "flashcards:read",
    "flashcards:write",
    "ai:flashcardGeneration",
  ]);
  const capability = await context.ai.requestCapability("flashcardGeneration");
  await capability.chat({ messages: [{ role: "user", content: "生成一道练习题" }] });
  const deck = await context.flashcards.createDeck({ name: "学习" });
  const drafts = await context.flashcards.generate({ content: "资料" });
  if (drafts[0]) await context.flashcards.createCard({ ...drafts[0], deckId: deck.id });
  await context.flashcards.openCreate({ mode: "ai", content: "资料" });
  const own = await context.entities.create({ kind: "note", key: "flashcard-source" });
  await context.flashcards.generateAndSave({
    deckId: deck.id,
    content: "资料",
    references: [{ refType: "content", contentRef: own.contentRef, title: own.title }],
  });
}

export async function checkHostAICapabilities(context: PluginContext, imageBase64: string) {
  const model = await context.ai.requestCapability("vibeLearningImageDescription");
  for await (const event of model.stream({
    messages: [
      {
        role: "user",
        content: "描述这张图片",
        images: [{ data: imageBase64, mimeType: "image/png" }],
      },
    ],
    signal: context.signal,
  })) {
    if (event.type === "done") return event.result.text;
  }
}

export async function checkExcerptContract(context: PluginContext) {
  const source: PluginExcerptSource = { key: "book-1", title: "示例书籍" };
  const item: PluginExcerptItem = { externalId: "book-1:note-1", quote: "示例划线" };
  const registration = context.excerpts.register({ label: "示例阅读" });
  await context.excerpts.replace(source, [item]);
  await context.excerpts.patch(source, { upsert: [item] });
  await context.excerpts.sources();
  for (const entry of await context.excerpts.items(source.key)) {
    for (const action of await context.materials.actions(entry.ref)) await action.run();
  }
  registration.dispose();
}

declare module "@tau/plugins" {
  interface EditorElementMap {
    "example.external-counter.note": {
      type: "example.external-counter.note";
      children: { text: string }[];
    };
  }
}

defineEditorElement({
  type: "example.external-counter.note",
  kind: "block",
  render: (props: EditorElementRenderProps) => props.children,
});

// @ts-expect-error 宿主入口不对独立作者开放。
import type { PluginHost } from "@tau/plugins/host";
// @ts-expect-error 内部编辑器包不成为作者依赖。
import type { EditorKit } from "@tau/editor";
type Forbidden = PluginHost | EditorKit;
export type { Forbidden };
