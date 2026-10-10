// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createGoverningDocument, updateGoverningDocument } from "@/db/documentRepository"
import { getJob } from "@/db/jobRepository"
import { getRulebook, getRulebookByStatus } from "@/db/rulebookRepository"
import type { GoverningDocument } from "@/documents/governingDocument"
import { createTestDatabase, type TestDatabase } from "@/tests/testDatabase"
import {
  abandonRulebookBuild,
  requestRulebookBuild,
  stopRulebookBuild,
  type RulebookBuildBinding
} from "./rulebookTrigger.server"

const hoaId = "demo-hoa"
const now = "2026-10-09T00:00:00.000Z"

/** A Workflow binding that records the instances it creates, each running until it's terminated or `end`ed. */
function fakeBinding() {
  const instances = new Set<string>()
  const states = new Map<string, string>()
  const terminate = vi.fn<(id: string) => Promise<void>>(async (id) => {
    if (states.get(id) !== "running") {
      throw new Error("Cannot terminate an instance that isn't running.")
    }
    states.set(id, "terminated")
  })
  const create = vi.fn<RulebookBuildBinding["create"]>(async (options) => {
    if (instances.has(options.id)) {
      throw new Error("An instance with that id exists.")
    }
    instances.add(options.id)
    states.set(options.id, "running")
    return { id: options.id }
  })
  const get = vi.fn<RulebookBuildBinding["get"]>(async (id) => {
    if (!instances.has(id)) {
      throw new Error("No such instance.")
    }
    return {
      status: async () => ({ status: states.get(id) ?? "unknown" }),
      terminate: () => terminate(id)
    }
  })
  /** Ends an instance as the Workflow would: it finished, failed or was terminated. */
  const end = (id: string, status: "complete" | "errored" | "terminated") => states.set(id, status)
  return { binding: { create, get }, instances, terminate, end }
}

describe("requestRulebookBuild", { timeout: 30_000 }, () => {
  let database: TestDatabase

  beforeEach(async () => {
    database = await createTestDatabase()
  })

  afterEach(async () => {
    await database.dispose()
  })

  async function upload(title: string, status: GoverningDocument["status"], lineageId?: string) {
    const document = await createGoverningDocument(database.db, {
      hoaId,
      kind: "declaration",
      title,
      effectiveDate: null,
      fileName: `${title}.pdf`,
      mediaType: "application/pdf",
      sizeBytes: 1,
      uploadedBy: "admin",
      uploadedAt: now,
      ...(lineageId ? { lineageId } : {})
    })
    await updateGoverningDocument(database.db, hoaId, document.id, { status })
    return document
  }

  it("builds the current documents once nothing is being read or built", async () => {
    const { db } = database
    const { binding } = fakeBinding()
    expect(await requestRulebookBuild(db, binding, hoaId, { now })).toEqual({
      status: "skipped",
      reason: "no-documents"
    })

    const first = await upload("Declaration", "ready")
    const second = await upload("Declaration, restated", "processing", first.lineageId)
    expect(await requestRulebookBuild(db, binding, hoaId, { now })).toEqual({ status: "skipped", reason: "processing" })

    await updateGoverningDocument(db, hoaId, second.id, { status: "ready" })
    expect(await requestRulebookBuild(db, binding, hoaId, { now, unlessCurrentIs: [second.id] })).toEqual({
      status: "skipped",
      reason: "unchanged"
    })
    const started = await requestRulebookBuild(db, binding, hoaId, { now, unlessCurrentIs: [first.id] })
    if (started.status !== "started") {
      throw new Error("The build should start")
    }
    expect(await getRulebook(db, hoaId, started.rulebookId)).toMatchObject({
      status: "building",
      sourceDocumentIds: [second.id],
      jobId: started.jobId
    })
    expect(await getJob(db, hoaId, started.jobId)).toMatchObject({ kind: "rulebook-build", status: "running" })
    expect(binding.create).toHaveBeenCalledWith({
      id: started.jobId,
      params: { hoaId, rulebookId: started.rulebookId, jobId: started.jobId }
    })

    expect(await requestRulebookBuild(db, binding, hoaId, { now })).toEqual({ status: "skipped", reason: "building" })
  })

  it("starts the workflow a retried request inserted the rulebook for, once", async () => {
    const { db } = database
    const { binding, instances } = fakeBinding()
    await upload("Declaration", "ready")
    const ids = { rulebookId: "rulebook-1", jobId: "job-1" }
    binding.create.mockRejectedValueOnce(new Error("Workflows is unavailable."))
    await expect(requestRulebookBuild(db, binding, hoaId, { now, ids })).rejects.toThrow("Workflows is unavailable.")
    expect((await getRulebookByStatus(db, hoaId, "building"))?.id).toBe("rulebook-1")
    expect(instances.size).toBe(0)

    expect(await requestRulebookBuild(db, binding, hoaId, { now, ids })).toEqual({ status: "started", ...ids })
    expect(await requestRulebookBuild(db, binding, hoaId, { now, ids })).toEqual({ status: "started", ...ids })
    expect([...instances]).toEqual(["job-1"])
  })

  it("fails a build whose workflow can't start", async () => {
    const { db } = database
    const { binding } = fakeBinding()
    await upload("Declaration", "ready")
    const ids = { rulebookId: "rulebook-1", jobId: "job-1" }
    binding.create.mockRejectedValue(new Error("Workflows is unavailable."))
    await expect(requestRulebookBuild(db, binding, hoaId, { now, ids })).rejects.toThrow("Workflows is unavailable.")
    await abandonRulebookBuild(db, hoaId, ids, "Workflows is unavailable.", now)
    expect(await getRulebook(db, hoaId, "rulebook-1")).toMatchObject({
      status: "failed",
      error: { stage: "start", message: "Workflows is unavailable." }
    })
    expect(await getJob(db, hoaId, "job-1")).toMatchObject({ status: "failed" })
  })
})

