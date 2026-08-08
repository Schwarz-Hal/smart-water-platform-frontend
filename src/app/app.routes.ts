import { Routes } from '@angular/router';

import { authGuard } from './core/guards/auth.guard';
import { permissionGuard } from './core/guards/permission.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/login/login.page').then((m) => m.LoginPage),
  },
  {
    path: '',
    loadComponent: () => import('./layout/app-shell.component').then((m) => m.AppShellComponent),
    canActivate: [authGuard],
    children: [
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard.page').then((m) => m.DashboardPage),
      },
      {
        path: 'data-sources',
        loadComponent: () =>
          import('./features/data-sources/data-sources.page').then((m) => m.DataSourcesPage),
        canActivate: [permissionGuard],
        data: { permission: 'data_source:read' },
      },
      {
        path: 'operators',
        loadComponent: () =>
          import('./features/operators/operator-center.page').then((m) => m.OperatorCenterPage),
        canActivate: [permissionGuard],
        data: { permission: 'operator:read' },
      },
      { path: 'algorithms', redirectTo: 'operators?kind=algorithm', pathMatch: 'full' },
      {
        path: 'datasets/:datasetId',
        loadComponent: () =>
          import('./features/data-sources/dataset-detail.page').then((m) => m.DatasetDetailPage),
        canActivate: [permissionGuard],
        data: { permission: 'dataset:read' },
      },
      {
        path: 'tasks',
        loadComponent: () =>
          import('./features/task-detail/task-center.page').then((m) => m.TaskCenterPage),
        canActivate: [permissionGuard],
        data: { permission: 'task:read' },
      },
      {
        path: 'tasks/:taskId',
        loadComponent: () =>
          import('./features/task-detail/task-detail.page').then((m) => m.TaskDetailPage),
        canActivate: [permissionGuard],
        data: { permission: 'task:read' },
      },
      {
        path: 'results/:taskId',
        loadComponent: () => import('./features/results/result.page').then((m) => m.ResultPage),
        canActivate: [permissionGuard],
        data: { permission: 'result:read' },
      },
      {
        path: 's01-leakage',
        redirectTo: 'workflows/new?template=s01_leakage_basic',
        pathMatch: 'full',
      },
      {
        path: 'workflows',
        loadComponent: () =>
          import('./features/workflows/workflow-library.page').then((m) => m.WorkflowLibraryPage),
        canActivate: [permissionGuard],
        data: { permission: 'workflow:read' },
      },
      {
        path: 'workflows/new',
        loadComponent: () =>
          import('./features/workflows/workflow-starter.page').then((m) => m.WorkflowStarterPage),
        canActivate: [permissionGuard],
        data: { permission: 'workflow:edit' },
      },
      {
        path: 'workflows/:workflowId/edit',
        loadComponent: () =>
          import('./features/workflows/workflow-editor.page').then((m) => m.WorkflowEditorPage),
        canActivate: [permissionGuard],
        data: { permission: 'workflow:read', workspace: true },
      },
      {
        path: 'workflow-runs',
        loadComponent: () =>
          import('./features/workflows/workflow-runs.page').then((m) => m.WorkflowRunsPage),
        canActivate: [permissionGuard],
        data: { permission: 'workflow:read' },
      },
      {
        path: 'workflow-runs/:runId',
        loadComponent: () =>
          import('./features/workflows/workflow-run-detail.page').then(
            (m) => m.WorkflowRunDetailPage,
          ),
        canActivate: [permissionGuard],
        data: { permission: 'workflow:read' },
      },
      {
        path: 'users',
        loadComponent: () => import('./features/users/users.page').then((m) => m.UsersPage),
        canActivate: [permissionGuard],
        data: { permission: 'user:manage' },
      },
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
    ],
  },
  { path: '**', redirectTo: '' },
];
