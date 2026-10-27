export class PresenceScheduler {
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private closed = false;

  constructor(
    private publish: (documentId: string) => void,
    private interval = 250
  ) {}

  schedule(documentId: string) {
    if (this.closed || this.timers.has(documentId)) return;
    const timer = setTimeout(() => {
      this.timers.delete(documentId);
      this.publish(documentId);
    }, this.interval);
    timer.unref();
    this.timers.set(documentId, timer);
  }

  close() {
    this.closed = true;
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }
}
