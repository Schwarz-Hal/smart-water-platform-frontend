import { Injectable } from '@angular/core';

export interface WorkflowRecoveryDraft {
  key: string;
  userId: number;
  workflowId: number;
  workflowName?: string;
  description?: string | null;
  graph: Record<string, unknown>;
  baseRevision: number;
  updatedAt: number;
}

@Injectable({ providedIn: 'root' })
export class WorkflowCacheService {
  private readonly databaseName = 'smart-water-platform-cache';
  private readonly storeName = 'workflow-drafts';
  private database?: Promise<IDBDatabase>;

  private open(): Promise<IDBDatabase> {
    if (this.database) return this.database;
    this.database = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.databaseName, 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore(this.storeName, { keyPath: 'key' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return this.database;
  }

  async put(value: WorkflowRecoveryDraft): Promise<void> {
    try {
      const db = await this.open();
      await new Promise<void>((resolve, reject) => {
        const request = db
          .transaction(this.storeName, 'readwrite')
          .objectStore(this.storeName)
          .put(value);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch {
      // Private recovery is best effort; the server draft remains authoritative.
    }
  }

  async get(userId: number, workflowId: number): Promise<WorkflowRecoveryDraft | null> {
    try {
      const db = await this.open();
      return await new Promise<WorkflowRecoveryDraft | null>((resolve, reject) => {
        const key = `${userId}:${workflowId}`;
        const request = db
          .transaction(this.storeName, 'readonly')
          .objectStore(this.storeName)
          .get(key);
        request.onsuccess = () =>
          resolve((request.result as WorkflowRecoveryDraft | undefined) ?? null);
        request.onerror = () => reject(request.error);
      });
    } catch {
      return null;
    }
  }

  async remove(userId: number, workflowId: number): Promise<void> {
    try {
      const db = await this.open();
      await new Promise<void>((resolve, reject) => {
        const request = db
          .transaction(this.storeName, 'readwrite')
          .objectStore(this.storeName)
          .delete(`${userId}:${workflowId}`);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch {
      // Ignore cache cleanup failures.
    }
  }
}
