import { propagateAttributes, startActiveObservation, type LangfuseSpan } from "@langfuse/tracing"

// Scores on a job's root span (ai.md, Evaluation): a pipeline that runs as many traced calls, such as a rulebook build,
// gets one more span under its trace name that holds its overall input and output and the scores computed in code.

export type Score = { name: string; value: number; comment?: string }

/** The slice of `LangfuseClient.score` that scores an observation. */
export type ScoreRecorder = {
  observation: (observation: Pick<LangfuseSpan, "otelSpan">, data: Score) => void
  flush: () => Promise<void>
}

export async function recordScores(options: {
  traceName: string
  sessionId: string
  input: unknown
  output: unknown
  scores: readonly Score[]
  recorder: ScoreRecorder
}) {
  propagateAttributes({ traceName: options.traceName, sessionId: options.sessionId }, () =>
    startActiveObservation(options.traceName, (span) => {
      span.update({ input: options.input, output: options.output })
      for (const score of options.scores) {
        options.recorder.observation(span, score)
      }
    })
  )
  await options.recorder.flush()
}
