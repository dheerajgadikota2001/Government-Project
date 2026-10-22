"""Build the district history (Statistical Abstract editions 2014 to 2023) for My district.

Inputs
  des/out/saYEAR.json      one file per edition, read off the page images (des/HIST_BRIEF.md)
  des/map2022.json         which old districts each 2022 district came from, official pages only
  src/data/district_measures.json   the 2024 edition, for labels, units and subject

Outputs
  src/data/district_history.json            what the site shows (lazy loaded)
  <backend>/seed/district_history_seed.json  everything, including state series and police units

House rules kept here:
- Every value is the book's own. Nothing is added, divided, converted or ranked. A unit change
  (Rs. million to Rs. crore) starts a new group; it is never converted.
- Old districts (13, before April 2022) and new districts (26) are never mixed or split.
- When two editions print the same data year, the newer edition's figures are kept and the
  older ones are recorded under `also` when they differ.
- Book slips are flagged, never fixed, except where a misplaced comma leaves the digits certain
  (the readers recorded those in flags).
"""
import json, re, sys, glob
from pathlib import Path

HERE = Path(__file__).resolve().parent
SITE = HERE.parent
DES = SITE.parent / 'des'
BACKEND = next(p for p in (SITE.parent / 'backend', SITE.parent / 'work/paging-device/backend') if p.exists())

OLD13 = ['Srikakulam', 'Vizianagaram', 'Visakhapatnam', 'East Godavari', 'West Godavari', 'Krishna', 'Guntur',
         'Prakasam', 'Sri Potti Sriramulu Nellore', 'YSR Kadapa', 'Kurnool', 'Ananthapuramu', 'Chittoor']

# history id -> 2024 id (labels, subject, unit)
H2024 = {
    'rain_actual': 'rain_actual_2023_24', 'net_area_sown': 'net_area_sown_2023_24', 'paddy_area': 'paddy_area_2023_24',
    'paddy_output': 'paddy_output_2023_24', 'net_area_irrigated': 'net_area_irrigated_2023_24',
    'milk_production': 'milk_production_2023_24', 'egg_production': 'egg_production_2023_24',
    'inland_fish_prawn': 'inland_fish_prawn_2023_24', 'marine_fish_shrimp': 'marine_fish_shrimp_2023_24',
    'forest_area': 'forest_area_2023_24',
    'national_highway_km': 'national_highway_km_2024', 'state_roads_rb_km': 'state_roads_rb_km_2024',
    'panchayat_raj_roads_km': 'panchayat_raj_roads_km_2024', 'motor_vehicles_on_road': 'motor_vehicles_on_road_2024',
    'power_consumption_total': 'power_consumption_total_2023_24', 'power_agriculture_lt': 'power_agriculture_lt_2023_24',
    'post_offices': 'post_offices_2024',
    'gva_current': 'gva_current_2022_23', 'bank_offices': 'bank_offices_2024', 'bank_deposits': 'bank_deposits_2024',
    'bank_credit': 'bank_credit_2024', 'documents_registered': 'documents_registered_2023_24',
    'registration_revenue': 'registration_revenue_2023_24',
    'govt_hospitals_total': 'govt_hospitals_total_2024', 'primary_health_centres': 'primary_health_centres_2024',
    'govt_hospital_beds': 'govt_hospital_beds_2024', 'institutional_deliveries': 'institutional_deliveries_2023_24',
    'infant_mortality_rate': 'infant_mortality_rate_2023_24',
    'schools_total': 'schools_total_all_managements', 'school_enrolment': 'school_enrolment_total',
    'school_teachers': 'school_teachers_total', 'ssc_appeared': 'ssc_appeared', 'ssc_passed': 'ssc_passed',
    'ssc_pass_percentage': 'ssc_pass_percentage', 'junior_colleges': 'junior_colleges', 'degree_colleges': 'degree_colleges',
    'engineering_colleges': 'engineering_colleges', 'medical_colleges': 'medical_colleges', 'iti_institutes': 'iti_institutes',
    'pensions_total': 'pensions_all_kinds_total', 'ration_cards': 'ration_cards_total', 'fair_price_shops': 'fair_price_shops',
    'self_help_groups': 'self_help_groups', 'anganwadi_centres': 'anganwadi_centres',
    'rural_job_guarantee_wages': 'rural_job_guarantee_total_wages', 'houses_completed': 'houses_completed_weaker_sections_2023_24',
    'ipc_crimes_total': 'ipc_crimes_total_2023',
    'gram_panchayats_income': 'gram_panchayats_income', 'gram_panchayats_expenditure': 'gram_panchayats_expenditure',
    'tourist_arrivals_domestic': 'tourist_arrivals_domestic_2023', 'tourist_arrivals_foreign': 'tourist_arrivals_foreign_2023',
}
# read under another id because the edition printed a different definition; shown as its own group
ALIAS = {'net_area_sown_incl_fish_ponds': 'net_area_sown'}
LABEL_OVERRIDE = {
    'houses_completed': ('Houses completed for weaker sections in the year', 'ఆ ఏడాదిలో బలహీన వర్గాలకు పూర్తయిన ఇళ్లు'),
}

