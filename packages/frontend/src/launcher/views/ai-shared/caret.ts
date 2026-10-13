const MIRRORED = [
  "box-sizing",
  "width",
  "border-top-width",
  "border-right-width",
  "border-bottom-width",
  "border-left-width",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "font-family",
  "font-size",
  "font-style",
  "font-variant",
  "font-weight",
  "font-stretch",
  "font-feature-settings",
  "line-height",
  "letter-spacing",
  "word-spacing",
  "text-indent",
  "text-transform",
  "tab-size",
];

/**
 * Caret position inside a textarea, relative to its border box and scroll
 * position, measured with an off-screen copy of the text (textareas expose
 * no caret geometry).
 */
export function caretOffset(textarea: HTMLTextAreaElement, position: number): { left: number; top: number; height: number } {
  const style = getComputedStyle(textarea);
  const mirror = document.createElement("div");
  for (const property of MIRRORED) mirror.style.setProperty(property, style.getPropertyValue(property));
  Object.assign(mirror.style, { position: "absolute", top: "0", left: "-9999px", visibility: "hidden", whiteSpace: "pre-wrap", overflowWrap: "break-word", overflow: "hidden", height: "auto" });
  mirror.textContent = textarea.value.slice(0, position);
  const marker = document.createElement("span");
  marker.textContent = "​";
  mirror.appendChild(marker);
  document.body.appendChild(mirror);
  const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.4;
  const result = { left: marker.offsetLeft - textarea.scrollLeft, top: marker.offsetTop - textarea.scrollTop, height: lineHeight };
  mirror.remove();
  return result;
}
