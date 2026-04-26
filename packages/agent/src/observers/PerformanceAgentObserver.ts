import type { AgentEvent, AgentObserver } from "../types";

export class PerformanceAgentObserver implements AgentObserver {
  private readonly startTimes = new Map<string, number>();

  onEvent(event: AgentEvent): void {
    if (event.type === "run-start") {
      this.startTimes.set(event.runId, event.timestamp);
      return;
    }

    if (event.type === "run-finished" || event.type === "run-error") {
      const start = this.startTimes.get(event.runId);
      if (typeof start === "number") {
        console.info(
          `[AgentPerformance] run ${event.runId} ${event.timestamp - start}ms`,
        );
        this.startTimes.delete(event.runId);
      }
    }
  }
}
