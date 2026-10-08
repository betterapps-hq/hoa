import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import type { Job } from "@/jobs/job"
import { JobProgress } from "./JobProgress"
import { stageLabel } from "./JobProgress.utils"

const job = (overrides: Partial<Job>): Job => ({
  id: "job-1",
  hoaId: "hoa",
  kind: "rulebook-build",
  subjectId: "rb",
  status: "running",
  stage: null,
  done: 0,
  total: 0,
  promptVersions: {},
  failures: [],
  error: null,
  createdAt: "",
  updatedAt: "",
  ...overrides
})

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
}

describe("JobProgress", () => {
  it("shows the stage and count while running", async () => {
    render(<JobProgress jobId="job-1" loadJob={async () => job({ stage: "extract", done: 12, total: 40 })} />, {
      wrapper
    })
    expect(await screen.findByText("Extracting rules: 12 of 40")).toBeInTheDocument()
    expect(screen.getByLabelText("Progress")).toBeInTheDocument()
  })

  it("reports the end once: done, done with problems, or the error", async () => {
    const onFinished = vi.fn<(job: Job) => void>()
    const { unmount } = render(
      <JobProgress
        jobId="a"
        loadJob={async () =>
          job({ status: "completed-with-errors", failures: [{ stage: "visuals", itemId: "1.1", message: "x" }] })
        }
        onFinished={onFinished}
      />,
      { wrapper }
    )
    expect(await screen.findByText("Done, with 1 problem")).toBeInTheDocument()
    expect(onFinished).toHaveBeenCalledTimes(1)
    unmount()

    render(
      <JobProgress
        jobId="b"
        loadJob={async () =>
          job({ status: "failed", error: { stage: "ocr", message: "Corrupt PDF", isRetryable: false } })
        }
      />,
      { wrapper }
    )
    expect(await screen.findByText("Corrupt PDF")).toBeInTheDocument()
  })

  it("labels stages for people", () => {
    expect(stageLabel(null)).toBe("Starting")
    expect(stageLabel("facts")).toBe("Reading the application")
    expect(stageLabel("unknown")).toBe("Working")
  })
})
