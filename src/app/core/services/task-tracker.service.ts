import { Injectable, WritableSignal, inject, signal } from '@angular/core';
import { forkJoin } from 'rxjs';

import { TaskDetail, TaskLog } from '../models/api.models';
import { AuthService } from './auth.service';
import { ApiClient } from './api-client.service';

const recentTasksKey = 'smart-water.demo.recent-tasks.v1';
const terminalStates = new Set(['success', 'failed', 'cancelled']);

export interface TaskTrackingHandle {
  task: WritableSignal<TaskDetail | null>;
  logs: WritableSignal<TaskLog[]>;
  connection: WritableSignal<'connecting' | 'connected' | 'polling' | 'closed'>;
}

interface ActiveTracking {
  handle: TaskTrackingHandle;
  socket: WebSocket | null;
  pollId: number | null;
}

@Injectable({ providedIn: 'root' })
export class TaskTrackerService {
  private readonly api = inject(ApiClient);
  private readonly auth = inject(AuthService);
  private readonly active = new Map<string, ActiveTracking>();
  readonly recentTaskIds = signal<string[]>(this.readRecent());

  track(taskId: string): TaskTrackingHandle {
    const existing = this.active.get(taskId);
    if (existing) {
      return existing.handle;
    }
    const handle: TaskTrackingHandle = {
      task: signal<TaskDetail | null>(null),
      logs: signal<TaskLog[]>([]),
      connection: signal<'connecting' | 'connected' | 'polling' | 'closed'>('connecting'),
    };
    const tracking: ActiveTracking = { handle, socket: null, pollId: null };
    this.active.set(taskId, tracking);
    this.remember(taskId);
    this.refresh(taskId, tracking);
    this.connect(taskId, tracking);
    return handle;
  }

  stop(taskId: string): void {
    const tracking = this.active.get(taskId);
    if (!tracking) {
      return;
    }
    if (tracking.pollId !== null) {
      window.clearInterval(tracking.pollId);
    }
    tracking.socket?.close();
    tracking.handle.connection.set('closed');
    this.active.delete(taskId);
  }

  private refresh(taskId: string, tracking: ActiveTracking): void {
    forkJoin({
      task: this.api.get<TaskDetail>(`/api/v1/tasks/${taskId}`),
      logs: this.api.get<TaskLog[]>(`/api/v1/tasks/${taskId}/logs`),
    }).subscribe({
      next: ({ task, logs }) => {
        tracking.handle.task.set(task);
        tracking.handle.logs.set(logs);
        if (this.isTerminal(task)) {
          this.finish(taskId, tracking);
        }
      },
      error: () => this.startPolling(taskId, tracking),
    });
  }

  private connect(taskId: string, tracking: ActiveTracking): void {
    const token = this.auth.accessToken();
    if (!token) {
      this.startPolling(taskId, tracking);
      return;
    }
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${protocol}://${window.location.host}/api/v1/ws/tasks/${taskId}?access_token=${encodeURIComponent(token)}`;
    const socket = new WebSocket(url);
    tracking.socket = socket;
    socket.onopen = () => tracking.handle.connection.set('connected');
    socket.onmessage = (event) => {
      try {
        const task = JSON.parse(String(event.data)) as TaskDetail;
        if (!task.task_id) {
          return;
        }
        tracking.handle.task.set(task);
        if (this.isTerminal(task)) {
          this.refresh(taskId, tracking);
        }
      } catch {
        this.startPolling(taskId, tracking);
      }
    };
    socket.onerror = () => this.startPolling(taskId, tracking);
    socket.onclose = () => {
      if (!this.isTerminal(tracking.handle.task())) {
        this.startPolling(taskId, tracking);
      }
    };
  }

  private startPolling(taskId: string, tracking: ActiveTracking): void {
    if (tracking.pollId !== null || this.isTerminal(tracking.handle.task())) {
      return;
    }
    tracking.handle.connection.set('polling');
    tracking.pollId = window.setInterval(() => this.refresh(taskId, tracking), 2000);
  }

  private finish(taskId: string, tracking: ActiveTracking): void {
    if (tracking.pollId !== null) {
      window.clearInterval(tracking.pollId);
      tracking.pollId = null;
    }
    tracking.socket?.close();
    tracking.socket = null;
    tracking.handle.connection.set('closed');
    this.active.delete(taskId);
  }

  private isTerminal(task: TaskDetail | null): boolean {
    return !!task && terminalStates.has(task.status);
  }

  private remember(taskId: string): void {
    const next = [taskId, ...this.recentTaskIds().filter((id) => id !== taskId)].slice(0, 8);
    this.recentTaskIds.set(next);
    sessionStorage.setItem(recentTasksKey, JSON.stringify(next));
  }

  private readRecent(): string[] {
    try {
      const parsed = JSON.parse(sessionStorage.getItem(recentTasksKey) ?? '[]');
      return Array.isArray(parsed)
        ? parsed.filter((id): id is string => typeof id === 'string')
        : [];
    } catch {
      return [];
    }
  }
}
