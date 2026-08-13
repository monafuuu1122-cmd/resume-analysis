import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react'

import { requestExtraction } from '../ai/client'
import { parseExtraction } from '../ai/parsers'
import ArtifactPanel from '../components/ArtifactPanel'
import ClaimCard, { kindLabels } from '../components/ClaimCard'
import { db } from '../db/database'
import {
  exportMigrationPackage,
  importMigrationPackage,
  migrateIfNeeded,
} from '../db/localDataMigration'
import {
  deleteProfileMaterial,
  listProfileMaterials,
  saveProfileMaterial,
} from '../db/profileMaterialRepository'
import { deleteExperienceCascade } from '../db/repository'
import { experienceSchema, sourceArtifactSchema } from '../domain/schemas'
import type {
  Experience,
  ExtractedClaim,
  ProfileMaterial,
} from '../domain/types'
import {
  storageErrorMessage,
  useExperienceWorkspace,
  type ExperienceExtractor,
} from '../hooks/useExperienceWorkspace'

export type { ExperienceExtractor } from '../hooks/useExperienceWorkspace'

const qwenExtractor: ExperienceExtractor = async (
  source,
  experienceId,
  sourceArtifactId,
) => {
  const payload = await requestExtraction(source)
  return parseExtraction(source, payload, experienceId, sourceArtifactId)
}

function createId(prefix: string) {
  const suffix =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return `${prefix}-${suffix}`
}

