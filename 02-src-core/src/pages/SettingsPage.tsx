import { useCallback, useEffect, useRef, useState } from 'react'

import {
  DEFAULT_DEEPSEEK_MODEL,
  DEEPSEEK_API_KEY_STORAGE_KEY,
  DEEPSEEK_MODEL_STORAGE_KEY,
  requestAiHealth,
  type AIHealthResult,
} from '../ai/client'

type ServiceStatus = 'checking' | 'available' | 'unreachable'

function serviceStatusMessage(
  status: ServiceStatus,
  health: AIHealthResult | null,
) {
  if (status === 'checking') return '正在检测智能分析服务…'
  if (status === 'available') return '智能分析服务可用'
  if (health?.errorCode === 'DEEPSEEK_NOT_CONFIGURED') {
    return '尚未配置 DeepSeek API Key，请填写后保存并检测。'
  }
  if (health?.errorCode === 'DEEPSEEK_AUTH_FAILED') {
    return 'DeepSeek API Key 无效或无权访问当前服务，请更新生产环境密钥。'
  }
  if (health?.errorCode === 'DEEPSEEK_MODEL_NOT_FOUND') {
    return '当前模型不可用，请确认模型名称或更换为账号可用的 DeepSeek 模型。'
  }
  if (health?.errorCode === 'DEEPSEEK_QUOTA_EXHAUSTED') {
    return 'DeepSeek 账户余额不足，请充值后重新检测。'
  }
  if (health?.errorCode === 'DEEPSEEK_RATE_LIMITED') {
    return 'DeepSeek 请求过于频繁，请稍后重新检测。'
  }
  if (health?.errorCode === 'DEEPSEEK_TIMEOUT') {
    return 'DeepSeek 响应超时，请稍后重试；不需要代理节点。'
  }
  if (health?.errorCode === 'DEEPSEEK_NETWORK_ERROR') {
    return '本地后端无法连接 DeepSeek，请确认后端正在运行和网络可用。'
  }
  return '智能分析服务暂时不可用，请稍后重试。'
}

export default function SettingsPage() {
  const [apiKey, setApiKey] = useState(
    () => localStorage.getItem(DEEPSEEK_API_KEY_STORAGE_KEY) ?? '',
  )
  const [model, setModel] = useState(
    () =>
      localStorage.getItem(DEEPSEEK_MODEL_STORAGE_KEY) ?? DEFAULT_DEEPSEEK_MODEL,
  )
  const [serviceStatus, setServiceStatus] =
    useState<ServiceStatus>('checking')
  const [health, setHealth] = useState<AIHealthResult | null>(null)
  const controllerRef = useRef<AbortController | null>(null)
  const speechSupported =
    'SpeechRecognition' in window || 'webkitSpeechRecognition' in window

  const checkService = useCallback(() => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setServiceStatus('checking')
    setHealth(null)
    void requestAiHealth(controller.signal)
      .then((result) => {
        setHealth(result)
        setServiceStatus(
          result.configured &&
            result.reachable &&
            result.authenticated &&
            result.modelAvailable &&
            !result.errorCode
            ? 'available'
            : 'unreachable',
        )
      })
      .catch((error: unknown) => {
        if ((error as { name?: string })?.name !== 'AbortError') {
          setServiceStatus('unreachable')
        }
      })
  }, [])

  useEffect(() => {
    checkService()
    return () => controllerRef.current?.abort()
  }, [checkService])

  const saveLocalKey = () => {
    const normalizedKey = apiKey.trim()
    const normalizedModel = model.trim() || DEFAULT_DEEPSEEK_MODEL
    if (normalizedKey) {
      localStorage.setItem(DEEPSEEK_API_KEY_STORAGE_KEY, normalizedKey)
      localStorage.setItem(DEEPSEEK_MODEL_STORAGE_KEY, normalizedModel)
    } else {
      localStorage.removeItem(DEEPSEEK_API_KEY_STORAGE_KEY)
      localStorage.removeItem(DEEPSEEK_MODEL_STORAGE_KEY)
    }
    setApiKey(normalizedKey)
    setModel(normalizedModel)
    checkService()
  }

  const clearLocalKey = () => {
    localStorage.removeItem(DEEPSEEK_API_KEY_STORAGE_KEY)
    localStorage.removeItem(DEEPSEEK_MODEL_STORAGE_KEY)
    setApiKey('')
    setModel(DEFAULT_DEEPSEEK_MODEL)
    checkService()
  }

  return (
    <section className="page" aria-labelledby="settings-title">
      <h1 id="settings-title">服务设置</h1>
      <p>
        默认使用网站服务端密钥；也可以为当前浏览器单独填写个人DeepSeek Key。
        本地 Key 不会进入数据备份。
      </p>

      <section className="settings-status" aria-label="本地DeepSeek设置">
        <h2>当前浏览器的DeepSeek设置</h2>
        <label>
          DeepSeek API Key
          <input
            autoComplete="off"
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="留空则使用网站服务端 Key"
            type="password"
            value={apiKey}
          />
        </label>
        <label>
          模型
          <input
            onChange={(event) => setModel(event.target.value)}
            value={model}
          />
        </label>
        <div className="button-row">
          <button onClick={saveLocalKey} type="button">
            保存并检测
          </button>
          <button onClick={clearLocalKey} type="button">
            清除本地 Key
          </button>
        </div>
        <small>密钥只保存在当前浏览器，并仅发送到本站服务端调用DeepSeek。</small>
      </section>

      <section className="settings-status" aria-label="服务状态">
        <h2>功能状态</h2>
        <p role="status">{serviceStatusMessage(serviceStatus, health)}</p>
        {health?.latencyMs !== undefined && serviceStatus === 'available' && (
          <p>连接检测耗时：{health.latencyMs} ms</p>
        )}
        <button type="button" onClick={checkService}>
          重新检测
        </button>
        <details>
          <summary>查看配置说明</summary>
          <p>
            未填写本地 Key 时，管理员需在生产 Worker 中配置
            DEEPSEEK_API_KEY；模型可通过 DEEPSEEK_MODEL 调整。
          </p>
        </details>
        <p>
          {speechSupported
            ? '当前浏览器支持语音输入'
            : '当前浏览器不支持语音输入，可继续使用文字模式'}
        </p>
      </section>
    </section>
  )
}
