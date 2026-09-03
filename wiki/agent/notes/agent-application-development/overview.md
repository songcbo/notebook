---
type: synthesis
status: active
tags:
  - agent
  - agent-application-development
  - architecture
  - comparative-analysis
source_links:
  - agent/notes/agent-application-development/qm-ai-manus-comparison
  - agent/notes/agent-application-development/omnigent-ai-manus-runtime-deployment-analysis
updated_at: 2026-09-02
---

# Agent Application Development

## 研究目的

这个专题通过真实项目理解一个完整 Agent 应用由哪些部分组成，各部分如何协作，以及不同项目为什么选择不同的架构和技术。

研究包含两条目的不同、但可以互相参照的主线：

1. **开源项目学习**：分析 QM、Omnigent 和 DeepSeek Harness（DSH）三个较成熟的开源项目，理解它们的整体架构、技术选择、运行流程、模块边界和设计思路。
2. **自有项目分析**：分析当前 AI Manus 的实际架构、已有模块、技术实现和不足。具体优化与改造方案不属于本轮总览的主要内容，后续再单独研究。

这里不是对四个项目进行排名，也不是把前三个开源项目仅仅当作 AI Manus 改造模板。首先要把每个项目本身理解清楚，再讨论相同职责在不同项目中的实现差异。

## 项目角色

| 项目 | 在本专题中的角色 | 主要观察视角 |
| --- | --- | --- |
| QM | 完整 Agent 应用参考 | Headless Core、Scope、Session/Turn、Harness、工具与审批、持久化 Sandbox |
| Omnigent | 完整 Agent 平台与 Meta-Harness 参考 | Server、Host、Runner、Harness、Agent Runtime、控制面与执行面 |
| DeepSeek Harness | 可组合 Agent Harness 参考 | Cordis、插件树、服务注入、事件、生命周期、Agent Loop 与能力 seam |
| AI Manus | 当前自有项目 | Application、Native Harness、FlowRuntime、多 Agent、工具审批、Session Sandbox 与基础设施 |

QM 和 Omnigent 都覆盖了比较完整的 Agent 应用控制与执行链路，适合研究“一个 Agent 产品怎样从入口运行到 Runtime”。DSH 的系统边界不同，更适合研究“Agent Harness 内部怎样通过插件、服务和事件解耦”。AI Manus 则按照同样的事实标准还原当前实现，不预设它必须长成其中任何一个项目的样子。

## 当前版本基线

以下版本用于本轮总览。后续模块分析需要重新记录当时的分支与 Commit，避免把持续变化的源码当成固定事实。

| 项目 | 分支 | Commit | 仓库状态说明 |
| --- | --- | --- | --- |
| QM | `main` | `0f0e0adccce2d13e4aff3e5bf3efb0cccf312f7a` | 本地存在 Portal 改动和未跟踪分析文件；本轮只读 |
| Omnigent | `main` | `c84ee695170501ba357eb410de0bbda4e1e83c41` | 工作区干净 |
| DeepSeek Harness | `master` | `141eb6fef83422698aef7a981029e843e8161534` | 本地存在 `.dsh/` 与 `artifacts/`；本轮只读 |
| AI Manus | `feat/skill-lazy-sync` | `d6f3921110f722065d531fe32cfb4e5a3038ba58` | 当前自有项目分支；本轮只读 |

## 研究方式

### 先逐项目讲清，再横向比较

架构总览先分别说明四个项目的定位、组件、进程边界、技术栈和关键流程，使每个项目形成一条完整主线；然后再按相同职责横向比较。

这种方式同时避免两个问题：

- 只有大表时，一个项目的整体架构会被切碎。
- 只有逐项目介绍时，相同职责的差异不容易被发现。

### 区分三类内容

- **代码事实**：能够从当前源码、配置、测试或项目文档直接确认。
- **架构解释**：根据多个事实归纳出的职责、边界和取舍。
- **待研究问题**：当前能够发现、但需要后续模块分析才能回答的问题。

技术选型原因如果是项目文档明确说明，会直接标出；如果是根据代码约束推导，会使用“从当前实现看”“可以推断”等措辞。

### 关注职责，不机械对应名称

相同职责在不同项目中可能使用完全不同的名称。例如 `Context` 既可能表示一次 Turn 的桥接对象，也可能表示插件容器；`Harness` 既可能是平台与 Runtime 之间的适配器，也可能指包含完整 Agent Loop 的应用框架。

