import { RpcErrorCode, type CalendarEvent, type CommandInfo, type MenuItemInfo, type ProcessInfo, type RunningAppInfo, type WindowLayout, type WindowLayoutRect } from "@opencast/protocol";
import { RpcError } from "../../errors";
import { tile } from "../fixtures/commands";
import type { MockArea, MockContext } from "./types";

const invalid = (message: string): never => {
  throw new RpcError({ code: RpcErrorCode.InvalidParams, message });
};
const notFound = (message: string): never => {
  throw new RpcError({ code: RpcErrorCode.NotFound, message });
};

// ---------------------------------------------------------------------------
// Window layouts
// ---------------------------------------------------------------------------

const DAY = 86_400_000;
const HOUR = 3_600_000;
const MINUTE = 60_000;

function layout(id: string, name: string, rect: WindowLayoutRect, daysAgo: number, icon?: WindowLayout["icon"]): WindowLayout {
  const at = Date.now() - daysAgo * DAY;
  return { id, name, rect, icon, createdAt: at - 3 * DAY, updatedAt: at };
}

function seedLayouts(): WindowLayout[] {
  return [
    layout("wl-focus", "Centered Focus", { x: 0.15, y: 0.08, width: 0.7, height: 0.84 }, 1),
    layout("wl-left-two-thirds", "Left Two Thirds", { x: 0, y: 0, width: 0.6667, height: 1 }, 6),
    layout("wl-code", "Editor Right", { x: 0.4, y: 0, width: 0.6, height: 1 }, 12, { tile: { glyph: "code-16", background: ["#3B82F6", "#1D4ED8"] } }),
    layout("wl-notes", "Floating Notes", { x: 0.72, y: 0.04, width: 0.25, height: 0.42 }, 20),
    layout("wl-bottom-strip", "Terminal Strip", { x: 0, y: 0.65, width: 1, height: 0.35 }, 34),
  ];
}

function validRect(rect: WindowLayoutRect | undefined): boolean {
  if (!rect) return false;
  const { x, y, width, height } = rect;
  return [x, y, width, height].every(Number.isFinite) && x >= 0 && y >= 0 && width > 0 && height > 0 && x + width <= 1 && y + height <= 1;
}

// ---------------------------------------------------------------------------
// Menu bar items (Safari, as the Accessibility API reports them: parents of
// submenus are listed too)
// ---------------------------------------------------------------------------

type MenuSpec = [title: string, shortcut?: string, options?: { disabled?: boolean; checked?: boolean; children?: MenuSpec[] }];

