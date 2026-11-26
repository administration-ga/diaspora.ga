/**
 * Formats localisés (dates, nombres, temps relatif). Le fuseau est celui du
 * navigateur de la personne : la diaspora vit dans des fuseaux variables (le
 * socle figeait Africa/Libreville, cahier EXT-DG-06).
 */
const RELATIVE_STEPS: readonly [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
]

/** « il y a 3 heures », « dans 2 jours » — en dessous d'une minute : « à l'instant ». */
export function formatRelative(timestamp: number, now: number, locale: string): string {
  const seconds = Math.round((timestamp - now) / 1000)
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" })
  for (const [unit, size] of RELATIVE_STEPS) {
    if (Math.abs(seconds) >= size) return formatter.format(Math.round(seconds / size), unit)
  }
  return formatter.format(0, "second")
}

export function formatDate(timestamp: number, locale: string, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(locale, options ?? { day: "numeric", month: "long", year: "numeric" }).format(
    new Date(timestamp),
  )
}

export function formatNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(value)
}

/** Bloc calendrier d'une carte d'évènement : jour et mois abrégé. */
export function calendarParts(timestamp: number, locale: string): { day: string; month: string } {
  const date = new Date(timestamp)
  return {
    day: new Intl.DateTimeFormat(locale, { day: "numeric" }).format(date),
    month: new Intl.DateTimeFormat(locale, { month: "short" }).format(date).replace(".", ""),
  }
}

/** La plage d'un évènement : jour, date et heures, et le fuseau dit à la fin. */
const EVENT_RANGE_OPTIONS: Intl.DateTimeFormatOptions = {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZoneName: "short",
}

/**
 * La plage d'un évènement annoncé (lot A5), dans la langue du lecteur et le fuseau de SON navigateur
 * (`timeZone` ne sert qu'aux tests) : « jeu. 3 déc. 2026, 18:00 – 20:00 UTC+1 ». Le même jour, la
 * date ne se répète pas ; une fin qui ne suit pas le début se lit comme un instant seul.
 */
export function formatEventRange(startAt: number, endAt: number, locale: string, timeZone?: string): string {
  const formatter = new Intl.DateTimeFormat(locale, { ...EVENT_RANGE_OPTIONS, ...(timeZone === undefined ? {} : { timeZone }) })
  if (!(endAt > startAt)) return formatter.format(startAt)
  // Un navigateur ancien sans `formatRange` lit les deux bornes en entier.
  return typeof formatter.formatRange === "function" ? formatter.formatRange(startAt, endAt) : `${formatter.format(startAt)} – ${formatter.format(endAt)}`
}
