# Omnigent 与 AI Manus：Runner、Agent Runtime、Sandbox 和分布式部署分析

> 整理时间：2026-08-30  
> 分析对象：本地 `omnigent` 与 `/Users/songqiutao/Project/ai_manus` 源码  
> 文档目的：记录已确认的 Omnigent 架构，并沉淀 AI Manus 后续把 Runner/Runtime 下沉到会话 Sandbox 的设计方向。

## 1. 结论先行

1. **Omnigent 后端主体是 Python**，基于 FastAPI、Uvicorn、SQLAlchemy、Pydantic、HTTPX 和 WebSocket；前端是 React + TypeScript + Vite。
2. Omnigent 不是传统的“把同一个无状态后端复制多份”的分布式架构，而是一个 **中心控制面 Server + 分布式执行面 Host/Runner/Harness** 的 Controller/Worker 架构。
3. Omnigent 当前 Server 仍是单副本：Runner 注册表保存在内存中。执行面可以分布在多台机器，但控制面还没有完成水平扩展。
4. Omnigent 没有把 RabbitMQ、Kafka、Celery 之类的外部消息队列作为核心执行链路。它主要使用 WebSocket/HTTP、进程内 `asyncio.Queue` 和数据库；这些内部队列不等于分布式消息中间件。
5. 普通 Host 部署下，Runner、Harness 和 Codex CLI/App Server 都是宿主机上的普通子进程；Managed Sandbox 部署下，Omnigent 会先创建会话 Sandbox，再在 Sandbox 中启动 Host、Runner、Harness 和底层 Agent Runtime。
6. Codex 原生 `spawn_agent` 产生的是同一个 Codex App Server 内的子 Thread，不会为每个子 Agent 再创建 Runner、Harness 或 Codex App Server。Omnigent 主要负责观察并把这些子 Thread 投影成平台可展示的 Child Conversation。
7. Omnigent 的 `sys_session_send` 是另一套平台级能力：它通过工具创建或复用 Child Session，把两个独立 Agent Runtime 组织成逻辑父子关系，甚至可以跨 Runtime 类型协作。
8. AI Manus 当前已经是“一个 Session 对应一个动态 Sandbox”，但主要 AgentTaskRunner、FlowRuntime 和 AgentRuntimeInstance 仍运行在共享 Backend 进程中，Sandbox 主要负责 Bash、文件等工具执行。
9. AI Manus 后续可以采用更直接的目标：**共享 Server 控制面 + 每个 Session 一个 Sandbox + Sandbox 内一个 Session Runner，Runner 内承载 FlowRuntime、AgentRuntimeInstance、外部 Harness/CLI 和工具执行**。
10. 这个目标不要求先实现 Omnigent 式 Host。第一阶段可以直接由现有 Docker/Kubernetes/Sandbox 管理器创建会话容器；只有需要跨机器动态拉起 Runner、机器注册、能力上报和远程升级时，才值得增加 Host daemon。

## 2. 概念不要按目录名机械对应

Omnigent 的 `service`、AI Manus 的 `application` 都可能是代码组织名称，不天然等于一个可独立部署的服务。更准确的对应关系如下：

| 架构职责 | Omnigent | AI Manus 当前 | AI Manus 目标建议 |
| --- | --- | --- | --- |
| 产品/API 控制面 | Server | FastAPI + application services | 保留在共享 Server 中 |
| 机器级执行代理 | Host | 暂无直接对应物 | 第一阶段不增加；Docker/K8s 先承担进程调度 |
| 会话执行协调器 | Runner | `AgentTaskRunner` 最接近，但当前不是独立进程/网络 Worker | Sandbox 内的 `SessionRunner` |
| 会话编排运行时 | Harness/Runtime | `Flow + FlowRuntime` | 放入会话 Sandbox |
| 单 Agent 执行实例 | Harness 内部 Runtime/Thread | `AgentRuntimeInstance` | 放入会话 Sandbox，由 FlowRuntime 管理 |
| 外部 Agent 适配 | Codex/Claude 等 Harness | 尚未形成统一外部 Harness 层 | 在 SessionRunner 下增加适配器 |
| 隔离环境 | Managed Sandbox 或工具 Sandbox | `DockerSandbox` | 作为完整的会话执行容器 |
| 持久化事实源 | Server 数据库/Artifact Store | Postgres/Redis/MinIO 等 | 继续由控制面负责 |