# Definition changes the books themselves state. Each starts a new group with its own words.
DEFS = {
    ('ration_cards', 2014): 'pink', ('ration_cards', 2015): 'pink', ('ration_cards', 2018): 'pink',
    ('ration_cards', 2016): 'apl', ('ration_cards', 2017): 'apl',
    ('net_area_sown', 2014): 'fish', ('net_area_sown', 2016): 'fish',
}
DEF_TEXT = {
    'pink': ('This year\'s total also counts Pink cards, so it is not the same count as later years.',
             'ఈ ఏడాది మొత్తంలో పింక్ కార్డులు కూడా ఉన్నాయి; తర్వాతి ఏళ్ల లెక్కతో సమానం కాదు.'),
    'apl': ('This year\'s total also counts APL cards, so it is not the same count as later years.',
            'ఈ ఏడాది మొత్తంలో ఏపీఎల్ కార్డులు కూడా ఉన్నాయి; తర్వాతి ఏళ్ల లెక్కతో సమానం కాదు.'),
    'fish': ('This year\'s book counts fish and prawn ponds as sown land, so it is not the same count as other years.',
             'ఈ ఏడాది పుస్తకం చేపలు, రొయ్యల చెరువులను కూడా సాగు భూమిగా లెక్కించింది; ఇతర ఏళ్లతో సమానం కాదు.'),
}

