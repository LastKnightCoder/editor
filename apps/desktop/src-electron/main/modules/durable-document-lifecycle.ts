export interface DocumentDrainScope {
  databaseName?: string;
  windowId?: number;
  reason: "window-close" | "database-change" | "quit";
}
export interface DocumentDrain {
  commit(): void;
  rollback(): void;
}
interface Provider {
  priority?: number;
  has(scope: DocumentDrainScope): boolean;
  prepare(scope: DocumentDrainScope): Promise<DocumentDrain>;
}
const providers = new Set<Provider>();
export function registerDurableDocuments(provider: Provider): () => void {
  providers.add(provider);
  return () => providers.delete(provider);
}
export function hasDurableDocuments(scope: DocumentDrainScope): boolean {
  return [...providers].some(provider => provider.has(scope));
}
export async function prepareDurableDocuments(scope: DocumentDrainScope): Promise<DocumentDrain> {
  const drains: DocumentDrain[] = [];
  try {
    for (const provider of [...providers].sort(
      (left, right) => (left.priority ?? 0) - (right.priority ?? 0)
    ))
      drains.push(await provider.prepare(scope));
  } catch (error) {
    drains.reverse().forEach(drain => drain.rollback());
    throw error;
  }
  return {
    commit: () => drains.forEach(drain => drain.commit()),
    rollback: () => drains.reverse().forEach(drain => drain.rollback()),
  };
}
export async function withDurableDocuments<T>(
  scope: DocumentDrainScope,
  action: () => Promise<T>
): Promise<T> {
  const drain = await prepareDurableDocuments(scope);
  try {
    const result = await action();
    drain.commit();
    return result;
  } catch (error) {
    drain.rollback();
    throw error;
  }
}
