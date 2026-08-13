# JD 面试练习与双模式模拟面试设计

## 目标

在现有 JD 分析、企业研究和模拟面试链路上，新增可从高概率问题直接进入的单题练习，并将完整模拟面试拆分为独立的 HR 面和业务面。保留现有复盘、语音降级、本地保存和旧记录兼容能力。

## 范围与不做事项

### 包含

- 高概率问题逐题练习入口。
- 单题一次回答、一次点评、可重新练习的页面流程。
- HR 面与业务面两个独立的完整面试入口。
- 依据面试类型生成首问，并依据上一轮回答动态追问。
- 文字输入、浏览器语音转文字、转写后编辑和文字降级。
- 保留现有总体复盘、逐题点评、薄弱项练习与导出功能，并按面试类型提供针对性建议。
- 使用现有 DeepSeek 服务端客户端、统一超时和现有 Dexie/Zustand 数据层。

### 不包含

- 独立的回答优化模式或页面。
- 连续追问式单题练习。
- 长期保存原始录音。
- 实时联网企业搜索或企业事实编造。
- 与本需求无关的页面、主题或数据迁移重构。

## 用户流程

### 单题练习

1. 用户在面试研究的高概率问题列表点击“练习这道题”。
2. 页面进入 `/jd-lab/:analysisId/interview?mode=practice&questionId=...`，自动载入 JD、简历匹配、企业研究和问题依据。
3. 用户使用文字或语音转文字提交一次回答。
4. 服务端生成结构化点评：切题度、证据与个人贡献、JD/企业关联、风险、改进建议和准备追问。
5. 页面保留原回答和点评，提供“重新练习”和“返回问题列表”。失败时不清除原回答。

### 完整模拟面试

承接页仅显示两个独立入口：

- **HR 面｜动机与经历核实**：自我介绍、求职动机、企业/岗位选择、经历真实性、个人贡献、岗位期待。
- **业务面｜能力与场景深挖**：业务理解、JD 核心能力、场景/行为题、决策依据、执行细节、数据结果、复盘与迁移。

每个入口独立创建会话，不提供 HR 面完成后自动进入业务面的流程。旧 `mode=coach` 链接兼容到单题练习，旧会话没有类型时按默认文字会话打开。

## 页面与组件

- `PredictedQuestionList`：为每题增加练习按钮，传递稳定的 `questionId` 与问题文本。
- `MockInterviewPage`：识别 `practice`、`hr`、`business` 和历史 `coach` 参数，分别渲染单题练习、承接页或会话。
- `QuestionPracticePanel`：展示问题依据、输入区、单次点评和重练操作。
- `MockInterviewLanding`：移除回答优化卡片，改为 HR 面与业务面两张突出入口卡片。
- `InterviewSession`：展示面试类型、问题分类和当前考察维度，继续复用暂停/继续/结束操作。
- `InterviewReport`：保留现有结构，增加 HR/业务类型标签和针对性准备建议。
- `CandidateAnswerInput`、`VoiceRecorder`、`BrowserSpeechProvider`：原样复用并保留文字降级。

## 数据结构

完整会话增加：

```ts
interviewType: 'hr' | 'business'
```

每轮增加可选字段：

```ts
questionType?: 'motivation' | 'experience' | 'business' | 'competency' | 'scenario' | 'behavioral'
focusDimension?: string
followUpReason?: string
```

单题点评使用独立结构并按分析记录保存，至少包含：

```ts
questionId: string
question: string
originalAnswer: string
answerCoverage: string
evidenceAssessment: string
roleRelevance: string
risks: string[]
improvements: string[]
followUpQuestions: string[]
evidenceClaimIds: string[]
createdAt: string
updatedAt: string
```

对已有会话和备份数据：缺少 `interviewType`、问题类型或点评字段时使用兼容默认值，不阻止读取。

## 服务与数据流

新增：

```text
POST /api/mock-interview/question-practice
```

该接口复用统一 DeepSeek 客户端、请求取消、任务级超时、结构化响应校验和错误码。它不创建完整会话，只生成当前题的一次点评。

现有接口保持路径不变：

- `POST /api/mock-interview/session`：请求新增 `interviewType`，首问提示按 HR/业务分流。
- `POST /api/mock-interview/:sessionId/turn`：上下文包含类型，生成带分类和追问理由的下一问。
- `POST /api/mock-interview/:sessionId/complete`：沿用现有复盘输出，提示词根据类型生成差异化建议。

所有模型上下文继续包含 JD、简历确认证据、匹配结果、企业研究和当前会话历史。不得编造经历、数字、公司事实或敏感信息。

## 异常、取消与保存

- 用户关闭页面或取消请求时，服务端 AbortController 终止上游请求。
- 超时、取消、鉴权失败、限流、上游错误和格式异常继续通过统一错误映射返回。
- 单题或某轮失败不删除已保存回答；完整复盘失败仍可查看会话并重试。
- 语音权限被拒绝、识别失败或浏览器不支持时切换到文字输入。
- 原始音频不入库；只保存用户确认后的文字回答及生成文本。

## 测试与验收

- 组件：问题按钮携带正确参数；承接页只显示 HR/业务入口；单题点评和重练状态可用。
- API：单题请求 schema、证据 ID 校验、HR/业务首问分流、动态追问分类、复盘结果和错误映射。
- Store：单题点评保存、会话类型保存、失败保留本地回答、旧记录默认兼容。
- 语音：权限/识别失败后文字降级。
- 回归：现有 JD 分析、企业研究、完整会话、历史记录和备份导入不受影响。

