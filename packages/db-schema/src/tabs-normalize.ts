/** 编辑器节点的最小结构（与 @tau/collaboration 的 ContentNode 同形） */
interface ContentNode {
  type?: string;
  text?: string;
  children?: ContentNode[];
  [key: string]: unknown;
}

const emptyParagraph = (): ContentNode => ({
  type: "paragraph",
  children: [{ type: "formatted", text: "" }],
});

// 旧协作形态中 Yjs 树的占位 children（单个空 formatted），不代表真实内容
const isPlaceholderChildren = (children: ContentNode[] | undefined): boolean =>
  Array.isArray(children) &&
  children.length === 1 &&
  children[0].type === "formatted" &&
  children[0].text === "";

const isEmptyParagraph = (node: ContentNode): boolean =>
  node.type === "paragraph" &&
  Array.isArray(node.children) &&
  node.children.length === 1 &&
  node.children[0].type === "formatted" &&
  node.children[0].text === "";

/**
 * children 是否承载实质内容（排除占位与空段落）。
 * 其它版本的代码（如未含本次改造的分支）可能写入空壳形态，
 * 涉及"覆盖快照 / 追加 Tab / 选择权威数据"的决策必须以本判定为门槛。
 */
export const hasSubstantialContent = (children: ContentNode[] | undefined): boolean => {
  if (!children || children.length === 0) return false;
  if (children.length === 1 && (isEmptyParagraph(children[0]) || isPlaceholderChildren(children)))
    return false;
  return true;
};

const isTabPane = (node: ContentNode): boolean => node.type === "tab-pane";

interface LegacyTab {
  key: string;
  title: string;
  content: ContentNode[];
}

export interface TabsNodeMigration {
  node: ContentNode;
  changed: boolean;
  /** tabs 无有效内容时退化为该节点，由调用方在父层替换 */
  replacedBy?: ContentNode;
}

/**
 * 将单个 tabs 节点迁移为 tab-pane 子节点形态：
 * 旧形态中非激活 Tab 的内容整体存于 tabsContent 属性、激活 Tab 内容在 children（快照可能过期），
 * 迁移后全部内容进 children 的 tab-pane 子节点。幂等：新形态重跑不再变化。
 */
export function migrateTabsNode(input: ContentNode): TabsNodeMigration {
  const children = Array.isArray(input.children) ? input.children : [];
  const panes = children.filter(isTabPane);
  const legacyTabs = Array.isArray(input.tabsContent) ? (input.tabsContent as unknown[]) : null;

  const collectLegacyTabs = (): LegacyTab[] => {
    const tabs: LegacyTab[] = [];
    const seenKeys = new Set<string>();
    if (!legacyTabs) return tabs;
    for (const entry of legacyTabs) {
      if (!entry || typeof entry !== "object") continue;
      const tab = entry as Record<string, unknown>;
      let key = typeof tab.key === "string" && !seenKeys.has(tab.key) ? tab.key : "";
      if (!key) key = crypto.randomUUID();
      seenKeys.add(key);
      tabs.push({
        key,
        title: typeof tab.title === "string" ? tab.title : `标签 ${tabs.length + 1}`,
        content: Array.isArray(tab.content) ? (tab.content as ContentNode[]) : [emptyParagraph()],
      });
    }
    return tabs;
  };

  if (panes.length > 0) {
    // 已是新形态：树内 pane 为权威数据，仅清理 tabsContent 残留与失效 activeKey；
    // 但树内 pane 全是空壳而 tabsContent 残留仍有实质内容（跨版本写入的脏形态）时，
    // 改以 tabsContent 重建，避免空壳吞掉真实内容。
    const tabs = collectLegacyTabs();
    const hollowPanes = panes.every(
      pane => !hasSubstantialContent(Array.isArray(pane.children) ? pane.children : [])
    );
    const legacyHasContent = tabs.some(tab => hasSubstantialContent(tab.content));
    if (!hollowPanes || !legacyHasContent) {
      const activeKey = typeof input.activeKey === "string" ? input.activeKey : "";
      const activeKeyValid = panes.some(pane => pane.tabKey === activeKey);
      if (!legacyTabs && activeKeyValid) return { node: input, changed: false };
      return {
        node: {
          ...input,
          activeKey: activeKeyValid ? activeKey : String(panes[0].tabKey),
          tabsContent: undefined,
        },
        changed: true,
      };
    }
    // 空壳 pane 让位于 tabsContent：删掉空壳，按 legacy 重建
    return rebuildFromLegacy(input, tabs, []);
  }

  return rebuildFromLegacy(input, collectLegacyTabs(), children);
}

const rebuildFromLegacy = (
  input: ContentNode,
  tabs: LegacyTab[],
  children: ContentNode[]
): TabsNodeMigration => {
  // children 是激活 Tab 的实时内容，仅在有实质内容时才可信：
  // 空段落/占位可能是其它版本吞掉内容后的残留，不能用它覆盖快照或追加空 Tab
  const activeKey = typeof input.activeKey === "string" ? input.activeKey : "";
  const activeContent =
    children.length > 0 &&
    children.every(node => !isTabPane(node)) &&
    hasSubstantialContent(children)
      ? children
      : null;
  const activeTab = tabs.find(tab => tab.key === activeKey);
  if (activeTab && activeContent) {
    activeTab.content = activeContent;
  } else if (!activeTab && activeContent) {
    // 对齐旧组件 syncCurrentTabContent：激活 Tab 元数据丢失时把内容补成新 Tab
    tabs.push({ key: activeKey || crypto.randomUUID(), title: "New Tab", content: activeContent });
  }

  if (tabs.length === 0) {
    return { node: input, changed: true, replacedBy: emptyParagraph() };
  }

  return {
    node: {
      ...input,
      activeKey: activeTab?.key || tabs[0].key,
      children: tabs.map(tab => ({
        type: "tab-pane",
        tabKey: tab.key,
        title: tab.title,
        children: tab.content,
      })),
      tabsContent: undefined,
    },
    changed: true,
  };
};

/**
 * 将整棵内容树中的 tabs 节点迁移为 tab-pane 形态（含嵌套 tabs），幂等可重跑。
 */
export function migrateTabsToPanes(content: ContentNode[]): {
  content: ContentNode[];
  changed: boolean;
} {
  let changed = false;
  const visit = (nodes: ContentNode[]): ContentNode[] => {
    const next: ContentNode[] = [];
    for (const input of nodes) {
      if (typeof input.text === "string") {
        next.push(input);
        continue;
      }
      let node = input;
      if (input.type === "tabs") {
        const result = migrateTabsNode(input);
        node = result.replacedBy ?? result.node;
        changed = changed || result.changed;
      }
      if (Array.isArray(node.children)) {
        const migratedChildren = visit(node.children);
        if (migratedChildren !== node.children) {
          node = { ...node, children: migratedChildren };
          changed = true;
        }
      }
      next.push(node);
    }
    return nodes.every((node, index) => node === next[index]) ? nodes : next;
  };
  const migrated = visit(content);
  return { content: migrated, changed };
}
