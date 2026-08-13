const technicalErrorPattern =
  /(?:zod|schema|validation|unknown source|official information requires|\[\s*\{\s*"code")/iu

const errorMessages: Record<string, string> = {
  DEEPSEEK_SCHEMA_VALIDATION_FAILED: '面试研究返回内容不完整，请重新生成。',
  DEEPSEEK_INVALID_RESPONSE: '面试研究返回内容不完整，请重新生成。',
  DEEPSEEK_TIMEOUT: '本次生成等待时间过长，已自动停止。你可以重新尝试，已完成的内容不会丢失。',
  DEEPSEEK_AUTH_FAILED: 'DeepSeek API Key 无效，请在服务设置中重新配置。',
  DEEPSEEK_MODEL_NOT_FOUND: '当前 DeepSeek 模型不可用，请在服务设置中更换模型。',
  DEEPSEEK_RATE_LIMITED: 'DeepSeek当前请求较多，请稍后重新尝试。',
  DEEPSEEK_QUOTA_EXHAUSTED: 'DeepSeek额度暂不可用，请检查账户额度后重试。',
  DEEPSEEK_NETWORK_ERROR: '本地后端暂时无法连接 DeepSeek，请确认后端运行和网络可用。',
  DEEPSEEK_ABORTED: '本次生成已取消，已完成的内容不会丢失。',
}

export function safeAIErrorMessage(body: unknown, fallback: string) {
  if (Array.isArray(body)) return errorMessages.DEEPSEEK_SCHEMA_VALIDATION_FAILED
  if (!body || typeof body !== 'object') {
    return typeof body === 'string' && !technicalErrorPattern.test(body)
      ? body
      : fallback
  }
  const value = body as { code?: unknown; message?: unknown }
  if (typeof value.code === 'string' && errorMessages[value.code]) {
    return errorMessages[value.code]
  }
  if (
    typeof value.message !== 'string' ||
    technicalErrorPattern.test(value.message) ||
    value.message.trim().startsWith('[') ||
    value.message.trim().startsWith('{')
  ) {
    return errorMessages.DEEPSEEK_SCHEMA_VALIDATION_FAILED
  }
  return value.message.trim() || fallback
}

export function sanitizeVisibleAIText(value: string) {
  return value
    .replace(
      /\s*[（(]\s*(?:(?:claim|span|profile-material)[-:][^（）()]+|[^（）()]*-claim-\d+)\s*[）)]/giu,
      '',
    )
    .replace(/\s+([，。；：！？])/gu, '$1')
    .replace(/([：；，。])\s*([：；，。])/gu, '$1')
    .replace(/\s{2,}/gu, ' ')
    .trim()
}
