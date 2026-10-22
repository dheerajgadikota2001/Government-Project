// Performance Grading Index for Districts (PGI-D) 2025-26, Union Ministry of Education.
// Annexure-1, "District wise score for all the 6 categories of PGI-D for 2025-26", page 16.
// Released with PIB's press release of 7 July 2026, 6:22 PM.
//
// Transcribed as printed, and checked two ways on 18 Oct 2026: two separate readings of the
// PDF agree on every number, and in every row the six category scores add up to the printed
// overall score. Still to do before the live site: check each row by eye against page 16.
//
// The report names districts its own way ("Asr", "Manyam", "Kadapa"). `site` is the district
// as this site names it; `printed` keeps the report's own word, so a reader can find the row.
// Grades are printed once per group in the report; each row here carries its group's grade.

export type PgidRow = {
  site: string
  printed: string
  grade: string
  overall: number
  outcome: number
  ect: number
  ifse: number
  sscp: number
  dl: number
  gp: number
}

export type PgidMeasure = {
  key: 'overall' | 'outcome' | 'ect' | 'ifse' | 'sscp' | 'dl' | 'gp'
  en: string
  te: string
  /** The report's own name for the category. */
  official: string
  max: number
}

export const PGID_MEASURES: PgidMeasure[] = [
  { key: 'overall', en: 'Overall score', te: 'మొత్తం స్కోరు', official: 'Overall', max: 600 },
  { key: 'outcome', en: 'Learning outcomes', te: 'అభ్యసన ఫలితాలు', official: 'Outcome', max: 290 },
  { key: 'ect', en: 'Classroom teaching', te: 'తరగతి గది బోధన', official: 'Effective Classroom Transactions', max: 90 },
  { key: 'ifse', en: 'Facilities and entitlements', te: 'సౌకర్యాలు, విద్యార్థులకు అందేవి', official: 'Infrastructure, Facilities, Student Entitlements', max: 51 },
  { key: 'sscp', en: 'Child safety', te: 'పిల్లల భద్రత', official: 'School Safety and Child Protection', max: 35 },
  { key: 'dl', en: 'Digital learning', te: 'డిజిటల్ అభ్యసన', official: 'Digital Learning', max: 50 },
  { key: 'gp', en: 'School administration', te: 'పాఠశాల నిర్వహణ', official: 'Governance Processes', max: 84 },
]

export const PGID_PAPER = {
  title: 'PGI-D 2025-26, Union Ministry of Education',
  short: 'PGI-D 2025-26',
  page: 'Annexure-1, page 16',
  released: '2026-07-07',
  url: 'https://www.dsel-education.gov.in/static/uploads/2026/07/6f5c484365560bbe3e26738b4d4dde8d.pdf',
  pressUrl: 'https://www.pib.gov.in/PressReleasePage.aspx?PRID=2282148&reg=48&lang=1',
}

const r = (site: string, printed: string, grade: string, overall: number, outcome: number, ect: number, ifse: number, sscp: number, dl: number, gp: number): PgidRow =>
  ({ site, printed, grade, overall, outcome, ect, ifse, sscp, dl, gp })

/** In the report's printed order. */
export const PGID_ROWS: PgidRow[] = [
  r('Visakhapatnam', 'Visakhapatnam', 'Uttam-3', 377, 163, 67, 42, 26, 30, 49),
  r('Krishna', 'Krishna', 'Uttam-3', 374, 154, 68, 44, 26, 24, 58),
  r('Vizianagaram', 'Vizianagaram', 'Uttam-3', 366, 157, 67, 42, 24, 23, 53),
  r('Guntur', 'Guntur', 'Uttam-3', 362, 148, 68, 42, 27, 25, 52),
  r('Anakapalli', 'Anakapalli', 'Uttam-3', 361, 145, 68, 44, 27, 24, 53),
  r('NTR', 'Ntr', 'Prachesta-1', 355, 144, 66, 42, 26, 26, 51),
  r('Bapatla', 'Bapatla', 'Prachesta-1', 355, 152, 67, 42, 27, 21, 46),
  r('Palnadu', 'Palnadu', 'Prachesta-1', 354, 147, 69, 41, 27, 24, 46),
  r('YSR Kadapa', 'Kadapa', 'Prachesta-1', 348, 145, 65, 41, 26, 23, 48),
  r('Nandyal', 'Nandyal', 'Prachesta-1', 343, 153, 63, 39, 22, 22, 44),
  r('Parvathipuram Manyam', 'Manyam', 'Prachesta-1', 342, 151, 65, 40, 25, 18, 43),
  r('East Godavari', 'East Godavari', 'Prachesta-1', 342, 140, 67, 42, 23, 25, 45),
  r('Chittoor', 'Chittoor', 'Prachesta-1', 340, 142, 68, 41, 24, 21, 44),
  r('Kakinada', 'Kakinada', 'Prachesta-1', 339, 136, 66, 40, 25, 25, 47),
  r('Tirupati', 'Tirupati', 'Prachesta-1', 337, 141, 67, 39, 25, 22, 43),
  r('West Godavari', 'West Godavari', 'Prachesta-1', 336, 135, 65, 42, 23, 23, 48),
  r('Sri Sathya Sai', 'Sri Satyasai', 'Prachesta-1', 336, 143, 65, 41, 24, 20, 43),
  r('Annamayya', 'Annamayya', 'Prachesta-1', 336, 143, 66, 41, 23, 21, 42),
  r('Sri Potti Sriramulu Nellore', 'Nellore', 'Prachesta-1', 335, 142, 66, 43, 26, 24, 34),
  r('Prakasam', 'Prakasam', 'Prachesta-1', 335, 133, 66, 42, 25, 22, 47),
  r('Srikakulam', 'Srikakulam', 'Prachesta-1', 331, 139, 66, 42, 23, 19, 42),
  r('Dr. B.R. Ambedkar Konaseema', 'Konaseema', 'Prachesta-1', 331, 140, 65, 41, 24, 21, 40),
  r('Eluru', 'Eluru', 'Prachesta-1', 329, 138, 65, 41, 22, 21, 42),
  r('Kurnool', 'Kurnool', 'Prachesta-1', 324, 124, 64, 37, 22, 25, 52),
  r('Ananthapuramu', 'Anantapur', 'Prachesta-1', 321, 128, 66, 38, 24, 23, 42),
  r('Alluri Sitharama Raju', 'Asr', 'Prachesta-1', 317, 136, 63, 40, 24, 17, 37),
]
