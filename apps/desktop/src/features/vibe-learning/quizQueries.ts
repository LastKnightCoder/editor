import { useMemo } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import * as quizCommands from "@/commands/vl-quiz";
import useSettingStore from "@/stores/useSettingStore";
import useDatabaseConnected from "@/hooks/useDatabaseConnected";
import { databaseQueryKey } from "@/services/command-context";
import { useDatabaseCommands } from "@/hooks/useDatabaseCommands";
import { on } from "@/electron";
import { queryClient } from "@/queryClient";
import type {
  CreateVLQuizRecordInput,
  UpdateVLQuizItemInput,
  UpdateVLQuizSetInput,
  VLQuizItem,
  VLQuizRecord,
  VLQuizSet,
} from "@/types";

const databaseId = (database: string) => database.replace(/\.db$/, "");
export const quizKeys = {
  root: (database: string) => ["vl-quizzes", databaseId(database)] as const,
  sets: (database: string, projectId: number, connectionId?: string) =>
    databaseQueryKey([...quizKeys.root(database), "sets", projectId] as const, connectionId),
  items: (database: string, quizSetId: number | undefined, connectionId?: string) =>
    databaseQueryKey([...quizKeys.root(database), "items", quizSetId] as const, connectionId),
  records: (database: string, quizSetId: number | undefined, connectionId?: string) =>
    databaseQueryKey([...quizKeys.root(database), "records", quizSetId] as const, connectionId),
  scores: (database: string, projectId: number, connectionId?: string) =>
    databaseQueryKey([...quizKeys.root(database), "scores", projectId] as const, connectionId),
};

export function invalidateQuizzes(client: QueryClient, database: string) {
  return client.invalidateQueries({ queryKey: quizKeys.root(database) });
}

on("vl-quiz:changed", (_event, { databaseName }: { databaseName: string }) => {
  void invalidateQuizzes(queryClient, databaseName);
});

function useQuizCommands() {
  const database = useSettingStore(state => state.setting.database.active);
  const { commands, connectionId } = useDatabaseCommands(quizCommands, database);
  return { database, commands, connectionId };
}

const EMPTY_SETS: VLQuizSet[] = [];
const EMPTY_ITEMS: VLQuizItem[] = [];
const EMPTY_RECORDS: VLQuizRecord[] = [];
const EMPTY_SCORES: Record<number, number> = {};

export function useQuizSets(projectId: number) {
  const { database, commands, connectionId } = useQuizCommands();
  const connected = useDatabaseConnected();
  const query = useQuery({
    queryKey: quizKeys.sets(database, projectId, connectionId),
    queryFn: () => commands.listVLQuizSets(projectId),
    enabled: connected && projectId > 0,
    staleTime: 30_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
  return { ...query, sets: query.data ?? EMPTY_SETS };
}

export function useQuizItems(quizSetId: number | undefined, enabled = true) {
  const { database, commands, connectionId } = useQuizCommands();
  const connected = useDatabaseConnected();
  const query = useQuery({
    queryKey: quizKeys.items(database, quizSetId, connectionId),
    queryFn: () => {
      if (quizSetId == null) throw new Error("缺少测验 ID");
      return commands.listVLQuizItems(quizSetId);
    },
    enabled: enabled && connected && quizSetId != null,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  return { ...query, items: query.data ?? EMPTY_ITEMS };
}

export function useQuizRecords(quizSetId: number | undefined, enabled = true) {
  const { database, commands, connectionId } = useQuizCommands();
  const connected = useDatabaseConnected();
  const query = useQuery({
    queryKey: quizKeys.records(database, quizSetId, connectionId),
    queryFn: () => {
      if (quizSetId == null) throw new Error("缺少测验 ID");
      return commands.listVLQuizRecords({ quizSetId });
    },
    enabled: enabled && connected && quizSetId != null,
    staleTime: 0,
  });
  return { ...query, records: query.data ?? EMPTY_RECORDS };
}

export function useQuizBestScores(projectId: number) {
  const { database, commands, connectionId } = useQuizCommands();
  const connected = useDatabaseConnected();
  const query = useQuery({
    queryKey: quizKeys.scores(database, projectId, connectionId),
    queryFn: () => commands.getVLQuizBestScores(projectId),
    enabled: connected && projectId > 0,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
  return { ...query, scores: query.data ?? EMPTY_SCORES };
}

export function useQuizMutations() {
  const client = useQueryClient();
  const { database, commands, connectionId } = useQuizCommands();
  return useMemo(() => {
    const assertCurrentDatabase = () => {
      if (databaseId(useSettingStore.getState().setting.database.active) !== databaseId(database)) {
        throw new Error("数据库已切换，请重新打开测验操作");
      }
    };
    const refresh = () => void invalidateQuizzes(client, database);
    return {
      async updateQuizSet(input: UpdateVLQuizSetInput) {
        assertCurrentDatabase();
        const result = await commands.updateVLQuizSet(input);
        if (!result) throw new Error("测验集已不存在");
        client.setQueryData<VLQuizSet[]>(
          quizKeys.sets(database, result.projectId, connectionId),
          previous => previous?.map(item => (item.id === result.id ? result : item))
        );
        refresh();
        return result;
      },
      async deleteQuizSet(id: number) {
        assertCurrentDatabase();
        if (!(await commands.deleteVLQuizSet(id))) throw new Error("测验集已不存在");
        client.removeQueries({ queryKey: quizKeys.items(database, id, connectionId) });
        client.removeQueries({ queryKey: quizKeys.records(database, id, connectionId) });
        refresh();
      },
      async updateItem(input: UpdateVLQuizItemInput) {
        assertCurrentDatabase();
        const result = await commands.updateVLQuizItem(input);
        if (!result) throw new Error("测验题已不存在");
        client.setQueryData<VLQuizItem[]>(
          quizKeys.items(database, result.quizSetId, connectionId),
          previous => previous?.map(item => (item.id === result.id ? result : item))
        );
        refresh();
        return result;
      },
      async deleteItem(id: number) {
        assertCurrentDatabase();
        if (!(await commands.deleteVLQuizItem(id))) throw new Error("测验题已不存在");
        refresh();
      },
      async createRecord(input: CreateVLQuizRecordInput) {
        assertCurrentDatabase();
        const record = await commands.createVLQuizRecord(input);
        client.setQueryData<VLQuizRecord[]>(
          quizKeys.records(database, input.quizSetId, connectionId),
          previous => (previous ? [record, ...previous] : previous)
        );
        refresh();
        return record;
      },
    };
  }, [client, database, commands, connectionId]);
}