# Measure-level words every reader needs (en, te).
MEASURE_NOTE = {
    'ipc_crimes_total': ('Police count crimes by police unit, not by district. Where a district had two units (a city and the rest), the book prints no single district figure, so we show the two units as printed and add nothing. A rise can mean more reporting, not only more crime. Years here are calendar years, January to December.',
                         'పోలీసులు నేరాలను జిల్లా వారీగా కాదు, పోలీసు యూనిట్ వారీగా లెక్కిస్తారు. ఒక జిల్లాలో రెండు యూనిట్లు (నగరం, మిగతా ప్రాంతం) ఉంటే పుస్తకం జిల్లా మొత్తం ముద్రించలేదు; రెండు యూనిట్లను ముద్రించినట్లే చూపాం, కలపలేదు. పెరిగితే ఎక్కువ ఫిర్యాదులు నమోదైనట్లు కూడా కావచ్చు. ఇక్కడ ఏళ్లు జనవరి నుంచి డిసెంబర్ వరకు.'),
    'ssc_passed': ('In 2019-20 and 2020-21 there was no regular exam because of COVID, and everyone who appeared was declared passed.',
                   '2019-20, 2020-21లో కోవిడ్ వల్ల సాధారణ పరీక్ష జరగలేదు; పరీక్షకు నమోదైన అందరినీ ఉత్తీర్ణులుగా ప్రకటించారు.'),
    'ssc_pass_percentage': ('In 2019-20 and 2020-21 there was no regular exam because of COVID, and everyone who appeared was declared passed.',
                            '2019-20, 2020-21లో కోవిడ్ వల్ల సాధారణ పరీక్ష జరగలేదు; పరీక్షకు నమోదైన అందరినీ ఉత్తీర్ణులుగా ప్రకటించారు.'),
    'gva_current': ('Each book prints its newest year as an early estimate (AE: advance estimate, FRE: first revised estimate). Later books revise these, so a year here can differ from the same year in a newer book.',
                    'ప్రతి పుస్తకం తన కొత్త ఏడాదిని ముందస్తు అంచనాగా ముద్రిస్తుంది (AE: ముందస్తు అంచనా, FRE: మొదటి సవరించిన అంచనా). తర్వాతి పుస్తకాలు వీటిని సవరిస్తాయి.'),
    'marine_fish_shrimp': ('Only districts with a sea coast are printed.', 'సముద్ర తీరం ఉన్న జిల్లాలు మాత్రమే ముద్రించారు.'),
    'degree_colleges': ('Counts only government and government-aided degree colleges; private unaided colleges are not in this table.',
                        'ప్రభుత్వ, ఎయిడెడ్ కళాశాలలు మాత్రమే; సాయం లేని ప్రైవేటు కళాశాలలు ఈ పట్టికలో లేవు.'),
    'infant_mortality_rate': ('From the health department\'s own records, not the national sample survey.',
                              'ఆరోగ్య శాఖ సొంత రికార్డుల నుంచి; జాతీయ నమూనా సర్వే (SRS) అంకెలు కావు.'),
    'tourist_arrivals_domestic': ('Years here are calendar years, January to December. 2020 and 2021 were COVID years.', 'ఇక్కడ ఏళ్లు జనవరి నుంచి డిసెంబర్ వరకు. 2020, 2021 కోవిడ్ సంవత్సరాలు.'),
    'tourist_arrivals_foreign': ('Years here are calendar years, January to December. 2020 and 2021 were COVID years.', 'ఇక్కడ ఏళ్లు జనవరి నుంచి డిసెంబర్ వరకు. 2020, 2021 కోవిడ్ సంవత్సరాలు.'),
}
# The five old districts whose crimes the police print as two units (names as the books spell them)
SPLIT_UNITS = {
    'Visakhapatnam': ['Visakhapatnam City', 'Visakhapatnam (R)'],
    'East Godavari': ['East Godavari', 'Rajamundry', 'Rajamahendravaram(U)'],
    'Krishna': ['Krishna', 'Vijayawada City'],
    'Guntur': ['Guntur (R)', 'Guntur (U)'],
    'Chittoor': ['Chittoor', 'Tirupathi (U)'],
}
SKIP = {'rain_normal', 'rice_output', 'gddp_current_2004_05_series'}

MONTHS_TE = {'Mar': 'మార్చి', 'Dec': 'డిసెంబర్'}


def year_of(id_, raw):
    """(key, label_en, label_te, sort). Keys join the same data year across editions."""
    s = str(raw)
    m = re.search(r'(20\d\d)\s*-\s*(\d\d)\b', s)
    tag = ''
    t = re.search(r'\((AE|FRE|A\.E|SRE)\)?', s)
    if id_ == 'gva_current' and t:
        tag = ' (' + t.group(1).replace('.', '') + ')'
    if m:
        y = f'{m.group(1)}-{m.group(2)}'
        return y, y + tag, y + tag, int(m.group(1)) + 0.75
    m = re.search(r'31(?:st)?\s*[.\- ]\s*(?:0?3|March)\s*[.\-, ]\s*(20\d\d)', s) or re.search(r'March,?\s*(20\d\d)', s)
    if m:
        y = m.group(1)
        return f'31.03.{y}', f'31 Mar {y}', f'31 మార్చి {y}', int(y) + 0.25
    m = re.search(r'(20\d\d)', s)
    if m:
        y = m.group(1)
        if id_ in ('ipc_crimes_total', 'tourist_arrivals_domestic', 'tourist_arrivals_foreign') or 'December' in s:
            return y, y, y, int(y) + 0.99
        return y, y, y, int(y) + 0.5
    raise ValueError(f'no year in {raw!r}')


def unit_of(u, base):
    """Kind and unit words for a point. Only a change the book prints changes them."""
    s = (u or '').lower()
    if 'million' in s and 'unit' not in s:
        return 'money_mn', '₹ million', '₹ మిలియన్లు'
    if 'crore' in s:
        return 'money_cr', '₹ crore', '₹ కోట్లు'
    if 'lakh' in s and ('rs' in s or '₹' in s or '`' in s):
        return 'money_lakh', '₹ lakh', '₹ లక్షలు'
    return base['kind'], base['unit_en'], base['unit_te']