因此：

- Omnigent 的 Server 更接近 AI Manus 的共享 Backend/Application Control Plane。
- Omnigent 的 Runner 更接近“把 AI Manus 的 `AgentTaskRunner + FlowRuntime` 变成一个独立会话 Worker”之后的形态。
- Omnigent 的 Harness 更接近 AI Manus 的一整套 Flow/Agent Runtime，而不只是某个 service 类。
- Host 是机器级生命周期代理，不是 Runtime 的必要业务层。

## 3. Omnigent 的真实部署拓扑

### 3.1 Server、Host、Runner、Harness 到底分别是什么

先用一句话定义整条链路：

```text
Server 决定“哪个会话应该在哪里运行”
Host 负责“在这台机器上把 Runner 进程拉起来”
Runner 负责“接管会话执行并管理 Harness”
Harness 负责“把统一会话协议翻译成某种具体 Agent Runtime 协议”
Agent Runtime 负责“真正执行模型循环、工具调用和上下文管理”
```

#### Server：中心控制面

Server 是全平台共享的 Backend，不执行具体 Agent 推理循环。它主要负责：

- 用户、认证、AgentSpec、Session/Conversation 和平台配置。
- 会话创建、归档、恢复、父子关系和持久化。
- Host/Runner 在线注册表以及 Session 到 Runner 的路由。
- 接收前端/CLI 消息，再通过 Runner tunnel 转发给执行面。
- 接收 Runner 事件，持久化后通过 SSE/WebSocket 提供给前端。
- Managed Sandbox 的创建、绑定、停止和重新拉起。

它回答的是：**谁发起了哪个会话、会话归谁、应该交给哪个执行环境、结果如何持久化和展示。**

Server 不应该持有 Codex/Claude 子进程句柄，也不应该直接运行某个会话的 Agent loop。Omnigent 当前 Server 仍只有一个副本，因为在线 Runner registry 保存在进程内存中。

#### Host：机器级进程代理

Host 是部署在某台执行机器上的 daemon。它主动连接 Server，接受启动/停止 Runner 的控制命令，主要负责：

- 注册“这台机器可用于执行”。
- 报告机器身份和可用能力。
- 在本机创建、观察、停止和清理 Runner 进程。
- 为 Server 无法直接访问的本地电脑、私网机器或远程节点提供反向连接。
- 管理工作目录、终端和机器级资源。

Host 不处理模型上下文，不管理 Agent 的父子 Thread，也不实现 Harness 协议。它回答的是：**怎样在这台机器上可靠地运行一个 Runner。**

因此 Host 不是 Agent 架构的必需业务层，而是 Omnigent 为“任意机器都能成为执行节点”增加的机器控制层。如果 Runner 已经由 Docker、Kubernetes 或 Sandbox Provider 创建，基础设施本身就能承担大部分 Host 职责。

#### Runner：会话执行协调器

Runner 是实际执行面的入口。它与 Server 建立 tunnel，并负责：

- 接收属于本 Runner/Session 的消息和控制请求。
- 维护会话状态、事件队列、异步 Inbox 和审批等运行期状态。
- 根据会话指定的 Harness 类型，懒启动并管理 Harness subprocess。
- 分发 Omnigent 动态工具，包括平台级 `sys_session_send`。
- 做子 Agent 路由、模型覆盖、事件转发和结束状态处理。
- 在会话结束或归档时回收 Harness 和相关子进程。

Runner 不等于具体 Codex Runtime。它回答的是：**一个平台会话如何被可靠地交给正确的 Harness 执行，并怎样把执行状态送回 Server。**

在 Host 启动的顶层会话中，Omnigent 通常给该会话一个 dedicated Runner。不过 Runner 内部的 `HarnessProcessManager` 仍按 Conversation 管理 Harness；平台级 Child Session 也可能由同一执行环境承载。因此不要把“Runner”机械理解成“一个 Agent 实例”。

#### Harness：具体 Runtime 的适配和进程隔离层

Harness 是 Omnigent 统一会话协议与具体 Agent Runtime 之间的适配器。它主要负责：

- 把统一的 Session/Turn、消息、工具和权限配置翻译成 Codex、Claude 等 Runtime 能理解的协议。
- 启动、恢复、停止底层 Runtime。
- 把 Runtime 的增量文本、工具调用、状态和子 Thread 事件转换为 Omnigent 事件。
- 屏蔽不同 Runtime 在 resume、steer、enqueue、model override 等能力上的差异。

