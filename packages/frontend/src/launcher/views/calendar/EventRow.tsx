import type { CSSProperties } from "react";
import type { CalendarEvent } from "@opencast/protocol";
import { Tag, Tooltip } from "../../../components";
import { Icon } from "../../../icons/Icon";
import { conferenceProvider, hasEnded, relativeTag, timeLabel } from "./schedule";

const uses12HourClock = new Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions().hourCycle?.startsWith("h1") ?? false;

/**
 * Schedule row (Raycast's My Schedule layout): calendar ring, time column,
 * title and accessories. `compact` (detail pane open) keeps the start time
 * and the Now/soon tag only. Past events are dimmed.
 */
export function EventRow({ event, day, color, now, compact }: { event: CalendarEvent; day: Date; color: string; now: Date; compact: boolean }) {
  const time = timeLabel(event, day);
  const tag = relativeTag(event, now);
  const provider = conferenceProvider(event.conferenceUrl);
  const attendees = event.attendees?.length ?? 0;
  return (
    <div className="sc-cal-row" data-compact={compact || undefined} data-past={hasEnded(event, now) || undefined} data-clock={uses12HourClock ? "12" : "24"}>
      <span className="sc-cal-row__ring" style={{ "--calendar-color": color } as CSSProperties} aria-hidden="true" />
      <span className="sc-cal-row__time">
        {time.start}
        {!compact && time.end && <span className="sc-cal-row__end"> – {time.end}</span>}
      </span>
      <span className="sc-cal-row__title sc-truncate">{event.title || "Untitled Event"}</span>
      <span className="sc-cal-row__accessories">
        {tag && (
          <Tag color={tag.tone === "now" ? "raycast-green" : "raycast-orange"}>
            {tag.text}
          </Tag>
        )}
        {!compact && attendees > 0 && (
          <Tooltip content={`${attendees} attendee${attendees === 1 ? "" : "s"}`}>
            <span className="sc-cal-row__meta">
              <Icon name="person-16" size={16} />
              {attendees}
            </span>
          </Tooltip>
        )}
        {!compact && event.conferenceUrl && (
          <Tooltip content={provider ? `${provider} meeting` : "Online meeting"}>
            <span className="sc-cal-row__meta">
              <Icon name="video-16" size={16} />
            </span>
          </Tooltip>
        )}
      </span>
    </div>
  );
}
