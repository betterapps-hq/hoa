// R2 keys (docs/design/documents.md, "Object layout"). Keys are built from record ids; every write goes to a new key.
// They start hoas/, the prefix the stored objects already have, though the table is organizations now.

export function extensionOf(fileName: string) {
  const extension = fileName.toLowerCase().split(".").pop()
  return extension && extension !== fileName.toLowerCase() ? extension : "bin"
}

export const governingKeys = (organizationId: string, documentId: string) => {
  const root = `hoas/${organizationId}/governing/${documentId}`
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

export const applicationKeys = (organizationId: string, applicationId: string) => {
  const root = `hoas/${organizationId}/applications/${applicationId}`
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

export const organizationCacheKey = (organizationId: string, stage: string, key: string) =>
  `hoas/${organizationId}/cache/${stage}/${key}.json`

export const jobOutputKey = (organizationId: string, jobId: string, stage: string, itemId: string) =>
  `hoas/${organizationId}/jobs/${jobId}/${stage}/${itemId}.json`

export const jobOutputPrefix = (organizationId: string, jobId: string) => `hoas/${organizationId}/jobs/${jobId}/`

/** A project type's objects: the templates its documents give homeowners to fill in. */
export const projectTypeKeys = (organizationId: string, projectTypeId: string) => {
  const root = `hoas/${organizationId}/project-types/${projectTypeId}/`
  return {
    root,
    template: (templateId: string, fileName: string) => `${root}templates/${templateId}.${extensionOf(fileName)}`
  }
}

/** A rulebook's objects: its published rules file, written once (encoding.md, Storage). */
export const rulebookKeys = (organizationId: string, rulebookId: string) => {
  const root = `hoas/${organizationId}/rulebooks/${rulebookId}/`
  return { root, file: `${root}rules.json` }
}

/**
 * A job's step output by step name: `find-rules:declaration:article-4` is `find-rules/declaration:article-4.json`, and a
 * step without an item, such as `merge`, is `merge/result.json`.
 */
export function jobStepKey(organizationId: string, jobId: string, name: string) {
  const [stage = name, ...item] = name.split(":")
  return jobOutputKey(organizationId, jobId, stage, item.join(":") || "result")
}

/** A rulebook build's step outputs (encoding.md, Storage). */
export const rulebookBuildKeys = (organizationId: string, jobId: string) => ({
  step: (name: string) => jobStepKey(organizationId, jobId, name)
})

/** Everything an organization keeps in storage, under one prefix. */
export const organizationPrefix = (organizationId: string) => `hoas/${organizationId}/`

/** An organization's logo, one object replaced on each upload. */
export const organizationLogoKey = (organizationId: string) => `${organizationPrefix(organizationId)}logo`