Omnigent 的 `HarnessProcessManager` 默认每个 Conversation 懒启动一个 Harness subprocess，Runner 通过 Unix socket 上的 HTTP 客户端与它通信。

对于 Codex，Harness 内部再启动一个长驻 `codex app-server`；对于其他 Harness，则可能启动对应 CLI、SDK Runtime 或原生服务。

#### Agent Runtime：真正工作的执行引擎

Agent Runtime 是最底层的 Codex App Server、Claude Code/SDK 或其他 Agent 引擎。模型循环、上下文、原生 Thread、原生子 Agent 和具体工具执行机制最终由它完成。

Omnigent 对 Runtime 进行托管、路由和观测，但不会取代 Runtime 自己的内部会话管理。例如 Codex 原生 `spawn_agent` 的 Child Thread 仍由 Codex App Server 创建和管理。

#### 四层控制关系速查

| 层 | 管理对象 | 主要状态 | 是否必须 |
| --- | --- | --- | --- |
| Server | 全平台 Session、Host、Runner 路由 | 持久化平台状态 + 当前在线路由 | 必须 |
| Host | 一台机器上的 Runner 进程 | 机器连接和进程生命周期 | 可选 |
| Runner | 会话执行与 Harness 进程 | 会话运行期状态、队列、Inbox | 必须有等价职责 |
| Harness | 某个 Conversation 的具体 Runtime | Runtime 连接、协议转换、子进程 | 接外部 Runtime 时必须 |

最容易混淆的边界是：

- Server 管平台，不跑 Agent。
- Host 管机器和进程，不管会话语义。
- Runner 管会话执行，不负责具体 Runtime 的内部推理实现。
- Harness 管适配和 Runtime 生命周期，不是平台级 Session 控制面。

### 3.2 普通 Host 模式

```text
Browser / CLI
      │ HTTP / SSE
      ▼
Omnigent Server（中心控制面）
      │ WebSocket tunnel
      ▼
Host daemon（每台执行机器一个）
      │ 创建和回收进程
      ▼
Runner（Host 启动的顶层会话通常拥有 dedicated Runner）
      │ 每个 Omnigent Conversation 懒启动一个进程
      ▼
Harness subprocess
      │ 适配具体 Runtime
      ├── Codex Harness → codex app-server → parent/child threads
      ├── Claude Harness → Claude runtime
      └── 其他 Harness
```

这个模式没有自动为每个 Codex 进程再套一层 Docker。Runner、Harness 和 CLI/App Server 默认都是执行机器上的普通 OS 子进程。Codex 自己仍可启用 `read-only`、`workspace-write` 或 `danger-full-access` 等 Sandbox 策略，但它和外层容器/微虚拟机不是同一层隔离。

### 3.3 Managed Sandbox 模式

```text
Omnigent Server
      │ 调用 Sandbox Provider
      ▼
Session Managed Sandbox
  ├── Host
  ├── dedicated Runner
  ├── per-conversation Harness
  ├── Codex/Claude/其他 Agent Runtime
  └── Workspace 与工具执行环境
```

Server 的 `_run_managed_launch()` 会完成：

1. 为 Session 创建 Managed Sandbox。
2. 在其中启动 Host。
3. 把 Host 和 Workspace 绑定到 Session。
4. 要求 Host 启动 Runner。
5. 等待 Runner tunnel 上线后再转发消息。

所以 Omnigent 同时支持两种执行环境：

- **直接宿主机执行**：适合可信本机环境，启动快，结构简单。
- **整个执行栈进入 Managed Sandbox**：适合远程执行、不可信代码、依赖隔离和资源限制。

### 3.4 Runner 与 Harness 的进程粒度

`HarnessProcessManager` 明确采用“每个 Omnigent Conversation 一个 Harness subprocess”，第一次访问该会话时懒启动，并让进程生命周期跟随会话。

Codex Harness 随后启动一个长驻的 `codex app-server`。因此一个普通 Codex 会话的典型进程关系是：

```text
Runner
  └── Harness subprocess（Conversation A）
        └── codex app-server
              └── Codex Thread A
```

