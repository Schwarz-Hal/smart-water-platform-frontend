export type WorkspaceThemeName = 'water-light' | 'workspace-dark';

export interface WorkspaceLayoutPreference {
  schemaVersion: 2;
  userId: number;
  theme: WorkspaceThemeName;
  layout: object;
}

export function workspacePreferenceKey(userId: number | null | undefined): string {
  return `smart-water.workflow-workspace.layout.v2.${userId ?? 'anonymous'}`;
}

export function legacyWorkspacePreferenceKey(userId: number | null | undefined): string {
  return `smart-water.workflow-workspace.layout.v1.${userId ?? 'anonymous'}`;
}

export function parseWorkspacePreference(
  raw: string | null,
  expectedUserId: number,
): WorkspaceLayoutPreference | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<WorkspaceLayoutPreference>;
    if (
      value.schemaVersion !== 2 ||
      value.userId !== expectedUserId ||
      (value.theme !== 'water-light' && value.theme !== 'workspace-dark') ||
      !value.layout ||
      typeof value.layout !== 'object' ||
      Array.isArray(value.layout)
    ) {
      return null;
    }
    return value as WorkspaceLayoutPreference;
  } catch {
    return null;
  }
}
