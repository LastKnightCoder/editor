import type { WhiteboardPeer } from "@tau/collaboration";
import { readWhiteboardPresence } from "@tau/collaboration";
import { agentIdentity } from "@/services/agent-identity";
import type { BoardAgentActivity } from "../../../../shared/whiteboard-agent";
import { onAgentRunEnded } from "../agent-run-events";

interface Participant {
  key: string;
  owner: string;
  lease: string;
  scope: string;
  peer: WhiteboardPeer;
  timer: ReturnType<typeof setTimeout>;
}

/** 本机 Agent 在场按白板代次分发；设备的共享连接只承载人类在线状态。 */
export class WhiteboardAgentPresence {
  private participants = new Map<string, Participant>();
  private nextClient = -1;
  private sequence = 0;
  private stop = onAgentRunEnded(scope => {
    for (const entry of this.participants.values())
      if (
        entry.owner === scope ||
        (scope.startsWith("subagent:") && entry.owner.endsWith(":" + scope))
      )
        this.remove(entry);
  });
  constructor(private changed: (scope: string) => void) {}
  snapshot(scope: string) {
    return {
      sequence: this.sequence,
      peers: [...this.participants.values()].filter(p => p.scope === scope).map(p => p.peer),
    };
  }
  set(scope: string, lease: string, activity: BoardAgentActivity) {
    const { owner, name } = activity;
    if (typeof owner !== "string" || !owner || owner.length > 512 || typeof name !== "string")
      throw new Error("白板协作者身份无效");
    const value = readWhiteboardPresence(activity.presence);
    if (!value) throw new Error("白板协作者位置无效");
    const agent = agentIdentity(name),
      key = JSON.stringify([scope, owner, agent.id]);
    const previous = this.participants.get(key);
    if (previous) clearTimeout(previous.timer);
    const peer = {
      ...value,
      clientId: previous?.peer.clientId ?? this.nextClient--,
      userId: agent.id,
      name: agent.name,
    };
    const entry: Participant = {
      key,
      owner,
      lease,
      scope,
      peer,
      timer: setTimeout(() => this.remove(entry), 600000),
    };
    entry.timer.unref();
    this.participants.set(key, entry);
    this.sequence++;
    this.changed(scope);
  }
  release(lease: string) {
    for (const entry of this.participants.values()) if (entry.lease === lease) this.remove(entry);
  }
  private remove(entry: Participant) {
    clearTimeout(entry.timer);
    if (this.participants.get(entry.key) !== entry) return;
    this.participants.delete(entry.key);
    this.sequence++;
    this.changed(entry.scope);
  }
  dispose() {
    this.stop();
    for (const p of this.participants.values()) clearTimeout(p.timer);
    this.participants.clear();
  }
}
