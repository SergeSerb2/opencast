import { Detail } from "../../../components";
import type { PlaceholderContext } from "./placeholders";

export function PlaceholderGuide({ context }: { context: PlaceholderContext }) {
  const common = `# Dynamic Placeholders

Type **{** in the editor, then choose an item with ↑ / ↓ and Enter. The first option value is selected so you can replace it. Press Esc to dismiss the menu.

| Placeholder | Inserts |
| --- | --- |
| \`{clipboard}\` | Copied text; use \`offset="1"\` for the preceding entry |
| \`{argument name="Customer" default="World"}\` | An input field when you use the item |
| \`{argument name="Size" options="Small,Medium,Large"}\` | A choice of values |
| \`{date}\`, \`{time}\`, \`{datetime}\`, \`{day}\` | The current date, time or weekday |
| \`{date format="yyyy-MM-dd"}\` | A date in your chosen format |
| \`{date locale="en-GB" offset="+1d"}\` | Tomorrow’s date in the chosen locale |
| \`{uuid}\` | A new unique identifier |
| \`{snippet name="Signature"}\` | Another snippet’s contents |
| \`{calculator expression="2+2"}\` | The result of a calculation |

Use up to **three distinct arguments**. Repeated named arguments share an input. Snippet references must have a unique name and cannot refer back to themselves or contain arguments or more snippet references.

## Modifiers

Chain transformations from left to right: \`{clipboard | trim | uppercase}\`.
Supported modifiers: \`uppercase\`, \`lowercase\`, \`trim\`, \`percent-encode\`, \`json-stringify\`, and \`raw\`.

Date offsets accept minutes (m), hours (h), days (d), months (M) and years (y). Use either a date format or a locale. Time, datetime and day accept locale and offset.
`;
  const specific = context === "snippet"
    ? `\n## Snippets\n\nUse \`{cursor}\` once to place the caret after pasting. It takes no options or modifiers. Selected-text and browser placeholders are unavailable in snippets.`
    : `\n## Quicklinks\n\nUse \`{selection}\` for selected text. Substitutions are URL encoded automatically; add \`| raw\` to keep a value unchanged. Legacy \`{query}\` and \`{query:default}\` links also work. Cursor and browser placeholders are unavailable in quicklinks.`;
  return <Detail navigationTitle="Dynamic Placeholders" markdown={common + specific} />;
}
