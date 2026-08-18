# 前端演示与真实 API 对照

## 网络拓扑

本演示不把后端、中间件或服务器端口暴露到浏览器。开发时维持如下边界：

```text
浏览器 ── http://localhost:4200 ── Angular 开发服务器
                                      │ /api、/health、WebSocket
                                      ▼
                               http://localhost:18000
                                      │
                              VSCode Remote Port 转发
                                      ▼
                               FastAPI / Celery / MySQL
```

因此前端代码只使用 `/api/v1/...`，不能写远程 IP、SSH 用户、数据库 URI 或任何中间件端口。

## 页面与后端接口

| 页面 | 路由 | 真实接口 | 说明 |
|------|------|---------|------|
| 登录 | `/login` | `POST /api/v1/auth/login`、`POST /api/v1/auth/refresh`、`POST /api/v1/auth/register`、`DELETE /api/v1/auth/account` | Token 放在 sessionStorage；401 自动无感刷新；支持注册与账户注销。 |
| 平台概览 | `/dashboard` | `GET /api/v1/portal/summary` | 平台统计、负载状态、最近数据资产/工作流/任务。 |
| 场景中心 | `/scenes` | （前端静态配置） | 12 个水务业务场景库，2 个已上线（S01 漏损、水质异常检测），10 个即将上线。 |
| 数据源与导入 | `/data-sources` | `GET/POST /api/v1/data-sources`、`POST /api/v1/data-sources/{id}/test`、`POST /api/v1/ingestions`、`POST /api/v1/data-sources/csv-uploads`、`POST /api/v1/csv-uploads/{batch_code}/imports` | CSV 上传含智能字段映射建议；仅创建只读 MySQL 数据源；绝不回显连接密码。 |
| 数据资产详情 | `/datasets/:id` | `GET /api/v1/datasets/{id}`、`GET /api/v1/datasets/{id}/versions`、`GET /api/v1/datasets/{id}/lineage`、`GET /api/v1/dataset-versions/{id}/channels`、`GET /api/v1/dataset-versions/{id}/quality-reports` | 版本管理、血缘树、通道明细、质量报告。 |
| 算子中心 | `/operators` | `GET /api/v1/operators`、`GET /api/v1/operators/{code}`、`PATCH /api/v1/operators/{code}`、`GET /api/v1/workflow-templates` | 查看算子契约（端口、参数、运行时、成熟度）；不直接执行任务；管理员可停用/启用。 |
| 外部算法导入 | `/operators/import` | `GET/POST /api/v1/algorithm-packages`、`GET /api/v1/algorithm-packages/versions/{id}`、`POST .../provision`、`PUT /api/v1/algorithm-operator-drafts/{id}`、`POST .../validate`、`POST .../smoke-tests`、`POST .../submit\|approve\|reject`、`GET /api/v1/runtime-profiles` | 六步上审流程：上传→静态检查→环境制备→契约编辑→样例试运行→审核激活。 |
| 工作流库 | `/workflows` | `GET/POST /api/v1/workflows`、`POST /api/v1/workflows/from-template`、`POST /api/v1/workflows/{id}/clone`、`POST /api/v1/workflows/{id}/draft/from-version`、`DELETE /api/v1/workflows/{id}`、`POST .../restore`、`DELETE .../permanent` | 草稿/已发布/全部/回收站多视图；克隆、派生版本、软删除与永久删除。 |
| 工作流编辑器 | `/workflows/:id/edit` | `GET /api/v1/workflows/{id}`、`PUT /api/v1/workflows/{id}/draft`、`POST /api/v1/workflows/{id}/publish` | Rete 画布 + Dockview 面板；草稿同时存服务端和 IndexedDB。 |
| 工作流运行记录 | `/workflow-runs` | `POST /api/v1/workflow-versions/{versionId}/runs`、`GET /api/v1/workflow-runs`、`GET /api/v1/workflow-runs/{runId}` | 运行提交、列表、详情（节点状态、参数快照、日志、artifact）。 |
| 任务中心 | `/tasks` | `GET /api/v1/tasks`、`POST /api/v1/tasks/{id}/rerun`、`DELETE /api/v1/tasks/{id}` | AG Grid 表格；全平台任务统一管理。 |
| 任务详情 | `/tasks/:id` | `GET /api/v1/tasks/{id}`、`GET /api/v1/tasks/{id}/logs`、`POST /api/v1/tasks/{id}/cancel` | 优先 WebSocket，2 秒轮询作为回退。 |
| 算法结果 | `/results/:taskId` | `GET /api/v1/results/tasks/{id}`、`GET /api/v1/timeseries` | 通用渲染器显示时序、表格、标量、候选列表、JSON。 |
| S01 漏损评估 | `/s01-leakage` | `GET /api/v1/workflows/templates/s01-leakage` + 工作流全套接口（通过 `S01WorkflowService` 封装） | 黑盒场景：四路数据绑定→参数设置→一键运行，自动创建工作流并提交。 |
| S01 运行结果 | `/s01/runs/:runId` | `GET /api/v1/workflow-runs/{runId}` | 漏损评估运行详情、风险时间线、候选时段与报告。 |
| 用户管理 | `/users` | `GET /api/v1/users` | 仅有 `user:manage` 权限时可见。 |
| 资源回收站 | `/recycle-bin` | `GET /api/v1/recycle-bin`、`POST /api/v1/recycle-bin/{id}/restore`、`POST /api/v1/recycle-bin/restore`、`POST /api/v1/recycle-bin/purge` | 已删除资源保留 14 天；支持恢复、永久清理、批量操作。 |

