# 智能水务算法管理平台前端

这是连接 FastAPI 后端的 Angular 21 前端工程，覆盖认证、私有数据资产、内置算法、异步任务、结果与 S01 DMA 漏损评估。业务页面只展示后端已经提供的能力，候选结果仍须结合现场与业务规则人工核验。

## 技术边界

- Angular 21（Standalone Components、Router、Signals）与 Angular Material。
- Apache ECharts 6：质量、预测和异常检测的时序结果展示。
- 浏览器只访问相对路径 `/api`、`/health`；开发服务器代理到本机 `localhost:18000`。
- 登录令牌仅保存在 `sessionStorage`，关闭浏览器标签页会清除；不提交任何账号、Token、服务器地址或中间件地址。
- 后端仍是权限的最终裁决者。前端权限控制只负责隐藏不适用的菜单和操作。

## 前置条件

1. Node.js 24.x 与 npm 11.x（当前工程使用 Angular 21.2）。
2. 已启动或已转发后端到本机 `localhost:18000`。远程联调时，在 VSCode Remote Ports 中把服务器 `18000` 转发到本机 `18000`。
3. 测试账号由使用者在登录页手动输入，不写入文件。

## 本地启动

```powershell
npm ci
npm start
```

浏览器打开 `http://localhost:4200`。启动命令会自动读取 [proxy.conf.json](proxy.conf.json)：

```text
浏览器 http://localhost:4200/api/...
  → Angular 开发代理
  → http://localhost:18000/api/...
  → 已转发的 FastAPI 服务
```

WebSocket 的 `/api/v1/ws/tasks/{task_id}` 同样通过代理转发。业务源码不可写服务器 IP、SSH 信息、数据库 URI 或 Redis/MinIO/RabbitMQ 地址。

若只想在没有后端的情况下查看静态页面，可运行 `npm run start:direct`；此模式不会代理 API，因此登录和业务数据会失败是预期行为。

## 演示步骤

1. 登录后在首页检查 `/health/ready` 的 MySQL、Redis、Broker、MinIO 状态。
2. 在“数据资产”上传 CSV，查看表头预览并完成点位、时间、指标和值来源映射；或接入只读 MySQL 后发起导入。
3. 等待导入任务成功后，在“算法中心”按数据资产、版本、点位和指标通道逐级选择输入，再调整算法超参数并提交。
4. 进入任务页，观察 WebSocket 推送；连接中断时会每 2 秒轮询任务和日志。
5. 成功后打开结果页：Qscore 显示分项，Seasonal Naive 显示实际/预测/区间曲线，Hampel 显示异常点。
6. “S01 漏损评估”复用同一数据资产选择器；补齐必需 DMA 映射后可创建异步运行，并读取节点与候选结果。候选仍需人工核验。GPU Chronos-2 在 GPU 环境验收前保持禁用。

数据资产默认仅创建者与管理员可见。CSV 原件由后端保存到 MinIO，浏览器不会得到 MinIO 凭据或直连下载地址；只读 MySQL URI 输入框也不会回显密码。

## DAG 工作流页面

登录后进入“DAG 工作流”。页面从后端读取受审核节点目录和 S01 starter graph。Rete.js 编辑器支持节点目录点击/拖入、节点拖动、端口连线、输出端口声明、参数类型控件、画布适应、撤销/重做和 Graph 序列化；保存、校验和发布仍由后端裁决。运行时使用数据资产选择器为每个数据通道节点绑定资产、版本、点位、指标和值来源，不要求用户填写内部版本 ID。\n\n工作流运行记录位于“工作流运行记录”，详情页按节点展示状态、参数快照、日志和 artifact；最终输出使用通用渲染器显示时序、表格、标量、候选列表、报告或 JSON，S01 候选结果仍提示人工核验。

## 开发、测试与交接

```powershell
npm test
npm run build
npm run format:check
```

目录约定：

```text
src/app/core/       认证、HTTP、拦截器、任务追踪、错误处理与 DTO
src/app/shared/     数据资产选择器、状态标签、图表等不依赖具体接口的通用组件
src/app/features/   登录、首页、数据源、算法、任务、结果、用户、S01、DAG 编辑器与运行详情
src/app/layout/     已登录后的导航外壳
```

新增 API 时，先在 `core/models/api.models.ts` 固化 DTO，再由 feature 调用 `ApiClient`；不要让图表组件解析后端原始响应。新增路由应保持懒加载，避免 ECharts 等大依赖进入登录首屏。

## 常见问题

- **401 / 自动跳回登录**：Token 已失效，重新登录即可；不要把 Token 写入 localStorage 或代码。
- **健康检查失败 / 请求 `ECONNREFUSED`**：确认 VSCode 的 `18000 → localhost:18000` 端口转发还在，或确认本机后端正在监听 18000。
- **CORS 报错**：正常代理模式下浏览器访问的是 `4200`，由开发服务器转发，通常不需要额外改 CORS；只有绕过代理直连后端时，才需后端显式允许前端 Origin。
- **WebSocket 断开**：任务页会自动使用轮询回退；最终状态以任务查询接口和后端 MySQL 记录为准。
- **GPU 算法不可点**：当前 GPU Worker 未验收，是刻意禁用，不应在前端解除限制。

更多演示边界见 [docs/DEMO_GUIDE.md](docs/DEMO_GUIDE.md)。

