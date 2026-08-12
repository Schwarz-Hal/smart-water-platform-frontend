import { describe, expect, it } from 'vitest';

import { parseWorkspacePreference, workspacePreferenceKey } from './workflow-workspace-preferences';

describe('workflow workspace preferences', () => {
  it('isolates layouts by user', () => {
    expect(workspacePreferenceKey(7)).toBe('smart-water.workflow-workspace.layout.v1.7');
    expect(workspacePreferenceKey(8)).not.toBe(workspacePreferenceKey(7));
    expect(workspacePreferenceKey(null)).toContain('anonymous');
  });

  it('restores a valid versioned preference', () => {
    const preference = parseWorkspacePreference(
      JSON.stringify({
        schemaVersion: 1,
        userId: 7,
        theme: 'workspace-dark',
        layout: { grid: { root: {} } },
      }),
      7,
    );
    expect(preference?.theme).toBe('workspace-dark');
    expect(preference?.layout).toEqual({ grid: { root: {} } });
  });

  it('rejects damaged, incompatible, and cross-user caches', () => {
    expect(parseWorkspacePreference('{broken', 7)).toBeNull();
    expect(
      parseWorkspacePreference(
        JSON.stringify({ schemaVersion: 2, userId: 7, theme: 'water-light', layout: {} }),
        7,
      ),
    ).toBeNull();
    expect(
      parseWorkspacePreference(
        JSON.stringify({ schemaVersion: 1, userId: 8, theme: 'water-light', layout: {} }),
        7,
      ),
    ).toBeNull();
  });
});
