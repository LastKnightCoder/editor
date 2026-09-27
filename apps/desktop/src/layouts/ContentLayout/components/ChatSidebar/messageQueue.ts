export class ConversationMessageQueue<T> {
  private readonly queues = new Map<string, T[]>();

  enqueue(conversationKey: string, message: T): number {
    const queue = this.queues.get(conversationKey) || [];
    queue.push(message);
    this.queues.set(conversationKey, queue);
    return queue.length;
  }

  prepend(conversationKey: string, message: T): number {
    const queue = this.queues.get(conversationKey) || [];
    queue.unshift(message);
    this.queues.set(conversationKey, queue);
    return queue.length;
  }

  dequeue(conversationKey: string): T | undefined {
    const queue = this.queues.get(conversationKey);
    const message = queue?.shift();
    if (queue?.length === 0) {
      this.queues.delete(conversationKey);
    }
    return message;
  }

  size(conversationKey: string): number {
    return this.queues.get(conversationKey)?.length || 0;
  }

  list(conversationKey: string): T[] {
    return [...(this.queues.get(conversationKey) ?? [])];
  }

  removeAt(conversationKey: string, index: number): number {
    const queue = this.queues.get(conversationKey);
    if (!queue || index < 0 || index >= queue.length) return queue?.length ?? 0;
    queue.splice(index, 1);
    if (queue.length === 0) this.queues.delete(conversationKey);
    return queue.length;
  }

  replaceAt(conversationKey: string, index: number, message: T): boolean {
    const queue = this.queues.get(conversationKey);
    if (!queue || index < 0 || index >= queue.length) return false;
    queue[index] = message;
    return true;
  }

  move(sourceKey: string, targetKey: string): number {
    if (sourceKey === targetKey) {
      return this.size(targetKey);
    }

    const sourceQueue = this.queues.get(sourceKey);
    if (!sourceQueue || sourceQueue.length === 0) {
      return this.size(targetKey);
    }

    const targetQueue = this.queues.get(targetKey) || [];
    targetQueue.push(...sourceQueue);
    this.queues.set(targetKey, targetQueue);
    this.queues.delete(sourceKey);
    return targetQueue.length;
  }
}
