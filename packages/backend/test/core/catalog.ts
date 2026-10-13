import type { CommandInfo } from "@surgecast/protocol";
import { builtinCatalog } from "../../src/services/core/builtins";

// A mixed macOS installation: system utilities, developer tools, and common desktop apps.
export const APP_NAMES = [
  "1Password", "Activity Monitor", "Adobe Acrobat", "Adobe Creative Cloud", "Adobe Illustrator",
  "Adobe Lightroom", "Adobe Photoshop", "Affinity Designer", "Affinity Photo", "Affinity Publisher",
  "AirPort Utility", "Alfred", "Amphetamine", "Android Studio", "App Store", "Arc", "Audio MIDI Setup",
  "Automator", "Balena Etcher", "Bartender", "BBEdit", "BetterDisplay", "BetterTouchTool", "Bitwarden",
  "Blender", "Books", "Brave Browser", "Calculator", "Calendar", "CapCut", "ChatGPT", "Chess",
  "Cisco AnyConnect", "Claude", "CleanMyMac X", "Clock", "ColorSync Utility", "Compressor",
  "Console", "Contacts", "CotEditor", "Cursor", "Cyberduck", "DaVinci Resolve", "DataGrip",
  "DB Browser for SQLite", "Dictionary", "Digital Color Meter", "Discord", "Disk Utility", "Docker",
  "Dropbox", "Elgato Stream Deck", "FaceTime", "Fantastical", "Figma", "Final Cut Pro", "Finder",
  "Firefox", "Flow", "Font Book", "Freeform", "GarageBand", "GitHub Desktop", "Google Chrome",
  "Google Drive", "HandBrake", "Home", "iA Writer", "Image Capture", "iMovie", "iMazing",
  "IntelliJ IDEA", "iPhone Mirroring", "iTerm", "Karabiner-Elements", "Keychain Access", "Keynote",
  "Krita", "Launchpad", "Linear", "LM Studio", "LocalSend", "Logic Pro", "Mac Mouse Fix", "Mail",
  "Maps", "Messages", "Microsoft Edge", "Microsoft Excel", "Microsoft OneNote", "Microsoft Outlook",
  "Microsoft PowerPoint", "Microsoft Teams", "Microsoft Word", "Migration Assistant", "Mission Control",
  "Mullvad VPN", "Music", "NordPass", "NordVPN", "Notes", "Notion", "Numbers", "OBS", "Obsidian",
  "Ollama", "OmniFocus", "OmniGraffle", "OneDrive", "Orion", "Pages", "Parallels Desktop", "Passwords",
  "PDF Expert", "Phone", "Photo Booth", "Photos", "Pixelmator Pro", "Podcasts", "Postman", "Preview",
  "Proton Mail", "Proton VPN", "PyCharm", "QuickTime Player", "Raycast", "Rectangle", "Reminders",
  "Remote Desktop", "Safari", "Screen Sharing", "Script Editor", "SF Symbols", "Shortcuts", "Signal",
  "Skim", "Skype", "Slack", "Soulver", "Spotify", "Steam", "Stremio", "Sublime Text", "Surgecast",
  "System Settings", "TablePlus", "Tailscale", "Telegram", "Terminal", "TextEdit", "Things", "Time Machine",
  "Todoist", "Transmit", "TV", "UTM", "VeraCrypt", "Visual Studio Code", "VLC", "Voice Memos",
  "Warp", "Weather", "WebStorm", "WhatsApp", "Windows App", "Wireshark", "Wispr Flow", "Xcode", "Zoom",
];
export const realisticCatalog: CommandInfo[] = [
  ...builtinCatalog().map((builtin) => builtin.command),
  ...APP_NAMES.map((title): CommandInfo => ({
    id: `app:test.${title}`, title, kind: "app", enabled: true, mode: "no-view",
    subtitle: `/Applications/${title}.app`,
    keywords: [`com.example.${title.replace(/\s+/g, "")}`, `/Applications/${title}.app`,
      ...(title === "Visual Studio Code" ? ["VS Code", "vscode"] : [])],
    typeLabel: "Application", icon: "app-window-16",
  })),
];
