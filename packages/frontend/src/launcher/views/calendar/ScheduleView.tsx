import { useEffect, useMemo, useState } from "react";
import { RpcErrorCode, type CalendarEvent, type CalendarInfo, type ColorLike, type ImageLike } from "@opencast/protocol";
import { errorMessage, RpcError } from "../../../bridge/errors";
import { useBackend, useNativeEvent } from "../../../bridge/hooks";
import { native } from "../../../bridge/native";
import { Action, ActionPanel, List, Metadata, showFailureToast } from "../../../components";
import { sc } from "../../../lib/keyboard";
import { hideLauncher } from "../../launch";
import type { LauncherViewProps } from "../registry";
import { EventRow } from "./EventRow";
import {
  attendeeStatus,
  calendarAppUrl,
  conferenceProvider,
  durationLabel,
  eventDetailsText,
  eventKey,
  filterEvents,
  groupByDay,
  initialEventId,
  scheduleRange,
  STATUS_LABEL,
  whenLabel,
  type AttendeeStatus,
} from "./schedule";
import "./calendar.css";

const ALL_CALENDARS = "all";
const PAGE_DAYS = 7;
const MAX_DAYS = 8 * PAGE_DAYS;
const DETAIL_KEY = "opencast.calendar.showDetail";

type CalendarOption = Pick<CalendarInfo, "id" | "title" | "color" | "source">;

/** Re-render every 30 s so Now/soon tags and dimming stay current. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/** Calendars from the host (titles, sources), else derived from the loaded events. */
function useCalendars(events: CalendarEvent[]): CalendarOption[] {
  const [hostCalendars, setHostCalendars] = useState<CalendarInfo[] | null>(null);
  useEffect(() => {
    native
      .call("calendar.calendars")
      .then(setHostCalendars)
      .catch(() => setHostCalendars([]));
  }, []);
  return useMemo(() => {
    if (hostCalendars?.length) return hostCalendars;
    const derived = new Map<string, CalendarOption>();
    for (const e of events) if (!derived.has(e.calendarId)) derived.set(e.calendarId, { id: e.calendarId, title: e.calendarTitle ?? "Calendar", color: e.color, source: "" });
    return [...derived.values()].sort((a, b) => a.title.localeCompare(b.title));
  }, [hostCalendars, events]);
}

const STATUS_STYLE: Record<AttendeeStatus, { icon: ImageLike; color?: ColorLike }> = {
  accepted: { icon: "check-circle-16", color: "raycast-green" },
  declined: { icon: "x-mark-circle-16", color: "raycast-red" },
  tentative: { icon: "question-mark-circle-16", color: "raycast-orange" },
  pending: { icon: "circle-16" },
  unknown: { icon: "circle-16" },
};

function openUrl(url: string, failure: string) {
  return native
    .call("open.url", { url })
    .then(hideLauncher)
    .catch((error: unknown) => showFailureToast(failure, error));
}

