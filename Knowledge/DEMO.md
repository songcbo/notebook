---
type: knowledge
domain: work
source: https://example.com/multi-agent-orchestration
status: seed
tags:
  - agent
  - architecture
---

# 多Agent编排框架对比

## 来源
- 博客：Multi-Agent Orchestration Patterns（已阅读并整理）

## 核心观点
- 复杂任务适合“规划 Agent + 执行 Agent”分层。
- 可观测性是生产可用的关键，不是附加功能。

## 我的理解
- 对当前项目，先做可观测与失败重试，比先追求模型效果更实际。
- 与其一次性上复杂架构，不如按里程碑逐步增强。

## 可复用结论
- 每个 Agent 调用必须记录：输入摘要、工具调用、输出摘要、错误码。
- 默认重试策略：指数退避 + 最大 3 次。

## 关联
- 项目：[[Projects/Agent 平台重构]]
- 计划：[[Planning/Daily/2026-03-03]]
