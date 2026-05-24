---
type: topic
status: active
tags:
  - agent
  - coding-agent
  - harness
source_links:
  - raw/sources/agent/2026-04-17-components-of-a-coding-agent.pdf
  - raw/sources/agent/2026-05-07-evolver-self-evolving-agent-harness.pdf
updated_at: 2026-05-07
---

# Coding Agent Harness

## 定义

coding harness 是包在模型外部的一层运行时与控制层，用来管理代码上下文、工具、权限、状态、执行反馈和循环控制。它不是模型本身，但往往决定了 coding agent 的实际可用性。

## 当前结论

- coding agent 的效果不能只归因于模型，harness 往往同样关键。
- 同一代模型放进更成熟的 harness 中，体验可能明显更强。
- “模型能力”和“agent 产品能力”之间隔着一层很厚的系统设计。
- 更高一层的问题是：harness 能不能根据自己的运行日志持续改进自己。Evolver 这类设计把 prompt 调优、技能沉淀和策略修复从人工循环推进到协议约束的自动循环。
- 自演化 harness 的可靠边界不在“让 Agent 随意改自己”，而在信号提取、变更半径、验证命令、回滚机制和可审计轨迹是否足够硬。

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

### 7. Self-Evolution Layer

- 自演化层关注的不是当前任务怎么完成，而是 harness 如何从历史运行中发现稳定错误模式，并把成功修复沉淀成可复用资产。
- 一个可工程化的自演化循环至少包括：提取日志信号、提出假设、选择策略、生成补丁、运行验证、固化成功经验、失败时回滚。
- 这类系统必须把“能改什么”和“改动能影响多大范围”变成硬约束，否则很容易从自动维护变成不可控漂移。

## Evolver 的启发

Evolver / EvoMap 的价值在于把 Agent 自我改进拆成可审计协议，而不是简单让模型读取日志后改 prompt。它的核心不是某个单点技巧，而是一条闭环流水线：

```text
SignalSnapshot -> Hypothesis -> Attempt -> Outcome
```

### 信号提取与反停滞

- 每轮演化先从会话日志、运行日志、记忆文件和历史演化事件中提取信号。
- 信号不仅包括错误，也包括缺失信息、能力缺口、工具滥用、性能瓶颈和停滞模式。
- 如果同一信号在最近多轮中反复出现，系统会压制该信号，避免在同一个修复循环里反复打转。
- 连续失败后强制剥离主导 Gene 的匹配信号，迫使系统尝试不同策略。

这个设计说明，自演化系统最危险的失败形态不是“不修”，而是“反复用同一类修法修同一类问题”。

### 记忆图谱与策略级学习

- Evolver 的记忆图谱记录 `SignalSnapshot -> Hypothesis -> Attempt -> Outcome`。
- 它不是只保存聊天历史，而是保存“在什么信号下选择了什么策略，执行后结果如何”。
- 历史成功率低的 Gene 会被 ban，成功率高的 Gene 会被 preferred。
- 这使 harness 可以做策略级因果学习：下一次遇到相似信号时，跳过已经证明无效的策略。

### 爆炸半径与固化流程

- 每个 Gene 预先定义允许修改的最大文件数、禁止路径和验证命令。
- 固化流程需要检查 git 状态、协议对象格式、diff 范围、禁止路径、破坏性变更和验证命令。
- 任何一步失败都应回滚，成功后才把 EvolutionEvent、Capsule 或新的 Gene 持久化。

这里和运行时权限控制不同：运行时权限回答“Agent 当前能做什么操作”，自演化固化层回答“Agent 对自身的修改最多能影响多大范围”。

### 人格参数与策略漂移

- PersonalityState 用 `rigor`、`creativity`、`verbosity`、`risk_tolerance`、`obedience` 这类连续参数控制自我改进风格。
- 这些参数控制的是 Agent 如何修改自己，而不是如何完成用户当前任务。
- 风险在于人格参数缺少清晰梯度信号，长期可能变成启发式漂移。

### Capsule 与跨节点复用

- Capsule 可以把某个节点验证过的修复策略共享给其他节点。
- 外部 Capsule 不应直接进入本地资产库，而要经过 staging、人工 review 和 promotion。
- 跨环境复用需要记录环境指纹，否则“在某处有效”的策略可能在另一个 harness 中失效。

## 自演化 Harness 的适用边界

- 最可靠的场景是信号清晰、验证命令确定性强的 repair 和 optimize 任务。
- 越接近 innovate，评估越模糊，风险越高，需要更强的人审和回滚边界。
- Gene 的质量决定系统上限；如果 Gene 只是手写策略模板，自演化能力会受模板质量限制。
- LLM 从成功 Capsule 中提炼新 Gene 有价值，但可靠性不能默认成立，需要独立验证。

## 对硬件 Agent 产品的启发

- Agent 产品的 prompt 腐化往往不是一次大错导致的，而是长期没人持续看日志、提取模式、修补策略。
- 如果硬件 Agent 有稳定日志、明确错误类型和可重复验证场景，可以把日常维护中的一部分变成后台演化循环。
- 初始落点应优先选择可验证的修复类任务，例如重复工具调用、常见执行失败、缺失记忆、固定格式错误，而不是直接让系统自动创新能力。

## 与普通聊天式 LLM 的区别

- 普通聊天更像“带文件的问答”
- coding harness 更像“带上下文、工具、状态和执行循环的工作台”

## 与多 Agent 文章的关系

- 多 agent 文章更强调“什么时候该拆”
- 这篇文章更强调“即使不拆，多数能力也来自 harness 设计”
- 两者合起来看，能得到一个更稳的判断：先把单 agent harness 做好，再考虑多 agent 架构
- Evolver 进一步补上了第三层问题：当单 agent harness 已经可观测、可验证之后，能否让 harness 自己进入受控改进循环。

## 关联

- [[agent/notes/multi-agent-decision-framework]]
