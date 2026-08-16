import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ApiFailure, WorkflowErrorDetail } from '../models/api.models';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly snackBar = inject(MatSnackBar);
  // 工作流错误码中文映射
  private readonly workflowErrorMessages: Readonly<Record<string, string>> = {
    WORKFLOW_BINDING_INVALID: '数据绑定不合法，请检查所有数据通道的绑定配置',
    WORKFLOW_BINDING_MISSING: '存在未绑定的数据通道，请完成所有数据节点的绑定后再保存',
    WORKFLOW_BINDING_DUPLICATE: '多个业务角色绑定了同一条数据通道，请为不同角色选择不同的指标通道',
    WORKFLOW_GRAPH_INVALID: '流程图结构校验失败，请检查节点连线是否完整',
    WORKFLOW_REVISION_CONFLICT: '草稿已被其他页面修改，请刷新后重试',
    WORKFLOW_PERMISSION_DENIED: '没有编辑该工作流的权限',
  };

  success(message: string): void {
    this.snackBar.open(message, '关闭', { duration: 3500, panelClass: ['notice-success'] });
  }

  error(error: unknown, fallback = '请求失败,请稍后重试｡'): void {
    this.snackBar.open(this.describe(error, fallback), '关闭', {
      duration: 7000,
      panelClass: ['notice-error'],
    });
  }

  describe(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse) {
      const body = error.error as ApiFailure | undefined;
      const traceId = body?.trace_id;

      // 优先解析工作流结构化错误
      const detail = body?.detail;
      if (detail && typeof detail === 'object' && 'code' in detail) {
        const message = this.formatWorkflowError(detail as WorkflowErrorDetail);
        return traceId ? `${message}(trace: ${traceId})` : message;
      }

      // 兼容原有字符串格式
      const message = typeof detail === 'string' ? detail : (body?.message ?? fallback);
      return traceId ? `${message}(trace: ${traceId})` : message;
    }

    return error instanceof Error ? error.message : fallback;
  }

  private formatWorkflowError(detail: WorkflowErrorDetail): string {
    const mainMessage =
      this.workflowErrorMessages[detail.code] ?? detail.message ?? '工作流校验失败';

    if (!detail.errors?.length) {
      return mainMessage;
    }

    // 组装子错误信息，最多显示 2 条，超出提示数量
    const errorLines = detail.errors.slice(0, 2).map((err) => {
      const subMsg = this.workflowErrorMessages[err.code] ?? err.message;
      return err.node_id ? `· ${err.node_id}: ${subMsg}` : `· ${subMsg}`;
    });

    if (detail.errors.length > 2) {
      errorLines.push(`· 另有 ${detail.errors.length - 2} 项错误未展示`);
    }

    return `${mainMessage}：\n${errorLines.join('\n')}`;
  }
}
