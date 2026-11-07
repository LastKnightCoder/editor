import type { MemoryDebugEvent, MemoryDebugSnapshot } from "@/types/assistant-memory-debug";

export interface MemoryDebugStamp {
  revision: number;
  contentRevision: number;
  events: MemoryDebugEvent[];
}
interface Subscriber {
  active: () => boolean;
  send: (snapshot: MemoryDebugSnapshot | null) => void;
  dispose: () => void;
}

export class MemoryDebugPublisher {
  private subscribers = new Map<string, Subscriber>();
  private revision = 0;
  private contentRevision = 0;
  private events: MemoryDebugEvent[] = [];
  private timer?: ReturnType<typeof setTimeout>;
  private closed = false;

  constructor(private readonly read: (stamp: MemoryDebugStamp) => MemoryDebugSnapshot) {}

  snapshot() {
    if (this.closed) throw new Error("记忆调试连接已关闭");
    return this.read({
      revision: this.revision,
      contentRevision: this.contentRevision,
      events: [...this.events],
    });
  }

  subscribe(key: string, subscriber: Subscriber) {
    this.unsubscribe(key);
    if (this.closed || !subscriber.active()) {
      subscriber.dispose();
      return false;
    }
    this.subscribers.set(key, subscriber);
    try {
      subscriber.send(this.snapshot());
      return true;
    } catch {
      this.unsubscribe(key);
      return false;
    }
  }

  unsubscribe(key: string) {
    const subscriber = this.subscribers.get(key);
    if (!subscriber) return;
    this.subscribers.delete(key);
    subscriber.dispose();
    if (!this.subscribers.size && this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  changed(contentChanged = false, event?: MemoryDebugEvent) {
    if (this.closed) return;
    this.revision++;
    if (contentChanged) this.contentRevision++;
    if (event) this.events = [event, ...this.events].slice(0, 60);
    if (!this.subscribers.size || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.flush();
    }, 100);
    this.timer.unref?.();
  }

  private flush() {
    for (const [key, subscriber] of this.subscribers) {
      try {
        if (!subscriber.active()) {
          subscriber.send(null);
          this.unsubscribe(key);
        }
      } catch {
        this.unsubscribe(key);
      }
    }
    if (!this.subscribers.size) return;
    let snapshot: MemoryDebugSnapshot;
    try {
      snapshot = this.snapshot();
    } catch {
      this.close();
      return;
    }
    for (const [key, subscriber] of this.subscribers) {
      try {
        subscriber.send(snapshot);
      } catch {
        this.unsubscribe(key);
      }
    }
  }

  close() {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    for (const [key, subscriber] of this.subscribers) {
      try {
        subscriber.send(null);
      } catch {
        /* 窗口销毁时不阻断其余订阅清理。 */
      }
      this.unsubscribe(key);
    }
  }
}
