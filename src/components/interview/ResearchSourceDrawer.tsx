import type { ResearchSource } from '../../domain/types'

const typeLabels = {
  official_website: '官方网站', official_careers: '官方招聘',
  official_report: '官方报告', official_social: '官方社交账号',
  industry_media: '行业媒体', job_platform: '招聘平台', other: '其他',
}

export default function ResearchSourceDrawer({ sources }: { sources: ResearchSource[] }) {
  return sources.length === 0 ? (
    <p className="interview-empty">没有可展示的可靠来源。</p>
  ) : (
    <div className="research-sources">
      {sources.map((source) => (
        <details key={source.id} open>
          <summary><strong>{source.title}</strong><span className="research-tag">{typeLabels[source.sourceType]}</span></summary>
          <p className="research-source-note">
            {source.publisher ?? source.domain ?? '来源机构待核实'}
            {' · '}
            {source.contentStatus === 'full'
              ? '已读取网页正文'
              : source.contentStatus === 'partial'
                ? '已读取部分正文'
                : source.contentStatus === 'snippet-only'
                  ? '仅获得搜索摘要'
                  : '来源状态未标记'}
          </p>
          <p>{source.content}</p>
          {source.failureReason && (
            <p className="research-source-note">读取提示：{source.failureReason}</p>
          )}
          <p className="research-source-note">访问于 {new Date(source.accessedAt).toLocaleDateString('zh-CN')}</p>
          <a href={source.url} target="_blank" rel="noreferrer">打开原始来源</a>
        </details>
      ))}
    </div>
  )
}
