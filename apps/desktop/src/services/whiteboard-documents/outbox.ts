import type { PendingWhiteboardUpdate, WhiteboardOutbox } from "./client";
export class IndexedWhiteboardOutbox implements WhiteboardOutbox {
  private opening?: Promise<IDBDatabase>;
  private database(): Promise<IDBDatabase> {
    return (this.opening ??= new Promise((resolve, reject) => {
      const request = indexedDB.open("tau-whiteboard-outbox", 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore("updates", { keyPath: "batchId" });
      request.onerror = () => {
        this.opening = undefined;
        reject(request.error);
      };
      request.onsuccess = () => resolve(request.result);
    }));
  }
  private async transaction<T>(
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => IDBRequest<T>
  ): Promise<T> {
    const db = await this.database();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("updates", mode, { durability: "strict" }),
        request = run(transaction.objectStore("updates"));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () =>
        reject(transaction.error ?? request.error ?? new Error("白板草稿写入中止"));
      transaction.onerror = () => reject(transaction.error ?? request.error);
    });
  }
  async list(databaseName: string, documentId: string): Promise<PendingWhiteboardUpdate[]> {
    const records = await this.transaction("readonly", store => store.getAll());
    return records.filter(
      (record: PendingWhiteboardUpdate) =>
        record.databaseName === databaseName && record.documentId === documentId
    );
  }
  async put(record: PendingWhiteboardUpdate): Promise<void> {
    await this.transaction("readwrite", store => store.put(structuredClone(record)));
  }
  async remove(batchId: string): Promise<void> {
    await this.transaction("readwrite", store => store.delete(batchId));
  }
}