/** "My Schedule": upcoming events grouped by day, with details and meeting links. */
export function ScheduleView({ props, title, icon }: LauncherViewProps<{ query?: string }>) {
  const now = useNow();
  const [days, setDays] = useState(PAGE_DAYS);
  const [calendarId, setCalendarId] = useState(ALL_CALENDARS);
  const [showDetail, setShowDetail] = useState(() => localStorage.getItem(DETAIL_KEY) !== "false");
  const [searchText, setSearchText] = useState(props.query ?? "");
  // The range starts at today's midnight; refetch when the date changes, not every tick.
  const day = now.toDateString();
  const range = useMemo(() => scheduleRange(new Date(), days), [day, days]); // eslint-disable-line react-hooks/exhaustive-deps
  const { data, error, isLoading, refetch } = useBackend("calendar.events", range);
  useNativeEvent("window.didShow", refetch);

  const events = useMemo(() => data ?? [], [data]);
  const calendars = useCalendars(events);
  const calendarById = useMemo(() => new Map(calendars.map((c) => [c.id, c])), [calendars]);
  // A remembered calendar that no longer exists falls back to all calendars.
  const activeCalendar = calendarById.has(calendarId) ? calendarId : ALL_CALENDARS;
  const visible = useMemo(() => filterEvents(events, searchText, activeCalendar === ALL_CALENDARS ? null : activeCalendar), [events, searchText, activeCalendar]);
  const sections = useMemo(() => groupByDay(visible, now), [visible, now]);

  const [initialSelection, setInitialSelection] = useState<string>();
  useEffect(() => {
    if (initialSelection === undefined && data) setInitialSelection(initialEventId(sections, new Date()) ?? "");
  }, [data, sections, initialSelection]);

  const toggleDetail = () =>
    setShowDetail((shown) => {
      localStorage.setItem(DETAIL_KEY, String(!shown));
      return !shown;
    });

  const refresh = <Action title="Refresh" icon="arrow-clockwise-16" shortcut={sc("cmd", "r")} onAction={refetch} />;
  const needsPermission = error instanceof RpcError && error.code === RpcErrorCode.PermissionDenied;
  const filtered = searchText.trim() !== "" || activeCalendar !== ALL_CALENDARS;

  const calendarSources = useMemo(() => {
    const bySource = new Map<string, CalendarOption[]>();
    for (const c of calendars) bySource.set(c.source, [...(bySource.get(c.source) ?? []), c]);
    return [...bySource.entries()];
  }, [calendars]);

  return (
    <List
      navigationTitle={title}
      navigationIcon={icon}
      searchBarPlaceholder="Filter events by title…"
      searchText={searchText}
      onSearchTextChange={setSearchText}
      filtering={false}
      isLoading={isLoading}
      isShowingDetail={showDetail && sections.length > 0}
      selectedItemId={initialSelection || undefined}
      pagination={{ hasMore: days < MAX_DAYS, onLoadMore: () => setDays((d) => Math.min(d + PAGE_DAYS, MAX_DAYS)) }}
      searchBarAccessory={
        calendars.length > 1 ? (
          <List.Dropdown tooltip="Filter by Calendar" id="calendar-filter" storeValue onChange={setCalendarId} placeholder="Search calendars…">
            <List.Dropdown.Item value={ALL_CALENDARS} title="All Calendars" icon="calendar-16" />
            {calendarSources.map(([source, list]) => (
              <List.Dropdown.Section key={source || "calendars"} title={source || "Calendars"}>
                {list.map((c) => (
                  <List.Dropdown.Item key={c.id} value={c.id} title={c.title} icon={{ source: "circle-filled-16", tintColor: c.color }} />
                ))}
              </List.Dropdown.Section>
            ))}
          </List.Dropdown>
        ) : undefined
      }
      actions={<ActionPanel>{refresh}</ActionPanel>}
    >
      {sections.map((section) => (
        <List.Section key={section.id} id={section.id} title={section.title} subtitle={section.subtitle}>
          {section.events.map((event) => {
            const calendar = calendarById.get(event.calendarId);
            const calendarTitle = calendar?.title ?? event.calendarTitle;
            const color = calendar?.color ?? event.color;
            const provider = conferenceProvider(event.conferenceUrl);
            const joinTitle = provider ? `Join ${provider} Meeting` : "Join Meeting";
            const notes = event.notes?.trim();
            return (
              <List.Item
                key={eventKey(event)}
                id={eventKey(event)}
                title={event.title || "Untitled Event"}
                render={() => <EventRow event={event} day={section.day} color={color} now={now} compact={showDetail} />}
                detail={
                  <List.Item.Detail
                    markdown={`# ${event.title || "Untitled Event"}\n\n${whenLabel(event, now)}${notes ? `\n\n${notes}` : ""}`}
                    metadataTitle="Event"
                    metadata={
                      <Metadata>
                        {calendarTitle && <Metadata.Label title="Calendar" text={calendarTitle} icon={{ source: "circle-filled-16", tintColor: color }} />}
                        <Metadata.Label title="Duration" text={durationLabel(event)} />
                        {event.location && !/^https?:\/\//i.test(event.location) && <Metadata.Label title="Location" text={event.location} icon="geopin-16" />}
                        {event.conferenceUrl && <Metadata.Link title={provider ?? "Meeting"} text={event.conferenceUrl.replace(/^https?:\/\//, "")} target={event.conferenceUrl} />}
                        {event.attendees?.length ? (
                          <Metadata.TagList title="Attendees">
                            {event.attendees.map((attendee, index) => {
                              const status = attendeeStatus(attendee.status);
                              return <Metadata.TagList.Item key={`${attendee.email ?? attendee.name}-${index}`} text={`${attendee.name || attendee.email || "Guest"} · ${STATUS_LABEL[status]}`} icon={STATUS_STYLE[status].icon} color={STATUS_STYLE[status].color} />;
                            })}
                          </Metadata.TagList>
                        ) : null}
                        {event.url && event.url !== event.conferenceUrl && <Metadata.Link title="Link" text={event.url.replace(/^https?:\/\//, "")} target={event.url} />}
                      </Metadata>
                    }
                  />
                }
                actions={
                  <ActionPanel title={event.title || "Untitled Event"}>
                    {event.conferenceUrl && <Action title={joinTitle} icon="video-16" onAction={() => openUrl(event.conferenceUrl!, "Could not open the meeting link")} />}
                    <Action title="Open in Calendar" icon="calendar-16" shortcut={event.conferenceUrl ? sc("cmd", "return") : undefined} onAction={() => openUrl(calendarAppUrl(event), "Could not open the event in Calendar")} />
                    <ActionPanel.Section>
                      <Action.CopyToClipboard title="Copy Event Details" content={eventDetailsText(event, now, calendarTitle)} shortcut={sc("cmd", "shift", "c")} />
                      <Action.CopyToClipboard title="Copy Event Title" content={event.title} shortcut={sc("cmd", "opt", "c")} />
                      {event.conferenceUrl && <Action.CopyToClipboard title="Copy Meeting Link" content={event.conferenceUrl} shortcut={sc("cmd", "ctrl", "c")} />}
                    </ActionPanel.Section>
                    <ActionPanel.Section>
                      <Action title={showDetail ? "Hide Details" : "Show Details"} icon="app-window-sidebar-right-16" shortcut={sc("cmd", "i")} onAction={toggleDetail} />
                      {refresh}
                    </ActionPanel.Section>
                  </ActionPanel>
                }
              />
            );
          })}
        </List.Section>
      ))}
      {needsPermission ? (
        <List.EmptyView
          icon="lock-16"
          title="Calendar Access Needed"
          description="Allow OpenCast to read your calendars to see your schedule here."
          actions={
            <ActionPanel>
              <Action
                title="Grant Calendar Access"
                icon="calendar-16"
                onAction={async () => {
                  const status = await native.call("permissions.request", { kind: "calendar" });
                  if (status === "granted") refetch();
                  else await native.call("permissions.openSettings", { kind: "calendar" });
                }}
              />
              {refresh}
            </ActionPanel>
          }
        />
      ) : error ? (
        <List.EmptyView icon="warning-16" title="Could Not Load Your Schedule" description={errorMessage(error)} actions={<ActionPanel>{refresh}</ActionPanel>} />
      ) : filtered ? (
        <List.EmptyView title="No Matching Events" description="Try another search or calendar." actions={<ActionPanel>{refresh}</ActionPanel>} />
      ) : (
        <List.EmptyView icon="calendar-16" title="No Events" description={`Nothing on your calendar for the next ${days} days.`} actions={<ActionPanel>{refresh}</ActionPanel>} />
      )}
    </List>
  );
}
