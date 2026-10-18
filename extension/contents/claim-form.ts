import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: ["http://localhost:5173/claim*"]
}

// Sets a value on a React-controlled field so React registers it.
// IMPLEMENTATION.md §5.6. Fill one field at a time; never submit.
export function setFieldValue(
  el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string
) {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : el instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value)
  el.dispatchEvent(new Event("input", { bubbles: true }))
  el.dispatchEvent(new Event("change", { bubbles: true }))
}

// TODO(C): the H5 fill spike. Collect {key, label, type, options} for every
// field, accept a DraftResponse from the side panel, fill with setFieldValue,
// highlight filled fields, and listen for the shopper's submit.
