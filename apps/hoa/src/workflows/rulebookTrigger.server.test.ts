// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createGoverningDocument, updateGoverningDocument } from "@/db/documentRepository"
import { getJob } from "@/db/jobRepository"
import { getRulebook, getRulebookByStatus } from "@/db/rulebookRepository"
import type { GoverningDocument } from "@/documents/governingDocument"
import { createTestDatabase, type TestDatabase } from "@/tests/testDatabase"
import { untouchedDatabase } from "@/tests/untouchedDatabase"
import {
  abandonRulebookBuild,
  requestRulebookBuild,
  stopRulebookBuild,
  terminateBuild,
  type RulebookBuildBinding
} from "./rulebookTrigger.server"

// What starts a build and how stopping one meets its Workflow are tested without a database (buildDecision in
// currentDocuments.test.ts, terminateBuild here); these database tests keep only what the SQL decides: a retried
// request finds the rulebook it inserted, a build that can't start doesn't stay building, and an organization reaches
// only its own build.

const organizationId = "demo-hoa"
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

  async function upload(title: string, status: GoverningDocument["status"]) {
    const document = await createGoverningDocument(database.db, {
      organizationId,
      kind: "declaration",
      title,
      effectiveDate: null,
      fileName: `${title}.pdf`,
      mediaType: "application/pdf",
      sizeBytes: 1,
      uploadedBy: "admin",
      uploadedAt: now
    })
    await updateGoverningDocument(database.db, organizationId, document.id, { status })
    return document
  }

  it("starts the workflow a retried request inserted the rulebook for, once", async () => {
    const { db } = database
    const { binding, instances } = fakeBinding()
    await upload("Declaration", "ready")
    const ids = { rulebookId: "rulebook-1", jobId: "job-1" }
    binding.create.mockRejectedValueOnce(new Error("Workflows is unavailable."))
    await expect(requestRulebookBuild(db, binding, organizationId, { now, ids })).rejects.toThrow(
      "Workflows is unavailable."
    )
    expect((await getRulebookByStatus(db, organizationId, "building"))?.id).toBe("rulebook-1")
    expect(instances.size).toBe(0)

    expect(await requestRulebookBuild(db, binding, organizationId, { now, ids })).toEqual({ status: "started", ...ids })
    expect(await requestRulebookBuild(db, binding, organizationId, { now, ids })).toEqual({ status: "started", ...ids })
    expect([...instances]).toEqual(["job-1"])
  })

  it("fails a build whose workflow can't start", async () => {
    const { db } = database
    const { binding } = fakeBinding()
    await upload("Declaration", "ready")
    const ids = { rulebookId: "rulebook-1", jobId: "job-1" }
    binding.create.mockRejectedValue(new Error("Workflows is unavailable."))
    await expect(requestRulebookBuild(db, binding, organizationId, { now, ids })).rejects.toThrow(
      "Workflows is unavailable."
    )
    await abandonRulebookBuild(db, organizationId, ids, "Workflows is unavailable.", now)
    expect(await getRulebook(db, organizationId, "rulebook-1")).toMatchObject({
      status: "failed",
      error: { stage: "start", message: "Workflows is unavailable." }
    })
    expect(await getJob(db, organizationId, "job-1")).toMatchObject({ status: "failed" })
  })
})

describe("stopRulebookBuild", { timeout: 30_000 }, () => {
  let database: TestDatabase
  const administrator = { organization: { id: organizationId }, role: "administrator" as const }

  beforeEach(async () => {
    database = await createTestDatabase()
  })

  afterEach(async () => {
    await database.dispose()
  })

  async function startBuild(binding: RulebookBuildBinding) {
    const document = await createGoverningDocument(database.db, {
      organizationId,
      kind: "declaration",
      title: "Declaration",
      effectiveDate: null,
      fileName: "Declaration.pdf",
      mediaType: "application/pdf",
      sizeBytes: 1,
      uploadedBy: "admin",
      uploadedAt: now
    })
    await updateGoverningDocument(database.db, organizationId, document.id, { status: "ready" })
    const started = await requestRulebookBuild(database.db, binding, organizationId, { now })
    if (started.status !== "started") {
      throw new Error("The build should start")
    }
    return { ...started, documentId: document.id }
  }

  it("only stops the organization's own build", async () => {
    const { db } = database
    const { binding, terminate } = fakeBinding()
    await startBuild(binding)

    expect(await stopRulebookBuild(db, binding, { ...administrator, organization: { id: "other-hoa" } }, now)).toEqual({
      status: "not-building"
    })
    expect(terminate).not.toHaveBeenCalled()
  })
})

describe("stopping a build", () => {
  it("is for administrators only", async () => {
    const { binding, terminate } = fakeBinding()
    await expect(
      stopRulebookBuild(untouchedDatabase(), binding, { organization: { id: organizationId }, role: "homeowner" }, now)
    ).rejects.toThrow("Only an administrator can do this.")
    expect(terminate).not.toHaveBeenCalled()
  })
})

describe("terminateBuild", () => {
  /** A Workflow instance that reports each status in turn, then the last one. */
  const terminated = () => vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
  function instance(statuses: string[], terminate = terminated()) {
    let reads = 0
    const status = async () => {
      const found = statuses[Math.min(reads, statuses.length - 1)] ?? "running"
      reads += 1
      return { status: found }
    }
    return { status, terminate }
  }

  it("terminates a running build's instance", async () => {
    const running = instance(["running"])
    expect(await terminateBuild(running)).toBe("terminated")
    expect(running.terminate).toHaveBeenCalledOnce()
    // A build whose instance can't be found or read is stopped all the same.
    expect(await terminateBuild(null)).toBe("terminated")
    expect(
      await terminateBuild({ status: async () => Promise.reject(new Error("gone")), terminate: terminated() })
    ).toBe("terminated")
  })

  it("says plainly when the build already finished, failed or was stopped, even in the moment before terminating", async () => {
    for (const ended of ["complete", "errored", "terminated"]) {
      const over = instance([ended])
      expect(await terminateBuild(over)).toBe("already-finished")
      expect(over.terminate).not.toHaveBeenCalled()
    }
    const refused = vi.fn<() => Promise<void>>(async () => Promise.reject(new Error("not running")))
    expect(await terminateBuild(instance(["running", "complete"], refused))).toBe("already-finished")
    await expect(terminateBuild(instance(["running"], refused))).rejects.toThrow("not running")
  })
})
