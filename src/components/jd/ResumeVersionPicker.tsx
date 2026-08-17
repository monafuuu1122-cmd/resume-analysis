import { useEffect, useState, type ChangeEvent } from 'react'

import { loadConfirmedEvidenceSnapshot } from '../../db/evidenceRepository'
import {
  deleteResumeVersion,
  listResumeVersions,
  saveResumeVersion,
} from '../../db/resumeVersionRepository'
import { buildInterviewProfileContext } from '../../domain/interviewContext'
import type { ResumeVersion } from '../../domain/types'
import {
  defaultResumeVersionName,
  extractResumePdfText,
  ResumePdfError,
} from '../../services/pdf/extractPdfText'

type ResumeVersionPickerProps = {
  selectedId?: string
  onSelect: (version?: ResumeVersion) => void
}

function createId() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `resume-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  )
}

export default function ResumeVersionPicker({
  selectedId,
  onSelect,
}: ResumeVersionPickerProps) {
  const [versions, setVersions] = useState<ResumeVersion[]>([])
  const [name, setName] = useState('')
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const reload = async () => setVersions(await listResumeVersions())

  useEffect(() => {
    void reload().catch(() => setError('简历归档读取失败，请稍后重试。'))
  }, [])

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setLoading(true)
    setError('')
    try {
      const parsed = await extractResumePdfText(file)
      setText(parsed.text)
      setFileName(file.name)
      setName(defaultResumeVersionName(file.name))
    } catch (caught) {
      setError(
        caught instanceof ResumePdfError
          ? caught.message
          : 'PDF 解析失败，请重试。',
      )
    } finally {
      setLoading(false)
    }
  }

  const save = async () => {
    if (!name.trim()) {
      setError('请先填写简历版本名称。')
      return
    }
    if (text.trim().length < 20) {
      setError('简历文字太少，请先上传可复制文字的 PDF 或粘贴完整内容。')
      return
    }
    setSaving(true)
    setError('')
    try {
      const snapshot = buildInterviewProfileContext(
        await loadConfirmedEvidenceSnapshot(),
      )
      const now = new Date().toISOString()
      const version = await saveResumeVersion({
        id: createId(),
        name: name.trim(),
        source: fileName ? 'pdf' : 'manual',
        ...(fileName ? { fileName } : {}),
        targetTags: [],
        resumeText: text.trim(),
        profileSnapshot: snapshot,
        createdAt: now,
        updatedAt: now,
      })
      await reload()
      onSelect(version)
      setText('')
      setName('')
      setFileName('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '简历版本保存失败。')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (version: ResumeVersion) => {
    if (!window.confirm(`确认删除简历版本“${version.name}”吗？`)) return
    try {
      await deleteResumeVersion(version.id)
      await reload()
      if (selectedId === version.id) onSelect(undefined)
    } catch {
      setError('简历版本删除失败，请稍后重试。')
    }
  }

  return (
    <section className="resume-version-picker" aria-labelledby="resume-version-title">
      <h2 id="resume-version-title">本次使用的简历</h2>
      <p>可直接上传一版 PDF；解析后的文字会作为本次 JD 对照依据。</p>
      <label>
        选择简历版本
        <select
          value={selectedId ?? ''}
          onChange={(event) => {
            const version = versions.find(({ id }) => id === event.target.value)
            onSelect(version)
          }}
        >
          <option value="">当前经历档案</option>
          {versions.map((version) => (
            <option key={version.id} value={version.id}>
              {version.name}{version.source === 'pdf' ? ' · PDF' : ''}
            </option>
          ))}
        </select>
      </label>

      <div className="resume-version-upload">
        <label>
          上传 PDF 简历
          <input
            accept="application/pdf,.pdf"
            disabled={loading || saving}
            onChange={(event) => void handleFile(event)}
            type="file"
          />
        </label>
        {loading && <p role="status">正在解析 PDF 文字…</p>}
      </div>

      {text && (
        <div className="resume-version-draft">
          <label>
            版本名称
            <input value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            解析预览（可修改）
            <textarea
              rows={8}
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
          </label>
          <button disabled={saving} onClick={() => void save()} type="button">
            {saving ? '正在保存…' : '保存为简历版本'}
          </button>
        </div>
      )}

      <details className="resume-version-manual">
        <summary>PDF 无法识别？粘贴文字简历</summary>
        <label>
          版本名称
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="例如：内容运营版"
          />
        </label>
        <label>
          简历正文
          <textarea
            rows={6}
            value={text}
            onChange={(event) => {
              setText(event.target.value)
              setFileName('')
            }}
            placeholder="粘贴完整简历文字"
          />
        </label>
        <button disabled={saving} onClick={() => void save()} type="button">
          {saving ? '正在保存…' : '保存文字简历版本'}
        </button>
      </details>

      {versions.length > 0 && (
        <ul className="resume-version-list" aria-label="已保存简历版本">
          {versions.map((version) => (
            <li key={version.id}>
              <span>
                <strong>{version.name}</strong>
                {version.fileName && <small>{version.fileName}</small>}
              </span>
              <button type="button" onClick={() => void remove(version)}>
                删除
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  )
}
