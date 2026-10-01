import { useMemo } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import * as quizCommands from "@/commands/vl-quiz";
import useSettingStore from "@/stores/useSettingStore";
import useDatabaseConnected from "@/hooks/useDatabaseConnected";
import { bindDatabaseCommands } from "@/services/command-context";
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
  sets: (database: string, projectId: number) =>
    [...quizKeys.root(database), "sets", projectId] as const,
  items: (database: string, quizSetId: number | undefined) =>
    [...quizKeys.root(database), "items", quizSetId] as const,
  records: (database: string, quizSetId: number | undefined) =>
    [...quizKeys.root(database), "records", quizSetId] as const,
  scores: (database: string, projectId: number) =>
    [...quizKeys.root(database), "scores", projectId] as const,
};

export function invalidateQuizzes(client: QueryClient, database: string) {
  return client.invalidateQueries({ queryKey: quizKeys.root(database) });
}

on("vl-quiz:changed", (_event, { databaseName }: { databaseName: string }) => {
  void invalidateQuizzes(queryClient, databaseName);
});

function useQuizCommands() {
  const database = useSettingStore(state => state.setting.database.active);
  const commands = useMemo(
    () => bindDatabaseCommands(quizCommands, { databaseName: database }),
    [database]
  );
  return { database, commands };
}

const EMPTY_SETS: VLQuizSet[] = [];
const EMPTY_ITEMS: VLQuizItem[] = [];
const EMPTY_RECORDS: VLQuizRecord[] = [];
const EMPTY_SCORES: Record<number, number> = {};

export function useQuizSets(projectId: number) {
  const { database, commands } = useQuizCommands();
  const connected = useDatabaseConnected();
  const query = useQuery({
    queryKey: quizKeys.sets(database, projectId),
    queryFn: () => commands.listVLQuizSets(projectId),
    enabled: connected && projectId > 0,
    staleTime: 30_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
  return { ...query, sets: query.data ?? EMPTY_SETS };
}

export function useQuizItems(quizSetId: number | undefined, enabled = true) {
  const { database, commands } = useQuizCommands();
  const connected = useDatabaseConnected();
  const query = useQuery({
    queryKey: quizKeys.items(database, quizSetId),
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
  const { database, commands } = useQuizCommands();
  const connected = useDatabaseConnected();
  const query = useQuery({
    queryKey: quizKeys.records(database, quizSetId),
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
  const { database, commands } = useQuizCommands();
  const connected = useDatabaseConnected();
  const query = useQuery({
    queryKey: quizKeys.scores(database, projectId),
    queryFn: () => commands.getVLQuizBestScores(projectId),
    enabled: connected && projectId > 0,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
  return { ...query, scores: query.data ?? EMPTY_SCORES };
}

export function useQuizMutations() {
  const client = useQueryClient();
  const { database, commands } = useQuizCommands();
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
        client.setQueryData<VLQuizSet[]>(quizKeys.sets(database, result.projectId), previous =>
          previous?.map(item => (item.id === result.id ? result : item))
        );
        refresh();
        return result;
      },
      async deleteQuizSet(id: number) {
        assertCurrentDatabase();
        if (!(await commands.deleteVLQuizSet(id))) throw new Error("测验集已不存在");
        client.removeQueries({ queryKey: quizKeys.items(database, id) });
        client.removeQueries({ queryKey: quizKeys.records(database, id) });
        refresh();
      },
      async updateItem(input: UpdateVLQuizItemInput) {
        assertCurrentDatabase();
        const result = await commands.updateVLQuizItem(input);
        if (!result) throw new Error("测验题已不存在");
        client.setQueryData<VLQuizItem[]>(quizKeys.items(database, result.quizSetId), previous =>
          previous?.map(item => (item.id === result.id ? result : item))
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
          quizKeys.records(database, input.quizSetId),
          previous => (previous ? [record, ...previous] : previous)
        );
        refresh();
        return record;
      },
    };
  }, [client, database, commands]);
}