const SAFARI_MENUS: [string, MenuSpec[]][] = [
  [
    "Safari",
    [
      ["About Safari"],
      ["Settings…", "⌘,"],
      ["Privacy Report"],
      ["Clear History…"],
      ["Services", undefined, { children: [["Add to Music as a Spoken Track"], ["Make New Sticky Note", "⇧⌘Y"]] }],
      ["Hide Safari", "⌘H"],
      ["Hide Others", "⌥⌘H"],
      ["Show All", undefined, { disabled: true }],
      ["Quit Safari", "⌘Q"],
    ],
  ],
  [
    "File",
    [
      ["New Window", "⌘N"],
      ["New Private Window", "⇧⌘N"],
      ["New Tab", "⌘T"],
      ["Open File…", "⌘O"],
      ["Open Location…", "⌘L"],
      ["Close Window", "⇧⌘W"],
      ["Close Tab", "⌘W"],
      ["Save As…", "⌘S"],
      ["Share", undefined, { children: [["Mail"], ["Messages"], ["AirDrop"], ["Notes"]] }],
      ["Export as PDF…"],
      ["Import From", undefined, { children: [["Google Chrome…"], ["Bookmarks HTML File…"]] }],
      ["Print…", "⌘P"],
    ],
  ],
  [
    "Edit",
    [
      ["Undo", "⌘Z", { disabled: true }],
      ["Redo", "⇧⌘Z", { disabled: true }],
      ["Cut", "⌘X"],
      ["Copy", "⌘C"],
      ["Paste", "⌘V"],
      ["Paste and Match Style", "⌥⇧⌘V"],
      ["Select All", "⌘A"],
      ["Find", undefined, { children: [["Find…", "⌘F"], ["Find Next", "⌘G"], ["Find Previous", "⇧⌘G"], ["Use Selection for Find", "⌘E"]] }],
      ["Spelling and Grammar", undefined, { children: [["Check Document Now", "⌘;"], ["Check Spelling While Typing", undefined, { checked: true }]] }],
      ["AutoFill", undefined, { children: [["Contact"], ["Passwords…"]] }],
      ["Emoji & Symbols", "⌃⌘Space"],
    ],
  ],
  [
    "View",
    [
      ["Always Show Tab Bar", undefined, { checked: true }],
      ["Show Tab Overview", "⇧⌘\\"],
      ["Show Sidebar", "⇧⌘L"],
      ["Show Reader", "⇧⌘R"],
      ["Reload Page", "⌘R"],
      ["Zoom In", "⌘+"],
      ["Zoom Out", "⌘-"],
      ["Actual Size", "⌘0"],
      ["Show Status Bar", "⌘/"],
      ["Enter Full Screen", "⌃⌘F"],
    ],
  ],
  [
    "History",
    [
      ["Show All History", "⌘Y"],
      ["Back", "⌘["],
      ["Forward", "⌘]"],
      ["Home", "⇧⌘H"],
      ["Reopen Last Closed Tab", "⇧⌘T"],
      ["Reopen All Windows from Last Session"],
      ["Clear History…"],
    ],
  ],
  [
    "Bookmarks",
    [
      ["Show Bookmarks", "⌥⌘B"],
      ["Edit Bookmarks", "⌥⌘B"],
      ["Add Bookmark…", "⌘D"],
      ["Add to Reading List", "⇧⌘D"],
      ["Show Reading List", "⌃⌘2"],
      ["Favorites", undefined, { children: [["OpenCast Docs"], ["GitHub"], ["Hacker News"]] }],
    ],
  ],
  [
    "Window",
    [
      ["Minimize", "⌘M"],
      ["Zoom"],
      ["Move Window to Left Side of Screen"],
      ["Move Window to Right Side of Screen"],
      ["Show Previous Tab", "⌃⇧⇥"],
      ["Show Next Tab", "⌃⇥"],
      ["Move Tab to New Window"],
      ["Merge All Windows"],
      ["Bring All to Front"],
    ],
  ],
  ["Help", [["Safari Help"], ["Send Safari Feedback"]]],
];

function flattenMenus(): MenuItemInfo[] {
  const out: MenuItemInfo[] = [];
  const walk = (specs: MenuSpec[], parent: string[]) => {
    for (const [title, shortcut, options] of specs) {
      const path = [...parent, title];
      out.push({ path, title, shortcut, enabled: !options?.disabled, checked: options?.checked ?? false });
      if (options?.children) walk(options.children, path);
    }
  };
  for (const [menu, specs] of SAFARI_MENUS) walk(specs, [menu]);
  return out;
}

// ---------------------------------------------------------------------------
// Calendar: a week around "now", including a meeting in progress
// ---------------------------------------------------------------------------

const CALENDARS = {
  work: { id: "cal-work", title: "Work", color: "#3B82F6" },
  personal: { id: "cal-personal", title: "Personal", color: "#34C759" },
  family: { id: "cal-family", title: "Family", color: "#FF9500" },
  birthdays: { id: "cal-birthdays", title: "Birthdays", color: "#AF52DE" },
} as const;

type CalendarKey = keyof typeof CALENDARS;

const PEOPLE = {
  me: { name: "Taylor Example", email: "taylor@example.com" },
  priya: { name: "Priya Example", email: "priya@example.com" },
  jonas: { name: "Jonas Example", email: "jonas@example.com" },
  mei: { name: "Mei Example", email: "mei@example.com" },
  alex: { name: "Alex Example", email: "alex@example.com" },
  dana: { name: "Dana Example", email: "dana@example.com" },
};

function atClock(dayOffset: number, hours: number, minutes = 0): Date {
  const date = new Date();
  date.setDate(date.getDate() + dayOffset);
  date.setHours(hours, minutes, 0, 0);
  return date;
}

function startOfDay(dayOffset: number): Date {
  return atClock(dayOffset, 0);
}

function event(id: string, calendar: CalendarKey, title: string, start: Date, end: Date, extra: Partial<CalendarEvent> = {}): CalendarEvent {
  const cal = CALENDARS[calendar];
  return { id, calendarId: cal.id, calendarTitle: cal.title, color: cal.color, title, start: start.toISOString(), end: end.toISOString(), isAllDay: false, ...extra };
}

function allDay(id: string, calendar: CalendarKey, title: string, dayOffset: number, days = 1, extra: Partial<CalendarEvent> = {}): CalendarEvent {
  return event(id, calendar, title, startOfDay(dayOffset), startOfDay(dayOffset + days), { isAllDay: true, ...extra });
}

