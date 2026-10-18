import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { getActiveDatabase } from "../../../utils/settings.js";
import { createSyncProvider, type IDatabaseInfo } from "../../../utils/sync-providers/factory.js";
import { runSyncPush } from "../../db/sync/push.js";
import { runSyncPull } from "../../db/sync/pull.js";
import { readRemoteInfo } from "../../db/sync/runtime.js";

type SyncState =
  "idle" | "pushing" | "pulling" | "confirm-push" | "confirm-pull" | "done" | "error";

export function SyncView({ onBack }: { onBack: () => void }) {
  const [localVersion, setLocalVersion] = useState<number>(0);
  const [remoteVersion, setRemoteVersion] = useState<number | null>(null);
  const [providerName, setProviderName] = useState<string>("N/A");
  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState("");
  const [dbName, setDbName] = useState("");

  useEffect(() => {
    const db = getActiveDatabase();
    setDbName(db.name);
    setLocalVersion(db.version);

    const provider = createSyncProvider();
    if (!provider) {
      setError("Sync not configured. Please configure sync settings in the Tau app.");
      return;
    }

    setProviderName(provider.getProviderName());

    const infoFileName = `database_${db.name}.json`;
    provider
      .fileExists(infoFileName)
      .then(async exists => {
        if (exists) {
          const info: IDatabaseInfo = await readRemoteInfo(provider, db.name);
          setRemoteVersion(info.version);
        }
      })
      .finally(() => provider.dispose?.())
      .catch((e: any) => {
        setError(`Failed to check remote: ${e.message}`);
      });
  }, []);

  useInput((input, key) => {
    if (syncState === "pushing" || syncState === "pulling") return;

    if (syncState === "confirm-push") {
      if (input === "y") {
        setSyncState("pushing");
        setStatusMessage("Pushing...");
        runSyncPush()
          .then(() => {
            setSyncState("done");
            setStatusMessage("Push complete!");
            const db = getActiveDatabase();
            setLocalVersion(db.version);
            setRemoteVersion(db.version);
          })
          .catch((e: any) => {
            setSyncState("error");
            setStatusMessage(`Push failed: ${e.message || "unknown error"}`);
          });
        return;
      }
      setSyncState("idle");
      setStatusMessage("");
      return;
    }

    if (syncState === "confirm-pull") {
      if (input === "y") {
        setSyncState("pulling");
        setStatusMessage("Pulling...");
        runSyncPull()
          .then(() => {
            setSyncState("done");
            setStatusMessage("Pull complete!");
            const db = getActiveDatabase();
            setLocalVersion(db.version);
            setRemoteVersion(db.version);
          })
          .catch((e: any) => {
            setSyncState("error");
            setStatusMessage(`Pull failed: ${e.message || "unknown error"}`);
          });
        return;
      }
      setSyncState("idle");
      setStatusMessage("");
      return;
    }

    if (key.escape || input === "q") {
      onBack();
      return;
    }

    if (input === "p") {
      setSyncState("confirm-push");
      setStatusMessage("Push local → remote? (y/n)");
    } else if (input === "l") {
      setSyncState("confirm-pull");
      setStatusMessage("Pull remote → local? (y/n)");
    } else if (input === "r") {
      setSyncState("idle");
      setStatusMessage("");
      setError("");
      setRemoteVersion(null);
      const provider = createSyncProvider();
      if (provider) {
        const db = getActiveDatabase();
        setLocalVersion(db.version);
        const infoFileName = `database_${db.name}.json`;
        provider
          .fileExists(infoFileName)
          .then(async exists => {
            if (exists) {
              const info: IDatabaseInfo = await readRemoteInfo(provider, db.name);
              setRemoteVersion(info.version);
            }
          })
          .finally(() => provider.dispose?.())
          .catch(() => {});
      }
    }
  });

  let syncStatus = "Up to date";
  let syncColor = "green";
  if (remoteVersion !== null) {
    if (localVersion > remoteVersion) {
      syncStatus = "Local ahead → push";
      syncColor = "yellow";
    } else if (localVersion < remoteVersion) {
      syncStatus = "Remote ahead → pull";
      syncColor = "yellow";
    }
  } else if (!error) {
    syncStatus = "No remote data";
    syncColor = "gray";
  }

  return (
    <Box flexDirection="column">
      <Box marginBottom={0}>
        <Text bold color="cyan">
          Sync Status
        </Text>
      </Box>
      <Text dimColor>{"─".repeat(50)}</Text>

      {error ? (
        <Box marginY={1}>
          <Text color="red">{error}</Text>
        </Box>
      ) : (
        <Box flexDirection="column" marginY={1}>
          <Box>
            <Box width={18}>
              <Text dimColor>Database</Text>
            </Box>
            <Text>{dbName}</Text>
          </Box>
          <Box>
            <Box width={18}>
              <Text dimColor>Provider</Text>
            </Box>
            <Text>{providerName}</Text>
          </Box>
          <Box>
            <Box width={18}>
              <Text dimColor>Local Version</Text>
            </Box>
            <Text>{localVersion}</Text>
          </Box>
          <Box>
            <Box width={18}>
              <Text dimColor>Remote Version</Text>
            </Box>
            <Text>{remoteVersion !== null ? remoteVersion : "N/A"}</Text>
          </Box>
          <Box>
            <Box width={18}>
              <Text dimColor>Status</Text>
            </Box>
            <Text color={syncColor}>{syncStatus}</Text>
          </Box>
        </Box>
      )}

      <Text dimColor>{"─".repeat(50)}</Text>
      {statusMessage ? (
        <Text color={syncState === "error" ? "red" : syncState === "done" ? "green" : "yellow"}>
          {statusMessage}
        </Text>
      ) : (
        <Text dimColor>p push · l pull · r refresh · Esc/q back</Text>
      )}
    </Box>
  );
}