这里的“一个会话一个 Harness”指 Omnigent 平台 Conversation，不等于“每个 Codex 原生子 Agent 一个 Harness”。

## 4. 两种子 Agent 必须严格区分

### 4.1 Codex 原生子 Agent

当 Codex Runtime 内部执行 `spawn_agent` 时，父子关系由 Codex 自己管理：

```text
1 Runner
  └── 1 Harness
        └── 1 codex app-server
              ├── Parent Thread
              ├── Child Thread A
              ├── Child Thread B
              └── Child Thread C
```

Omnigent 在这条链路中的主要职责是：

- 监听 Codex 子 Thread 的创建和事件。
- 为子 Thread 创建或更新 Child Conversation 投影。
- 回填子 Thread 历史，用于 UI、持久化和状态展示。
- 可通过 PreToolUse hook 对 `spawn_agent` 做模型路由或策略控制。

真正的 Thread 创建、调度、上下文和生命周期仍由 Codex App Server 负责。

### 4.2 Omnigent 平台级子 Agent

当父 Agent 调用 `sys_session_send` 时，父子关系由 Omnigent 平台创建：

```text
Parent Agent Runtime
      │ sys_session_send 工具调用
      ▼
Omnigent Runner / Server
      ├── 创建或复用 Child Session
      ├── 写入 parent_session_id
      ├── 选择 Child Agent / Harness / Model
      ├── 启动或唤醒 Child Runtime
      └── 完成后把结果投递到 Parent Inbox
```

这里相当于通过一个平台工具，把两个原本独立的 Agent Runtime 组合成逻辑父子结构：

- 父 Runtime 看到的是一次委派工具调用。
- 子 Runtime 看到的是一条普通用户任务。
- 平台负责 Session 关系、生命周期、状态、展示和结果回传。
- 父子可以使用不同 Runtime，例如父 Codex、子 Claude。
- 这是逻辑父子关系，不要求操作系统进程也形成父子关系。

一句话区分：

- `spawn_agent`：Codex Runtime 内部的 Child Thread。
- `sys_session_send`：Omnigent 平台创建的跨 Runtime Child Session。

## 5. Omnigent 的“分布式”与传统分布式有什么不同

### 5.1 传统无状态服务扩容

```text
Load Balancer
  ├── Application instance 1
  ├── Application instance 2
  └── Application instance 3
         │
         └── Shared DB / Redis / MQ
```

每个 Application 实例通常能力相同，请求可在实例之间自由调度。

### 5.2 Omnigent 的控制面/执行面分离

```text
Single Server control plane
  ├── Host A → Runner A1 / A2
  ├── Host B → Runner B1 / B2
  └── Managed Sandbox C → Host C → Runner C1
```

它更像 GitLab Server/Runner、Jenkins Controller/Agent 或 Kubernetes Control Plane/Node Agent：

- Server 管理用户、配置、会话、路由和持久化。
- Host 代表一台可执行机器。
- Runner 代表具体执行单元。
- Harness 适配不同 Agent Runtime。

这种设计的主要收益是：

- 把高风险、高资源消耗的 Agent 执行与 API 控制面隔离。
- 不同 Runner 可以拥有不同操作系统、GPU、CLI、凭据和网络能力。
- 单个会话崩溃或 CLI 泄漏时，不必拖垮整个 Server。
- 可以按会话调度、限额、暂停、回收和迁移执行资源。

代价是：

- 需要处理注册、心跳、断线、重连、进程回收和状态同步。
- 调试从单进程调用变成跨进程/跨网络调用。
- 会话恢复、日志聚合、指标和资源计费更复杂。
- Sandbox 镜像构建和冷启动会增加延迟。

### 5.3 当前控制面并没有真正水平扩展

Omnigent Kubernetes 文档明确说明，Server 的 Runner registry 仍在进程内存中，因此只支持一个 Server replica。也就是说：

- **执行面可以分布式部署。**
- **Server 控制面目前仍是单点。**

若要多 Server 副本，需要把 Runner/Host 在线注册、请求关联和 tunnel 路由等状态迁移到共享协调层；这不是简单把 `replicas` 改大。

### 5.4 消息队列结论

当前核心链路未依赖 RabbitMQ、Kafka、NATS 或 Celery。源码中大量 `Queue` 主要是：

- Runner/Server 进程内的 `asyncio.Queue`。
- WebSocket tunnel 的收发缓冲。
- Session Inbox 和 SSE 事件队列。
- 前端消息暂存队列。

