import React from "react";
import { render, Box, Text } from "ink";
import { getActiveDatabase } from "../../../utils/settings.js";
import {
  createSyncProvider,
  type IDatabaseInfo,
} from "../../../utils/sync-providers/factory.js";
import { Header, Divider } from "../../../ui/components.js";

function StatusView({
  data,
}: {
  data: {
    dbName: string;
    localVersion: number;
    remoteVersion: number | null;
    providerName: string;
    syncNeeded: string;
    error?: string;
  };
}) {
  return (
    <Box flexDirection="column" paddingX={1}>
      <Header>Sync Status</Header>
      <Divider width={40} />
      <Box flexDirection="column" gap={0}>
        <Box>
          <Box width={18}>
            <Text dimColor>Database</Text>
          </Box>
          <Text>{data.dbName}</Text>
        </Box>
        <Box>
          <Box width={18}>
            <Text dimColor>Provider</Text>
          </Box>
          <Text>{data.providerName}</Text>
        </Box>
        <Box>
          <Box width={18}>
            <Text dimColor>Local Version</Text>
          </Box>
          <Text>{data.localVersion}</Text>
        </Box>
        <Box>
          <Box width={18}>
            <Text dimColor>Remote Version</Text>
          </Box>
          <Text>
            {data.remoteVersion !== null ? data.remoteVersion : "N/A"}
          </Text>
        </Box>
        <Box>
          <Box width={18}>
            <Text dimColor>Status</Text>
          </Box>
          <Text color={data.syncNeeded === "Up to date" ? "green" : "yellow"}>
            {data.syncNeeded}
          </Text>
        </Box>
        {data.error && (
          <Box marginTop={1}>
            <Text color="red">{data.error}</Text>
          </Box>
        )}
      </Box>
    </Box>
  );
}

export async function runSyncStatus() {
  const db = getActiveDatabase();
  const provider = createSyncProvider();

  if (!provider) {
    render(
      <Box paddingX={1}>
        <Text color="red">
          Sync not configured. Please configure sync settings in the Tau app.
        </Text>
      </Box>,
    );
    return;
  }

  let remoteVersion: number | null = null;
  let error: string | undefined;

  try {
    const infoFileName = `database_${db.name}.json`;
    const exists = await provider.fileExists(infoFileName);
    if (exists) {
      const content = await provider.downloadFile(infoFileName);
      const decoder = new TextDecoder();
      const info: IDatabaseInfo = JSON.parse(decoder.decode(content));
      remoteVersion = info.version;
    }
  } catch (e: any) {
    error = `Failed to check remote: ${e.message}`;
  }

  let syncNeeded = "Up to date";
  if (remoteVersion !== null) {
    if (db.version > remoteVersion) {
      syncNeeded = "Local ahead → push";
    } else if (db.version < remoteVersion) {
      syncNeeded = "Remote ahead → pull";
    }
  } else if (!error) {
    syncNeeded = "No remote data";
  }

  render(
    <StatusView
      data={{
        dbName: db.name,
        localVersion: db.version,
        remoteVersion,
        providerName: provider.getProviderName(),
        syncNeeded,
        error,
      }}
    />,
  );
}
