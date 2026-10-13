import { memo } from "react";

const RADII = [0.25, 0.5, 0.75, 1, 1.4, 1.8, 2.3, 2.9, 3.6];
const BAND = 100 / 9;

/**
 * Nine stacked backdrop blurs, each masked to a band, so content scrolling under
 * a header blurs progressively towards the edge (§3.2, §6.9).
 */
export const ProgressiveBlur = memo(function ProgressiveBlur({ height, edge = "top" }: { height: number; edge?: "top" | "bottom" }) {
  const direction = edge === "top" ? "to top" : "to bottom";
  return (
    <div className="sc-progressive-blur" data-edge={edge} style={{ height }} aria-hidden="true">
      {RADII.map((radius, i) => {
        const start = i * BAND;
        const mask = `linear-gradient(${direction}, transparent ${start}%, #000 ${start + BAND}%, #000 ${start + 2 * BAND}%, transparent ${start + 3 * BAND}%)`;
        return <div key={radius} style={{ WebkitBackdropFilter: `blur(${radius}px)`, backdropFilter: `blur(${radius}px)`, WebkitMaskImage: mask, maskImage: mask }} />;
      })}
    </div>
  );
});