def flag_kind(text):
    t = text.lower()
    if 'police unit' in t or re.search(r'printed as .*(city|\(r\)|\(u\)|rajamundry|tirupathi)', t):
        return 'police'
    if re.search(r'misplaced comma|without a comma|doubled comma|without the thousands comma|trailing comma|space after the comma|missing comma|stray leading comma|wrapped|cut off|clipped|one decimal', t):
        return 'reading'
    if re.search(r'row name|label|legible|misspel', t):
        return 'label'
    if re.search(r'not printed|row not printed|dash|blank', t):
        return 'blank'
    return 'doubt'


FLAG_TE = {
    'reading': 'పుస్తకంలో కామా లేదా అంకె తప్పు చోట ముద్రితమైంది; అంకెలు స్పష్టంగా ఉన్నాయి, వాటినే చూపాం.',
    'doubt': 'ఈ అంకె పుస్తకంలోని ఇతర అంకెలతో సరిపోలడం లేదు. ముద్రించినట్లే చూపాం; అచ్చుతప్పు అయ్యే అవకాశం ఉంది.',
    'blank': 'పుస్తకం ఈ జిల్లాకు అంకె ముద్రించలేదు.',
}


def state_gap(m):
    c = m.get('check') or {}
    ds, sp = c.get('district_sum'), m.get('state_printed')
    if c.get('matches_state') or ds is None or sp is None or m.get('police_units') or 'per cent' in str(m.get('unit')) or 'railway' in str(c.get('how', '')).lower():
        return False
    return abs(ds - sp) > max(2, 0.0005 * abs(sp))


