"""Build the prototype's data files from the live API dumps and the Polavaram draft story.

Only fields the house rules allow reach the page: no tenure, party, span or
site-computed totals. Every figure keeps its paper and date beside it.
Run from the site folder: python3 scripts/prep_data.py
"""
import json, os, re, datetime

S = '/tmp/claude-0/-home-claude/1bec7e1b-544e-5672-b46e-4cf91965d07f/scratchpad'
LIVE = f'{S}/live'
OUT = 'src/data'
os.makedirs(OUT, exist_ok=True)

def load(p):
    return json.load(open(p, encoding='utf-8'))

# The day the dumps were fetched, in India time: every "as of" on the page uses it.
_fetched = open(f'{LIVE}/FETCHED').read().strip()
ASOF = (datetime.datetime.fromisoformat(_fetched.replace('Z', '+00:00')) + datetime.timedelta(hours=5, minutes=30)).date().isoformat()

# CAG moved its report files to a new host in October 2026 and kept the names; the old addresses answer
# "not found". Migration 0014 moves the database rows, but a dump taken before it ran still has the old
# ones, so every file written here gets the current address. Same rule as backend/app/scrapers/cag_address.py.
CAG_OLD = 'https://cag.gov.in/webroot/uploads/'
CAG_NEW = 'https://d1jmc0u14z2tmp.cloudfront.net/uploads/'

