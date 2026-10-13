/** Browser-only stand-in for the native window buttons, so dev runs and screenshots show the real layout. */
export function DevTrafficLights() {
  return (
    <span className="sc-ai-traffic-lights" aria-hidden="true">
      <span data-color="close" />
      <span data-color="minimize" />
      <span data-color="zoom" />
    </span>
  );
}
