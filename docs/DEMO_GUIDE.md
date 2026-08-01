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

| 页面   | 真实接口                                                             | 说明                                              |
| ------ | -------------------------------------------------------------------- | ------------------------------------------------- |
| 登录   | `POST /api/v1/auth/login`、`GET /auth/me`                            | Token 放在 sessionStorage；刷新失败则安全退出。   |
| 首页   | `GET /health/ready`、`GET /tasks/{id}`                               | 只显示当前浏览器会话曾跟踪的任务。                |
| 数据源 | `GET/POST /data-sources`、`POST /{id}/test`、`POST /ingestions`      | 仅创建只读 MySQL 数据源；绝不回显连接密码。       |
| 算法   | `GET /algorithms`、`POST /algorithms/runs`                           | 只允许 `builtin_cpu + ready` 的算法提交。         |
| 任务   | `GET /tasks/{id}`、`GET /tasks/{id}/logs`、`POST /tasks/{id}/cancel` | 优先 WebSocket，2 秒轮询作为回退。                |
| 结果   | `GET /results/tasks/{id}`、`GET /timeseries`                         | Qscore、Seasonal Naive、Hampel 采用真实结果渲染。 |
| 用户   | `GET /users`                                                         | 仅有 `user:manage` 权限时可见。                   |

`/api/v1/ws/tasks/{task_id}?access_token=...` 的 Token 只用于连接已有的任务进度通道。前端不以 WebSocket 的瞬时消息决定最终事实；刷新或断线后会重新从 HTTP 查询任务状态。

## 权限展示原则

前端根据 `/auth/me` 的 `permissions` 控制导航和按钮。例如：

- `data_source:read`：可见数据源；`data_source:write`：可创建、测试、导入。
- `algorithm:read`：可浏览算法；`algorithm:run`：可提交可执行的 CPU 算法。
- `task:read`：可打开任务页；`task:cancel`：可看见取消按钮。
- `result:read`：可打开结果页；`user:manage`：可见用户页面。

这是减少误操作的用户体验措施，不能替代后端鉴权。即使有人通过浏览器开发者工具手动构造请求，后端仍必须返回 403。

## S01 漏损页边界

当前 S01 页呈现固定流程，并可查看每个节点的输入/输出端口、可调超参数和可视化契约：数据质量 → DMA 水量平衡/夜流/压力修正 → 正常基线 → 持续残差 → 证据融合 → 漏损候选。它不提供运行按钮，不展示模拟漏点、虚构损失量或地图结果。

当后端实现 `assessment run`、`node run`、`leak candidate` 契约后，可保留该路由、节点元数据和参数面板，仅替换静态定义为真实运行状态与结果。

## 联调前检查

1. 在 VSCode Port 面板确认本地 `18000` 正在转发到服务器 `18000`。
2. 访问 `http://localhost:18000/health/live`，应返回后端存活响应。
3. 在本仓库运行 `npm start`，浏览器从 `http://localhost:4200` 打开。
4. 登录后先看首页健康状态，再创建 CPU 任务；GPU 算法应保持禁用。
5. 发现接口字段变化时，先记录 `trace_id`，与后端同学对照 OpenAPI 和任务日志后再改 DTO。