describe("stopRulebookBuild", { timeout: 30_000 }, () => {
  let database: TestDatabase
  const administrator = { hoa: { id: hoaId }, role: "administrator" as const }

  beforeEach(async () => {
    database = await createTestDatabase()
  })

  afterEach(async () => {
    await database.dispose()
  })

  async function startBuild(binding: RulebookBuildBinding) {
    const document = await createGoverningDocument(database.db, {
      hoaId,
      kind: "declaration",
      title: "Declaration",
      effectiveDate: null,
      fileName: "Declaration.pdf",
      mediaType: "application/pdf",
      sizeBytes: 1,
      uploadedBy: "admin",
      uploadedAt: now
    })
    await updateGoverningDocument(database.db, hoaId, document.id, { status: "ready" })
    const started = await requestRulebookBuild(database.db, binding, hoaId, { now })
    if (started.status !== "started") {
      throw new Error("The build should start")
    }
    return { ...started, documentId: document.id }
  }

  it("terminates a running build and marks it stopped, so nothing restarts it on its own", async () => {
    const { db } = database
    const { binding, terminate } = fakeBinding()
    const started = await startBuild(binding)

    expect(await stopRulebookBuild(db, binding, administrator, now)).toEqual({ status: "stopped" })
    expect(terminate).toHaveBeenCalledWith(started.jobId)
    expect(await getRulebook(db, hoaId, started.rulebookId)).toMatchObject({ status: "cancelled" })
    expect(await getJob(db, hoaId, started.jobId)).toMatchObject({ status: "cancelled" })
    expect(await getRulebookByStatus(db, hoaId, "building")).toBeNull()

    // The stopped build's follow-up would compare against the same documents: nothing starts.
    expect(await requestRulebookBuild(db, binding, hoaId, { now, unlessCurrentIs: [started.documentId] })).toEqual({
      status: "skipped",
      reason: "unchanged"
    })
    // The administrator's "Build a draft" starts a new one.
    expect(await requestRulebookBuild(db, binding, hoaId, { now })).toMatchObject({ status: "started" })
  })

  it("says plainly when the build already finished, failed or was stopped", async () => {
    const { db } = database
    const { binding, end, terminate } = fakeBinding()
    const started = await startBuild(binding)
    end(started.jobId, "complete")

    expect(await stopRulebookBuild(db, binding, administrator, now)).toEqual({ status: "already-finished" })
    expect(terminate).not.toHaveBeenCalled()
    expect(await getRulebook(db, hoaId, started.rulebookId)).toMatchObject({ status: "building" })

    await abandonRulebookBuild(db, hoaId, started, "Failed.", now)
    expect(await stopRulebookBuild(db, binding, administrator, now)).toEqual({ status: "not-building" })
  })

  it("is for administrators only", async () => {
    const { db } = database
    const { binding, terminate } = fakeBinding()
    const started = await startBuild(binding)

    await expect(stopRulebookBuild(db, binding, { hoa: { id: hoaId }, role: "homeowner" }, now)).rejects.toThrow(
      "Only an administrator can do this."
    )
    expect(terminate).not.toHaveBeenCalled()
    expect(await getRulebook(db, hoaId, started.rulebookId)).toMatchObject({ status: "building" })
  })

  it("only stops the organization's own build", async () => {
    const { db } = database
    const { binding, terminate } = fakeBinding()
    await startBuild(binding)

    expect(await stopRulebookBuild(db, binding, { ...administrator, hoa: { id: "other-hoa" } }, now)).toEqual({
      status: "not-building"
    })
    expect(terminate).not.toHaveBeenCalled()
  })
})