这些队列用于并发解耦，但不能提供跨 Server 副本的共享消费、持久化重放和分布式协调。因此，未来若只做“一个 Server 对多个会话 Sandbox”，**不需要为了架构形式先增加新的 MQ**；现有 HTTP/WebSocket/Redis 能覆盖需求时，应继续走最短路径。

### 5.5 关键技术速查

| 范围 | Omnigent 采用的主要技术 | 用途 |
| --- | --- | --- |
| 后端语言 | Python 3.12+ | Server、Host、Runner、Harness 主体 |
| Web/API | FastAPI、Starlette、Uvicorn、Pydantic | REST、SSE、WebSocket、协议模型 |
| 前端 | React、TypeScript、Vite | 会话 UI、状态展示、终端和管理界面 |
| 控制面持久化 | SQLAlchemy、Alembic，支持 SQLite/PostgreSQL/MySQL | Session、Agent、配置和平台状态 |
| 执行面通信 | HTTP、WebSocket tunnel、Unix domain socket | Server↔Host/Runner、Runner↔Harness |
| 进程并发 | `asyncio`、subprocess、进程内 Queue | Harness/CLI 生命周期和事件流 |
| Agent Runtime | Codex App Server、Claude Agent SDK/CLI、OpenAI Agents 等 | 实际 Agent loop 与工具调用 |
| 可观测性 | OpenTelemetry | API、HTTP 和数据库链路追踪 |
| Sandbox Provider | Kubernetes、Modal、Daytona、E2B、Boxlite 等可选后端 | 会话级隔离和远程执行 |
| Artifact | 本地或 S3 兼容对象存储 | 会话文件和制品 |

关键判断：

- WebSocket/Unix socket 是通信机制，不是持久化消息队列。
- `asyncio.Queue` 是单进程内并发结构，不支持多 Server 共享。
- Harness subprocess 提供的是故障和依赖边界，不等于安全 Sandbox。
- 外层 Managed Sandbox、Codex 自身 Sandbox mode、工具级权限策略是三层不同的安全边界。

## 6. AI Manus 当前状态

AI Manus 已具备明确的 Session 运行链路：

```text
FastAPI / Application
  └── AgentTaskRunner（共享 Backend 进程内）
        ├── Flow
        ├── FlowRuntime
        │     ├── AgentRuntimeInstance A
        │     ├── AgentRuntimeInstance B
        │     └── Mailbox / Agent loops
        ├── Event Dispatcher / Publisher
        └── DockerSandbox client
                │ HTTP
                ▼
          Session Sandbox service
                ├── Bash
                ├── File
                └── Supervisor / workspace
```

当前边界的关键点：

- Session 持有 `sandbox_id`，动态 Sandbox 生命周期已经与会话关联。
- `AgentTaskRunner` 负责组装 FlowRuntime、事件出口、Mailbox 和 Sandbox 心跳。
- `FlowRuntime` 管理多个 `AgentRuntimeInstance` 和各自的 Agent loop。
- `AgentRuntimeInstance` 负责单 Agent mailbox 串行消费和执行。
- Redis Stream 已用于 Mailbox 等异步传输。
- Agent Runner/Runtime 本身仍在 Backend Python 进程，不在 Sandbox 中。

因此 AI Manus 当前不是“每个 Session 一个完整 Agent Runtime 容器”，而是“每个 Session 一个工具执行 Sandbox，共享 Backend 承载多个 Session Runtime”。

## 7. AI Manus 后续目标方案

### 7.1 推荐的最小目标拓扑

你提出的方向可以整理为：

```text
Frontend
   │
   ▼
Shared Server / Control Plane
   ├── Auth / Project / Session API
   ├── Session metadata 与持久化
   ├── Sandbox lifecycle
   ├── Runner registry / routing
   └── Event streaming
          │
          ├── Session A Sandbox
          │     └── SessionRunner A（容器启动后主动注册）
          │           ├── FlowRuntime
          │           ├── AgentRuntimeInstance(s)
          │           ├── Harness adapters
          │           ├── Codex/Claude App Server or CLI
          │           └── Bash/File/Workspace
          │
          └── Session B Sandbox
                └── SessionRunner B（容器启动后主动注册）
                      └── 同一套会话执行栈
```