export function ExperiencesView({
  extractor,
}: {
  extractor?: ExperienceExtractor
}) {
  const activeExtractor = extractor ?? qwenExtractor
  const [experiences, setExperiences] = useState<Experience[]>([])
  const [organization, setOrganization] = useState('')
  const [role, setRole] = useState('')
  const [project, setProject] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [artifactTitle, setArtifactTitle] = useState('')
  const [artifactContent, setArtifactContent] = useState('')
  const [profileMaterials, setProfileMaterials] = useState<ProfileMaterial[]>([])
  const [materialType, setMaterialType] =
    useState<ProfileMaterial['type']>('certificate')
  const [materialTitle, setMaterialTitle] = useState('')
  const [materialDetail, setMaterialDetail] = useState('')
  const [materialProficiency, setMaterialProficiency] = useState('')
  const [migrationMessage, setMigrationMessage] = useState('')
  const [migrationText, setMigrationText] = useState('')
  const {
    activeExperience,
    activateExperience,
    addArtifact,
    artifacts,
    claims,
    clearActiveExperience,
    error,
    evidenceSpans,
    extractingArtifactIds,
    extractArtifact,
    selectExperience,
    setError,
    updateClaim,
  } = useExperienceWorkspace(activeExtractor)

  useEffect(() => {
    void Promise.all([
      migrateIfNeeded(),
      db.experiences.orderBy('updatedAt').reverse().toArray(),
      listProfileMaterials(),
    ])
      .then(async ([migration, initialExperiences, storedMaterials]) => {
        const storedExperiences = migration.migrated
          ? await db.experiences.orderBy('updatedAt').reverse().toArray()
          : initialExperiences
        setExperiences(storedExperiences)
        setProfileMaterials(storedMaterials)
        if (migration.migrated || migration.recovery) {
          setMigrationMessage(
            `已迁移 ${migration.migrated} 条；${migration.recovery} 条需要手动恢复。`,
          )
        }
      })
      .catch((storageError) => setError(storageErrorMessage(storageError)))
  }, [])

  const exportLocalData = async () => {
    try {
      const payload = await exportMigrationPackage()
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(payload, null, 2)], {
          type: 'application/json',
        }),
      )
      const link = document.createElement('a')
      link.href = url
      link.download = `offer-adventure-data-${new Date()
        .toISOString()
        .slice(0, 10)}.json`
      link.click()
      URL.revokeObjectURL(url)
      setMigrationMessage('本地数据包已导出。')
    } catch (exportError) {
      setMigrationMessage(storageErrorMessage(exportError))
    }
  }

  const importMigrationText = async (value: string) => {
    try {
      const result = await importMigrationPackage(
        JSON.parse(value),
      )
      setExperiences(
        await db.experiences.orderBy('updatedAt').reverse().toArray(),
      )
      setProfileMaterials(await listProfileMaterials())
      setMigrationMessage(
        `导入完成：新增 ${result.migrated} 条，跳过 ${result.duplicates} 条重复经历。`,
      )
      setMigrationText('')
    } catch {
      setMigrationMessage('数据包格式不受支持，未修改现有数据。')
    }
  }

  const importLocalData = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    await importMigrationText(await file.text())
    event.target.value = ''
  }

  const groupedClaims = useMemo(
    () =>
      claims.reduce<Partial<Record<ExtractedClaim['kind'], ExtractedClaim[]>>>(
        (groups, claim) => {
          const group = groups[claim.kind] ?? []
          group.push(claim)
          groups[claim.kind] = group
          return groups
        },
        {},
      ),
    [claims],
  )

  const saveNewExperience = async (event: FormEvent) => {
    event.preventDefault()
    const now = new Date().toISOString()

    try {
      const experience = experienceSchema.parse({
        id: createId('experience'),
        organization,
        role,
        project,
        startDate,
        endDate,
        createdAt: now,
        updatedAt: now,
      })
      await db.experiences.put(experience)
      setExperiences((current) => [experience, ...current])
      activateExperience(experience)
      setError('')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存经历失败')
    }
  }

  const saveArtifact = async (event: FormEvent) => {
    event.preventDefault()
    if (!activeExperience) return

    try {
      const artifact = sourceArtifactSchema.parse({
        id: createId('artifact'),
        experienceId: activeExperience.id,
        title: artifactTitle,
        content: artifactContent,
        createdAt: new Date().toISOString(),
      })
      await db.sourceArtifacts.put(artifact)
      addArtifact(artifact)
      setError('')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存材料失败')
    }
  }

  const saveMaterial = async (event: FormEvent) => {
    event.preventDefault()
    const now = new Date().toISOString()
    try {
      await saveProfileMaterial({
        id: createId('profile-material'),
        type: materialType,
        title: materialTitle,
        detail: materialDetail,
        ...(materialProficiency.trim()
          ? { proficiency: materialProficiency }
          : {}),
        createdAt: now,
        updatedAt: now,
      })
      setProfileMaterials(await listProfileMaterials())
      setMaterialTitle('')
      setMaterialDetail('')
      setMaterialProficiency('')
      setError('')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存补充资料失败')
    }
  }

  const removeMaterial = async (material: ProfileMaterial) => {
    try {
      await deleteProfileMaterial(material.id)
      setProfileMaterials((current) =>
        current.filter(({ id }) => id !== material.id),
      )
      setError('')
    } catch (deleteError) {
      setError(storageErrorMessage(deleteError))
    }
  }

  const removeExperience = async (experience: Experience) => {
    if (
      !window.confirm(
        `确认删除“${experience.organization} · ${experience.role}”及其全部材料和证据吗？`,
      )
    ) {
      return
    }
    try {
      await deleteExperienceCascade(experience.id)
      setExperiences((current) =>
        current.filter(({ id }) => id !== experience.id),
      )
      if (activeExperience?.id === experience.id) clearActiveExperience()
      setError('')
    } catch (deleteError) {
      setError(storageErrorMessage(deleteError))
    }
  }

  return (
    <section className="page" aria-labelledby="experiences-title">
      <h1 id="experiences-title">经历档案</h1>
      <p>保存完整原始材料，再逐条确认带证据的信息。</p>
      <section
        className="migration-panel"
        aria-labelledby="migration-panel-title"
      >
        <div>
          <h2 id="migration-panel-title">旧版数据与迁移</h2>
          <p>
            不同网址的浏览器数据彼此隔离。可从旧网址导出，再在这里导入；已有记录会自动去重。
          </p>
          {migrationMessage && <p role="status">{migrationMessage}</p>}
        </div>
        <div className="page-actions">
          <button
            className="text-button"
            onClick={() => void exportLocalData()}
            type="button"
          >
            导出本地数据包
          </button>
          <label className="pill-button file-button">
            导入数据包
            <input
              accept="application/json,.json"
              aria-label="导入旧网站数据包"
              onChange={(event) => void importLocalData(event)}
              type="file"
            />
          </label>
        </div>
        <details className="migration-paste">
          <summary>无法选择文件？粘贴数据包内容</summary>
          <p>仅在当前浏览器本地解析并导入，不会上传数据。</p>
          <textarea
            aria-label="粘贴数据包 JSON"
            placeholder="将 offer-adventure-data-*.json 的全部内容粘贴到这里"
            value={migrationText}
            onChange={(event) => setMigrationText(event.target.value)}
          />
          <button
            className="pill-button"
            disabled={!migrationText.trim()}
            onClick={() => void importMigrationText(migrationText)}
            type="button"
          >
            粘贴并导入
          </button>
        </details>
      </section>
      {error && <p role="alert">{error}</p>}

      <section className="profile-materials" aria-labelledby="profile-materials-title">
        <h2 id="profile-materials-title">个人补充资料</h2>
        <p>
          记录不适合绑定某段实习的证书、AI 应用场景、技能和工具及语言能力。
        </p>
        <form className="stack-form" onSubmit={saveMaterial}>
          <label>
            资料类型
            <select
              value={materialType}
              onChange={(event) =>
                setMaterialType(event.target.value as ProfileMaterial['type'])
              }
            >
              <option value="certificate">证书 / 等级考试</option>
              <option value="ai_application">AI 应用场景</option>
              <option value="skill_tool">技能和工具</option>
              <option value="language">语言能力</option>
            </select>
          </label>
          <label>
            名称
            <input
              required
              value={materialTitle}
              onChange={(event) => setMaterialTitle(event.target.value)}
            />
          </label>
          <label>
            具体说明
            <textarea
              required
              rows={3}
              value={materialDetail}
              onChange={(event) => setMaterialDetail(event.target.value)}
            />
          </label>
          {(materialType === 'language' ||
            materialType === 'skill_tool') && (
            <label>
              {materialType === 'language'
                ? '等级 / 熟练度（可选）'
                : '熟练度（可选）'}
              <input
                value={materialProficiency}
                onChange={(event) =>
                  setMaterialProficiency(event.target.value)
                }
              />
            </label>
          )}
          <button type="submit">保存补充资料</button>
        </form>
        {profileMaterials.length > 0 && (
          <ul className="experience-list profile-material-list">
            {profileMaterials.map((material) => (
              <li key={material.id}>
                <div>
                  <strong>{material.title}</strong>
                  <span>{material.detail}</span>
                  {material.proficiency && <span>{material.proficiency}</span>}
                </div>
                <button
                  className="danger-button"
                  type="button"
                  onClick={() => void removeMaterial(material)}
                >
                  删除资料
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="experience-layout">
        <div>
          <h2>新增经历</h2>
          <form className="stack-form" onSubmit={saveNewExperience}>
            <label>
              组织
              <input
                required
                value={organization}
                onChange={(event) => setOrganization(event.target.value)}
              />
            </label>
            <label>
              角色
              <input
                required
                value={role}
                onChange={(event) => setRole(event.target.value)}
              />
            </label>
            <label>
              项目（可选）
              <input
                value={project}
                onChange={(event) => setProject(event.target.value)}
              />
            </label>
            <div className="date-row">
              <label>
                开始日期（可选）
                <input
                  type="month"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                />
              </label>
              <label>
                结束日期（可选）
                <input
                  type="month"
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                />
              </label>
            </div>
            <button type="submit">保存经历</button>
          </form>
        </div>

        <div>
          <h2>已保存经历</h2>
          {experiences.length === 0 ? (
            <p>还没有经历，填写左侧表单开始记录。</p>
          ) : (
            <ul className="experience-list">
              {experiences.map((experience) => (
                <li key={experience.id}>
                  <button
                    aria-pressed={activeExperience?.id === experience.id}
                    type="button"
                    onClick={() => void selectExperience(experience)}
                  >
                    {experience.organization} · {experience.role}
                  </button>
                  <button
                    aria-label={`删除经历“${experience.organization} · ${experience.role}”`}
                    className="danger-button"
                    type="button"
                    onClick={() => void removeExperience(experience)}
                  >
                    删除
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {activeExperience && (
        <section className="experience-detail">
          <h2>
            {activeExperience.organization} · {activeExperience.role}
          </h2>
          <form className="stack-form" onSubmit={saveArtifact}>
            <label>
              材料标题
              <input
                required
                value={artifactTitle}
                onChange={(event) => setArtifactTitle(event.target.value)}
              />
            </label>
            <label>
              完整工作产出
              <textarea
                required
                rows={8}
                value={artifactContent}
                onChange={(event) => setArtifactContent(event.target.value)}
              />
            </label>
            <button type="submit">保存原始材料</button>
          </form>

          <ArtifactPanel
            artifacts={artifacts}
            extractingArtifactIds={extractingArtifactIds}
            onExtract={(artifact) => void extractArtifact(artifact)}
          />
        </section>
      )}

      {claims.length > 0 && (
        <section className="claims">
          <h2>待核对信息</h2>
          {Object.entries(groupedClaims).map(([kind, kindClaims]) => (
            <section key={kind}>
              <h3>{kindLabels[kind as ExtractedClaim['kind']]}</h3>
              <div className="claim-grid">
                {kindClaims?.map((claim) => (
                  <ClaimCard
                    claim={claim}
                    evidence={evidenceSpans.find((span) =>
                      claim.evidenceSpanIds.includes(span.id),
                    )}
                    key={claim.id}
                    onStorageError={setError}
                    onUpdate={updateClaim}
                  />
                ))}
              </div>
            </section>
          ))}
        </section>
      )}
    </section>
  )
}

export default function ExperiencesPage() {
  return <ExperiencesView />
}
