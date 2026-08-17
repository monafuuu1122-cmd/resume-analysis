export const MAX_RESUME_PDF_BYTES = 10 * 1024 * 1024

export class ResumePdfError extends Error {
  readonly name = 'ResumePdfError'
}

export function validateResumePdfFile(file: File) {
  const isPdf =
    file.type === 'application/pdf' || /\.pdf$/iu.test(file.name.trim())
  if (!isPdf) {
    throw new ResumePdfError('请选择 PDF 格式的简历文件。')
  }
  if (file.size > MAX_RESUME_PDF_BYTES) {
    throw new ResumePdfError('PDF 文件不能超过 10 MB，请压缩后再上传。')
  }
}

export function defaultResumeVersionName(fileName: string) {
  return fileName.replace(/\.pdf$/iu, '').trim() || '未命名简历'
}

export async function extractResumePdfText(file: File) {
  validateResumePdfFile(file)

  try {
    const { GlobalWorkerOptions, getDocument } = await import('pdfjs-dist')
    GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.mjs',
      import.meta.url,
    ).toString()

    const document = await getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
    }).promise
    try {
      const pages: string[] = []
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        const page = await document.getPage(pageNumber)
        const content = await page.getTextContent()
        const text = content.items
          .map((item) => ('str' in item ? item.str : ''))
          .filter(Boolean)
          .join(' ')
        pages.push(text)
      }
      const text = pages
        .map((page, index) => `第 ${index + 1} 页\n${page}`)
        .join('\n\n')
        .trim()
      if (text.length < 20) {
        throw new ResumePdfError(
          '没有提取到足够文字，可能是扫描版 PDF。请改用可复制文字的 PDF 或手动粘贴简历。',
        )
      }
      return { text, pageCount: document.numPages }
    } finally {
      await document.destroy()
    }
  } catch (error) {
    if (error instanceof ResumePdfError) throw error
    throw new ResumePdfError('PDF 解析失败，请重试或改用文字粘贴。')
  }
}