function seedEvents(): CalendarEvent[] {
  const now = Date.now();
  // The meeting in progress started at the last quarter hour, so it is always "Now".
  const currentStart = new Date(Math.floor(now / (15 * MINUTE)) * 15 * MINUTE - 15 * MINUTE);
  const nextStart = new Date(currentStart.getTime() + 60 * MINUTE);
  return [
    allDay("ev-birthday", "birthdays", "Ada Lovelace’s Birthday", 0),
    event("ev-earlier", "personal", "Morning Run", new Date(currentStart.getTime() - 3 * HOUR), new Date(currentStart.getTime() - 2.25 * HOUR), { location: "Golden Gate Park" }),
    event("ev-now", "work", "Design Review: Launcher v2", currentStart, new Date(currentStart.getTime() + 45 * MINUTE), {
      location: "Zoom",
      conferenceUrl: "https://zoom.us/j/84629301745?pwd=bGF1bmNoZXJ2Mg",
      url: "https://zoom.us/j/84629301745?pwd=bGF1bmNoZXJ2Mg",
      notes: "Agenda\n\n1. Root search ranking changes\n2. New footer toast styles\n3. Window management editor walkthrough\n\nFigma: https://figma.com/file/launcher-v2",
      attendees: [
        { ...PEOPLE.priya, status: "accepted" },
        { ...PEOPLE.me, status: "accepted" },
        { ...PEOPLE.jonas, status: "tentative" },
        { ...PEOPLE.mei, status: "declined" },
        { ...PEOPLE.dana, status: "pending" },
      ],
    }),
    event("ev-next", "work", "1:1 with Priya", nextStart, new Date(nextStart.getTime() + 30 * MINUTE), {
      conferenceUrl: "https://meet.google.com/xpd-qmzr-tke",
      location: "Google Meet",
      notes: "Career growth check-in and Q4 goals.",
      attendees: [
        { ...PEOPLE.priya, status: "accepted" },
        { ...PEOPLE.me, status: "accepted" },
      ],
    }),
    event("ev-later", "personal", "Pick Up Dry Cleaning", new Date(nextStart.getTime() + 3 * HOUR), new Date(nextStart.getTime() + 3.5 * HOUR), { location: "Sunset Cleaners, 1820 Irving St" }),
    event("ev-gym", "personal", "Gym", atClock(1, 8), atClock(1, 9)),
    event("ev-sync", "work", "Product Sync", atClock(1, 10), atClock(1, 10, 30), {
      conferenceUrl: "https://teams.microsoft.com/l/meetup-join/19%3ameeting_product-sync",
      location: "Microsoft Teams",
      attendees: [
        { ...PEOPLE.jonas, status: "accepted" },
        { ...PEOPLE.me, status: "pending" },
        { ...PEOPLE.dana, status: "accepted" },
      ],
    }),
    event("ev-dentist", "personal", "Dentist", atClock(1, 15), atClock(1, 16), { location: "Smile Dental, 410 Market St, San Francisco" }),
    allDay("ev-offsite", "work", "Q4 Planning Offsite", 2, 2, { location: "Pier 70, San Francisco", notes: "Bring laptop and charger. Lunch provided." }),
    event("ev-coffee", "personal", "Coffee with Sam", atClock(3, 9, 30), atClock(3, 10), { location: "Blue Bottle, Hayes Valley" }),
    event("ev-allhands", "work", "Engineering All Hands", atClock(3, 16), atClock(3, 17), {
      conferenceUrl: "https://zoom.us/j/91827364550",
      location: "Zoom",
      notes: "Demos from every team. Post questions in #all-hands.",
    }),
    event("ev-dinner", "family", "Family Dinner", atClock(4, 19), atClock(4, 21), { location: "Nonna’s, North Beach" }),
    event("ev-market", "family", "Farmers Market", atClock(5, 10), atClock(5, 11, 30), { location: "Ferry Building" }),
    event("ev-yoga", "personal", "Yoga", atClock(6, 18), atClock(6, 19), { location: "Mission Yoga" }),
  ];
}

// ---------------------------------------------------------------------------
// Processes: ~25 entries whose CPU and memory drift a little on every call
// ---------------------------------------------------------------------------

interface MockProcess extends ProcessInfo {
  /** Owned by root: killing it fails like it would for a normal user. */
  system?: boolean;
}

const MB = 1024 * 1024;

function running(name: string, bundleId: string, path: string, pid: number, isActive = false): RunningAppInfo {
  return { name, bundleId, path, pid, isActive, isHidden: false };
}

