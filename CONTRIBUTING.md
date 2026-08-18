# 前端贡献指南

这份文档面向第一次参与本项目的同学，也作为代码助手和大模型理解前端仓库的入口。Git 概念只作简要说明；重点是**前端在整个平台中的职责、代码放在哪里、如何与后端协作，以及交付前必须通过什么检查**。

## 1. 前端负责什么

本仓库是智能水务算法管理平台的 Angular 21 前端。浏览器通过 FastAPI 的 REST 和 WebSocket 使用平台能力，不直接连接 MySQL、Redis、MinIO 或 Celery。

```text
用户操作
→ Angular 页面和表单
→ HttpClient / WebSocket
→ FastAPI API
→ 任务、工作流和结果
→ 标准化 DTO
→ 表格、图表和报告
```

主要技术：Angular 21、TypeScript、Angular Material、Signals、ECharts 6、Rete.js 2、Dockview、NGX Formly、AG Grid Community、Vitest。环境与启动方法见 [README](README.md)，请求和响应以后端 [API 文档](https://github.com/Schwarz-Hal/smart-water-platform-backend/blob/main/docs/API_CONTRACT_V1.md) 与 `/openapi.json` 为准。

### 目录职责

| 目录                | 用途                                         | 修改时注意                   |
| ------------------- | -------------------------------------------- | ---------------------------- |
| `src/app/core/`     | 认证、HTTP、拦截器、错误处理、任务跟踪、DTO、S01 场景服务、工作流草稿缓存 | 不放具体页面展示逻辑         |
| `src/app/features/` | 登录、首页、场景中心、数据资产、算子、工作流、任务、结果、用户、回收站等业务页面 | 每个 feature 保持独立边界    |
| `src/app/shared/`   | 通用组件、图表、选择器、血缘树、参数表单和展示模型 | 不直接解析某个接口的原始响应 |
| `src/app/layout/`   | 登录后的导航和页面外壳                       | 权限菜单、响应式布局         |
| `.storybook/`       | 通用组件的隔离展示                           | 只使用模拟数据，不连接服务器 |
| `src/**/*.spec.ts`  | Angular/Vitest 单元测试                      | 覆盖状态、权限和错误分支     |

### 核心服务清单（`core/services/`）

| 服务 | 职责 |
|------|------|
| `api-client.service.ts` | 统一 API 客户端，自动解包 `ApiEnvelope.data`，序列化查询参数 |
| `auth.service.ts` | 认证服务，sessionStorage 存储双 Token，登录/刷新/注销/账户注销 |
| `notification.service.ts` | 基于 MatSnackBar 的全局通知，自动携带 trace_id，解析工作流结构化错误 |
| `task-tracker.service.ts` | 任务追踪服务，WebSocket 优先，断开降级 2s 轮询，多任务并行管理 |
| `workflow-cache.service.ts` | 工作流草稿 IndexedDB 本地缓存，刷新页面可恢复未保存编辑 |
| `operator-name.service.ts` | 算子编码与显示名称映射，稳定编码不变，仅影响展示 |
| `s01-workflow.service.ts` | S01 漏损黑盒场景服务，封装模板解析→草稿创建→数据绑定→发布→运行全链路 |

### 不可突破的边界

- 业务请求使用相对路径 `/api`、`/health`，源码不写服务器 IP、SSH 或中间件地址。
- Token 只由认证服务管理，不写入代码、日志、测试快照或仓库。
- 前端权限控制只改善体验，后端始终是最终权限边界。
- 浏览器不获取数据库连接串、MinIO 密钥、内部对象键或 Celery 配置。
- 图表组件只接收规范化展示模型，不在浏览器重新计算算法结论。
- 工作流图使用稳定的英文编码和版本；中文名称只用于显示。
- 工作流编辑器必须保持唯一 Rete 实例，面板布局变化不能重建画布或丢失图数据。
- 不提交测试账号、真实数据、Token、构建目录、截图和本地配置。

## 2. 开始一个开发任务

### 第一次准备

安装 Git、Node.js 24 和 npm 11。获得仓库权限后：

```powershell
git clone https://github.com/Schwarz-Hal/smart-water-platform-frontend.git
cd smart-water-platform-frontend
git config user.name "你的 GitHub 名称"
git config user.email "你的 GitHub 邮箱"
npm ci
```

启动开发服务器：

```powershell
npm start
```

默认访问 `http://localhost:4200`，开发代理把 `/api` 和 WebSocket 转发到 `localhost:18000`。后端未启动时可以完成纯组件开发，但登录和真实业务操作失败属于预期现象。

### 每个任务都从最新 `main` 开始

Git 中，分支是独立开发线，commit 是一次可追溯修改，Pull Request（PR）用于审查和合并。固定流程如下：

```powershell
git switch main
git pull --ff-only origin main
git switch -c feature/<模块>-<事项>
```

分支命名：

- 新功能：`feature/dataset-lineage`
- 缺陷修复：`fix/workflow-layout`
- 文档：`docs/contribution-guide`
- 重构：`refactor/task-table`

不要直接在 `main` 上开发。一个分支只完成一个主题，不夹带无关格式化或大范围重命名。

## 3. 按前端流程实现功能

### 新增或修改 API 调用

1. 先确认后端接口、权限、分页、错误码和时间格式已经确定。
2. 在 `src/app/core/models/api.models.ts` 等模型位置定义或更新 DTO。
3. 通过统一 API Client/Service 发起请求，不在多个组件里重复拼 URL。
4. Feature 将 DTO 转换为页面状态；图表和共享组件接收规范化数据。
5. 同时实现加载中、空数据、403/404、业务失败和后端不可达状态。
6. 后端接口尚未完成时可以使用测试 mock，但不能把模拟结果伪装成真实平台能力。

### 页面和组件

- 优先复用 Angular Material 和 `shared/` 组件，不复制相似控件。
- 页面必须根据后端返回的权限控制入口，同时正确处理后端 403。
- 重要操作提供明确成功/失败反馈，并展示可复制的 `trace_id`。
- 时间统一通过 `beijing-time.pipe` 北京时间格式化逻辑显示，不直接依赖浏览器时区。
- 在 1440px、1024px 和手机宽度检查文字、按钮、表格、抽屉和图表。
- 新增通用组件时补充 Storybook；业务页面不需要为了展示而连接真实服务。

### 工作流编辑器

- Graph 中只保存节点编码、版本、参数、连线、位置和输出声明。
- 数据资产运行绑定按节点实例隔离，不能在不同 Dataset Channel 间共享表单状态。
- Rete、Dockview 与表单状态统一由编辑器 Store 协调，组件切换不得丢失草稿。
- 连线时校验端口 `data_type`，类型不匹配阻止连接。
- 前端校验用于即时提示，保存、发布和运行仍以后端校验为准。
- 修改图序列化时必须验证旧草稿、已发布图和历史运行仍可打开。
- 草稿同时写入服务端和 IndexedDB，多标签页编辑以 `expected_revision` 做乐观锁。

### S01 黑盒场景

- S01 漏损评估不暴露工作流编排细节，通过 `S01WorkflowService` 一键完成模板解析→草稿创建→四路数据绑定→发布→运行。
- 四路必填角色：`inlet_flow`、`authorized_consumption`、`legitimate_night_use`、`pressure`，不可复用同一数据通道。
- 压力通道单位必须为米（m），前端做前置校验。
- 运行结果通过 `/s01/runs/:runId` 查看，内部复用工作流运行接口。

### 权限点参考

| 权限码 | 控制范围 |
|--------|---------|
| `data_source:read` / `data_source:write` | 数据源查看 / 创建、测试、导入 |
| `dataset:read` | 数据资产详情查看 |
| `operator:read` | 算子目录查看 |
| `algorithm:publish` | 外部算法包导入页面 |
| `algorithm:approve` | 算法包审核批准/退回 |
| `algorithm:run` | 提交可执行算法（已统一走工作流） |
| `workflow:read` | 工作流库、运行记录、场景中心查看 |
| `workflow:edit` | 工作流创建、编辑、S01 场景运行 |
| `task:read` / `task:cancel` | 任务查看 / 取消 |
| `result:read` | 算法结果查看 |
| `user:manage` | 用户管理页面 |
| `recycle:manage` | 资源回收站页面 |

### 测试要求

测试应覆盖用户能观察到的行为：正常显示、权限隐藏、加载/空态、失败信息、参数类型、路由和关键状态恢复。修复缺陷时先增加能复现问题的测试。

## 4. 提交前检查

前端最低检查：

```powershell
npm test
npm run build
npm run build-storybook
npx prettier --check src/app/features/example/example.page.ts
git diff --check
git status --short
```

将示例路径替换为本次实际修改的前端文件。仓库仍有历史格式差异，不要为了一个功能 PR 执行全仓格式化并提交大量无关变化。

查看差异并只暂存本任务文件：

```powershell
git diff
git add src/app/features/example/example.page.ts `
  src/app/features/example/example.page.spec.ts
git diff --cached
git commit -m "feat: add example experience"
git push -u origin feature/<模块>-<事项>
```

不建议直接使用 `git add .`，避免把本地配置、截图或无关修改带进提交。

提交前缀：

| 前缀        | 用途                 |
| ----------- | -------------------- |
| `feat:`     | 新页面或能力         |
| `fix:`      | 缺陷修复             |
| `test:`     | 测试                 |
| `refactor:` | 不改变业务行为的重构 |
| `style:`    | 纯展示或格式调整     |
| `docs:`     | 文档                 |
| `chore:`    | 依赖、构建和维护     |

## 5. Pull Request 与后端协作

在 GitHub 创建 PR 时，目标分支选择 `main`，并说明：

- 用户会看到什么变化；
- 涉及哪些页面、权限和 API；
- 桌面与移动端如何验证；
- 运行了哪些测试；
- 是否依赖后端 PR 或暂未上线的接口。

前后端共同修改时：

1. 后端先固定请求、响应、错误码、权限和兼容策略。
2. 两个仓库分别提交 PR，并在 PR 描述中互相链接。
3. 前端不得依赖数据库字段或后端内部对象，只依赖公开 DTO。
4. 联调问题提供接口、时间、状态码和 `trace_id`，不要发送 Token、密码或完整连接串。
5. 后端暂未合并时，前端测试可以 mock；合并前必须说明尚未完成的真实联调。

审查提出修改后，在原分支继续提交并推送，PR 会自动更新，不需要重建分支和 PR。

## 6. 当前前端 CI 做什么

`.github/workflows/frontend-ci.yml` 在以下情况运行：

- 创建或更新 Pull Request；
- 向 `main` 推送提交。

GitHub Actions 会：

1. 使用 Ubuntu 和 Node.js 24；
2. 使用 npm 缓存并执行 `npm ci`；
3. 执行 `npm test`（Vitest）；
4. 执行生产构建 `npm run build`；
5. 执行 Storybook 静态构建 `npm run build-storybook`。

当前 CI 不连接真实后端、数据库、Redis、MinIO 或 GPU，也不执行服务器部署。全仓 `npm run format:check` 当前尚未进入 CI；提交前只检查并格式化本次涉及的文件。

CI 失败时，在 PR 的 **Checks** 或仓库 **Actions** 页面打开失败步骤，先定位第一处真实错误。修复后推送到同一分支会自动重新运行。只有确定是 GitHub Runner 或下载服务临时故障时才使用 Re-run。

CI 通过并完成审查后才能合并。合并后：

```powershell
git switch main
git pull --ff-only origin main
git branch -d feature/<模块>-<事项>
```

## 7. 常见 Git 问题

```powershell
# 取消暂存，但保留本地修改
git restore --staged <文件>

# 查看当前状态
git status

# 功能分支同步最新 main；先提交自己的工作
git fetch origin
git merge origin/main
```

出现冲突时，人工处理 Git 标出的文件，删除冲突标记，重新运行测试后再提交。不确定业务内容时找对应模块负责人确认。

禁止使用 `git reset --hard`、`git push --force` 或删除他人分支来处理问题。

## 8. 完成标准

- 页面只使用公开 API，未写死服务器和敏感信息；
- 权限、加载、空态和错误状态完整；
- DTO、业务组件和图表职责清晰；
- 测试、生产构建、Storybook 和本次修改文件的格式检查通过；
- 响应式页面完成必要宽度检查；
- PR 链接相关后端变更并说明真实联调状态；
- GitHub Actions 全部通过并至少完成一次审查。
