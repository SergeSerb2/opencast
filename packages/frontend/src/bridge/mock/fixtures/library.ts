import type { AppInfo, CalculatorResult, EmojiItem, FileResult } from "@surgecast/protocol";

const now = Date.now();
const min = 60_000;
const hour = 60 * min;
const day = 24 * hour;

/** Apps the browser stand-in reports for "Open With" pickers. */
export const MOCK_APPS: AppInfo[] = [
  { name: "Safari", bundleId: "com.apple.Safari", path: "/Applications/Safari.app" },
  { name: "Google Chrome", bundleId: "com.google.Chrome", path: "/Applications/Google Chrome.app" },
  { name: "Firefox", bundleId: "org.mozilla.firefox", path: "/Applications/Firefox.app" },
  { name: "Arc", bundleId: "company.thebrowser.Browser", path: "/Applications/Arc.app" },
  { name: "Finder", bundleId: "com.apple.finder", path: "/System/Library/CoreServices/Finder.app", isSystem: true },
  { name: "Visual Studio Code", bundleId: "com.microsoft.VSCode", path: "/Applications/Visual Studio Code.app" },
  { name: "Terminal", bundleId: "com.apple.Terminal", path: "/System/Applications/Utilities/Terminal.app" },
  { name: "Preview", bundleId: "com.apple.Preview", path: "/System/Applications/Preview.app" },
];

const HOME = "/Users/me";

export const FILES: FileResult[] = [
  { path: `${HOME}/Documents/Quarterly Report.pdf`, name: "Quarterly Report.pdf", kind: "File", size: 2_480_000, modified: now - 1 * day },
  { path: `${HOME}/Documents/Roadmap 2027.key`, name: "Roadmap 2027.key", kind: "File", size: 18_200_000, modified: now - 3 * day },
  { path: `${HOME}/Downloads/surgecast-0.1.0.dmg`, name: "surgecast-0.1.0.dmg", kind: "File", size: 96_400_000, modified: now - 2 * hour },
  { path: `${HOME}/Desktop/Screenshot 2026-10-12 at 09.41.22.png`, name: "Screenshot 2026-10-12 at 09.41.22.png", kind: "File", size: 412_000, modified: now - 1 * day - 5 * hour },
  { path: `${HOME}/Developer/surgecast`, name: "surgecast", kind: "Folder", size: 0, modified: now - 20 * min },
  { path: `${HOME}/Developer/surgecast/README.md`, name: "README.md", kind: "File", size: 6_120, modified: now - 4 * hour },
  { path: `${HOME}/Developer/surgecast/package.json`, name: "package.json", kind: "File", size: 1_204, modified: now - 6 * day },
  { path: `${HOME}/Documents/Invoices`, name: "Invoices", kind: "Folder", size: 0, modified: now - 12 * day },
  { path: `${HOME}/Documents/Invoices/Invoice-1042.pdf`, name: "Invoice-1042.pdf", kind: "File", size: 88_000, modified: now - 12 * day },
  { path: `${HOME}/Pictures/Wallpapers/Sequoia Sunrise.heic`, name: "Sequoia Sunrise.heic", kind: "File", size: 5_400_000, modified: now - 40 * day },
  { path: `${HOME}/Music/Focus Mix.m4a`, name: "Focus Mix.m4a", kind: "File", size: 64_000_000, modified: now - 70 * day },
  { path: `${HOME}/Documents/Notes/meeting-notes.txt`, name: "meeting-notes.txt", kind: "File", size: 3_300, modified: now - 2 * day },
];

/** Most recently used first. */
export const RECENT_FILE_PATHS = [FILES[2].path, FILES[5].path, FILES[4].path, FILES[0].path, FILES[3].path, FILES[11].path];

type HistoryEntry = CalculatorResult & { id: string; createdAt: number };