这里 Server 直接管理和路由到每个会话 Sandbox；Sandbox 内只有一个 SessionRunner。由于这个 Runner 只服务一个 Session，命名为 `SessionRunner` 或 `SessionWorker` 会比照抄 Omnigent 的通用 `Runner` 更准确。

这是本方案已经明确的架构取舍：

- **不部署 Omnigent Host。**
- Docker/Kubernetes/Sandbox Provider 负责创建和停止容器。
- Runner 直接写入 Sandbox 镜像，作为容器主服务或由容器内 supervisor 启动。
- Runner 启动后使用会话范围的注册 token 主动连接 Server。
- Server 保存 `session_id → runner_id/connection` 的路由。
- Server 不进入容器启动 Codex CLI；它只向 Runner 发会话命令。
- Runner 在自己的容器内启动 Harness 和 Codex/Claude Runtime。

因此要借鉴的是 Omnigent 的 **Server/Runner/Harness 职责边界**，不是完整复制它的 Server/Host/Runner 部署形态。

### 7.2 无 Host 模式的会话生命周期

```text
1. 用户创建或恢复 Session
2. Server 写入 Session 元数据并创建会话 Sandbox
3. Sandbox 启动 SessionRunner
4. SessionRunner 携带 session_id + scoped token 主动注册 Server
5. Server 将用户消息路由到该 Runner
6. Runner 懒启动 Harness 和具体 Agent Runtime
7. Runtime 事件经 Runner 回传 Server
8. Server 持久化并推送给前端
9. Session 归档或超时后，Server 停止 Sandbox
10. 再次恢复时，根据持久化 checkpoint 创建新 Sandbox/Runner
```

这里 Host 原来负责的“创建 Runner 进程”已经被容器编排替代；Host 原来负责的“Runner 主动连回 Server”则由容器内 Runner 自己完成。

第一阶段建议每个 Sandbox 只运行一个 SessionRunner，不在同一个容器中复用多个用户 Session。这样 Session、容器、Workspace、Runtime 进程和资源限额可以一一对应，故障边界最清楚。

### 7.3 哪些组件应该进入 Sandbox

建议进入：

- `AgentTaskRunner` 中与单 Session 执行相关的部分。
- `FlowRuntime`、`AgentRuntimeInstance`、Agent loops 和会话内 Mailbox 消费。
- 外部 Runtime Harness、Codex App Server、Claude CLI 等执行进程。
- Bash、File、Browser、代码执行和 Workspace。
- 只属于当前会话的临时状态、进程句柄和 Runtime 缓存。

建议继续留在 Server：

- 用户认证、团队/项目权限和公共 API。
- Session 元数据、任务入口和全局路由。
- Postgres/对象存储等持久化事实源。
- Sandbox 创建、停止、恢复和资源配额。
- 对前端的 SSE/WebSocket 事件出口。
- 跨 Session 的平台级调度和审计。

关键安全边界是：不要因为 Runtime 进入 Sandbox，就把数据库管理员凭据、全局 Redis 权限或平台密钥整体放进 Sandbox。SessionRunner 应拿短期、会话范围的身份，通过受控协议回传事件和 checkpoint。

### 7.4 一个会话一个 Sandbox 时的子 Agent 规则

建议采用以下清晰规则：

| 子 Agent 类型 | 是否新建 Sandbox | 原因 |
| --- | --- | --- |
| AI Manus 同一 Flow 内的 Worker Agent | 否 | 它仍属于同一个 Session/FlowRuntime |
| Codex 原生 `spawn_agent` Child Thread | 否 | 它由同一个 Codex App Server 管理 |
| 平台 `sys_session_send` 式 Child Session | 是，若坚持“一 Session 一 Sandbox” | 它是独立平台 Session 和独立 Runtime |

第一阶段如果 AI Manus 还没有平台级跨 Runtime Child Session，就不需要提前实现第三种情况。

### 7.5 Host 层是否必要

第一阶段不必要。可以直接使用现有 Docker Sandbox 管理能力：

```text
Server → Docker/Kubernetes API → 创建 Session Sandbox → 启动 SessionRunner
```

这时 Docker daemon、Kubernetes kubelet/Job/Pod controller 或 Sandbox Provider 已经承担了大部分“Host”的基础设施职责。

只有出现以下真实需求时，再增加自研 Host：