def dump(name, obj):
    text = json.dumps(obj, ensure_ascii=False, separators=(',', ':'))
    moved = text.count(CAG_OLD)
    if moved:
        text = text.replace(CAG_OLD, CAG_NEW)
        print(f'{name}: {moved} CAG file address(es) moved to the current file store')
    with open(f'{OUT}/{name}.json', 'w', encoding='utf-8') as f:
        f.write(text)
    print(name, os.path.getsize(f'{OUT}/{name}.json') // 1024, 'KB')

# Record 705 (a Ladakh tunnel road) arrived through the MoSPI import and is not
# an Andhra Pradesh work. It stays out until the owner decides.
HOLD_BACK = {705}

register = load(f'{LIVE}/register.json')
updates = load(f'{LIVE}/updates.json')
districts_api = load(f'{LIVE}/districts.json')
old = load(f'{S}/datapages/data.json')
te_places = old['te_places']
shapes = old['shapes']
shape_by_name = {x['name']: x['d'] for x in shapes['districts']}
VIEWBOX = shapes['viewBox']

# ---------------------------------------------------------------- districts
def slug(s):
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')

# The two districts of 1 January 2026. Their lines are not drawn yet: no official boundary
# file we can use has them, so the picker map keeps the 2022 lines and names them beside it.
NEW_2026 = {
    'Markapuram': {'te': 'మార్కాపురం', 'from': 'Prakasam', 'order': 'G.O.Ms.No.524, Revenue (Lands-IV), 30 Dec 2025'},
    'Polavaram': {'te': 'పోలవరం', 'from': 'Alluri Sitharama Raju', 'order': 'G.O.Ms.No.517, Revenue (Lands-IV), 30 Dec 2025'},
}
districts = []
for d in districts_api:
    name = d['name']
    row = {
        'name': name, 'slug': slug(name), 'hq': d.get('hq'),
        'te': te_places.get(name) or NEW_2026.get(name, {}).get('te'),
        'shape': shape_by_name.get(name) or '',
    }
    if name in NEW_2026:
        row.update(formed='2026-01-01', **{k: v for k, v in NEW_2026[name].items() if k != 'te'})
    districts.append(row)
missing_shape = [d['name'] for d in districts if not d['shape'] and d['name'] not in NEW_2026]
assert not missing_shape, missing_shape

# ---------------------------------------------------------------- projects
def ev_clean(e):
    return {
        'date': e.get('date'), 'pre': bool(e.get('pre_window')),
        'title': e.get('title'), 'doc': e.get('document'), 'url': e.get('url'),
        'tier': e.get('tier'), 'kind': e.get('kind'),
    }

events = {}
for fn in os.listdir(f'{LIVE}/reg'):
    r = load(f'{LIVE}/reg/{fn}')
    if r['id'] in HOLD_BACK:
        continue
    events[r['id']] = [ev_clean(e) for e in r.get('events', [])]

projects = []
for p in register['projects']:
    if p['id'] in HOLD_BACK:
        continue
    row = {
        'id': p['id'], 't': p['title'], 'ty': p['project_type'], 'st': p['status'],
        'd': p['district'], 'dept': p['department'],
        'c': p['estimated_cost_crore'] if p['has_published_cost'] else None,
        'cu': p['cost_source_url'], 'ct': p['cost_source_tier'],
        'p': p['completion_percentage'], 'due': p['expected_completion'],
        'sp': p['source_portal'], 'su': p['source_url'],
        'f': p['first_document'], 'l': p['last_document'], 'n': p['event_count'],
    }
    projects.append(row)

# Two government line items can share a title (two AMRUT works with the same name). Their page
# titles must differ, or a search result and a browser tab cannot tell them apart. The tag is the
# cost as printed, or the id when there is none, and only the projects that share a title get one.
_by_title = {}
for row in projects:
    _by_title.setdefault(re.sub(r'[^a-z0-9]+', '', row['t'].lower()), []).append(row)
for group in _by_title.values():
    if len(group) > 1:
        for row in group:
            row['dn'] = f"₹{row['c']:g} Cr" if row['c'] is not None else f"no. {row['id']}"

meta = {
    'asof': ASOF,
    'register_updated': updates['generated_at'][:10],
    'counts': {
        'projects': len(projects),
        'with_district': sum(1 for p in projects if p['d']),
        'without_district': sum(1 for p in projects if not p['d']),
    },
    'held_back': sorted(HOLD_BACK),
}

dump('districts', {'viewBox': VIEWBOX, 'items': districts})
dump('projects', projects)
dump('events', events)

# ---------------------------------------------------------------- Polavaram
story = load(f'{S}/repo/dev/ap-nadu-nedu/src/data/stories/drafts/613-polavaram.json')
reg613 = load(f'{LIVE}/reg613.json')
ext613 = load(f'{LIVE}/ext613.json')

GOV = 'gov'
papers = {s['id']: {k: s[k] for k in ('id', 'short', 'title', 'publisher', 'date', 'url', 'tier')} for s in story['sources']}
papers['ls1723'] = {
    'id': 'ls1723', 'short': 'Lok Sabha answer, 1 Aug 2024',
    'title': 'Lok Sabha Unstarred Question No. 1723, Polavaram Project',
    'publisher': 'Ministry of Jal Shakti, Department of Water Resources, RD & GR',
    'date': '2024-08-01',
    'url': 'https://eparlib.sansad.in/bitstream/123456789/2978868/1/AU1723_DYjh7U.pdf',
    'tier': GOV,
}
for o in ext613['observations']:
    key = 'mospi' + o['observed_date'][2:4] + o['observed_date'][5:7]
    papers.setdefault(key, {
        'id': key, 'short': o['source_label'], 'title': o['source_label'],
        'publisher': 'Ministry of Statistics and Programme Implementation',
        'date': o['observed_date'][:7], 'url': o['source_url'], 'tier': GOV,
    })

readings = [{
    'date': o['observed_date'][:10], 'pct': o['completion_percentage'],
    'spent': o['cumulative_expenditure_crore'], 'cost': o['estimated_cost_crore'],
    'paper': o['source_label'], 'url': o['source_url'],
} for o in ext613['observations']]

# Cost as each paper printed it. Different scopes, so the page never joins them with a line.
cost_history = [
    {'date': '2009-01', 'value': 10151.05, 'label': 'Cleared by the Centre’s technical committee', 'scope': 'Whole project', 'src': 'cag2025'},
    {'date': '2011-01', 'value': 16010.45, 'label': 'Revised estimate accepted, at 2010-11 prices', 'scope': 'Whole project', 'src': 'cag2025'},
    {'date': '2019-02', 'value': 55548.87, 'label': 'New estimate accepted, at 2017-18 prices', 'scope': 'Whole project', 'src': 'cag2025'},
    {'date': '2020-03', 'value': 47725.74, 'label': 'Recommended by the Revised Cost Committee', 'scope': 'Whole project', 'src': 'cag2025'},
    {'date': '2024-08', 'value': 30436.95, 'label': 'Approved by the Union Cabinet for the first phase', 'scope': 'First phase, water up to 41.15 m', 'src': 'pib2025'},
]

# Every completion date a paper gave, with the date of that paper.
deadlines_gov = [
    {'said': '2017-02', 'target': '2018-12', 'prec': 'month', 'paper': 'Investment clearance, as the CAG reports it', 'src': 'cag2025'},
    {'said': '2018-03', 'target': '2019-06', 'prec': 'month', 'paper': 'Socio-Economic Survey 2017-18', 'src': 'ses1718'},
    {'said': '2019-07', 'target': '2021-06', 'prec': 'month', 'paper': 'Socio-Economic Survey 2018-19', 'src': 'ses1819'},
    {'said': '2021-05', 'target': '2021', 'prec': 'year', 'paper': 'Socio-Economic Survey 2020-21', 'src': 'ses2021'},
    {'said': '2022-03', 'target': '2023', 'prec': 'year', 'paper': 'Socio-Economic Survey 2021-22', 'src': 'ses2122'},
    {'said': '2023-03', 'target': '2024-06', 'prec': 'month', 'paper': 'Socio-Economic Survey 2022-23', 'src': 'ses2223'},
    {'said': '2024-08', 'target': '2026-03', 'prec': 'month', 'paper': 'Lok Sabha answer (first phase)', 'src': 'ls1723'},
    {'said': '2024-11', 'target': '2025-03', 'prec': 'month', 'paper': 'Socio-Economic Survey 2023-24', 'src': 'ses2324'},
    {'said': '2024-11', 'target': '2026-03', 'prec': 'month', 'paper': 'State’s reply to the CAG (first phase)', 'src': 'cag2025'},
    {'said': '2025-02', 'target': '2027', 'prec': 'year', 'paper': 'Socio-Economic Survey 2024-25', 'src': 'ses2425'},
    {'said': '2026-08', 'target': '2026-03', 'prec': 'month', 'paper': 'MoSPI report, July 2026', 'src': 'mospi2607'},
    {'said': '2026-09', 'target': '2027-06', 'prec': 'month', 'paper': 'MoSPI report, August 2026', 'src': 'mospi2608'},
]

# Progress as each paper measured it. Measures differ, so each is its own series.
progress = [
    {'measure': 'Works (CAG, from the department’s records)', 'date': '2023-03', 'pct': 82, 'src': 'cag2025'},
    {'measure': 'Land acquisition (CAG)', 'date': '2023-03', 'pct': 67, 'src': 'cag2025'},
    {'measure': 'Resettlement of families (CAG)', 'date': '2023-03', 'pct': 11, 'src': 'cag2025'},
    {'measure': 'Hydro power house (CAG)', 'date': '2023-03', 'pct': 12, 'src': 'cag2025'},
    {'measure': 'Works (Socio-Economic Survey 2024-25)', 'date': '2024-12', 'pct': 77, 'src': 'ses2425'},
    {'measure': 'Land acquisition and resettlement together (Survey 2024-25)', 'date': '2024-12', 'pct': 23, 'src': 'ses2425'},
    {'measure': 'Whole project (Survey 2024-25)', 'date': '2024-12', 'pct': 53.47, 'src': 'ses2425'},
] + [
    {'measure': 'Physical progress (MoSPI)', 'date': r['date'][:7], 'pct': r['pct'], 'src': 'mospi' + r['date'][2:4] + r['date'][5:7]}
    for r in readings if r['pct'] is not None
]

families = {
    'total': 106006, 'resettled_by_2023_03': 11677, 'src': 'cag2025',
    'by_year': [
        {'year': 'Up to March 2014', 'n': 714}, {'year': '2014-15', 'n': 485}, {'year': '2015-16', 'n': 2581},
        {'year': '2016-17', 'n': 0}, {'year': '2017-18', 'n': 0}, {'year': '2018-19', 'n': 0}, {'year': '2019-20', 'n': 0},
        {'year': '2020-21', 'n': 503}, {'year': '2021-22', 'n': 3679}, {'year': '2022-23', 'n': 3715},
    ],
    'phase1': [
        {'date': '2021-11', 'n': 20946, 'label': 'First phase when the work was split into two phases', 'src': 'cag2025'},
        {'date': '2024-11', 'n': 38060, 'label': 'First phase after a new survey, as the state told the CAG', 'src': 'cag2025'},
    ],
}
land = {'needed': 179770, 'requested': 167765, 'acquired': 113119, 'pct_printed': 67.43, 'date': '2023-03', 'src': 'cag2025'}
money = [
    {'label': 'Spent by the state before April 2014', 'value': 4730.71, 'date': '2014-03', 'src': 'cag2025'},
    {'label': 'Spent by the state, April 2014 to March 2023', 'value': 16089.79, 'date': '2023-03', 'src': 'cag2025'},
    {'label': 'Paid back by the Centre, April 2014 to March 2023', 'value': 14290, 'date': '2023-03', 'src': 'cag2025'},
    {'label': 'Paid back by the Centre, as of January 2025', 'value': 15605.96, 'date': '2025-01', 'src': 'pib2025'},
    {'label': 'Released by the Centre in advance on 9 October 2024', 'value': 2348, 'date': '2024-10', 'src': 'pib2025'},
    {'label': 'Spent on the works since 2014, as the state reported, up to 30 November 2024', 'value': 18348.84, 'date': '2024-11', 'src': 'pib2025'},
]
water = {
    'src': 'ls1723', 'unit': 'TMC', 'total_printed': 188.34,
    'rows': [
        {'paper': 'East Godavari', 'district': 'East Godavari', 'tmc': 51.34},
        {'paper': 'West Godavari', 'district': 'West Godavari', 'tmc': 9.01},
        {'paper': 'Eluru', 'district': 'Eluru', 'tmc': 21.77},
        {'paper': 'Krishna', 'district': 'Krishna', 'tmc': 12.76},
        {'paper': 'NTR', 'district': 'NTR', 'tmc': 2.51},
        {'paper': 'Dr. B R Ambedkar Konaseema', 'district': 'Dr. B.R. Ambedkar Konaseema', 'tmc': 0.42},
        {'paper': 'Kakinada', 'district': 'Kakinada', 'tmc': 35.23},
        {'paper': 'Anakapalli', 'district': 'Anakapalli', 'tmc': 34.07},
        {'paper': 'Visakhapatnam', 'district': 'Visakhapatnam', 'tmc': 21.23},
    ],
}

# Newspaper reports, read on 17 October 2026. Summaries are ours, in plain words.
# Their figures are claims: they never feed a government figure.
press = [
    {'id': 'p1', 'paper': 'Swarajya', 'date': '2026-10-15',
     'url': 'https://swarajyamag.com/news-brief/andhra-pradeshs-polavaram-project-crosses-90-per-cent-physical-progress-major-works-targeted-for-june-2027-completion',
     'summary': 'A presentation for a 12 October review at the Union Jal Shakti Ministry put physical progress at 90.1% for September 2026, land acquisition at 95.6% and resettlement at 51.9%, the magazine reports, citing The New Indian Express.',
     'figures': [{'kind': 'progress', 'label': 'Physical progress, September 2026', 'pct': 90.1, 'date': '2026-09'},
                 {'kind': 'deadline', 'label': 'Gap II embankments', 'target': '2027-06', 'prec': 'month'}]},
    {'id': 'p2', 'paper': 'Deccan Chronicle', 'date': '2026-10-14',
     'url': 'https://www.deccanchronicle.com/amp/southern-states/andhra-pradesh/international-expert-team-inspects-polavaram-project-works-1995948',
     'summary': 'Four international experts inspected the earth-cum-rock-fill dam works, the paper reports. They were to keep monitoring the works until 17 October.',
     'figures': []},
    {'id': 'p3', 'paper': 'Deccan Chronicle', 'date': '2026-09-16',
     'url': 'https://www.deccanchronicle.com/amp/southern-states/andhra-pradesh/vijayawada-ppa-ceo-sanjeev-vohra-calls-for-expediting-polavaram-works-1987977',
     'summary': 'A Polavaram Project Authority team inspected the two earth-cum-rock-fill dam gaps and asked for the works to be speeded up, the paper reports.',
     'figures': []},
    {'id': 'p4', 'paper': 'Deccan Chronicle', 'date': '2026-07-14',
     'url': 'https://www.deccanchronicle.com/southern-states/andhra-pradesh/polavaram-works-to-be-completed-by-march-2027-says-cm-1970707',
     'summary': 'The state’s Chief Minister said the works would be completed by March 2027 and put them at 89 per cent complete, the paper reports. He said a ceremony would mark the water reaching Anakapalli through the left main canal on 14 August 2026.',
     'figures': [{'kind': 'progress', 'label': 'Works complete, as the Chief Minister put it in July 2026', 'pct': 89, 'date': '2026-07'},
                 {'kind': 'deadline', 'label': 'Completion', 'target': '2027-03', 'prec': 'month'}]},
    {'id': 'p5', 'paper': 'Deccan Chronicle', 'date': '2026-06-04',
     'url': 'https://deccanchronicle.com/southern-states/andhra-pradesh/polavaram-project-site-abuzz-1961381',
     'summary': 'A superintending engineer said the dam would be finished by March 2027, or by June 2027 at the latest, the paper reports. Gap 1 had reached a height of 33 metres.',
     'figures': [{'kind': 'deadline', 'label': 'Dam, earliest date given', 'target': '2027-03', 'prec': 'month'}]},
    {'id': 'p6', 'paper': 'Deccan Chronicle', 'date': '2026-04-17',
     'url': 'https://www.deccanchronicle.com/amp/southern-states/andhra-pradesh/polavaram-families-seek-jobs-pending-compensation-1951112',
     'summary': 'Families in a resettlement colony in Eluru district say only part of the ₹10 lakh sanctioned for each family has been released, and ask for jobs, the paper reports. About 4,000 of the 6,000 families the colony was built for have moved in.',
     'figures': []},
    {'id': 'p7', 'paper': 'Deccan Chronicle', 'date': '2025-12-08',
     'url': 'https://www.deccanchronicle.com/southern-states/andhra-pradesh/completion-of-polavaram-by-july-2027-1922359',
     'summary': 'Officials aim to finish the major works before the Godavari Pushkaralu in July 2027, against a scheduled end of December 2027, the paper reports. It says 14,385 of 38,060 first-phase families have moved and 91,127 of 1,00,099 acres have been acquired.',
     'figures': [{'kind': 'deadline', 'label': 'Major works, aim', 'target': '2027-07', 'prec': 'month'},
                 {'kind': 'deadline', 'label': 'Scheduled end', 'target': '2027-12', 'prec': 'month'}]},
    {'id': 'p8', 'paper': 'PTI, via The Week', 'date': '2025-10-03',
     'url': 'https://www.theweek.in/wire-updates/national/2025/10/03/mes23-ap-polavaram-project-cm.html',
     'summary': 'The state’s Chief Minister asked officials to finish the project before the 2027 Godavari Pushkaralu, the news agency reports. Officials said the earth-cum-rock-fill main dam would be done by December 2027.',
     'figures': [{'kind': 'deadline', 'label': 'Main dam', 'target': '2027-12', 'prec': 'month'}]},
    {'id': 'p9', 'paper': 'Deccan Herald', 'date': '2024-12-16',
     'url': 'https://www.deccanherald.com/amp/story/india%2Fandhra-pradesh%2Fandhra-cm-chandrababu-naidu-sets-oct-2026-target-to-complete-polavaram-project-3319856',
     'summary': 'The state’s Chief Minister set October 2026 as the target to complete the project, the paper reports. He said 76.79% of the project was complete.',
     'figures': [{'kind': 'deadline', 'label': 'Completion', 'target': '2026-10', 'prec': 'month'},
                 {'kind': 'progress', 'label': 'Complete, as stated in December 2024', 'pct': 76.79, 'date': '2024-12'}]},
    {'id': 'p10', 'paper': 'm9.news (Telugu)', 'date': '2019-11-18',
     'url': 'https://www.m9.news/telugunews/andhra-pradesh-polavaram/',
     'summary': 'The news site reported the project as 67.09% complete and said work had stood still since 21 October 2019.',
     'figures': [{'kind': 'progress', 'label': 'Complete, as reported in November 2019', 'pct': 67.09, 'date': '2019-11'}]},
]

# Telugu for our own words on the Polavaram page (added 18 Oct 2026). Paper and newspaper names stay
# as they are printed. Every English line must have its Telugu line, with the same numbers in it.
POL_TE = {
    # cost, as each paper printed it
    'Cleared by the Centre’s technical committee': 'కేంద్ర సాంకేతిక కమిటీ ఆమోదం',
    'Revised estimate accepted, at 2010-11 prices': 'సవరించిన అంచనాకు ఆమోదం, 2010-11 ధరల్లో',
    'New estimate accepted, at 2017-18 prices': 'కొత్త అంచనాకు ఆమోదం, 2017-18 ధరల్లో',
    'Recommended by the Revised Cost Committee': 'సవరించిన వ్యయ కమిటీ సిఫార్సు',
    'Approved by the Union Cabinet for the first phase': 'మొదటి దశకు కేంద్ర మంత్రివర్గం ఆమోదం',
    'Whole project': 'మొత్తం ప్రాజెక్టు',
    'First phase, water up to 41.15 m': 'మొదటి దశ, 41.15 మీటర్ల వరకు నీరు',
    # progress, measure by measure
    'Works (CAG, from the department’s records)': 'పనులు (CAG, శాఖ రికార్డుల నుంచి)',
    'Land acquisition (CAG)': 'భూసేకరణ (CAG)',
    'Resettlement of families (CAG)': 'కుటుంబాల పునరావాసం (CAG)',
    'Hydro power house (CAG)': 'జల విద్యుత్ కేంద్రం (CAG)',
    'Works (Socio-Economic Survey 2024-25)': 'పనులు (సామాజిక ఆర్థిక సర్వే 2024-25)',
    'Land acquisition and resettlement together (Survey 2024-25)': 'భూసేకరణ, పునరావాసం కలిపి (సర్వే 2024-25)',
    'Whole project (Survey 2024-25)': 'మొత్తం ప్రాజెక్టు (సర్వే 2024-25)',
    'Physical progress (MoSPI)': 'భౌతిక పురోగతి (MoSPI)',
    # families and money
    'Up to March 2014': '2014 మార్చి వరకు',
    'First phase when the work was split into two phases': 'పనిని రెండు దశలుగా విభజించినప్పుడు మొదటి దశ',
    'First phase after a new survey, as the state told the CAG': 'కొత్త సర్వే తర్వాత మొదటి దశ, రాష్ట్రం CAGకి చెప్పినట్లు',
    'Spent by the state before April 2014': '2014 ఏప్రిల్‌కు ముందు రాష్ట్రం చేసిన ఖర్చు',
    'Spent by the state, April 2014 to March 2023': '2014 ఏప్రిల్ నుంచి 2023 మార్చి వరకు రాష్ట్రం చేసిన ఖర్చు',
    'Paid back by the Centre, April 2014 to March 2023': '2014 ఏప్రిల్ నుంచి 2023 మార్చి వరకు కేంద్రం తిరిగి చెల్లించినది',
    'Paid back by the Centre, as of January 2025': '2025 జనవరి నాటికి కేంద్రం తిరిగి చెల్లించినది',
    'Released by the Centre in advance on 9 October 2024': '2024 అక్టోబర్ 9న కేంద్రం ముందుగా విడుదల చేసినది',
    'Spent on the works since 2014, as the state reported, up to 30 November 2024': '2014 నుంచి 2024 నవంబర్ 30 వరకు పనులపై ఖర్చు, రాష్ట్రం నివేదించినట్లు',
    # newspaper figures
    'Physical progress, September 2026': 'భౌతిక పురోగతి, 2026 సెప్టెంబర్',
    'Gap II embankments': 'గ్యాప్ II కట్టలు',
    'Works complete, as the Chief Minister put it in July 2026': 'పూర్తయిన పనులు, 2026 జూలైలో ముఖ్యమంత్రి చెప్పినట్లు',
    'Completion': 'పూర్తి',
    'Dam, earliest date given': 'డ్యామ్, చెప్పిన తొలి తేదీ',
    'Major works, aim': 'ప్రధాన పనులు, లక్ష్యం',
    'Scheduled end': 'షెడ్యూల్ ప్రకారం ముగింపు',
    'Main dam': 'ప్రధాన డ్యామ్',
    'Complete, as stated in December 2024': 'పూర్తయినది, 2024 డిసెంబర్‌లో చెప్పినట్లు',
    'Complete, as reported in November 2019': 'పూర్తయినది, 2019 నవంబర్‌లో రాసినట్లు',
}
PRESS_TE = {
    'p1': 'కేంద్ర జలశక్తి మంత్రిత్వ శాఖలో అక్టోబర్ 12 సమీక్ష కోసం చేసిన ప్రెజెంటేషన్, 2026 సెప్టెంబర్ నాటికి భౌతిక పురోగతి 90.1%, భూసేకరణ 95.6%, పునరావాసం 51.9% అని చూపిందని ఆ పత్రిక రాసింది. ది న్యూ ఇండియన్ ఎక్స్‌ప్రెస్‌ను ఆధారంగా పేర్కొంది.',
    'p2': 'నలుగురు అంతర్జాతీయ నిపుణులు ఎర్త్ కమ్ రాక్ ఫిల్ (మట్టి, రాళ్ల) డ్యామ్ పనులను పరిశీలించారని పత్రిక రాసింది. అక్టోబర్ 17 వరకు వారు పనులను పర్యవేక్షించాల్సి ఉంది.',
    'p3': 'పోలవరం ప్రాజెక్టు అథారిటీ బృందం ఎర్త్ కమ్ రాక్ ఫిల్ డ్యామ్‌లోని రెండు గ్యాప్‌లను పరిశీలించి, పనులు వేగవంతం చేయాలని కోరిందని పత్రిక రాసింది.',
    'p4': 'పనులు 2027 మార్చి నాటికి పూర్తవుతాయని, ఇప్పటికి 89 శాతం పూర్తయ్యాయని రాష్ట్ర ముఖ్యమంత్రి చెప్పారని పత్రిక రాసింది. ఎడమ ప్రధాన కాలువ ద్వారా నీరు అనకాపల్లికి చేరడాన్ని 2026 ఆగస్టు 14న ఒక కార్యక్రమంతో గుర్తిస్తామని ఆయన చెప్పారు.',
    'p5': 'డ్యామ్ 2027 మార్చి నాటికి, ఆలస్యమైనా 2027 జూన్ నాటికి పూర్తవుతుందని ఒక సూపరింటెండింగ్ ఇంజనీర్ చెప్పారని పత్రిక రాసింది. గ్యాప్ 1 ఎత్తు 33 మీటర్లకు చేరింది.',
    'p6': 'ఒక్కో కుటుంబానికి మంజూరైన ₹10 లక్షల్లో కొంత భాగమే విడుదలైందని, ఉద్యోగాలు కావాలని ఏలూరు జిల్లాలోని ఒక పునరావాస కాలనీ కుటుంబాలు చెబుతున్నాయని పత్రిక రాసింది. కాలనీని 6,000 కుటుంబాల కోసం కట్టగా, సుమారు 4,000 కుటుంబాలు వచ్చి చేరాయి.',
    'p7': 'షెడ్యూల్ ప్రకారం ముగింపు 2027 డిసెంబర్ అయినా, ప్రధాన పనులను 2027 జూలై గోదావరి పుష్కరాలకు ముందే పూర్తి చేయాలని అధికారులు లక్ష్యంగా పెట్టుకున్నారని పత్రిక రాసింది. మొదటి దశలోని 38,060 కుటుంబాల్లో 14,385 తరలివెళ్లాయని, 1,00,099 ఎకరాల్లో 91,127 ఎకరాలు సేకరించారని అది చెబుతోంది.',
    'p8': '2027 గోదావరి పుష్కరాలకు ముందే ప్రాజెక్టు పూర్తి చేయాలని రాష్ట్ర ముఖ్యమంత్రి అధికారులను కోరారని వార్తా సంస్థ రాసింది. ఎర్త్ కమ్ రాక్ ఫిల్ ప్రధాన డ్యామ్ 2027 డిసెంబర్ నాటికి పూర్తవుతుందని అధికారులు చెప్పారు.',
    'p9': 'ప్రాజెక్టు పూర్తికి రాష్ట్ర ముఖ్యమంత్రి 2026 అక్టోబర్‌ను లక్ష్యంగా పెట్టారని పత్రిక రాసింది. ప్రాజెక్టు 76.79% పూర్తయిందని ఆయన చెప్పారు.',
    'p10': 'ప్రాజెక్టు 67.09% పూర్తయిందని, 2019 అక్టోబర్ 21 నుంచి పనులు ఆగిపోయాయని ఆ వార్తా సైట్ రాసింది.',
}
_nums = lambda s: sorted(re.findall(r'\d+(?:,\d+)*(?:\.\d+)?', s))
def pol_te(s):
    te = POL_TE[s]  # a KeyError here means a new English line has no Telugu yet
    assert _nums(s) == _nums(te), f'numbers differ between English and Telugu: {s!r} / {te!r}'
    return te
for c in cost_history:
    c['label_te'], c['scope_te'] = pol_te(c['label']), pol_te(c['scope'])
for p in progress:
    p['measure_te'] = pol_te(p['measure'])
for r in families['by_year']:
    r['year_te'] = pol_te(r['year']) if not re.fullmatch(r'\d{4}-\d{2}', r['year']) else r['year']
for p in families['phase1']:
    p['label_te'] = pol_te(p['label'])
for mny in money:
    mny['label_te'] = pol_te(mny['label'])
for n in press:
    n['summary_te'] = PRESS_TE[n['id']]
    assert _nums(n['summary']) == _nums(n['summary_te']), f'numbers differ in the Telugu summary of {n["id"]}'
    for f in n['figures']:
        f['label_te'] = pol_te(f['label'])

polavaram = {
    'record': {k: reg613[k] for k in ('id', 'title', 'status', 'district', 'department', 'estimated_cost_crore',
                                      'cost_source_url', 'completion_percentage', 'expected_completion', 'source_url')},
    'events': [ev_clean(e) for e in reg613['events']],
    'readings': readings,
    'story': {k: story[k] for k in ('steps', 'stepsTitle', 'keyDates', 'chapters', 'questions')},
    'story_status': story['status'],
    'papers': papers,
    'cost_history': cost_history,
    'deadlines': deadlines_gov,
    'progress': progress,
    'families': families,
    'land': land,
    'money': money,
    'water': water,
    'press': press,
    'press_read_on': '2026-10-17',
}
dump('polavaram', polavaram)

# ---------------------------------------------------------------- money
fin = load(f'{LIVE}/finances.json')
series = []
for s in fin['series']:
    series.append({'indicator': s['indicator'], 'family': s['source_family'], 'unit': s['unit'],
                   'points': [{k: p.get(k) for k in ('fy_end', 'value', 'stage', 'source')} for p in s['points']]})
finsrc = {k: {kk: v.get(kk) for kk in ('label', 'title', 'publisher', 'url', 'date', 'short', 'name') if kk in v} for k, v in fin['sources'].items()}
three = fin['composition']['cag_three_way']
money_page = {'series': series, 'sources': finsrc,
              'cag_parts': {'label': 'Audited parts of the debt, as the CAG prints them', 'years': three['years']}}
# Department rows go out compact, each paper's address once (scripts/prep_departments.py).
from prep_departments import compact as compact_departments
dept = load(f'{LIVE}/departments.json')
departments, dept_books = compact_departments(dept['departments'])
money_page['departments'] = departments
money_page['dept_books'] = dict(sorted(dept_books.items()))
money_page['states'] = old['states']
# What the state earns and what interest takes (Form F-1), and what the Assembly voted against what was spent
# (Appropriation Accounts). Printed amounts only: the API's own shares (interest_pct_of_revenue, pct_spent) stay out.
money_page['income_interest'] = [{k: y.get(k) for k in ('fy_end', 'fy_label', 'stage', 'source', 'form', 'revenue_receipts', 'interest_payments')}
                                 for y in fin['committed']['years']]
money_page['voted_spent'] = [{'fy_end': y['fy_end'], 'fy_label': y['fy_label'], 'doc': y.get('doc'),
                              'blocks': [{k: b.get(k) for k in ('section', 'voted_or_charged', 'label', 'promised', 'spent')} for b in y['blocks']]}
                             for y in fin['promised_vs_spent']['years']]
# RBI's breakdown of the debt for the newest audited year, as printed. Its growth notes are our
# arithmetic and stay out; long dashes in names become colons.
rd = fin['composition']['rbi_latest_detail']
money_page['rbi_parts'] = {'as_of_fy_end': rd['as_of_fy_end'], 'stage': rd['stage'], 'source': rd['source'], 'total': rd['total'],
                           'items': [{'name': re.sub(r'\s*\u2014\s*', ': ', i['name']), 'value': i['value']} for i in rd['items']]}
assert abs(sum(i['value'] for i in rd['items']) - rd['total']) < 1, 'RBI parts do not add to the printed total'
dump('money', money_page)

sf = load(f'{LIVE}/statefacts.json')
facts = {'groups': sf['groups'], 'sources': sf['sources'], 'unavailable': sf['unavailable'], 'indicators': []}
for i in sf['indicators']:
    pts = []
    for p in i.get('series', i.get('points', [])) or []:
        pts.append({k: p.get(k) for k in ('fy_end', 'fy_label', 'value', 'stage') if k in p})
    facts['indicators'].append({
        'key': i['key'], 'label': i['label'], 'group': i['group'], 'unit': i['display_unit'],
        'div': i['display_divisor'], 'dec': i['decimals'], 'what': i['what_it_means'],
        'source': i['source'], 'table': i.get('table'),
        'latest': {k: i['latest'].get(k) for k in ('fy_end', 'fy_label', 'value', 'stage')} if i.get('latest') else None,
        'points': pts,
    })
dump('statefacts', facts)

# ---------------------------------------------------------------- investments
mous = load(f'{LIVE}/mous.json')['items']
summ = load(f'{LIVE}/summits.json')
summits = [{k: s.get(k) for k in ('key', 'name', 'long_name', 'city', 'start_date', 'end_date', 'mou_count', 'investment_crore', 'jobs', 'figure_type', 'quote', 'source_url')} for s in summ['summits']]
grounded = [{k: g.get(k) for k in ('year', 'investment_crore', 'employment', 'basis', 'quote', 'source_url', 'source_publisher', 'missing_reason', 'missing_kind')} for g in summ['grounded_by_year']]
dump('investments', {'mous': mous, 'summits': summits, 'by_year': grounded, 'definition': summ.get('definition_warning')})

# ---------------------------------------------------------------- claims, papers, tenders, updates
fc = load(f'{S}/repo/dev/ap-nadu-nedu/src/data/factchecks.json')['checks']
claims = []
# Questions are shown without any party name; the paper and its date identify every claim.
NEUTRAL_Q = {'ap-debt-june-2014': "Was Andhra Pradesh's debt about \u20b997,000 crore in June 2014?"}
for c in fc:
    claims.append({
        'slug': c['slug'], 'question': NEUTRAL_Q.get(c['slug'], c['question']), 'as_of': c.get('as_of'), 'unit': c.get('unit'),
        'claims': [{'date': x.get('date'), 'document': x.get('document'), 'url': x.get('document_url'),
                    'doc_note': x.get('document_note'), 'status': x.get('status'),
                    'quote': x.get('quote'), 'figure': x.get('figure')} for x in c.get('claims', [])],
        'record': [{k: r.get(k) for k in ('source', 'document', 'document_url', 'measure', 'figure')} for r in c.get('record', [])],
    })
# Telugu for the record lines (added 18 Oct 2026); the same numbers must appear in both languages.
CLAIM_TE = {
    'Outstanding liabilities, end-March 2019': '2019 మార్చి చివరికి మిగిలిన అప్పు',
    'Outstanding liabilities, end-March 2019, Accounts': '2019 మార్చి చివరికి మిగిలిన అప్పు, లెక్కలు',
    'Outstanding liabilities, end-March 2024': '2024 మార్చి చివరికి మిగిలిన అప్పు',
    'Outstanding liabilities, end-March 2024, Accounts': '2024 మార్చి చివరికి మిగిలిన అప్పు, లెక్కలు',
    'Outstanding liabilities, end-March 2015, the first published year-end for the residuary state': '2015 మార్చి చివరికి మిగిలిన అప్పు; విభజన తర్వాత రాష్ట్రానికి ప్రచురించిన మొదటి ఏడాది ముగింపు సంఖ్య',
    'Outstanding liabilities, end-March 2015, Accounts': '2015 మార్చి చివరికి మిగిలిన అప్పు, లెక్కలు',
    'Reserve Bank of India': 'రిజర్వ్ బ్యాంక్ ఆఫ్ ఇండియా',
    'Government of Andhra Pradesh, audited accounts': 'ఆంధ్రప్రదేశ్ ప్రభుత్వం, ఆడిట్ చేసిన లెక్కలు',
}
for c in claims:
    for r in c['record']:
        for k in ('measure', 'source'):
            r[k + '_te'] = CLAIM_TE[r[k]]
            assert _nums(r[k]) == _nums(r[k + '_te']), f'numbers differ: {r[k]!r}'
dump('claims', claims)
lib = load(f'{LIVE}/library.json')
dump('papers', {'documents': lib['documents'], 'doc_types': lib['doc_types'], 'sectors': lib['sectors'], 'updated': lib['updated']})
# Tenders, the refresh log and the community board are not baked into the site any more: the pages
# read them live from the API (src/lib/live.ts), so a copy here could only ever be out of date.
dump('meta', meta)

# ================================================================ added 18 Oct 2026
# ---------------------------------------------------------------- papers register
# Two kinds of paper are left out of the preview until Dheeraj's go:
#  1. voter-roll parts (titles carrying constituency, part or polling-station
#     numbers) from district collectorates: his standing rule is no voter lists;
#  2. lists that name private people (merit, selection, application, seniority
#     and accreditation lists). The notices about the same posts stay.
# Titles only were read to decide this; no PDF was opened.
ROLL = re.compile(r'(-?\bAC\b[\s-]*(PART)?[\s-]*\d+)|(\bPart\s*-?\s*\d+)|(\bP\.?\s?S\.?\s*No\.?\s*\d+)|electoral|voter|polling|draft roll|final roll|special intensive|no\s*mapping', re.I)
# A title that is only an Assembly constituency's number and name ("20-Bhimili", "25- GAJUWAKA"):
# 14 such files from the Visakhapatnam collectorate in August 2026, some marked "NO MAPPING",
# the wording of an electoral roll revision. Found on 18 Oct 2026 while reviewing the preview.
AC_TITLE = re.compile(r'^\s*\d{1,3}\s*-\s*[A-Za-z][A-Za-z .()]*$')
NAMES = re.compile(r'merit|selection list|provisional list|statement showing the applications|accredi|seniority list', re.I)
docs = load(f'{LIVE}/documents_all.json')['items']
roll_like = [d for d in docs if d.get('department', '').endswith('District Collectorate') and (ROLL.search(d['title']) or AC_TITLE.match(d['title']))]
roll_ids = {d['id'] for d in roll_like}
name_lists = [d for d in docs if d['id'] not in roll_ids and NAMES.search(d['title'])]
left_out = roll_ids | {d['id'] for d in name_lists}
kept = [d for d in docs if d['id'] not in left_out]
print(f'papers: {len(docs)} in the register, {len(roll_like)} voter-roll-like and {len(name_lists)} name lists left out, {len(kept)} kept')
# 21 name lists: 19 from Visakhapatnam (record 929's full title ends in a provisional merit list), one
# press accreditation list (YSR Kadapa) and one seniority list (East Godavari). Checked by hand on 18 Oct 2026.
# 232 roll-like: 119 Parvathipuram Manyam and 99 Srikakulam (constituency, part or polling-station
# numbers), and 14 Visakhapatnam files titled only by Assembly constituency.
assert len(roll_like) == 232 and len(name_lists) == 21, 'the left-out sets changed: re-check by hand before publishing'

def doc_row(d):
    return {'id': d['id'], 't': d['title'], 'k': d['document_type'], 'y': d.get('year'),
            'o': d.get('department'), 'portal': d.get('source_portal'), 'u': d.get('source_url'),
            'd': (d.get('published_date') or '')[:10] or None, 'ref': d.get('reference_number')}

register_papers = {
    'total_live': len(docs),
    'left_out': {
        'roll_like': len(roll_like),
        'roll_like_offices': sorted({d['department'] for d in roll_like}),
        'name_lists': len(name_lists),
    },
    'items': sorted((doc_row(d) for d in kept), key=lambda r: (r['d'] or '', r['y'] or 0, r['id']), reverse=True),
}
dump('register_papers', register_papers)

# ---------------------------------------------------------------- helplines
con = load(f'{LIVE}/contacts.json')
# Numbers whose own entry says to dial-test before publishing. Shown apart, never mixed with confirmed numbers.
CHECK_FIRST = {'1902', '155300', '1091', '1921'}
def line(h):
    return {k: h.get(k) for k in ('name', 'number', 'scope', 'what_for', 'hours', 'source_url')} | {'check_first': h.get('number') in CHECK_FIRST}
unavailable = []
for u in con['unavailable']:
    u = {k: u.get(k) for k in ('what', 'url', 'what_a_human_should_do')}
    # The research pass of 30 Aug said these two districts were never created. Press reports since
    # say both exist from 1 Jan 2026; the Gazette copy is still to be read, so the note says only that.
    if 'Markapuram' in (u['what'] or '') and 'Polavaram' in (u['what'] or ''):
        u = {'what': 'Two new districts, Markapuram and Polavaram, are reported to exist from 1 January 2026. They will be added here once the Gazette notification has been read.',
             'url': 'https://apegazette.cgg.gov.in', 'what_a_human_should_do': 'Until then, use the parent district\'s website: Prakasam for Markapuram, Alluri Sitharama Raju for Polavaram.',
             'override': True}
    unavailable.append(u)
escalations = []
for e in con['escalations']:
    steps = [{k: s.get(k) for k in ('rung', 'office', 'what_to_bring', 'time_limit', 'portal', 'source_url')} for s in e['steps']]
    unconfirmed = [2, 3] if e['problem'].startswith('Pension not received') else []
    for s in steps:
        s['unconfirmed'] = s['rung'] in unconfirmed
    escalations.append({'problem': e['problem'], 'steps': steps, 'law': e.get('law_or_go')})
depts = []
for d in con['departments']:
    row = {k: d.get(k) for k in ('name', 'website', 'phone', 'email', 'citizen_portal', 'source_url')}
    # Our library found core.ap.gov.in gone from DNS on 28 Aug; the link is held, with a note.
    if row['citizen_portal'] and 'core.ap.gov.in' in row['citizen_portal']:
        row['citizen_portal'] = None
        row['note'] = 'Its dashboard link (core.ap.gov.in) no longer resolved on 28 Aug 2026; held until rechecked.'
    depts.append(row)
helplines = {
    'fetched': con['fetched'], 'readme': con['readme'], 'warning': con['warning'],
    'emergency': [line(h) for h in con['emergency']],
    'helplines': [line(h) for h in con['helplines']],
    'grievance': [{k: g.get(k) for k in ('name', 'what_for', 'url', 'how_to_file', 'source_url')} for g in con['grievance_systems']],
    'departments': depts,
    'districts': [{k: d.get(k) for k in ('name', 'website', 'email', 'source_url')} for d in con['districts']],
    'escalations': escalations,
    'unavailable': unavailable,
}
dump('helplines', helplines)

# ---------------------------------------------------------------- governments by period
gov = load(f'{LIVE}/governments.json')
gsrc = gov['sources']
def src_of(key):
    s = gsrc.get(key) or {}
    return {'key': key, 'title': s.get('title'), 'url': s.get('pdf') or s.get('url'), 'date': s.get('date'), 'publisher': s.get('publisher')}
series = {}
for key in ('capital_outlay', 'social_sector', 'education_share', 'health_share', 'committed_pct'):
    s = gov['spending'][key]
    series[key] = {'unit': s['unit'], 'note': s.get('note'), 'sources': [src_of(k) for k in s.get('sources', [])],
                   'points': [{k: p.get(k) for k in ('fy_end', 'value', 'stage')} for p in s['points']]}
pc = gov['economy']['per_capita_nsdp']
# State facts marks the newest three years provisional, as the NSO publishes them; this page says the same.
pc_points = [{'fy_end': p['fy_end'], 'value': p['value'], 'stage': 'PE' if p['fy_end'] >= 2023 else p.get('stage')} for p in pc['points']]
series['per_capita'] = {'unit': 'rupees', 'note': pc.get('note'), 'sources': [src_of(k) for k in pc.get('sources', [])], 'points': pc_points}
tp = load(f'{LIVE}/by_tenure_projects.json')
periods = [{'from': t['from'], 'to': t['to'], 'cm': t['cm'], 'projects_announced': t['announced_count']} for t in tp['tenures']]
mous_all = load(f'{LIVE}/mous.json')['items']
for p in periods:
    inside = [m for m in mous_all if m.get('signed_date') and p['from'] <= m['signed_date'][:10] <= (p['to'] or '9999')]
    p['promises_signed'] = len(inside)
    p['promises_operational'] = sum(1 for m in inside if m.get('status') == 'operational')
events = [
    {'date': '2014-06-02', 'en': 'Andhra Pradesh begins as a divided state, under the AP Reorganisation Act.', 'te': 'ఏపీ పునర్వ్యవస్థీకరణ చట్టం ప్రకారం విభజిత ఆంధ్రప్రదేశ్ మొదలైంది.', 'src': src_of('REORG-ACT')},
    {'date': '2015-10-22', 'en': 'The Prime Minister lays the foundation stone of Amaravati.', 'te': 'ప్రధానమంత్రి అమరావతికి శంకుస్థాపన చేశారు.', 'src': src_of('PMO-AMARAVATI')},
    {'date': '2017-04-27', 'en': 'Kia Motors signs an MoU for a car plant at Anantapur.', 'te': 'అనంతపురంలో కార్ల ప్లాంట్ కోసం కియా మోటార్స్ ఎంఓయూ కుదుర్చుకుంది.', 'src': src_of('KIA-2017'), 'kind': 'company'},
    {'date': '2019-07-21', 'en': 'The World Bank confirms its proposed Amaravati project is dropped.', 'te': 'ప్రతిపాదిత అమరావతి ప్రాజెక్టు నుంచి వైదొలిగినట్లు ప్రపంచ బ్యాంకు ధృవీకరించింది.', 'src': src_of('WB-AMARAVATI')},
    {'date': '2024-07-23', 'en': 'Union Budget: "₹15,000 crore will be arranged" for the capital.', 'te': 'కేంద్ర బడ్జెట్: రాజధానికి ₹15,000 కోట్లు సమకూర్చుతామని ప్రకటన.', 'src': src_of('UNION-BUDGET-24')},
    {'date': '2024-08-28', 'en': "The Union Cabinet approves Polavaram's revised first-phase cost of ₹30,436.95 crore.", 'te': 'పోలవరం మొదటి దశ సవరించిన వ్యయం ₹30,436.95 కోట్లకు కేంద్ర మంత్రివర్గం ఆమోదం.', 'src': src_of('PIB-POLAVARAM-25')},
]
rankings = []
for i in gov['rankings']['indices']:
    eds = [{'edition': e['edition'], 'result': e['result'], 'src': src_of(e.get('source'))} for e in i['editions'] if not e.get('caveat')]
    rankings.append({'name': i['name'], 'publisher': i['publisher'], 'measures': i['measures'], 'editions': eds})
awards = [{k: a.get(k) for k in ('date', 'text', 'url', 'publisher')} for a in gov['awards']['items']]
dump('periods', {'periods': periods, 'unattributed': tp['unattributed_count'], 'pre_division': tp['pre_bifurcation_count'],
                 'series': series, 'events': events, 'rankings': rankings, 'awards': awards})

# ---------------------------------------------------------------- trust pages, from the live site's own words
REPO = f'{S}/repo/dev/ap-nadu-nedu/src/i18n/locales'
en_cat, te_cat = load(f'{REPO}/en.json'), load(f'{REPO}/te.json')
legal = {}
for top in ('about', 'disclaimer', 'privacy', 'community'):
    e, t = dict(en_cat[top]), dict(te_cat.get(top, {}))
    if top == 'disclaimer':
        # No grievance officer for now (decision of 24 Sep 2026): the section stays hidden, as on the live site.
        e['sections'] = {k: v for k, v in e['sections'].items() if k != 'grievance'}
        t['sections'] = {k: v for k, v in t.get('sections', {}).items() if k != 'grievance'}
    legal[top] = {'en': e, 'te': t}
# The new design adds plain explanations around figures. About says so, in the same place as "We create nothing".
legal['about']['en']['principles']['createNothing']['body'] += ' The plain explanations and everyday examples around the figures are ours, and are marked as such.'
te_cn = legal['about']['te'].get('principles', {}).get('createNothing')
if te_cn:
    te_cn['body'] += ' అంకెల చుట్టూ ఉండే సులభమైన వివరణలు, ఉదాహరణలు మావి; అవి అలా స్పష్టంగా గుర్తించబడతాయి.'
# The house style has no long dashes: the live wording keeps its words, with a comma in their place.
def undash(o):
    if isinstance(o, str):
        return re.sub(r'\s*[\u2014]\s*|\s+[\u2013]\s+|\s*--\s*', ', ', o)
    if isinstance(o, dict):
        return {k: undash(v) for k, v in o.items()}
    if isinstance(o, list):
        return [undash(v) for v in o]
    return o
legal = undash(legal)
dump('legal', legal)
