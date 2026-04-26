import type {
  AgentModelAdapter,
  AgentModelProtocolAdapter,
  AgentModelTransport,
} from "../types";

export const composeAgentModel = (options: {
  protocol: AgentModelProtocolAdapter;
  transport: AgentModelTransport;
}): AgentModelAdapter => ({
  async *streamTurn(request) {
    const preparedTurn = await options.protocol.prepareTurn(request);
    yield* options.transport.streamPreparedTurn(preparedTurn);
  },
});
