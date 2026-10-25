export interface LegacyUpgradeJob {
  key: string;
  run(): Promise<void>;
}
export interface LegacyUpgradeFailure {
  key: string;
  message: string;
}

/** 队列只编排；耐久进度由正文和白板各自的迁移回执负责。 */
export class LegacyContentUpgradeQueue {
  private readonly requested = new Set<string>();
  private running?: Promise<void>;
  private paused = 0;

  constructor(
    private readonly host: {
      jobs(name: string): AsyncIterable<LegacyUpgradeJob>;
      current(name: string): boolean;
      finished(name: string, failures: LegacyUpgradeFailure[]): void;
      yield(): Promise<void>;
    }
  ) {}

  request(name: string): void {
    this.requested.add(name);
    this.start();
  }

  private start() {
    if (this.running || this.paused || !this.requested.size) return;
    this.running = this.run()
      .catch(error => {
        console.error("[legacy-content-upgrade] 后台升级调度未完成，保留原回执等待续做", error);
      })
      .finally(() => {
        this.running = undefined;
        this.start();
      });
  }

  async idle(): Promise<void> {
    while (this.running) await this.running;
  }

  async pause(): Promise<() => void> {
    this.paused++;
    await this.idle();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.paused--;
      queueMicrotask(() => this.start());
    };
  }

  private async run() {
    while (!this.paused && this.requested.size) {
      const name = this.requested.values().next().value;
      if (name === undefined) break;
      this.requested.delete(name);
      const failures: LegacyUpgradeFailure[] = [];
      try {
        for await (const job of this.host.jobs(name)) {
          if (this.paused || !this.host.current(name)) {
            if (this.paused) this.requested.add(name);
            break;
          }
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              await job.run();
              break;
            } catch (error) {
              if (this.paused || !this.host.current(name)) break;
              if (attempt === 2)
                failures.push({
                  key: job.key,
                  message: error instanceof Error ? error.message : "数据升级未完成",
                });
              else await this.host.yield();
            }
          }
          await this.host.yield();
        }
        if (this.paused) this.requested.add(name);
        else if (this.host.current(name)) this.host.finished(name, failures);
      } catch (error) {
        if (!this.paused && this.host.current(name))
          this.host.finished(name, [
            {
              key: "library",
              message: error instanceof Error ? error.message : "资料库升级未完成",
            },
          ]);
      }
    }
  }
}
