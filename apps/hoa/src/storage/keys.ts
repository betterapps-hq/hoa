// R2 keys (docs/design/documents.md, "Object layout"). Keys are built from record ids; every write goes to a new key.

export function extensionOf(fileName: string) {
  const extension = fileName.toLowerCase().split(".").pop()
  return extension && extension !== fileName.toLowerCase() ? extension : "bin"
}

export const governingKeys = (hoaId: string, documentId: string) => {
  const root = `hoas/${hoaId}/governing/${documentId}`
  return {
    source: (fileName: string) => `${root}/source.${extensionOf(fileName)}`,
    ocr: (engine: string, range: string) => `${root}/ocr/${engine}/${range}.json`,
    page: (pageIndex: number) => `${root}/pages/${pageIndex}.json`,
    layout: () => `${root}/layout.json`,
    figureImage: (figureId: string) => `${root}/figures/${figureId}.png`,
    figureDescription: (figureId: string) => `${root}/figures/${figureId}.json`,
    sectionText: (sectionId: string) => `${root}/sections/${sectionId}.md`
  }
}

export const applicationKeys = (hoaId: string, applicationId: string) => {
  const root = `hoas/${hoaId}/applications/${applicationId}`
  const file = (fileId: string) => `${root}/files/${fileId}`
  return {
    root: `${root}/`,
    source: (fileId: string, fileName: string) => `${file(fileId)}/source.${extensionOf(fileName)}`,
    ocr: (fileId: string, engine: string, range: string) => `${file(fileId)}/ocr/${engine}/${range}.json`,
    page: (fileId: string, pageIndex: number) => `${file(fileId)}/pages/${pageIndex}.json`,
    figureImage: (fileId: string, figureId: string) => `${file(fileId)}/figures/${figureId}.png`,
    figureDescription: (fileId: string, figureId: string) => `${file(fileId)}/figures/${figureId}.json`,
    cache: (stage: string, key: string) => `${root}/cache/${stage}/${key}.json`,
    review: (reviewId: string) => `${root}/reviews/${reviewId}.json`
  }
}

export const hoaCacheKey = (hoaId: string, stage: string, key: string) => `hoas/${hoaId}/cache/${stage}/${key}.json`

export const jobOutputKey = (hoaId: string, jobId: string, stage: string, itemId: string) =>
  `hoas/${hoaId}/jobs/${jobId}/${stage}/${itemId}.json`

export const jobOutputPrefix = (hoaId: string, jobId: string) => `hoas/${hoaId}/jobs/${jobId}/`
