/**
 * Which document a figure came from, and how to name it.
 *
 * WHY THIS FILE EXISTS
 *
 * Four places on a project page name a source: the summary paragraph ("every
 * figure here is taken from..."), the link under "where do these figures come
 * from", the share card, and the story. Each used to pick "the latest
 * reading's document", and that is wrong whenever the latest reading is not
 * where the figures came from. The Veligonda page told readers that every
 * figure on it came from a newspaper report of an inauguration, when the cost
 * and the progress it printed are from the Socio-Economic Survey; the
 * Polavaram Phase 1 page credited the Union Cabinet's cost to a survey
 * annexure. One rule, here, decides it for all four.
 */

/**
 * Government files that live on a cloud bucket rather than on a government
 * domain. The Finance Department publishes every Socio-Economic Survey from
 * an S3 bucket named after its own domain, so a host check alone would call
 * the state's own survey "not a government document".
 */
const GOVERNMENT_PREFIXES = [
  'https://s3.ap-south-1.amazonaws.com/apfinance.gov.in/',
]

/** A company describing its own project: named and checkable, not government. */
const COMPANY_HOSTS = new Set([
  // GMR serves its investor presentations and exchange filings from its own
  // document host; the backend's source_tier lists the same one.
  'investor.gmraero.com', 'publish-p168597-e1857439.adobeaemcloud.com', 'www.gmrgroup.in', 'gmrgroup.in',
  'www.airindia.com', 'airindia.com', 'www.jsw.in', 'jsw.in',
  'www.adaniports.com', 'adaniports.com', 'www.bseindia.com', 'www.nseindia.com',
])

/**
 * gov, company or other, read from where a document lives.
 *
 * The host decides, not the publisher's name, for the same reason the
 * backend's source_tier does: a host cannot be mislabelled by whoever typed
 * the record. "other" is everything else, press included, and is shown to
 * the reader as "not a government document".
 */
export function sourceTier(url) {
  const s = String(url || '').trim()
  if (!s) return 'other'
  if (GOVERNMENT_PREFIXES.some(p => s.startsWith(p))) return 'gov'
  const m = s.match(/^https?:\/\/([^/?#]+)/i)
  const host = m ? m[1].toLowerCase() : ''
  if (!host) return 'other'
  if (/(^|\.)gov\.in$|(^|\.)nic\.in$|\.gov$/.test(host)) return 'gov'
  if (COMPANY_HOSTS.has(host)) return 'company'
  return 'other'
}

/**
 * A reading's document, as a page names it.
 *
 * The register's labels carry the document's name and then, in brackets,
 * our note on how it is dated: "Socio-Economic Survey 2018-19, ch.7 Tables
 * 7.3-7.5 (no as-on date printed; survey year end used)". The page names the
 * document and keeps the full label for the link's title. It also keeps how
 * precisely the reading is dated, because a survey that printed no date must
 * never be described as saying something "in March 2019".
 *
 * @returns { name, label, url, tier, dated, edition }  dated is 'month' or
 *          'none'; edition is a survey's year span ("2018-19"), the only
 *          honest way to say when an undated survey speaks
 */
export function documentOf(obs) {
  const label = String(obs?.source_label || '').trim()
  const url = obs?.source_url || null
  let name = label
  let dated = 'month'
  let edition = null
  const survey = label.match(/^(Socio-Economic Survey (\d{4}-\d{2}))\b/)
  if (survey) {
    name = survey[1]
    edition = survey[2]
    if (/no as-on date printed/i.test(label)) dated = 'none'
  } else {
    const cut = label.indexOf(' (')
    if (cut > 0) name = label.slice(0, cut)
  }
  return { name: name || label, label, url, tier: sourceTier(url), dated, edition }
}

/**
 * When a reading speaks, in words: "July 2026" for a dated report, the
 * edition ("2018-19") for a survey that printed no date. Our register files
 * an undated survey at the end of its survey year so it can be sorted; that
 * day is ours, and it is never printed as the survey's.
 */
export function whenPrinted(observation, fmtMonth) {
  if (!observation?.observed_date) return null
  const doc = documentOf(observation)
  return doc.dated === 'none' && doc.edition ? doc.edition : fmtMonth(observation.observed_date)
}

/**
 * The date a register row's own source was published, when the row says so.
 *
 * Only the AMRUT importer writes this, into its description: "Milestone in
 * the official MoHUA status PDF (as on 05.03.2026)".
 */
export function asOnDate(project) {
  const text = `${project?.description || ''} ${project?.source_url || ''}`
  const m = text.match(/as[ -]on[ -](\d{2})[.-](\d{2})[.-](\d{4})/i)
  if (!m) return null
  const [, d, mo, y] = m
  const iso = `${y}-${mo}-${d}`
  return /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(iso) ? iso : null
}

/** What the importers call their sources, as a reader would name them. */
const PORTAL_NAMES = {
  MOSPI_IPMD: 'MoSPI flash report',
  AMRUT_MoHUA: 'AMRUT 2.0 status report',
}

/** A register row's source, named for a reader: "AMRUT 2.0 status report, as on 05.03.2026". */
export function portalName(project) {
  const portal = project?.source_portal || ''
  let name = PORTAL_NAMES[portal] || portal
  const on = portal === 'AMRUT_MoHUA' ? asOnDate(project) : null
  if (on) name = `${name}, as on ${on.split('-').reverse().join('.')}`
  return name || null
}

/**
 * The document the page's figures come from, for the summary's source line,
 * the link under it and the share card.
 *
 * The latest reading is named only when it is the row's own document (a
 * MoSPI row points at the flash report its figures are from) or when the row
 * names no document of its own. Otherwise the row's source is named, because
 * that is where its cost and progress were read: a survey row's latest
 * reading can be a press note, and a curated row's cost can come from a
 * Cabinet approval its survey readings never printed.
 *
 * @returns { label, url } or null
 */
export function summarySource({ project, observation }) {
  const label = observation?.source_label ? String(observation.source_label).trim() : ''
  const sameDoc = observation?.source_url && project?.source_url && observation.source_url === project.source_url
  if (label && (sameDoc || !project?.source_url)) {
    return { label, url: observation.source_url || project?.source_url || null }
  }
  const row = portalName(project)
  if (row) return { label: row, url: project.source_url || null }
  return label ? { label, url: observation.source_url || null } : null
}
