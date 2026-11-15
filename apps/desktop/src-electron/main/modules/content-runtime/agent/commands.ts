import type Database from "better-sqlite3";
import { basename } from "node:path";
import type { ScopedContentSubmission } from "@tau/collaboration";
import type { CommandContext } from "@tau/rpc";
import type { AgentPresenceUpdate } from "@/types/agent-presence";
import type {
  AgentPermissionLevel,
  ContentQuestionRequest,
  ContentSuggestionAcceptOptions,
  ContentSuggestionBatch,
  ContentSuggestionQuery,
} from "@/types/content-suggestion";
import { asynchronousDatabaseCommand } from "../../database-command";
import type { ContentAgent } from ".";

export function createContentAgentCommands(getAgent: () => ContentAgent | Promise<ContentAgent>) {
  const command = <Args extends unknown[], Result>(
    run: (agent: ContentAgent, db: Database.Database, ...args: Args) => Result
  ) =>
    asynchronousDatabaseCommand(async (db: Database.Database, ...args: Args) =>
      run(await getAgent(), db, ...args)
    );

  return {
    "content:edit-snapshot": command((agent, db, id: number) => agent.readEditSnapshot(db, id)),
    "content:apply-scoped-edit": command(
      (agent, db, id: number, request: ScopedContentSubmission) =>
        agent.applyScopedEdit(db, id, request)
    ),
    "content:suggestions": command((agent, db, query: ContentSuggestionQuery) =>
      agent.suggestions.list(db, query)
    ),
    "content:suggestions-create": command((agent, db, id: number, batch: ContentSuggestionBatch) =>
      agent.suggestions.create(db, id, batch)
    ),
    "content:suggestions-accept": command(
      (
        agent,
        db,
        id: number,
        ids: string[],
        options?: ContentSuggestionAcceptOptions | CommandContext
      ) =>
        agent.suggestions.accept(
          db,
          id,
          ids,
          options && typeof options === "object" && !("broadcastOthers" in options)
            ? options
            : undefined
        )
    ),
    "content:suggestions-reject": command(
      (agent, db, id: number, ids: string[], feedback?: string | CommandContext) =>
        agent.suggestions.reject(db, id, ids, typeof feedback === "string" ? feedback : undefined)
    ),
    "content:suggestions-supersede": command((agent, db, id: number, proposalId: string) =>
      agent.suggestions.supersede(db, id, proposalId)
    ),
    "content:suggestions-undo": command((agent, db, id: number, ids: string[]) =>
      agent.suggestions.undo(db, id, ids)
    ),
    "content:suggestions-question": command(
      (agent, db, id: number, request: ContentQuestionRequest) =>
        agent.suggestions.createQuestion(db, id, request)
    ),
    "content:suggestions-answer": command(
      (agent, db, id: number, suggestionId: string, answer: string) =>
        agent.suggestions.answer(db, id, suggestionId, answer)
    ),
    "content:suggestions-follow-up": command((agent, db, request: Record<string, unknown>) =>
      agent.suggestions.followUp(db, request)
    ),
    "content:agent-presence": command((agent, db, id: number, update: AgentPresenceUpdate) =>
      agent.presence.set(basename(db.name, ".db"), id, update)
    ),
    "content:agent-presence-clear": command((agent, db, id: number, name: string) =>
      agent.presence.clear(basename(db.name, ".db"), id, name)
    ),
    "content:agent-permissions": command((agent, db, id: number) => agent.permissions.list(db, id)),
    "content:agent-permission": command((agent, db, id: number, name: string) =>
      agent.permissions.level(db, id, name)
    ),
    "content:agent-permission-set": command(
      (agent, db, id: number, name: string, level: AgentPermissionLevel) =>
        agent.permissions.set(db, id, name, level)
    ),
    "content:agent-presences": command((agent, db, id: number) =>
      agent.presence.list(basename(db.name, ".db"), id)
    ),
  };
}