比较时优先回答：

1. 这项职责解决什么问题。
2. 谁拥有这项职责。
3. 状态保存在哪里。
4. 通过什么协议与其他组件交互。
5. 失败、暂停和恢复时会发生什么。

## 四项目一句话定位

### QM

QM 是一个面向组织与多人协作场景的 Headless Agent Core。它以 Scope 为资源和执行边界，由 Core 统一处理身份、策略、Session、Turn、工具、审批与持久化，再通过可切换 Harness 使用 Codex、Claude Code、Pi 或 OpenCode 等 Runtime。

### Omnigent

Omnigent 是一个管理多种 Agent Runtime 的 Meta-Harness 平台。它将共享 Server 控制面、机器级 Host、会话执行 Runner、按 Conversation 隔离的 Harness 子进程以及底层 Agent Runtime 分开，重点解决多 Runtime 接入、远程执行、会话治理和运行观测。

### DeepSeek Harness

DSH 是一个由 Cordis 驱动、采用“一切皆插件”架构的 Agent Harness。模型、工具、Session、Agent Loop、审批、Sandbox 和 UI 都由插件向共享 Context 贡献服务和事件，因此它的核心学习价值是时空作用域、生命周期与能力组合。

### AI Manus

AI Manus 是一个以 Session 为中心、支持项目扩展和多 Agent Flow 的 Agent 应用。它由 Vue 前端、FastAPI 后端、Application 编排层、Native Harness、FlowRuntime、AgentRuntimeInstance、Docker Sandbox、PostgreSQL、Redis 和 MinIO 共同组成。

## 内容地图

### 总览阶段

- [[agent/notes/agent-application-development/architecture|Architecture]]：技术栈、逐项目架构、横向比较、关键流程和技术概念附录。
- [[agent/notes/agent-application-development/analysis-plan|Analysis Plan]]：研究方法、总览结构和后续模块候选范围。

### 已有基线分析

- [[agent/notes/agent-application-development/qm-ai-manus-comparison|QM 与 AI Manus 对比分析]]
- [[agent/notes/agent-application-development/omnigent-ai-manus-runtime-deployment-analysis|Omnigent 与 AI Manus：Runtime 与部署分析]]

这两篇保留了早期完整思考过程。新总览会吸收其中仍被当前源码支持的结论，但不会删除或覆盖原文。

## 模块级分析

模块分析以职责为主轴：每篇先说明边界，再分别还原 QM、Omnigent、DSH 与 AI Manus 的实现，最后做横向比较。

本轮深化重点补充了 Turn 与前端状态联动、Skill 是否投影进 Sandbox、定时任务 fire、附件/Artifact 跨边界、恢复窗口和资源清理；各主题配有可直接预览的 SVG，并保留 Archify HTML 交互附件。先看 `architecture.md` 的动态图索引，再按模块下钻会更容易。

1. [交互入口与实时通信](./models/01-interaction-realtime.md)
2. [应用核心与 Session / Turn 生命周期](./models/02-session-turn-lifecycle.md)
3. [Harness、Agent Runtime 与模型调用](./models/03-harness-runtime-model.md)
4. [Context、Prompt、Memory 与 Skills](./models/04-context-prompt-memory-skills.md)
5. [Tools、MCP、Policy 与 Approval](./models/05-tools-mcp-policy-approval.md)
6. [Sandbox、Workspace、文件与制品](./models/06-sandbox-workspace-artifacts.md)
7. [状态、事件、持久化与恢复](./models/07-state-events-persistence-recovery.md)
8. [多 Agent、子 Agent 与消息协作](./models/08-multi-agent-collaboration.md)
9. [插件、依赖注入与模块组合](./models/09-plugins-di-composition.md)
10. [部署、可观测性、安全与测试](./models/10-deployment-observability-security-testing.md)
11. [浏览器插件作为 Agent 的浏览器执行端](./models/11-browser-extension-integration.md)

## 当前阅读顺序

建议先阅读 [[agent/notes/agent-application-development/architecture|Architecture]] 建立四个项目的整体认识，再按关心的职责进入模块分析。需要了解早期 QM、Omnigent 与 AI Manus 对比过程时，再阅读两篇基线分析。
