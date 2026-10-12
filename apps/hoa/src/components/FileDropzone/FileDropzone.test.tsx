import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"
import { FileDropzone, type ChosenFile, type FileDropzoneProps } from "./FileDropzone"

const pdf = (name: string, size = 4) => new File(["x".repeat(size)], name, { type: "application/pdf" })

function Zone(props: Partial<FileDropzoneProps> & { onValue?: (files: ChosenFile[]) => void }) {
  const [value, setValue] = useState<ChosenFile[]>([])
  return (
    <FileDropzone
      id="zone"
      target="application"
      value={value}
      onChange={(next) => {
        setValue(next)
        props.onValue?.(next)
      }}
      {...props}
    />
  )
}

const input = () => {
  const found = document.getElementById("zone")
  if (!(found instanceof HTMLInputElement)) {
    throw new Error("No input")
  }
  return found
}

describe("FileDropzone", () => {
  it("says what it takes, from the upload rules", () => {
    render(<Zone />)
    const zone = screen.getByRole("button", { name: "Add files" })
    expect(zone).toHaveAccessibleDescription("PDF or Word up to 25 MB, JPEG or PNG up to 5 MB.")
    expect(input()).toHaveAttribute("accept", expect.stringContaining(".pdf"))
  })

  it("opens the file browser with Enter or Space", async () => {
    const user = userEvent.setup()
    render(<Zone />)
    const click = vi.spyOn(input(), "click")
    screen.getByRole("button", { name: "Add files" }).focus()
    await user.keyboard("{Enter}")
    await user.keyboard(" ")
    expect(click).toHaveBeenCalledTimes(2)
  })

  it("takes files, lists them, and turns away those it can't take with the reason", async () => {
    const user = userEvent.setup({ applyAccept: false })
    render(<Zone />)
    const big = new File([new Uint8Array(6 * 1024 * 1024)], "big.png", { type: "image/png" })
    await user.upload(input(), [pdf("plan.pdf"), big, new File(["x"], "photo.heic", { type: "image/heic" })])
    expect(await screen.findByText("plan.pdf")).toBeInTheDocument()
    const problems = screen.getByRole("alert")
    expect(problems).toHaveTextContent("big.png is larger than 5 MB.")
    expect(problems).toHaveTextContent("photo.heic isn't a PDF, Word, JPEG or PNG file. Save photos as JPEG or PNG.")
  })

  it("asks what each file is, with a guess, and removes or replaces one", async () => {
    const user = userEvent.setup()
    const onValue = vi.fn<(files: ChosenFile[]) => void>()
    render(
      <Zone
        kinds={[
          { value: "plan", label: "Plan" },
          { value: "photo", label: "Photo" }
        ]}
        guessKind={(file) => (file.name.includes("plan") ? "plan" : "")}
        onValue={onValue}
      />
    )
    await user.upload(input(), [pdf("plan.pdf"), pdf("other.pdf")])
    expect(await screen.findByRole("combobox", { name: "What plan.pdf is" })).toHaveValue("plan")
    await user.selectOptions(screen.getByRole("combobox", { name: "What other.pdf is" }), "photo")
    await user.click(screen.getByRole("button", { name: "Replace other.pdf" }))
    const replacement = pdf("better.pdf")
    await user.upload(input(), replacement)
    await waitFor(() => expect(screen.getByText("better.pdf")).toBeInTheDocument())
    expect(screen.getByRole("combobox", { name: "What better.pdf is" })).toHaveValue("photo")
    await user.click(screen.getByRole("button", { name: "Remove plan.pdf" }))
    expect(onValue).toHaveBeenLastCalledWith([{ file: replacement, kind: "photo" }])
  })

  it("keeps one file when it takes one, and hands files on without a list when it keeps none", async () => {
    const user = userEvent.setup()
    const { unmount } = render(<Zone multiple={false} target="governing" />)
    await user.upload(input(), pdf("first.pdf"))
    await user.upload(input(), pdf("second.pdf"))
    await waitFor(() => expect(screen.getByText("second.pdf")).toBeInTheDocument())
    expect(screen.queryByText("first.pdf")).not.toBeInTheDocument()
    unmount()
    const onFiles = vi.fn<(files: File[]) => void>()
    render(<FileDropzone id="zone" target="application" onFiles={onFiles} />)
    const file = pdf("plan.pdf")
    await user.upload(input(), file)
    await waitFor(() => expect(onFiles).toHaveBeenCalledWith([file]))
    expect(screen.queryByRole("list", { name: "Chosen files" })).not.toBeInTheDocument()
  })
})
