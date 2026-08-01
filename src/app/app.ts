import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { AuthService } from './core/services/auth.service';
@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: '<router-outlet />',
  styleUrl: './app.scss',
})
export class App {
  constructor(private readonly auth: AuthService) {
    // A page refresh restores the short-lived browser session only after /auth/me succeeds.
    this.auth.restoreProfile().subscribe();
  }
}
