import { and, desc, eq } from "drizzle-orm"
import { jobSchema, type Job } from "@/jobs/job"
import { advanceProgress } from "@/jobs/progress"
import type { Database } from "./database"
import { jobs } from "./schema"

export type NewJob = Pick<Job, "hoaId" | "kind" | "subjectId"> & { id?: string; now: string; total?: number }

/** A new job's row. Server functions insert it in the same batch as the guarded update that claims the subject. */
export function newJob(input: NewJob): Job {
  return {
    id: input.id ?? crypto.randomUUID(),
    hoaId: input.hoaId,
    kind: input.kind,
    subjectId: input.subjectId,
    status: "running",
    stage: null,
    done: 0,
    total: input.total ?? 0,
    promptVersions: {},
    failures: [],
    error: null,
    progress: null,
    createdAt: input.now,
    updatedAt: input.now
  }
}

export function insertJob(db: Database, job: Job) {
  return db.insert(jobs).values(job)
}

export async function getJob(db: Database, hoaId: string, id: string): Promise<Job | null> {
  const row = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.hoaId, hoaId), eq(jobs.id, id)))
    .get()
  return row ? jobSchema.parse(row) : null
}

/** The latest job for a document, rulebook or application, so a reloaded page can find a job in progress. */
export async function getLatestJob(db: Database, hoaId: string, subjectId: string): Promise<Job | null> {
  const row = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.hoaId, hoaId), eq(jobs.subjectId, subjectId)))
    .orderBy(desc(jobs.createdAt))
    .limit(1)
    .get()
  return row ? jobSchema.parse(row) : null
}

/** The HOA's latest job of a kind, so the rulebook page can show why the last build failed. */
export async function getLatestJobOfKind(db: Database, hoaId: string, kind: Job["kind"]): Promise<Job | null> {
  const row = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.hoaId, hoaId), eq(jobs.kind, kind)))
    .orderBy(desc(jobs.createdAt))
    .limit(1)
    .get()
  return row ? jobSchema.parse(row) : null
}

/** Every job for a subject, newest first: the retention sweep deletes their outputs and traces. */
export async function listJobs(db: Database, hoaId: string, subjectId: string): Promise<Job[]> {
  const rows = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.hoaId, hoaId), eq(jobs.subjectId, subjectId)))
    .orderBy(desc(jobs.createdAt))
  return rows.map((row) => jobSchema.parse(row))
}

/**
 * Moves a job's stage and count, and its steps when it records them (`src/jobs/progress.ts`), reading the steps it has
 * so parallel reports each build on the latest.
 */
export async function reportJobProgress(
  db: Database,
  hoaId: string,
  id: string,
  report: { stage: string; done: number; total: number; now: string }
) {
  const job = await getJob(db, hoaId, id)
  const { now, ...counts } = report
  await updateJob(db, hoaId, id, {
    ...counts,
    ...(job?.progress ? { progress: advanceProgress(job.progress, counts, now) } : {}),
    now
  })
}

export async function updateJob(
  db: Database,
  hoaId: string,
  id: string,
  patch: Partial<
    Pick<Job, "status" | "stage" | "done" | "total" | "promptVersions" | "failures" | "error" | "progress">
  > & {
    now: string
  }
) {
  const { now, ...changes } = patch
  await db
    .update(jobs)
    .set({ ...changes, updatedAt: now })
    .where(and(eq(jobs.hoaId, hoaId), eq(jobs.id, id)))
}
