import type { AgentEvent, AgentObserver } from "../types";

export class ConsoleAgentObserver implements AgentObserver {
  onEvent(event: AgentEvent): void {
    console.info(
      `[Agent] ${event.type} ${JSON.stringify({
        traceId: event.traceId,
        runId: event.runId,
        turnId: event.turnId,
      })}`,
    );
  }
}