export const CALC_HISTORY: HistoryEntry[] = [
  { id: "calc1", input: "2+2*10 usd in eur", interpreted: "2 + 2 × 10 USD in EUR", result: "€19.66", copyValue: "19.66", inputLabel: "Expression", resultLabel: "Euro", kind: "currency", createdAt: now - 12 * min },
  { id: "calc2", input: "1920/1080", interpreted: "1920 / 1080", result: "1.7778", copyValue: "1.7778", inputLabel: "Expression", resultLabel: "Number", kind: "math", createdAt: now - 3 * hour },
  { id: "calc3", input: "5 km in mi", interpreted: "5 km in mi", result: "3.10686 miles", copyValue: "3.10686", inputLabel: "Kilometers", resultLabel: "Miles", kind: "unit", createdAt: now - 1 * day - 2 * hour },
  { id: "calc4", input: "15% of 240", interpreted: "15% of 240", result: "36", copyValue: "36", inputLabel: "Percentage", resultLabel: "Number", kind: "percentage", createdAt: now - 1 * day - 6 * hour },
  { id: "calc5", input: "time in tokyo", interpreted: "Time in Tokyo", result: "23:41", copyValue: "23:41", inputLabel: "Time", resultLabel: "Japan Standard Time", kind: "timezone", createdAt: now - 4 * day },
  { id: "calc6", input: "#7C5CFF", interpreted: "#7C5CFF", result: "rgb(124, 92, 255)", copyValue: "rgb(124, 92, 255)", inputLabel: "HEX", resultLabel: "RGB", kind: "color", color: "#7C5CFF", createdAt: now - 9 * day },
];

type EmojiRow = [emoji: string, name: string, keywords: string, skins?: boolean];

const SMILEYS: EmojiRow[] = [
  ["😀", "Grinning Face", "smile happy"],
  ["😃", "Grinning Face With Big Eyes", "smile happy joy"],
  ["😄", "Grinning Face With Smiling Eyes", "smile happy laugh"],
  ["😁", "Beaming Face With Smiling Eyes", "grin smile"],
  ["😆", "Grinning Squinting Face", "laugh satisfied"],
  ["😅", "Grinning Face With Sweat", "relief nervous"],
  ["🤣", "Rolling On The Floor Laughing", "lol rofl"],
  ["😂", "Face With Tears Of Joy", "lol cry laugh"],
  ["🙂", "Slightly Smiling Face", "smile"],
  ["🙃", "Upside-Down Face", "silly sarcasm"],
  ["🫠", "Melting Face", "dissolve embarrassed"],
  ["😉", "Winking Face", "wink flirt"],
  ["😊", "Smiling Face With Smiling Eyes", "blush happy"],
  ["😇", "Smiling Face With Halo", "angel innocent"],
  ["🥰", "Smiling Face With Hearts", "love adore"],
  ["😍", "Smiling Face With Heart-Eyes", "love crush"],
  ["🤩", "Star-Struck", "wow excited"],
  ["😘", "Face Blowing A Kiss", "kiss love"],
  ["😋", "Face Savoring Food", "yum delicious"],
  ["🤓", "Nerd Face", "geek glasses"],
  ["😬", "Grimacing Face", "awkward"],
  ["🙄", "Face With Rolling Eyes", "eyeroll"],
  ["😏", "Smirking Face", "smug"],
  ["😴", "Sleeping Face", "zzz tired"],
  ["😭", "Loudly Crying Face", "sob sad"],
  ["🥹", "Face Holding Back Tears", "grateful moved"],
  ["😈", "Smiling Face With Horns", "devil mischief"],
  ["🤯", "Exploding Head", "mind blown"],
];

const PEOPLE: EmojiRow[] = [
  ["👋", "Waving Hand", "hello bye wave", true],
  ["👍", "Thumbs Up", "like yes approve +1", true],
  ["👎", "Thumbs Down", "dislike no -1", true],
  ["👏", "Clapping Hands", "applause bravo", true],
  ["🙌", "Raising Hands", "hooray celebrate", true],
  ["🙏", "Folded Hands", "please thanks pray", true],
  ["💪", "Flexed Biceps", "strong muscle", true],
  ["✌️", "Victory Hand", "peace", true],
  ["👀", "Eyes", "look watch"],
  ["🧠", "Brain", "smart think"],
];