- Runner 要分散到用户电脑、边缘节点或不同私网机器。
- Server 无法直接访问 Docker/Kubernetes API，只能让远端机器主动连出。
- 需要机器注册、能力标签、GPU/CLI 探测和工作目录管理。
- 需要由平台远程升级 Runner、采集机器级日志并清理孤儿进程。
- 一台机器上存在多个非容器 Runner，需要统一生命周期代理。

否则 Host 只会增加一层协议和故障状态。

### 7.6 是否需要消息队列

这个改造不自动要求引入新的消息中间件。第一阶段可以选择：

- Server 与 SessionRunner 之间使用 HTTP + SSE/WebSocket；或
- 复用已有 Redis Stream 做需要持久化的任务/Mailbox 传输。

不要同时维护 HTTP、WebSocket、Redis Queue 和新 MQ 四套等价控制路径。建议保持：

- 一条命令入口。
- 一条事件回流路径。
- 一个持久化事实源。

如果未来需要多个 Server 副本、可靠抢占式消费、延迟任务和跨区域容灾，再基于实际故障模型决定是否补充共享 Broker。

## 8. 建议的迁移顺序

### 阶段 1：定义 SessionRunner 边界

- 把 `AgentTaskRunner + FlowRuntime` 视为一个会话执行单元。
- 定义最小协议：启动/恢复、提交用户消息、停止、状态、事件、checkpoint。
- 先保持现有 Agent/Flow 行为不变，不重写 AgentBase 和 Mailbox 语义。

### 阶段 2：让 SessionRunner 在现有 Sandbox 镜像中启动

- Sandbox 启动时同时启动 SessionRunner service。
- Server 创建 Sandbox 后等待健康检查和会话注册。
- Server 将消息路由给对应 SessionRunner。
- SessionRunner 在 Sandbox 内创建 FlowRuntime 和 Agent Runtime。

### 阶段 3：收紧持久化和安全边界

- Server 保持会话与事件的持久化权威。
- SessionRunner 使用会话范围 token 回传事件/checkpoint。
- 外部 CLI 凭据按 Session/Agent 最小范围注入。
- Sandbox 销毁后可根据持久化 checkpoint 重建。

### 阶段 4：按真实需求增加分布式能力

- 多机调度存在后，再决定是采用 Kubernetes/Sandbox Provider，还是新增 Host daemon。
- Server 真要多副本时，再把 Runner registry/tunnel 路由迁移到共享协调层。
- 跨 Runtime 父子 Session 成为产品能力后，再加入 `sys_session_send` 式平台协议。

## 9. 当前建议

对 AI Manus 来说，**把完整 Session Runner/Runtime 移入已有的每会话 Sandbox 是有价值且方向一致的改造**，因为它已经具备动态 Sandbox、Session 生命周期和 Redis/Postgres 等基础设施，不是从零引入容器编排。

但建议只吸收 Omnigent 的核心边界，不照搬全部层级：

- 保留一个共享 Server 控制面。
- 每个 Session 一个 Sandbox。
- 每个 Sandbox 一个 SessionRunner。
- Runner 内管理 FlowRuntime、多个 AgentRuntimeInstance 和外部 Runtime。
- 暂不自研 Host。
- 暂不新增消息中间件。
- Codex 原生子 Agent 继续留在同一 Codex Runtime 内。
- 平台级父子 Agent 等真正需要跨 Runtime 委派时再实现。

这条路径能够先获得进程隔离、依赖隔离、会话级资源限制和更清晰的故障边界，同时把新增的分布式复杂度控制在必要范围内。

## 10. 关键问题速查

### Omnigent 是不是主要用 Python 写的？

是。Server、Host、Runner、Harness 和 CLI 主体都是 Python；Web 前端是 React + TypeScript。

### Server、Host、Runner、Harness 的最短定义是什么？

- Server：平台控制面和持久化入口。
- Host：一台机器上的 Runner 进程代理。
- Runner：会话执行协调器和 Harness 管理器。
- Harness：具体 Codex/Claude 等 Agent Runtime 的协议适配器。

### Omnigent 是分布式部署吗？

执行面是分布式的，Server 控制面当前仍是单副本。它属于 Controller/Worker 模式，不是传统无状态 Application 多副本模式。

### Omnigent 是否依赖消息队列？