def main():
    dm = json.loads((SITE / 'src/data/district_measures.json').read_text())
    by24 = {m['id']: m for m in dm['measures']}
    global NEW26
    NEW26 = list(dm['measures'][0]['values'])
    eds = []
    for f in sorted(glob.glob(str(DES / 'out/sa20*.json'))):
        eds.append(json.loads(Path(f).read_text()))
    eds.sort(key=lambda e: e['edition'])

    measures = {}
    full = {}
    for e in eds:
        ed = e['edition']
        for m in e['measures']:
            hid = ALIAS.get(m['id'], m['id'])
            if hid in SKIP or hid not in H2024:
                if hid not in SKIP:
                    print('unmapped id', ed, m['id'], file=sys.stderr)
                continue
            base = by24[H2024[hid]]
            key, len_, lte, sort = year_of(hid, m['year'])
            kind, uen, ute = unit_of(m.get('unit'), base)
            d = DEFS.get((hid, ed)) or ('fish' if m['id'] == 'net_area_sown_incl_fish_ponds' else None)
            got = m.get('values') or {}
            keys = OLD13 if m['map'] == '13' else NEW26
            extra = set(got) - set(keys)
            if extra:
                sys.exit(f'{ed} {m["id"]}: names outside the {m["map"]} map: {extra}')
            # a district the table does not list is not printed: null, never zero
            vals = {k: got.get(k) for k in keys}
            flags = {}
            for k, v in (m.get('flags') or {}).items():
                if k.startswith('_') or k not in vals:
                    continue
                fk = flag_kind(str(v))
                if fk == 'label':
                    continue
                flags[k] = {'kind': fk, 'en': str(v), 'te': FLAG_TE.get(fk)}
            # police units: the two printed units of a split district, for display as printed
            units = {}
            pu = m.get('police_units') or {}
            if hid == 'ipc_crimes_total' and pu:
                for k, names in SPLIT_UNITS.items():
                    if vals.get(k) is not None:
                        continue
                    got = [(n, pu[n]) for n in pu if n.replace(' ', '') in {x.replace(' ', '') for x in names}]
                    if len(got) != 2:
                        sys.exit(f'police units {ed} {k}: {got}')
                    units[k] = [{'unit': n, 'value': x} for n, x in got]
                    flags[k] = {'kind': 'police', 'en': f'Printed as two police units, {got[0][0]} and {got[1][0]}; the book prints no district total.',
                                'te': 'రెండు పోలీసు యూనిట్లుగా ముద్రించారు; జిల్లా మొత్తం ముద్రించలేదు.'}
            pt = {
                'edition': ed, 'key': key, 'year_en': len_, 'year_te': lte, 'sort': sort,
                'map': m['map'], 'table': m.get('table'), 'page': m.get('pdf_page'),
                'kind': kind, 'unit_en': uen, 'unit_te': ute, 'def': d,
                'values': vals, 'state': m.get('state_printed'),
                'state_matches': (m.get('check') or {}).get('matches_state'),
                # True only when the districts miss the book's own state row by more than rounding. A check, never shown as a number.
                'state_gap': state_gap(m),
                'flags': flags, 'units': units or None,
            }
            measures.setdefault(hid, []).append(pt)
            full.setdefault(hid, []).append({**pt, 'raw': m})

    out = []
    for hid, pts in measures.items():
        # one point per (map, data year): the newest edition wins; older differing values kept in `also`
        best = {}
        for p in sorted(pts, key=lambda p: p['edition']):
            k = (p['map'], p['key'], p['def'])
            if k in best:
                old = best[k]
                if old['values'] != p['values']:
                    p['also'] = {'edition': old['edition'], 'values': old['values']}
            best[k] = p
        pts = sorted(best.values(), key=lambda p: (p['map'], p['sort']))
        for p in pts:
            p.pop('key')
        b = by24[H2024[hid]]
        en, te = LABEL_OVERRIDE.get(hid, (b['en'], b['te']))
        note = MEASURE_NOTE.get(hid)
        out.append({
            'id': hid, 'id2024': H2024[hid], 'theme': b['theme'], 'en': en, 'te': te,
            'note': {'en': note[0], 'te': note[1]} if note else None,
            'points': pts,
        })
    order = [m['id'] for m in dm['measures']]
    out.sort(key=lambda m: order.index(m['id2024']))

    parents = json.loads((DES / 'map2022.json').read_text())
    unsourced = parents.pop('unsourced', [])
    doc = {
        'paper': {'title': 'Statistical Abstract, Andhra Pradesh, editions 2014 to 2023',
                  'title_te': 'గణాంక సంగ్రహం, ఆంధ్రప్రదేశ్, 2014 నుంచి 2023 సంచికలు',
                  'by': 'Directorate of Economics and Statistics, Government of Andhra Pradesh',
                  'by_te': 'అర్థ గణాంక శాఖ, ఆంధ్రప్రదేశ్ ప్రభుత్వం',
                  'editions': [e['edition'] for e in eds]},
        'def_text': {k: {'en': v[0], 'te': v[1]} for k, v in DEF_TEXT.items()},
        'old13': OLD13,
        'parents2022': {k: {'from': v['from'], 'source': v['source'], 'url': v['url']} for k, v in parents.items()},
        'unsourced2022': unsourced,
        'measures': out,
    }
    dest = SITE / 'src/data/district_history.json'
    dest.write_text(json.dumps(doc, ensure_ascii=False, separators=(',', ':')))
    print('site', dest, dest.stat().st_size, 'bytes,', len(out), 'measures,', sum(len(m['points']) for m in out), 'points')

    # backend seed: everything the readers recorded, plus state series
    seed = {**doc, 'measures': []}
    for m in out:
        raw = full[m['id']]
        seed['measures'].append({**m, 'readings': [
            {'edition': r['edition'], 'id_as_read': r['raw']['id'], 'year': r['raw']['year'], 'unit': r['raw'].get('unit'),
             'table': r['raw'].get('table'), 'pdf_page': r['raw'].get('pdf_page'), 'column': r['raw'].get('column'),
             'source_line': r['raw'].get('source_line'), 'check': r['raw'].get('check'), 'state_series': r['raw'].get('state_series'),
             'flags': r['raw'].get('flags'), 'note': r['raw'].get('note'), 'police_units': r['raw'].get('police_units')}
            for r in raw]})
    seed['missing'] = {str(e['edition']): e.get('missing', {}) for e in eds}
    sd = BACKEND / 'seed/district_history_seed.json'
    sd.write_text(json.dumps(seed, ensure_ascii=False, indent=1))
    print('seed', sd, sd.stat().st_size, 'bytes')


if __name__ == '__main__':
    main()
