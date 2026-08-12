import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatListModule } from '@angular/material/list';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs/operators';

import { AuthService } from '../core/services/auth.service';
import { NotificationService } from '../core/services/notification.service';

interface NavigationItem {
  label: string;
  route: string;
  permission?: string;
}

@Component({
  selector: 'app-shell',
  imports: [
    MatButtonModule,
    MatDividerModule,
    MatListModule,
    MatSidenavModule,
    MatToolbarModule,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
  ],
  template: `
    <mat-sidenav-container class="shell">
      <mat-sidenav
        [mode]="mobile() ? 'over' : 'side'"
        [opened]="!mobile() || drawerOpen()"
        (closed)="drawerOpen.set(false)"
        class="side-nav"
      >
        <div class="brand">
          <span class="brand-mark">SW</span>
          <div><strong>智能水务平台</strong><small>算法管理</small></div>
        </div>
        <mat-divider />
        <mat-nav-list>
          @for (item of visibleItems(); track item.route) {
            <a
              mat-list-item
              [routerLink]="item.route"
              routerLinkActive="active-link"
              (click)="closeDrawer()"
              >{{ item.label }}</a
            >
          }
        </mat-nav-list>
      </mat-sidenav>
      <mat-sidenav-content>
        <mat-toolbar class="top-bar">
          @if (mobile()) {
            <button mat-button type="button" class="menu-button" (click)="drawerOpen.set(true)">
              菜单
            </button>
          }
          <span>算法管理平台</span>
          <span class="spacer"></span>
          @if (auth.user(); as user) {
            <span class="user-name">{{ user.display_name }}（{{ user.roles.join('、') }}）</span>
            <button mat-button type="button" (click)="cancelAccount()">注销账户</button>
            <button mat-button type="button" (click)="logout()">退出</button>
          }
        </mat-toolbar>
        <main class="content" [class.workspace-content]="workspace()"><router-outlet /></main>
      </mat-sidenav-content>
    </mat-sidenav-container>
  `,
  styles: `
    .shell {
      height: 100vh;
      background: var(--sw-page-bg);
    }
    .side-nav {
      width: 236px;
      border-right: 1px solid var(--sw-border);
      background: var(--sw-surface);
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 24px 18px 18px;
    }
    .brand-mark {
      display: grid;
      place-items: center;
      width: 36px;
      height: 36px;
      border-radius: 10px;
      background: var(--sw-color-primary);
      color: white;
      font-weight: 800;
    }
    .brand small {
      display: block;
      margin-top: 3px;
      color: var(--sw-text-muted);
      font-size: 12px;
    }
    .active-link {
      background: color-mix(in srgb, var(--sw-color-primary) 12%, transparent);
      color: var(--sw-color-primary-strong);
      font-weight: 700;
      border-radius: 8px;
    }

    .top-bar {
      background: var(--sw-surface);
      border-bottom: 1px solid var(--sw-border);
      color: var(--sw-text-primary);
    }
    .spacer {
      flex: 1;
    }
    .user-name {
      color: var(--sw-text-secondary);
      font-size: 14px;
      margin-right: 10px;
    }
    .content {
      min-width: 0;
      padding: 24px;
      max-width: 1440px;
      margin: 0 auto;
    }
    .workspace-content {
      max-width: none;
      height: calc(100vh - 64px);
      padding: 0;
      overflow: hidden;
    }
    .menu-button {
      margin-left: -8px;
    }
    @media (max-width: 800px) {
      .side-nav {
        width: min(82vw, 300px);
      }
      .content {
        padding: 14px;
      }
      .user-name {
        display: none;
      }
    }
  `,
})
export class AppShellComponent {
  readonly auth = inject(AuthService);
  readonly mobile = signal(typeof window !== 'undefined' && window.innerWidth <= 800);
  readonly drawerOpen = signal(false);
  private readonly router = inject(Router);
  private readonly notifications = inject(NotificationService);
  readonly workspace = signal(false);
  private readonly items: NavigationItem[] = [
    { label: '平台概览', route: '/dashboard' },
    { label: '数据源与导入', route: '/data-sources', permission: 'data_source:read' },
    { label: '算子中心', route: '/operators', permission: 'operator:read' },
    { label: '工作流', route: '/workflows', permission: 'workflow:read' },
    { label: '工作流运行记录', route: '/workflow-runs', permission: 'workflow:read' },
    { label: '任务中心', route: '/tasks', permission: 'task:read' },
    { label: '用户与角色', route: '/users', permission: 'user:manage' },
    { label: '资源回收站', route: '/recycle-bin', permission: 'recycle:manage' },
  ];
  readonly visibleItems = computed(() =>
    this.items.filter((item) => !item.permission || this.auth.hasPermission(item.permission)),
  );

  constructor() {
    this.workspace.set(this.isWorkspaceUrl(this.router.url));
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => {
        this.workspace.set(this.isWorkspaceUrl(event.urlAfterRedirects));
      });
  }

  private isWorkspaceUrl(url: string): boolean {
    return /\/workflows\/[^/]+\/edit(?:\?|$)/.test(url);
  }

  @HostListener('window:resize')
  updateViewport(): void {
    this.mobile.set(window.innerWidth <= 800);
    if (!this.mobile()) this.drawerOpen.set(false);
  }

  closeDrawer(): void {
    if (this.mobile()) this.drawerOpen.set(false);
  }

  logout(): void {
    this.auth.clearSession();
    void this.router.navigate(['/login']);
  }

  cancelAccount(): void {
    const user = this.auth.user();
    if (!user) return;
    const username = window.prompt(
      `账户注销后，资源将进入回收站并保留 14 天。\n请输入用户名 ${user.username} 确认：`,
    );
    if (username !== user.username) return;
    const password = window.prompt('请输入当前密码：');
    if (!password) return;
    this.auth.cancelAccount(username, password).subscribe({
      next: () => {
        this.auth.clearSession();
        void this.router.navigate(['/login']);
      },
      error: (error: unknown) => this.notifications.error(error, '账户注销失败。'),
    });
  }
}