const ANIMALS: EmojiRow[] = [
  ["🐶", "Dog Face", "puppy pet"],
  ["🐱", "Cat Face", "kitten pet"],
  ["🦊", "Fox", "animal"],
  ["🐼", "Panda", "animal bear"],
  ["🐸", "Frog", "animal"],
  ["🦄", "Unicorn", "magic fantasy"],
  ["🌵", "Cactus", "plant desert"],
  ["🌸", "Cherry Blossom", "flower spring"],
];

const FOOD: EmojiRow[] = [
  ["🍎", "Red Apple", "fruit"],
  ["🍕", "Pizza", "food slice"],
  ["🍣", "Sushi", "food japanese"],
  ["☕", "Hot Beverage", "coffee tea"],
  ["🍺", "Beer Mug", "drink"],
  ["🥑", "Avocado", "fruit"],
];

const TRAVEL: EmojiRow[] = [
  ["🚀", "Rocket", "launch ship space"],
  ["✈️", "Airplane", "flight travel"],
  ["🚲", "Bicycle", "bike"],
  ["🏠", "House", "home"],
  ["🌍", "Globe Showing Europe-Africa", "world earth"],
  ["⛰️", "Mountain", "nature"],
];

const ACTIVITIES: EmojiRow[] = [
  ["🎉", "Party Popper", "celebrate tada"],
  ["🎁", "Wrapped Gift", "present birthday"],
  ["⚽", "Soccer Ball", "football sport"],
  ["🎮", "Video Game", "controller play"],
  ["🏆", "Trophy", "win award"],
];

const OBJECTS: EmojiRow[] = [
  ["💻", "Laptop", "computer mac"],
  ["📱", "Mobile Phone", "iphone"],
  ["💡", "Light Bulb", "idea"],
  ["📎", "Paperclip", "attach"],
  ["🔒", "Locked", "security private"],
  ["📅", "Calendar", "date schedule"],
];

const SYMBOLS: EmojiRow[] = [
  ["❤️", "Red Heart", "love"],
  ["✅", "Check Mark Button", "done yes"],
  ["❌", "Cross Mark", "no wrong"],
  ["⚠️", "Warning", "caution"],
  ["✨", "Sparkles", "shiny new"],
  ["🔥", "Fire", "hot lit"],
  ["→", "Rightwards Arrow", "arrow right symbol"],
  ["⌘", "Place Of Interest Sign", "command key symbol"],
];

const FLAGS: EmojiRow[] = [
  ["🏁", "Chequered Flag", "race finish"],
  ["🇺🇸", "Flag: United States", "us america"],
  ["🇩🇪", "Flag: Germany", "de"],
  ["🇯🇵", "Flag: Japan", "jp"],
];

const SKIN_TONES = ["🏻", "🏼", "🏽", "🏾", "🏿"];

function rows(category: string, list: EmojiRow[]): EmojiItem[] {
  return list.map(([emoji, name, keywords, skins]) => ({
    emoji,
    name,
    keywords: keywords.split(" "),
    category,
    skins: skins ? SKIN_TONES.map((tone) => emoji.replace("️", "") + tone) : undefined,
  }));
}

/** Category order matches the backend's emoji groups. */
export const EMOJI: EmojiItem[] = [
  ...rows("Smileys & Emotion", SMILEYS),
  ...rows("People & Body", PEOPLE),
  ...rows("Animals & Nature", ANIMALS),
  ...rows("Food & Drink", FOOD),
  ...rows("Travel & Places", TRAVEL),
  ...rows("Activities", ACTIVITIES),
  ...rows("Objects", OBJECTS),
  ...rows("Symbols", SYMBOLS),
  ...rows("Flags", FLAGS),
];

export const FREQUENT_EMOJI = ["🤣", "😘", "🥹", "🥰", "😈", "😴", "🤩", "😋", "😅", "😭", "🫠", "🤓", "😬", "🙄", "👀", "😏"];
