---
type: topic
status: active
tags:
  - agent
  - coding-agent
  - harness
source_links:
  - raw/sources/agent/2026-04-17-components-of-a-coding-agent.pdf
updated_at: 2026-04-18
---

# Coding Agent Harness

## 定义

coding harness 是包在模型外部的一层运行时与控制层，用来管理代码上下文、工具、权限、状态、执行反馈和循环控制。它不是模型本身，但往往决定了 coding agent 的实际可用性。

## 当前结论

- coding agent 的效果不能只归因于模型，harness 往往同样关键。
- 同一代模型放进更成熟的 harness 中，体验可能明显更强。
- “模型能力”和“agent 产品能力”之间隔着一层很厚的系统设计。

## 为什么这篇文章重要

- 它把“coding agent 为什么比普通聊天强”拆成了可实现的系统组件，而不是停留在抽象概念上。
- 它给出的重点不是某个具体产品 feature，而是 coding harness 的工程骨架。
- 这对后续看 Claude Code、Codex、OpenClaw 这类系统很有帮助，因为可以用同一套框架比较。

## 心智模型

- LLM 是底层模型
- reasoning model 是更偏推理与自校验的模型形态
- agent 是围绕模型运行的控制循环
- coding harness 是专门为代码任务设计的 agent 外壳

这里最关键的一点是：用户实际感受到的“coding agent 能力”，很多时候来自 harness，而不是裸模型本身。

## 六个核心组件

### 1. Live Repo Context

- 先收集 repo、分支、状态、项目说明和工作区摘要，再开始执行。
- 目标是避免模型在没有项目上下文的情况下盲猜。
- 这一步本质上是在建立“稳定事实层”，让后续每一轮都不是从零开始。

### 2. Prompt Shape And Cache Reuse

- 稳定前缀和变化部分应拆开处理。
- 一般规则、工具说明、workspace summary 适合作为稳定前缀复用。
- 如果把所有东西都当成每轮重新拼装的大 prompt，成本高，稳定性也差。

### 3. Structured Tools, Validation, And Permissions

- 工具必须是命名明确、输入明确、边界明确的。
- harness 需要做参数校验、路径限制和审批分流，不能让模型直接无边界执行任意动作。
- 这一层不是单纯的安全壳，也是可靠性壳。它让模型行为从“自由生成”变成“受约束动作选择”。

### 4. Context Reduction And Output Management

- 长日志、重复文件读取、历史 transcript 需要裁剪、去重和压缩。
- 很多表面上的“模型质量问题”，本质是上下文质量问题。
- 这也是为什么 coding agent 的“记忆”不能理解成简单聊天记录堆叠。

### 5. Transcripts, Memory, And Resumption

- 要同时维护完整 transcript 和更小的 working memory。
- transcript 负责可追溯和可恢复，working memory 负责任务连续性。
- 这两个层次解决的是不同问题：一个解决可恢复，一个解决可继续。

### 6. Delegation And Bounded Subagents

- 子 agent 需要继承足够上下文，但不能无限复制主 agent 的自由度。
- 有价值的不是“能 spawn”，而是“能在边界内 spawn”。
- 真正重要的是 bounded，而不是 subagent 这个名词本身。

## 与普通聊天式 LLM 的区别

- 普通聊天更像“带文件的问答”
- coding harness 更像“带上下文、工具、状态和执行循环的工作台”

## 与多 Agent 文章的关系

- 多 agent 文章更强调“什么时候该拆”
- 这篇文章更强调“即使不拆，多数能力也来自 harness 设计”
- 两者合起来看，能得到一个更稳的判断：先把单 agent harness 做好，再考虑多 agent 架构

## 关联

- [[agent/notes/multi-agent-decision-framework]]
