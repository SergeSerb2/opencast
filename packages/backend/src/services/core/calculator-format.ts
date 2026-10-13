const CURRENCY_NAMES = new Intl.DisplayNames("en", { type: "currency" });
const CURRENCIES = new Set<string>(Intl.supportedValuesOf("currency"));

export function isCurrency(
  code: string,
  rates?: Record<string, number>,
): boolean {
  return CURRENCIES.has(code.toUpperCase()) || !!rates?.[code.toUpperCase()];
}

export function currencyName(code: string): string {
  return CURRENCY_NAMES.of(code.toUpperCase()) ?? code.toUpperCase();
}

export function currencyText(
  value: number,
  code: string,
): { result: string; copyValue: string } {
  if (Math.abs(value) < 0.005) value = 0;
  return {
    result: new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code.toUpperCase(),
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value),
    copyValue: new Intl.NumberFormat("en-US", {
      useGrouping: false,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value),
  };
}

// Aliases are presentation names; evaluation and dimensional checks belong to mathjs.
const UNIT_NAMES: Record<string, [string, string]> = {};
function names(aliases: string, singular: string, plural = `${singular}s`) {
  for (const alias of aliases.split(" "))
    UNIT_NAMES[alias] = [singular, plural];
}
names("m meter meters metre metres", "Meter");
names("cm centimeter centimeters", "Centimeter");
names("mm millimeter millimeters", "Millimeter");
names("km kilometer kilometers", "Kilometer");
names("um micrometer micrometers", "Micrometer");
names("nm nanometer nanometers", "Nanometer");
names("ft foot feet", "Foot", "Feet");
names("in inch inches", "Inch", "Inches");
names("mi mile miles", "Mile");
names("yd yard yards", "Yard");
names("kg kilogram kilograms", "Kilogram");
names("g gram grams", "Gram");
names("mg milligram milligrams", "Milligram");
names("lb lbs pound pounds lbm", "Pound");
names("oz ounce ounces", "Ounce");
names("s sec second seconds", "Second");
names("ms millisecond milliseconds", "Millisecond");
names("min minute minutes", "Minute");
names("h hr hour hours", "Hour");
names("d day days", "Day");
names("week weeks", "Week");
names("month months", "Month");
names("year years", "Year");
names("l L liter liters litre litres", "Liter");
names("ml mL milliliter milliliters", "Milliliter");
names("gal gallon gallons", "Gallon");
names("tsp teaspoon teaspoons", "Teaspoon");
names("tbsp tablespoon tablespoons", "Tablespoon");
names("cup cups", "Cup");
names("degC celsius", "Celsius", "Celsius");
names("degF fahrenheit", "Fahrenheit", "Fahrenheit");
names("K kelvin", "Kelvin", "Kelvin");
names("rad radian radians", "Radian");
names("deg degree degrees", "Degree");
names("px pixel pixels", "Pixel");
names("rem", "Root em", "Root ems");
names("bit bits", "Bit");
names("B byte bytes", "Byte");
names("kB KB kilobyte kilobytes", "Kilobyte");
names("MB megabyte megabytes", "Megabyte");
names("GB gigabyte gigabytes", "Gigabyte");
names("TB terabyte terabytes", "Terabyte");

export function unitLabel(unit: string, value?: number): string {
  const label = UNIT_NAMES[unit];
  if (label) return label[value !== undefined && Math.abs(value) === 1 ? 0 : 1];
  const squared = /^(\w+)\^([23])$/.exec(unit);
  if (squared)
    return `${squared[2] === "2" ? "Square" : "Cubic"} ${unitLabel(squared[1], value)}`;
  const per = /^(.+?)\s*\/\s*(.+)$/.exec(unit);
  if (per)
    return `${unitLabel(per[1].trim(), value)} per ${unitLabel(per[2].trim(), 1)}`;
  return unit.replace(/^\w/, (c) => c.toUpperCase());
}

export function unitNumber(value: number): string {
  return Number(value.toPrecision(6)).toString();
}

export function zoneLabel(zone: string, now: Date): string {
  return new Intl.DateTimeFormat("en", { timeZone: zone, timeZoneName: "long" })
    .formatToParts(now)
    .find((p) => p.type === "timeZoneName")!.value;
}
