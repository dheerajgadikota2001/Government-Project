/**
 * All 26 districts of Andhra Pradesh (April 2022 reorganisation).
 *
 * Single source of truth for every district dropdown on the site. In
 * production this should be replaced by a fetch of GET /projects/districts
 * so the list can never drift from what the ingested data actually uses —
 * the shape returned by that endpoint is identical to this array.
 */
export const AP_DISTRICTS = [
  { code: 'alluri-sitharama-raju', name: 'Alluri Sitharama Raju', hq: 'Paderu' },
  { code: 'anakapalli', name: 'Anakapalli', hq: 'Anakapalli' },
  { code: 'ananthapuramu', name: 'Ananthapuramu', hq: 'Ananthapuramu' },
  { code: 'annamayya', name: 'Annamayya', hq: 'Rayachoti' },
  { code: 'bapatla', name: 'Bapatla', hq: 'Bapatla' },
  { code: 'chittoor', name: 'Chittoor', hq: 'Chittoor' },
  { code: 'dr-br-ambedkar-konaseema', name: 'Dr. B.R. Ambedkar Konaseema', hq: 'Amalapuram' },
  { code: 'east-godavari', name: 'East Godavari', hq: 'Rajamahendravaram' },
  { code: 'eluru', name: 'Eluru', hq: 'Eluru' },
  { code: 'guntur', name: 'Guntur', hq: 'Guntur' },
  { code: 'kakinada', name: 'Kakinada', hq: 'Kakinada' },
  { code: 'krishna', name: 'Krishna', hq: 'Machilipatnam' },
  { code: 'kurnool', name: 'Kurnool', hq: 'Kurnool' },
  { code: 'nandyal', name: 'Nandyal', hq: 'Nandyal' },
  { code: 'ntr', name: 'NTR', hq: 'Vijayawada' },
  { code: 'palnadu', name: 'Palnadu', hq: 'Narasaraopet' },
  { code: 'parvathipuram-manyam', name: 'Parvathipuram Manyam', hq: 'Parvathipuram' },
  { code: 'prakasam', name: 'Prakasam', hq: 'Ongole' },
  { code: 'sri-potti-sriramulu-nellore', name: 'Sri Potti Sriramulu Nellore', hq: 'Nellore' },
  { code: 'sri-sathya-sai', name: 'Sri Sathya Sai', hq: 'Puttaparthi' },
  { code: 'srikakulam', name: 'Srikakulam', hq: 'Srikakulam' },
  { code: 'tirupati', name: 'Tirupati', hq: 'Tirupati' },
  { code: 'visakhapatnam', name: 'Visakhapatnam', hq: 'Visakhapatnam' },
  { code: 'vizianagaram', name: 'Vizianagaram', hq: 'Vizianagaram' },
  { code: 'west-godavari', name: 'West Godavari', hq: 'Bhimavaram' },
  { code: 'ysr-kadapa', name: 'YSR Kadapa', hq: 'Kadapa' },
]

export const DISTRICT_NAMES = AP_DISTRICTS.map(d => d.name)

/** Departments that appear across AP government project data. */
export const DEPARTMENTS = [
  'Agriculture & Cooperation',
  'Energy',
  'Finance',
  'Health, Medical & Family Welfare',
  'Higher Education',
  'Housing',
  'Industries & Commerce',
  'IT, Electronics & Communications',
  'Municipal Administration & Urban Development',
  'Panchayat Raj & Rural Development',
  'Revenue',
  'Roads & Buildings',
  'School Education',
  'Social Welfare',
  'Transport',
  'Water Resources',
  'Youth Advancement, Tourism & Culture',
]

export const PROJECT_TYPES = [
  'Infrastructure', 'Roads', 'Irrigation', 'Power', 'Industrial',
  'Urban Development', 'Education', 'Health', 'Agriculture', 'Ports',
  'Airports', 'Railways', 'Housing', 'Tourism', 'IT/Tech',
]

export const PROJECT_STATUSES = [
  'Announced', 'Approved', 'Tendered', 'Under Construction',
  'Completed', 'Delayed', 'Suspended', 'Cancelled',
]
