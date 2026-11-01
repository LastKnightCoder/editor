export async function synchronizeHybridHttp(replica, url, options) {
  for (let attempt = 0; attempt < 4; attempt++) {
    let sentBytes = 0,
      receivedBytes = 0,
      snapshotUploaded = false;
    const post = async bundle => {
      const body = JSON.stringify(bundle);
      sentBytes += Buffer.byteLength(body);
      snapshotUploaded ||= Boolean(bundle.snapshot);
      const response = await fetch(`${url}/linear-sync`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        signal: AbortSignal.timeout(5000),
      });
      const raw = await response.text();
      receivedBytes += Buffer.byteLength(raw);
      const payload = JSON.parse(raw);
      if (!response.ok) throw new Error(payload.error);
      return payload;
    };
    const body = replica.bodyBundle();
    const total = replica.db.prepare("SELECT count(*) AS n FROM _linear_local").get().n;
    if (body && body.pending.length < total) {
      let accepted = await post(body);
      if (accepted.kind === "needs-snapshot")
        accepted = await post(replica.bodyBundle({ includeSnapshot: true }));
    }
    let result = await post(replica.bundle({ includeSnapshot: false }));
    if (result.kind === "needs-snapshot") result = await post(replica.bundle());
    try {
      await replica.installResponse(result, options);
      return {
        ...result,
        libraryChoiceRequired: false,
        noteCopies: replica.copies().length,
        wire: { sentBytes, receivedBytes, snapshotUploaded },
      };
    } catch (error) {
      if (error.message !== "LOCAL_CHANGED_DURING_SYNC" || attempt === 3) throw error;
    }
  }
}
