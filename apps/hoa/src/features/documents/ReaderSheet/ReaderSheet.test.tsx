import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import type { DocumentReading } from "@/documents/reading"
import { readerTargetOf } from "../citationLink"
import { ReaderLink } from "../ReaderLink/ReaderLink"
import { CitationsOpenInSheet } from "./ReaderSheet"

vi.mock("../documents.functions", () => ({
  getDocumentReading: vi.fn<() => Promise<DocumentReading>>(async () => ({
    id: "upload-1",
    title: "Community Rules",
    edition: null,
    pageCount: 1,
    isStructured: true,
    newerVersionId: null,
    original: null,
    files: [{ id: "upload-1", title: "Community Rules" }],
    pages: [{ fileId: "upload-1", page: 1, label: null }],
    outline: [],
    blocks: [
      {
        type: "provision",
        key: "rules:1.1",
        provisionKey: "rules:1.1",
        part: "main",
        depth: 0,
        number: "1.1",
        heading: null,
        level: null,
        text: "Fences stay under six feet.",
        intro: null,
        at: { fileId: "upload-1", page: 1 },
        anchors: []
      }
    ]
  })),
  locateProvisions: vi.fn<() => Promise<Record<string, never>>>(async () => ({})),
  getPageGeometry: vi.fn<() => Promise<never[]>>(async () => [])
}))

const href = "/documents/upload-1?provision=rules%3A1.1"

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
}

function Form() {
  return (
    <CitationsOpenInSheet>
      <label>
        Height
        <input defaultValue="" />
      </label>
      <ReaderLink href={href}>Rules 1.1</ReaderLink>
    </CitationsOpenInSheet>
  )
}

describe("CitationsOpenInSheet", () => {
  it("opens a citation in a reader sheet over the form, which keeps what was typed", async () => {
    const user = userEvent.setup()
    render(<Form />, { wrapper })
    await user.type(screen.getByRole("textbox", { name: "Height" }), "72")
    const link = screen.getByRole("link", { name: "Rules 1.1" })
    expect(link).toHaveAttribute("href", href)
    await user.click(link)
    const sheet = await screen.findByRole("dialog", { name: "Governing document" })
    expect(await within(sheet).findByText("Fences stay under six feet.")).toBeInTheDocument()
    expect(within(sheet).getByRole("link", { name: "Open in a new tab" })).toHaveAttribute("target", "_blank")
    expect(within(sheet).getByRole("link", { name: "Open in a new tab" })).toHaveAttribute("href", href)
    await user.keyboard("{Escape}")
    expect(screen.getByRole("textbox", { name: "Height" })).toHaveValue("72")
    expect(window.location.pathname).toBe("/")
  })

  it("leaves a click with a modifier to the browser, which opens the link in a new tab", () => {
    render(<Form />, { wrapper })
    const link = screen.getByRole("link", { name: "Rules 1.1" })
    const event = new MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true })
    fireEvent(link, event)
    expect(event.defaultPrevented).toBe(false)
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("reads only the reader's own URLs", () => {
    expect(readerTargetOf("/documents/upload-1?provision=a%3A1&cites=a%3A1%2Ca%3A2")).toEqual({
      documentId: "upload-1",
      provision: "a:1",
      cites: ["a:1", "a:2"]
    })
    expect(readerTargetOf("/rules")).toBeNull()
  })
})