`/api/v1/ws/tasks/{task_id}?access_token=...` 的 Token 只用于连接已有的任务进度通道。前端不以 WebSocket 的瞬时消息决定最终事实；刷新或断线后会重新从 HTTP 查询任务状态。

## 权限展示原则

前端根据 `/api/v1/auth/me` 的 `permissions` 控制导航和按钮。例如：

- `data_source:read`：可见数据源；`data_source:write`：可创建、测试、导入。
- `dataset:read`：可查看数据资产详情。
- `operator:read`：可浏览算子目录。
- `algorithm:publish`：可进入外部算法导入页。
- `algorithm:approve`：可批准/退回算法包审核。
- `workflow:read`：可浏览工作流、运行记录、场景中心；`workflow:edit`：可创建/编辑工作流、运行 S01 场景。
- `task:read`：可打开任务页；`task:cancel`：可看见取消按钮。
- `result:read`：可打开结果页。
- `user:manage`：可见用户页面。
- `recycle:manage`：可见资源回收站。

这是减少误操作的用户体验措施，不能替代后端鉴权。即使有人通过浏览器开发者工具手动构造请求，后端仍必须返回 403。

## S01 漏损页说明

当前 S01 页是**可运行的黑盒业务场景**，不再是静态展示页：

- **四路必填数据绑定**：进水流量（inlet_flow）、授权用水量（authorized_consumption）、合法夜间用水量（legitimate_night_use）、管网压力（pressure）。
- **前置校验**：四路通道不可重复；压力通道单位必须为米（m）。
- **一键运行**：通过 `S01WorkflowService` 自动完成：获取内置模板 → 创建工作流草稿 → 绑定数据到 graph.bindings → 发布版本 → 提交运行。
- **运行结果**：跳转到 `/s01/runs/:runId`，查看节点状态、风险时间线、候选时段和评估报告。
- **候选仅用于人工核验**，不代表漏点结论；不展示模拟漏点、虚构损失量或地图结果。

当后端实现更多场景模板（如 S02 内涝、水质预测等）后，可在场景中心新增入口，复用相同的黑盒场景模式。

## 联调前检查

1. 在 VSCode Port 面板确认本地 `18000` 正在转发到服务器 `18000`。
2. 访问 `http://localhost:18000/health/live`，应返回后端存活响应。
3. 在本仓库运行 `npm start`，浏览器从 `http://localhost:4200` 打开。
4. 登录后先看平台概览确认服务状态，再创建 CPU 工作流或进入 S01 场景运行；GPU 算子在运行时环境未就绪时由后端标记为不可用。
5. 发现接口字段变化时，先记录 `trace_id`，与后端同学对照 OpenAPI 和任务日志后再改 DTO。