function proc(pid: number, name: string, executable: string, cpu: number, memoryMb: number, extra: Partial<MockProcess> = {}): MockProcess {
  return { pid, name, executable, cpuPercent: cpu, memoryBytes: Math.round(memoryMb * MB), ...extra };
}

function app(pid: number, name: string, bundleId: string, appPath: string, binary: string, cpu: number, memoryMb: number, isActive = false): MockProcess {
  return proc(pid, name, `${appPath}/Contents/MacOS/${binary}`, cpu, memoryMb, { app: running(name, bundleId, appPath, pid, isActive) });
}

function seedProcesses(): MockProcess[] {
  return [
    app(812, "Safari", "com.apple.Safari", "/Applications/Safari.app", "Safari", 6.4, 612, true),
    app(1033, "Figma", "com.figma.Desktop", "/Applications/Figma.app", "Figma", 18.7, 1480),
    app(944, "Slack", "com.tinyspeck.slackmacgap", "/Applications/Slack.app", "Slack", 2.1, 538),
    app(1201, "Visual Studio Code", "com.microsoft.VSCode", "/Applications/Visual Studio Code.app", "Electron", 9.3, 892),
    app(1288, "Spotify", "com.spotify.client", "/Applications/Spotify.app", "Spotify", 3.8, 402),
    app(677, "Mail", "com.apple.mail", "/System/Applications/Mail.app", "Mail", 0.6, 241),
    app(702, "Notes", "com.apple.Notes", "/System/Applications/Notes.app", "Notes", 0.2, 168),
    app(655, "Calendar", "com.apple.iCal", "/System/Applications/Calendar.app", "Calendar", 0.1, 132),
    app(1417, "Terminal", "com.apple.Terminal", "/System/Applications/Utilities/Terminal.app", "Terminal", 0.9, 96),
    app(421, "Finder", "com.apple.finder", "/System/Library/CoreServices/Finder.app", "Finder", 0.4, 214),
    proc(0, "kernel_task", "kernel_task", 4.2, 3200, { system: true }),
    proc(1, "launchd", "/sbin/launchd", 0.3, 38, { system: true }),
    proc(155, "WindowServer", "/System/Library/PrivateFrameworks/SkyLight.framework/Resources/WindowServer", 11.6, 690, { system: true }),
    proc(1040, "Figma Helper (Renderer)", "/Applications/Figma.app/Contents/Frameworks/Figma Helper (Renderer).app/Contents/MacOS/Figma Helper (Renderer)", 24.9, 1890),
    proc(1210, "Code Helper (Plugin)", "/Applications/Visual Studio Code.app/Contents/Frameworks/Code Helper (Plugin).app/Contents/MacOS/Code Helper (Plugin)", 7.2, 640),
    proc(830, "Safari Web Content", "/System/Volumes/Preboot/Cryptexes/App/System/Library/Frameworks/WebKit.framework/Versions/A/XPCServices/com.apple.WebKit.WebContent.xpc/Contents/MacOS/com.apple.WebKit.WebContent", 12.3, 1120),
    proc(951, "Slack Helper (Renderer)", "/Applications/Slack.app/Contents/Frameworks/Slack Helper (Renderer).app/Contents/MacOS/Slack Helper (Renderer)", 1.7, 470),
    proc(2203, "node", "/opt/homebrew/bin/node", 14.8, 356),
    proc(2240, "postgres", "/opt/homebrew/opt/postgresql@16/bin/postgres", 0.8, 74),
    proc(2311, "com.docker.backend", "/Applications/Docker.app/Contents/MacOS/com.docker.backend", 5.5, 1310),
    proc(388, "mds_stores", "/System/Library/Frameworks/CoreServices.framework/Frameworks/Metadata.framework/Support/mds_stores", 3.1, 182, { system: true }),
    proc(512, "photoanalysisd", "/System/Library/PrivateFrameworks/PhotoAnalysis.framework/Versions/A/Support/photoanalysisd", 2.6, 310),
    proc(296, "coreaudiod", "/usr/sbin/coreaudiod", 1.2, 28, { system: true }),
    proc(604, "cloudd", "/System/Library/PrivateFrameworks/CloudKitDaemon.framework/Support/cloudd", 0.5, 64),
    proc(1450, "zsh", "/bin/zsh", 0, 6),
    proc(1502, "ssh-agent", "/usr/bin/ssh-agent", 0, 3),
  ];
}