核心链路没有 RabbitMQ/Kafka/Celery。它使用 HTTP、WebSocket、Unix socket 和进程内 `asyncio.Queue`。进程内队列不能解决多 Server 协调。

### 一个 Omnigent Conversation 是否有独立 Runtime？

Runner 会为每个 Conversation 懒启动独立 Harness subprocess。Codex Harness 内再启动一个 Codex App Server。因此顶层 Conversation 通常有独立 Harness/Runtime 进程边界。

### Codex 每个原生子 Agent 是否都有独立 Harness？

不是。Codex 原生子 Agent 是同一 Codex App Server 内的 Child Thread，不新增 Runner、Harness 或 App Server。

### Omnigent 平台级子 Agent 是什么？

父 Agent 通过 `sys_session_send` 请求平台创建/复用另一个 Child Session 和 Runtime，再由平台维护 `parent_session_id`、运行状态和结果 Inbox。它可以跨 Runtime 类型。

### Omnigent 是否总把 Codex 放进 Sandbox？

不是。普通 Host 模式直接启动宿主机子进程；Managed Sandbox 模式才把 Host、Runner、Harness 和 Runtime 整体放进会话 Sandbox。Codex 自身 Sandbox mode 是另一层限制。

### 多个 Runner 是否必须有 Host？

不必须。只要 Docker、Kubernetes、systemd 或其他调度器能管理 Runner 生命周期，Runner 就可以直接自注册 Server。Host 只在远端机器代理、反向连接和机器能力管理成为真实需求时有价值。

### AI Manus 当前 Sandbox 和目标 Sandbox 有什么区别？

- 当前：Backend 进程运行 AgentTaskRunner/FlowRuntime，Session Sandbox 主要执行 Bash/File 等工具。
- 目标：SessionRunner、FlowRuntime、AgentRuntimeInstance、外部 Harness/CLI 和工具全部进入对应 Session Sandbox。

### AI Manus 最终采用哪条最小路径？

```text
Shared Server
  └── Docker/Kubernetes 创建每会话 Sandbox
        └── SessionRunner 主动注册 Server
              └── Harness → Agent Runtime
```

当前不增加 Host，不增加新消息中间件，也不预建多 Server 分布式协调。

## 11. 主要源码证据

### Omnigent

- `omnigent/pyproject.toml`：Python 3.12+、FastAPI、Uvicorn、SQLAlchemy、Pydantic、HTTPX、WebSocket 等后端依赖。
- `omnigent/web/package.json`：React、TypeScript、Vite、TanStack Query、Zustand 等前端依赖。
- `omnigent/omnigent/runtime/harnesses/process_manager.py`：每个 Conversation 一个 Harness subprocess，懒启动并跟随会话生命周期。
- `omnigent/omnigent/inner/codex_executor.py`：启动 `codex app-server`，并映射 Codex Sandbox mode。
- `omnigent/omnigent/server/routes/_sessions/orchestration.py`：Host 启动的 dedicated Runner，以及 Managed Sandbox → Host → Runner 的创建链路。
- `omnigent/omnigent/codex_native_forwarder.py`：把 Codex Child Thread 注册/回填为 Omnigent Child Session 投影。
- `omnigent/omnigent/runner/tool_dispatch.py`：`sys_session_send` 创建或复用 Child Session，并将完成消息写入父 Session Inbox。
- `omnigent/deploy/kubernetes/README.md`：Server 使用进程内 Runner registry，目前只支持单副本。

### AI Manus

- `/Users/songqiutao/Project/ai_manus/backend/app/application/turn/agent_task_runner.py`：单 Session 任务执行装配、FlowRuntime、事件、Mailbox 和 Sandbox 生命周期。
- `/Users/songqiutao/Project/ai_manus/backend/app/agent_runtime/flows/flow_runtime.py`：单 Flow 的 Agent 调度、Agent loops 和 RuntimeInstance 管理。
- `/Users/songqiutao/Project/ai_manus/backend/app/agent_runtime/core/agent_runtime_instance.py`：单 Agent mailbox 消费与执行边界。
- `/Users/songqiutao/Project/ai_manus/backend/app/infrastructure/external/sandbox/docker_sandbox.py`：Session 动态 Docker Sandbox 的创建、访问和销毁。
- `/Users/songqiutao/Project/ai_manus/backend/app/application/sessions/models.py`：Session 与 `sandbox_id` 的关联。
