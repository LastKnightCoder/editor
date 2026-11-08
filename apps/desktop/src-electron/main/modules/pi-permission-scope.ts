/** 父子会话共享授权；单次审批仍由各自会话持有。 */
export class PiPermissionScope {
  private readonly allowed = new Set<string>();
  private readonly listeners = new Set<() => void>();

  has(identity: string): boolean {
    return this.allowed.has(identity);
  }

  allow(identity: string): void {
    this.allowed.add(identity);
    for (const listener of [...this.listeners]) listener();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