/** Random walk so CPU and memory look live between refreshes. */
function drift(process: MockProcess): MockProcess {
  const cpu = Math.max(0, process.cpuPercent * (0.75 + Math.random() * 0.5) + (Math.random() - 0.5) * 0.6);
  const memory = Math.max(MB, process.memoryBytes * (0.985 + Math.random() * 0.03));
  return { ...process, cpuPercent: Math.round(cpu * 10) / 10, memoryBytes: Math.round(memory) };
}

const publicInfo = ({ system: _system, ...info }: MockProcess): ProcessInfo => info;

// ---------------------------------------------------------------------------

/** Opens the saved window commands list (`window-management` without an action). */
const SEARCH_WINDOW_COMMANDS: CommandInfo = {
  id: "builtin:windowManagement.searchWindowCommands",
  kind: "builtin",
  title: "Search Window Commands",
  subtitle: "Window Management",
  extensionTitle: "Window Management",
  typeLabel: "Command",
  icon: tile("app-window-list-16", "#52D6D0", "#1A9E9E"),
  mode: "view",
  enabled: true,
  keywords: ["custom", "layout", "window"],
};

/** Mock backend for window layouts, menu items, calendar events, processes. */
export function createSystemMock({ events }: MockContext): MockArea {
  const layouts = seedLayouts();
  const menuItems = flattenMenus();
  const calendarEvents = seedEvents();
  let processes = seedProcesses();

  const changedLayouts = (id: string) => events.emit("entities.changed", { collection: "windowLayouts", ids: [id], source: "local" });

  return {
    commands: [SEARCH_WINDOW_COMMANDS],
    launch: (command, args, fallbackText) =>
      command.id === SEARCH_WINDOW_COMMANDS.id ? { kind: "view", view: { id: "window-management", title: command.title, props: { query: fallbackText, arguments: args } } } : undefined,
    handlers: {
      "windows.layouts.list": () => layouts.map((l) => ({ ...l })),
      "windows.layouts.upsert": (params) => {
        const index = params.id ? layouts.findIndex((l) => l.id === params.id) : -1;
        const old = index >= 0 ? layouts[index] : undefined;
        const now = Date.now();
        const next: WindowLayout = { ...old, ...params, id: params.id || old?.id || `wl-${now.toString(36)}`, createdAt: old?.createdAt ?? now, updatedAt: now };
        if (!next.name?.trim()) invalid("Layout name is required");
        if (!validRect(next.rect)) invalid("Layout must fit within the screen using fractions from 0 to 1");
        if (index >= 0) layouts[index] = next;
        else layouts.push(next);
        changedLayouts(next.id);
        return { ...next };
      },
      "windows.layouts.delete": ({ id }) => {
        const index = layouts.findIndex((l) => l.id === id);
        if (index >= 0) layouts.splice(index, 1);
        changedLayouts(id);
      },
      "windows.layouts.apply": async ({ id }) => {
        if (!layouts.some((l) => l.id === id)) notFound(`Window layout ${id}`);
        await new Promise((resolve) => setTimeout(resolve, 80));
      },

      "menus.list": async () => {
        await new Promise((resolve) => setTimeout(resolve, 120));
        return { app: "Safari", items: menuItems.map((item) => ({ ...item, path: [...item.path] })) };
      },
      "menus.press": ({ path }) => {
        if (path.length === 1 && SAFARI_MENUS.some(([menu]) => menu === path[0])) return;
        const item = menuItems.find((i) => i.path.join("\u0000") === path.join("\u0000"));
        if (!item) notFound(`Menu item not found: ${path[path.length - 1] ?? ""}`);
        else if (!item.enabled) throw new RpcError({ code: RpcErrorCode.InternalError, message: `Menu item disabled: ${item.title}` });
      },

      "calendar.events": ({ from, to }) => {
        const start = Date.parse(from);
        const end = Date.parse(to);
        if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) invalid("Invalid calendar date range");
        return calendarEvents.filter((e) => Date.parse(e.end) > start && Date.parse(e.start) < end).map((e) => ({ ...e }));
      },

      "system.processes": () => {
        processes = processes.map(drift);
        return processes.map(publicInfo);
      },
      "system.killProcess": async ({ pid, force }) => {
        if (!Number.isSafeInteger(pid) || pid <= 1) invalid("Choose a valid process other than OpenCast");
        const target = processes.find((p) => p.pid === pid);
        if (!target) return notFound(`Process ${pid}`);
        if (target.system) invalid("Cannot terminate this process; it may have exited or belong to another user");
        await new Promise((resolve) => setTimeout(resolve, force ? 60 : 180));
        processes = processes.filter((p) => p.pid !== pid);
      },
    },
  };
}
