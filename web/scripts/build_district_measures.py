"""
District measures for "My district": every district figure the Statistical Abstract AP 2024
prints for all 26 districts, read from the page images and checked against the printed state row.

Input: the four extraction files (abstract24/measures/{a,b,c,d}.json), each value read off the
rendered page and cross-checked with the text layer, each column summed against the state row.
Output: src/data/district_measures.json, and backend/seed/district_measures_seed.json (same rows).

Kept out on purpose:
- District "per capita income" (Tables 13.9, 13.10): it is district output per person, not the
  official per capita income, and its state row differs from the official figure.
- GDDP (13.7): district GVA times one state-wide factor, so it adds nothing to GVA.
- Counts of bodies "audited" (21.5, 21.6 col 3): they count audits, not bodies.
Nothing here is computed: no sums, shares, per-person figures or ranks.
"""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', '..', 'abstract24', 'measures')
OUT_SITE = os.path.join(HERE, '..', 'src', 'data', 'district_measures.json')
OUT_SEED = os.path.join(HERE, '..', '..', 'work', 'paging-device', 'backend', 'seed', 'district_measures_seed.json')

D26 = ['Alluri Sitharama Raju', 'Anakapalli', 'Ananthapuramu', 'Annamayya', 'Bapatla', 'Chittoor', 'Dr. B.R. Ambedkar Konaseema',
       'East Godavari', 'Eluru', 'Guntur', 'Kakinada', 'Krishna', 'Kurnool', 'Nandyal', 'NTR', 'Palnadu', 'Parvathipuram Manyam',
       'Prakasam', 'Sri Potti Sriramulu Nellore', 'Sri Sathya Sai', 'Srikakulam', 'Tirupati', 'Visakhapatnam', 'Vizianagaram',
       'West Godavari', 'YSR Kadapa']
RENAME = {'YSR': 'YSR Kadapa'}

THEMES = [
    ('people', 'People', 'ప్రజలు'),
    ('economy', 'Money and work', 'డబ్బు, పని'),
    ('farming', 'Farming, fishing and markets', 'వ్యవసాయం, చేపలు, మార్కెట్లు'),
    ('health', 'Health', 'ఆరోగ్యం'),
    ('education', 'Schools and colleges', 'బడులు, కళాశాలలు'),
    ('welfare', 'Welfare and daily needs', 'సంక్షేమం, రోజువారీ అవసరాలు'),
    ('infrastructure', 'Roads, power and post', 'రోడ్లు, విద్యుత్, తపాలా'),
    ('safety', 'Police and crime', 'పోలీసు, నేరాలు'),
    ('local', 'Village panchayats', 'గ్రామ పంచాయతీలు'),
    ('environment', 'Forests', 'అడవులు'),
    ('tourism', 'Visitors', 'సందర్శకులు'),
]

# unit key -> (en suffix, te suffix, kind). kind decides how the site prints the number.
UNITS = {
    'persons': ('people', 'మంది', 'count'),
    'number': ('', '', 'count'),
    'per cent': ('%', '%', 'pct'),
    'persons per sq. km': ('people per sq km', 'మంది / చ.కి.మీ.', 'dec0'),
    'females per 1,000 males': ('women per 1,000 men', 'మహిళలు / 1,000 పురుషులు', 'dec0'),
    'Rs. crore': ('₹ crore', '₹ కోట్లు', 'money_cr'),
    'Rs. lakh': ('₹ lakh', '₹ లక్షలు', 'money_lakh'),
    'mm': ('mm', 'మి.మీ.', 'dec1'),
    'hectares': ('hectares', 'హెక్టార్లు', 'count'),
    'tonnes': ('tonnes', 'టన్నులు', 'count'),
    "'000 MTs": ('thousand tonnes', 'వేల టన్నులు', 'dec1'),
    'lakh eggs': ('lakh eggs', 'లక్షల గుడ్లు', 'dec1'),
    'sq km': ('sq km', 'చ.కి.మీ.', 'count'),
    'km': ('km', 'కి.మీ.', 'dec1'),
    'MU': ('million units', 'మిలియన్ యూనిట్లు', 'dec1'),
    'per 1,00,000 live births': ('per 1,00,000 live births', '1,00,000 సజీవ జననాలకు', 'dec0'),
    'per 1,000 live births': ('per 1,000 live births', '1,000 సజీవ జననాలకు', 'dec0'),
}

YEAR_TE = {
    '2011 Census': '2011 జనగణన', '2001-11 (2011 Census)': '2001-11 (2011 జనగణన)', '2022-23 (FRE)': '2022-23 (మొదటి సవరించిన అంచనా)',
    'as on 31.03.2024': '31.03.2024 నాటికి', 'as on 31-03-2024': '31.03.2024 నాటికి', 'as on 31 March 2024': '31.03.2024 నాటికి',
    '2023-24': '2023-24', '2023': '2023', 'as on 31-12-2023': '31.12.2023 నాటికి', 'calendar year 2023': '2023',
    'as on 31.03.2023': '31.03.2023 నాటికి', '2023-24 (Cumulative)': '2023-24 వరకు మొత్తం',
    '2023-24 (as on 31st March, 2024)': '31.03.2024 నాటికి', 'as on 31st December 2023': '2023 క్యాలెండర్ ఏడాది',
}
YEAR_EN_FIX = {'2023-24 (as on 31st March, 2024)': 'as on 31.03.2024', 'as on 31st December 2023': 'calendar year 2023'}

# id: (theme override or None, label_te, caveat_te or None). Labels in English come from the extraction,
# lightly edited where noted. Every measure listed here is shown; anything else is left out.
M = {
 # people
 'population_2011': (None, 'జిల్లాలో జనాభా (2011 జనగణన)', 'ఇవి 2011 జనగణన అంకెలు, 2022లో గీసిన 26 జిల్లాల ప్రకారం మళ్లీ విభజించినవి.'),
 'population_density_2011': (None, 'ఒక చదరపు కిలోమీటరుకు జనం (2011)', 'ఇవి 2011 జనగణన అంకెలు, 2022లో గీసిన 26 జిల్లాల ప్రకారం మళ్లీ విభజించినవి.'),
 'population_growth_2001_2011': (None, '2001 నుంచి 2011 వరకు జనాభా పెరుగుదల, శాతం', 'ఇవి 2011 జనగణన అంకెలు, 2022లో గీసిన 26 జిల్లాల ప్రకారం మళ్లీ విభజించినవి.'),
 'sex_ratio_2011': (None, 'ప్రతి 1,000 మంది పురుషులకు మహిళలు (2011)', 'ఇవి 2011 జనగణన అంకెలు, 2022లో గీసిన 26 జిల్లాల ప్రకారం మళ్లీ విభజించినవి.'),
 'urban_population_2011': (None, 'పట్టణాలు, నగరాల్లో నివసించేవారు (2011)', 'ఇవి 2011 జనగణన అంకెలు, 2022లో గీసిన 26 జిల్లాల ప్రకారం మళ్లీ విభజించినవి.'),
 'literacy_rate_2011': (None, 'చదవడం, రాయడం వచ్చినవారు, శాతం (2011)', '0 నుంచి 6 ఏళ్ల పిల్లలను లెక్కలోకి తీసుకోలేదు. 2022లో గీసిన 26 జిల్లాల ప్రకారం.'),
 # economy
 'gva_current_2022_23': (None, 'జిల్లాలో ఉత్పత్తయిన వస్తువులు, సేవల విలువ (ప్రస్తుత ధరల్లో)', '2022-23కి మొదటి సవరించిన అంచనా. ఇది జిల్లా వారీ తలసరి ఆదాయం కాదు.'),
 'bank_offices_2024': (None, 'షెడ్యూల్డ్ వాణిజ్య బ్యాంకుల శాఖలు', 'రాష్ట్ర స్థాయి బ్యాంకర్ల కమిటీ లెక్క. ఇదే పుస్తకంలో ఆర్‌బీఐ పట్టికలు రాష్ట్రానికి 7,753, 8,224 శాఖలు అని వేరేగా చూపుతాయి.'),
 'bank_deposits_2024': (None, 'జిల్లాలో బ్యాంకుల్లో ఉన్న డిపాజిట్లు', None),
 'bank_credit_2024': (None, 'జిల్లాలో బ్యాంకులు ఇచ్చిన రుణాలు', 'రుణ ఖాతా ఉన్న చోట లెక్కిస్తారు; డబ్బు వాడిన చోట కాకపోవచ్చు.'),
 'documents_registered_2023_24': (None, 'నమోదైన దస్తావేజులు (అమ్మకాలు, బహుమతులు, తనఖాలు, పంపకాలు, ఇతరాలు)', None),
 'registration_revenue_2023_24': (None, 'దస్తావేజుల నమోదుతో ప్రభుత్వానికి వచ్చిన ఆదాయం', 'ఇది నమోదు ఆదాయం; ఆస్తి మార్కెట్ విలువ కాదు.'),
 # farming
 'rain_actual_2023_24': (None, 'ఏడాదిలో కురిసిన వర్షం (జూన్ నుంచి మే)', 'రాష్ట్ర అంకె విస్తీర్ణ సగటు; జిల్లాల మొత్తం కాదు.'),
 'rain_normal_annual': (None, 'సాధారణ వార్షిక వర్షం (దీర్ఘకాల సగటు)', None),
 'rain_deviation_2023_24': (None, 'సాధారణం కంటే ఎంత ఎక్కువ లేదా తక్కువ వర్షం, శాతం', 'మైనస్ అంటే సాధారణం కంటే తక్కువ.'),
 'net_area_sown_2023_24': (None, 'పంటలు వేసిన భూమి (ఒక్కసారి లెక్కించి)', 'చేపల చెరువులను ఈ అంకెలో కలపలేదు.'),
 'current_fallows_2023_24': (None, 'ఈ ఏడాది సాగు చేయని భూమి (ప్రస్తుత బీడు)', 'ఏడాది లేదా అంతకంటే తక్కువ కాలం సాగు చేయని పొలాలు.'),
 'paddy_area_2023_24': (None, 'వరి సాగు విస్తీర్ణం', None),
 'paddy_output_2023_24': (None, 'వరి (ధాన్యం) దిగుబడి', 'ఇది ధాన్యం; మర పట్టిన బియ్యం కాదు.'),
 'net_area_irrigated_2023_24': (None, 'ఏదో ఒక వనరుతో నీరు అందిన సాగు భూమి', None),
 'canal_irrigated_area_2023_24': (None, 'కాలువల నీరు అందిన సాగు భూమి', None),
 'milk_production_2023_24': (None, 'పాల ఉత్పత్తి (అంచనా)', None),
 'egg_production_2023_24': (None, 'గుడ్ల ఉత్పత్తి (అంచనా)', None),
 'inland_fish_prawn_2023_24': (None, 'చెరువులు, నదుల నుంచి చేపలు, రొయ్యలు', 'చెరువుల్లో పెంచే చేపలు, రొయ్యలు కూడా ఇందులో ఉన్నాయి.'),
 'marine_fish_shrimp_2023_24': (None, 'సముద్రం నుంచి చేపలు, రొయ్యలు', 'సముద్ర తీరం ఉన్న జిల్లాలు మాత్రమే పట్టికలో ఉన్నాయి.'),
 'agricultural_market_committees': (None, 'వ్యవసాయ మార్కెట్ కమిటీలు', None),
 'farmers_markets_state_run': (None, 'ప్రభుత్వం నడిపే రైతు బజార్లు', 'పుస్తకంలో గీత (-) అంటే ఆ జిల్లాలో ఏవీ లేవు.'),
 # health
 'govt_general_hospitals_2024': (None, 'ప్రభుత్వ సాధారణ ఆసుపత్రులు (జిల్లా, ఏరియా ఆసుపత్రులు, సామాజిక ఆరోగ్య కేంద్రాలతో కలిపి)', None),
 'govt_hospitals_total_2024': (None, 'అన్ని ప్రభుత్వ ఆసుపత్రులు', 'ప్రాథమిక ఆరోగ్య కేంద్రాలు, డిస్పెన్సరీలు ఈ మొత్తంలో లేవు; అవి వేరుగా ఉన్నాయి.'),
 'primary_health_centres_2024': (None, 'ప్రాథమిక ఆరోగ్య కేంద్రాలు', None),
 'govt_hospital_beds_2024': (None, 'ప్రభుత్వ ఆసుపత్రులు, ఆరోగ్య కేంద్రాల్లో పడకలు', None),
 'institutional_deliveries_2023_24': (None, 'ఆసుపత్రి లేదా ఆరోగ్య కేంద్రంలో జరిగిన కాన్పులు', None),
 'child_immunisation_2023_24': (None, 'టీకాలు వేసిన పిల్లలు', 'పూర్తిగా టీకాలు వేసినవారా, మొత్తం టీకాలా అనేది పట్టిక చెప్పలేదు.'),
 'maternal_mortality_ratio_2023_24': (None, 'గర్భం లేదా కాన్పు సమయంలో చనిపోయిన తల్లులు, 1,00,000 సజీవ జననాలకు', 'ఆరోగ్య శాఖ సొంత రికార్డుల నుంచి; జాతీయ నమూనా సర్వే (SRS) అంకెలతో పోల్చలేం.'),
 'infant_mortality_rate_2023_24': (None, 'ఏడాది నిండకముందే చనిపోయిన శిశువులు, 1,000 సజీవ జననాలకు', 'ఆరోగ్య శాఖ సొంత రికార్డుల నుంచి; జాతీయ నమూనా సర్వే (SRS) అంకెలతో పోల్చలేం.'),
 # education
 'schools_total_all_managements': (None, 'అన్ని రకాల బడులు, ప్రభుత్వ, ప్రైవేటు', 'కేంద్రీయ, నవోదయ విద్యాలయాలు ఇందులో లేవు.'),
 'school_enrolment_total': (None, 'బడుల్లో చేరిన పిల్లలు', 'కేంద్రీయ, నవోదయ విద్యాలయాలు ఇందులో లేవు.'),
 'school_teachers_total': (None, 'బడుల్లో ఉపాధ్యాయులు', 'కేంద్రీయ, నవోదయ విద్యాలయాలు ఇందులో లేవు.'),
 'schools_mpp_zpp': (None, 'మండల, జిల్లా పరిషత్ బడులు', 'మండల, జిల్లా పరిషత్ బడులు మాత్రమే; రాష్ట్ర, కేంద్ర, మున్సిపల్ బడులు వేరు.'),
 'enrolment_mpp_zpp': (None, 'మండల, జిల్లా పరిషత్ బడుల్లో పిల్లలు', None),
 'schools_private_unaided': (None, 'ప్రభుత్వ సాయం లేని ప్రైవేటు బడులు', 'గుర్తింపు లేని బడులు, మదర్సాలు కూడా ఇందులో ఉన్నాయి.'),
 'enrolment_private_unaided': (None, 'సాయం లేని ప్రైవేటు బడుల్లో పిల్లలు', 'గుర్తింపు లేని బడులు, మదర్సాలు కూడా ఇందులో ఉన్నాయి.'),
 'ger_primary_i_v': (None, '1 నుంచి 5 తరగతుల్లో నమోదు నిష్పత్తి', 'ఆ వయసు పిల్లల అంచనా జనాభాతో పోలిస్తే నమోదైనవారు; వేరే వయసు లేదా వేరే జిల్లా పిల్లలు చదివితే 100 దాటవచ్చు.'),
 'ger_secondary_ix_x': (None, '9, 10 తరగతుల్లో నమోదు నిష్పత్తి', 'ఆ వయసు పిల్లల అంచనా జనాభాతో పోలిస్తే నమోదైనవారు; 100 దాటవచ్చు.'),
 'dropout_primary_i_v': (None, '1 నుంచి 5 తరగతుల్లో బడి మానేసినవారు, సగటు శాతం', 'మైనస్ విలువలను పుస్తకం సున్నాగా ముద్రించింది; సున్నా అంటే ఎవరూ మానలేదని కాదు.'),
 'dropout_secondary_ix_x': (None, '9, 10 తరగతుల్లో బడి మానేసినవారు, సగటు శాతం', 'మైనస్ విలువలను పుస్తకం సున్నాగా ముద్రించింది; సున్నా అంటే ఎవరూ మానలేదని కాదు.'),
 'ssc_appeared': (None, 'పదో తరగతి (SSC) పరీక్ష రాసినవారు', 'రెగ్యులర్ విద్యార్థులు మాత్రమే; ప్రైవేటు, సప్లిమెంటరీ కాదు.'),
 'ssc_passed': (None, 'పదో తరగతి (SSC) ఉత్తీర్ణులు', 'రెగ్యులర్ విద్యార్థులు మాత్రమే; ప్రైవేటు, సప్లిమెంటరీ కాదు.'),
 'ssc_pass_percentage': (None, 'పదో తరగతి (SSC) ఉత్తీర్ణత శాతం', 'మార్చి 2024 పరీక్ష, రెగ్యులర్ విద్యార్థులు మాత్రమే.'),
 'junior_colleges': (None, 'జూనియర్ కళాశాలలు (ఇంటర్మీడియట్)', None),
 'junior_college_enrolment': (None, 'జూనియర్ కళాశాలల్లో విద్యార్థులు', None),
 'degree_colleges': (None, 'డిగ్రీ కళాశాలలు, ప్రభుత్వ, ఎయిడెడ్', 'ప్రభుత్వ, ఎయిడెడ్ కళాశాలలు మాత్రమే; సాయం లేని ప్రైవేటు కళాశాలలు ఈ పట్టికలో లేవు.'),
 'engineering_colleges': (None, 'ఇంజనీరింగ్ (బీటెక్) కళాశాలలు', None),
 'engineering_admissions': (None, 'ఇంజనీరింగ్ కళాశాలల్లో ప్రవేశాలు', '2023-24లో చేరినవారు; మొత్తం విద్యార్థులు కాదు.'),
 'iti_institutes': (None, 'పారిశ్రామిక శిక్షణ సంస్థలు (ఐటీఐ)', None),
 'medical_colleges': (None, 'వైద్య (ఎంబీబీఎస్) కళాశాలలు, ప్రభుత్వ, ప్రైవేటు', 'గీత (-) అంటే 2023-24లో ఆ జిల్లాలో వైద్య కళాశాల లేదు.'),
 'medical_college_seats': (None, 'వైద్య కళాశాలల్లో ఏటా సీట్లు', 'గీత (-) అంటే 2023-24లో ఆ జిల్లాలో వైద్య కళాశాల లేదు.'),
 'sc_welfare_hostels': (None, 'ఎస్సీ విద్యార్థులకు ప్రభుత్వ వసతి గృహాలు', 'పది ముందు, పది తర్వాత వసతి గృహాలు కలిపి.'),
 'tribal_welfare_schools_and_hostels': (None, 'గిరిజన సంక్షేమ గురుకులాలు, ఆశ్రమ పాఠశాలలు, వసతి గృహాలు', 'నాలుగు రకాలను పుస్తకమే కలిపి ముద్రించింది.'),
 'bc_welfare_pre_matric_hostels': (None, 'బీసీ విద్యార్థులకు ప్రభుత్వ వసతి గృహాలు, పదో తరగతి వరకు', None),
 'bc_welfare_post_matric_hostels': (None, 'బీసీ విద్యార్థులకు ప్రభుత్వ వసతి గృహాలు, పదో తరగతి తర్వాత', None),
 # welfare
 'pensions_all_kinds_total': (None, 'అన్ని రకాల సామాజిక భద్రతా పింఛన్లు (వృద్ధులు, వితంతువులు, దివ్యాంగులు, ఇతరులు)', '31 మార్చి 2024న చెల్లిస్తున్న పింఛన్లు; అర్హులైనవారి సంఖ్య కాదు.'),
 'pensions_old_age': (None, 'వృద్ధాప్య పింఛన్లు', '31 మార్చి 2024న చెల్లిస్తున్నవి.'),
 'ration_cards_total': (None, 'రాయితీ ఆహార ధాన్యాల రేషన్ కార్డులు, అన్ని రకాలు', None),
 'fair_price_shops': (None, 'రేషన్ దుకాణాలు', None),
 'tap_connections_given_up_to_31_03_2023': (None, '31 మార్చి 2023 వరకు ఇళ్లకు ఇచ్చిన కుళాయి కనెక్షన్లు', 'గ్రామీణ నీటి సరఫరా శాఖ అంకెలు; ఎక్కువగా గ్రామీణ ఇళ్లే. పట్టిక శాతం ఇవ్వలేదు.'),
 'tap_connections_given_2023_24': (None, '2023-24లో కొత్తగా ఇచ్చిన కుళాయి కనెక్షన్లు', 'గ్రామీణ నీటి సరఫరా శాఖ అంకెలు; ఎక్కువగా గ్రామీణ ఇళ్లే.'),
 'tap_table_total_households': (None, 'కుళాయి కనెక్షన్ల కోసం లెక్కించిన మొత్తం ఇళ్లు', 'గ్రామీణ నీటి సరఫరా శాఖ అంకెలు; ఎక్కువగా గ్రామీణ ఇళ్లే.'),
 'self_help_groups': (None, 'మహిళా స్వయం సహాయక సంఘాలు (ఇప్పటివరకు ఏర్పడినవి)', 'ఏళ్ల తరబడి ఏర్పడిన సంఘాల మొత్తం; 2023-24లో ఏర్పడినవి మాత్రమే కాదు.'),
 'self_help_groups_bank_credit_2023_24': (None, '2023-24లో స్వయం సహాయక సంఘాలకు బ్యాంకు రుణాలు', None),
 'anganwadi_centres': (None, 'అంగన్‌వాడీ కేంద్రాలు (ప్రధాన, మినీ)', None),
 'anganwadi_children_benefitted': (None, 'అంగన్‌వాడీల ద్వారా లబ్ధి పొందిన పిల్లలు', None),
 'rural_job_guarantee_women_worked': (None, 'గ్రామీణ ఉపాధి హామీలో పని పొందిన మహిళలు', 'కనీసం ఒక్కసారి పని చేసినవారు; పని దినాలు కాదు. పుస్తకం పని దినాలు ముద్రించలేదు.'),
 'rural_job_guarantee_men_worked': (None, 'గ్రామీణ ఉపాధి హామీలో పని పొందిన పురుషులు', 'కనీసం ఒక్కసారి పని చేసినవారు; పని దినాలు కాదు.'),
 'rural_job_guarantee_total_wages': (None, 'గ్రామీణ ఉపాధి హామీలో చెల్లించిన కూలీ, మొత్తం', None),
 'rural_job_guarantee_women_wages': (None, 'గ్రామీణ ఉపాధి హామీలో మహిళలకు చెల్లించిన కూలీ', None),
 'houses_completed_weaker_sections_2023_24': (None, '2023-24లో బలహీన వర్గాలకు పూర్తయిన ఇళ్లు', None),
 # infrastructure
 'national_highway_km_2024': (None, 'జాతీయ రహదారుల పొడవు', None),
 'state_roads_rb_km_2024': (None, 'రోడ్లు, భవనాల శాఖ రాష్ట్ర రహదారుల పొడవు', None),
 'panchayat_raj_roads_km_2024': (None, 'పంచాయతీ రాజ్ గ్రామ రోడ్ల పొడవు', 'చాలా జిల్లాల్లో సగానికి పైగా మట్టి (కంకర లేని) రోడ్లు.'),
 'motor_vehicles_on_road_2024': (None, 'రోడ్డుపై ఉన్న మోటారు వాహనాలు, అన్ని రకాలు', 'వాహనం నమోదైన జిల్లా ప్రకారం; నడిచే చోటు ప్రకారం కాదు.'),
 'power_consumption_total_2023_24': (None, 'విద్యుత్ వినియోగం, అన్ని రకాల వినియోగదారులు', 'మిలియన్ యూనిట్లు (kWh).'),
 'power_agriculture_lt_2023_24': (None, 'వ్యవసాయ పంపుసెట్ల విద్యుత్ వినియోగం (లో టెన్షన్)', 'ఎత్తిపోతల వంటి పెద్ద వ్యవసాయ కనెక్షన్లు హై టెన్షన్ అంకెలో ఉన్నాయి.'),
 'power_agriculture_ht_2023_24': (None, 'ఎత్తిపోతల వంటి పెద్ద వ్యవసాయ కనెక్షన్ల విద్యుత్ (హై టెన్షన్)', None),
 'post_offices_2024': (None, 'తపాలా కార్యాలయాలు, అన్ని రకాలు', 'ఎక్కువ భాగం గ్రామాల్లోని చిన్న బ్రాంచ్ తపాలా కార్యాలయాలు.'),
 # safety
 'police_civil_men_actual': (None, 'పనిలో ఉన్న సివిల్ పోలీసు సిబ్బంది (కానిస్టేబుల్, ఎస్సై)', 'రాష్ట్ర మొత్తంలో ఏ జిల్లాకు చెందని ప్రత్యేక విభాగాలు, బెటాలియన్లు కూడా ఉన్నాయి; అందుకే జిల్లాలు కలిపితే రాష్ట్ర అంకె రాదు.'),
 'police_civil_men_sanctioned': (None, 'మంజూరైన సివిల్ పోలీసు పోస్టులు (కానిస్టేబుల్, ఎస్సై)', 'రాష్ట్ర మొత్తంలో ఏ జిల్లాకు చెందని ప్రత్యేక విభాగాలు కూడా ఉన్నాయి.'),
 'police_civil_officers_actual': (None, 'పనిలో ఉన్న సివిల్ పోలీసు అధికారులు (ఇన్‌స్పెక్టర్, ఆపైన)', 'రాష్ట్ర మొత్తంలో ఏ జిల్లాకు చెందని ప్రత్యేక విభాగాలు కూడా ఉన్నాయి.'),
 'ipc_crimes_total_2023': (None, 'పోలీసులు నమోదు చేసిన తీవ్రమైన నేరాలు (ఐపీసీ)', 'పోలీసులు నమోదు చేసినవి; పెరిగితే ఎక్కువ ఫిర్యాదులు నమోదైనట్లు కూడా కావచ్చు.'),
 # local
 'gram_panchayats_income': (None, 'గ్రామ పంచాయతీల ఆదాయం', 'ఆడిట్ అయిన పంచాయతీలు మాత్రమే.'),
 'gram_panchayats_expenditure': (None, 'గ్రామ పంచాయతీల ఖర్చు', 'ఆడిట్ అయిన పంచాయతీలు మాత్రమే.'),
 # environment
 'forest_area_2023_24': (None, 'అటవీ భూమి (చట్టం ప్రకారం)', 'చట్టపరమైన అటవీ భూమి; ఉపగ్రహం చూపే చెట్ల విస్తీర్ణం కాదు.'),
 'forest_share_of_area_2023_24': (None, 'జిల్లా భూమిలో అడవి శాతం', None),
 # tourism
 'tourist_arrivals_domestic_2023': (None, 'దేశంలోని సందర్శకులు', 'సందర్శనల సంఖ్య; ఒకరే రెండుసార్లు వస్తే రెండు.'),
 'tourist_arrivals_foreign_2023': (None, 'విదేశీ సందర్శకులు', 'సందర్శనల సంఖ్య; ఒకరే రెండుసార్లు వస్తే రెండు.'),
}

# Notes on one district's figure, in both languages. Only where the reader of that district must know.
NOTES = {
 ('documents_registered_2023_24', 'Alluri Sitharama Raju'): ('The book prints only 150 documents for this district.', 'ఈ జిల్లాకు పుస్తకం 150 దస్తావేజులే ముద్రించింది.'),
 ('registration_revenue_2023_24', 'Alluri Sitharama Raju'): ('The book prints only ₹3.88 lakh, from 150 documents.', 'పుస్తకం 150 దస్తావేజుల నుంచి ₹3.88 లక్షలే ముద్రించింది.'),
 ('degree_colleges', 'Krishna'): ('The book prints 6 in its totals part but 7 in another part of the same table.', 'అదే పట్టికలో ఒక భాగంలో 6, మరో భాగంలో 7 అని ముద్రించారు.'),
 ('engineering_admissions', 'Sri Potti Sriramulu Nellore'): ('The book shows a government college here but prints no admissions for it.', 'ఇక్కడ ఒక ప్రభుత్వ కళాశాల చూపారు కానీ దాని ప్రవేశాలు ముద్రించలేదు.'),
 ('bc_welfare_post_matric_hostels', 'Parvathipuram Manyam'): ('This row is the same as the district\'s pre-matric row; it may be a copying error in the book.', 'ఈ వరుస పదో తరగతి ముందు వసతి గృహాల వరుసలాగే ఉంది; పుస్తకంలో పొరపాటు కావచ్చు.'),
 ('gram_panchayats_expenditure', 'Guntur'): ('Guntur and Bapatla print the same figure, 8,047.24; it may be a copying error.', 'గుంటూరు, బాపట్ల రెండింటికీ ఒకే అంకె 8,047.24 ముద్రించారు; పొరపాటు కావచ్చు.'),
 ('gram_panchayats_expenditure', 'Bapatla'): ('Guntur and Bapatla print the same figure, 8,047.24; it may be a copying error.', 'గుంటూరు, బాపట్ల రెండింటికీ ఒకే అంకె 8,047.24 ముద్రించారు; పొరపాటు కావచ్చు.'),
 ('dropout_secondary_ix_x', 'Visakhapatnam'): ('0.00 here means the worked-out rate was below zero, not that no child dropped out.', 'ఇక్కడ 0.00 అంటే లెక్కించిన రేటు సున్నా కంటే తక్కువ వచ్చింది; ఎవరూ మానలేదని కాదు.'),
 ('dropout_secondary_ix_x', 'NTR'): ('0.00 here means the worked-out rate was below zero, not that no child dropped out.', 'ఇక్కడ 0.00 అంటే లెక్కించిన రేటు సున్నా కంటే తక్కువ వచ్చింది; ఎవరూ మానలేదని కాదు.'),
 ('forest_area_2023_24', 'West Godavari'): ('The book prints a dash: no notified forest in this district.', 'పుస్తకంలో గీత: ఈ జిల్లాలో ప్రకటిత అటవీ భూమి లేదు.'),
}
# A state row that differs from its district rows by rounding: said once, in words.
STATE_NOTE = {
 'forest_area_2023_24': ('The book\'s state row is 2 sq km off its district rows, from rounding.', 'రాష్ట్ర వరుస జిల్లా వరుసల కంటే 2 చ.కి.మీ. తేడా; రౌండింగ్ వల్ల.'),
 'national_highway_km_2024': ('The book\'s state row is 0.02 km off its district rows, from rounding.', 'రాష్ట్ర వరుస 0.02 కి.మీ. తేడా; రౌండింగ్ వల్ల.'),
 'power_consumption_total_2023_24': ('The book\'s state row is 0.02 million units off its district rows, from rounding.', 'రాష్ట్ర వరుస 0.02 మిలియన్ యూనిట్ల తేడా; రౌండింగ్ వల్ల.'),
 'power_agriculture_ht_2023_24': ('The book\'s state row is 0.02 million units off its district rows, from rounding.', 'రాష్ట్ర వరుస 0.02 మిలియన్ యూనిట్ల తేడా; రౌండింగ్ వల్ల.'),
 'degree_colleges': ('The book\'s state row prints 229; its district rows add to 228 (see Krishna).', 'రాష్ట్ర వరుస 229; జిల్లా వరుసలు 228 (కృష్ణా చూడండి).'),
 'police_civil_men_actual': ('The state figure includes battalions and special units that belong to no district.', 'రాష్ట్ర అంకెలో ఏ జిల్లాకు చెందని బెటాలియన్లు, ప్రత్యేక విభాగాలు ఉన్నాయి.'),
 'police_civil_men_sanctioned': ('The state figure includes battalions and special units that belong to no district.', 'రాష్ట్ర అంకెలో ఏ జిల్లాకు చెందని బెటాలియన్లు, ప్రత్యేక విభాగాలు ఉన్నాయి.'),
 'police_civil_officers_actual': ('The state figure includes battalions and special units that belong to no district.', 'రాష్ట్ర అంకెలో ఏ జిల్లాకు చెందని బెటాలియన్లు, ప్రత్యేక విభాగాలు ఉన్నాయి.'),
 'ipc_crimes_total_2023': ('The state figure includes railway police units that belong to no district.', 'రాష్ట్ర అంకెలో ఏ జిల్లాకు చెందని రైల్వే పోలీసు విభాగాలు ఉన్నాయి.'),
 'rain_actual_2023_24': ('The state figure is an average over the land, not a total.', 'రాష్ట్ర అంకె భూభాగ సగటు; మొత్తం కాదు.'),
}
UNIT_FIX = {'maternal_mortality_ratio_2023_24': 'per 1,00,000 live births', 'infant_mortality_rate_2023_24': 'per 1,000 live births'}
EN_LABEL_FIX = {
 'gva_current_2022_23': 'Value of all goods and services produced in the district (current prices)',
 'rural_job_guarantee_women_worked': 'Women who got work under the rural job guarantee',
}


def main():
    rows = []
    for f in 'abcd':
        for m in json.load(open(os.path.join(SRC, f + '.json')))['measures']:
            m['values'] = {RENAME.get(k, k): v for k, v in m['values'].items()}
            rows.append(m)
    by_id = {m['id']: m for m in rows}
    missing = [k for k in M if k not in by_id]
    assert not missing, missing
    out = []
    for key, theme_en, theme_te in THEMES:
        for mid, (theme_over, te, cav_te) in M.items():
            m = by_id[mid]
            if (theme_over or m['theme']) != key:
                continue
            unit = UNIT_FIX.get(mid, m['unit'])
            assert unit in UNITS, (mid, unit)
            ue, ut, kind = UNITS[unit]
            assert set(m['values']) == set(D26), (mid, set(m['values']) ^ set(D26))
            year = m['year'].split(' (table')[0]
            assert year in YEAR_TE, (mid, year)
            year_te = YEAR_TE[year]
            year = YEAR_EN_FIX.get(year, year)
            notes = {d: {'en': en, 'te': tt} for (i, d), (en, tt) in NOTES.items() if i == mid}
            sn = STATE_NOTE.get(mid)
            if m['check'].get('matches_state') is False and not sn:
                sys.exit(f'{mid}: state row does not match and no note says why')
            out.append({
                'id': mid, 'theme': key, 'en': EN_LABEL_FIX.get(mid, m['label_en']), 'te': te,
                'unit_en': ue, 'unit_te': ut, 'kind': kind, 'year_en': year, 'year_te': year_te,
                'table': m['table'], 'page': m['pdf_page'], 'column': m['column'], 'source': m['source_line'].replace('Source :', 'Source:').strip(),
                'values': {d: m['values'][d] for d in D26}, 'state': m['state_printed'],
                'state_note': {'en': sn[0], 'te': sn[1]} if sn else None,
                'caveat': {'en': m.get('caveat_en'), 'te': cav_te} if m.get('caveat_en') and cav_te else None,
                'notes': notes,
            })
    doc = {
        'paper': {'title': 'Statistical Abstract, Andhra Pradesh 2024', 'title_te': 'గణాంక సంక్షిప్తం, ఆంధ్రప్రదేశ్ 2024',
                  'by': 'Directorate of Economics and Statistics, Government of Andhra Pradesh',
                  'by_te': 'అర్థ, గణాంక శాఖ, ఆంధ్రప్రదేశ్ ప్రభుత్వం', 'foreword': '2025-08-21', 'pages': 788,
                  'url': None, 'read_on': '2026-10-19'},
        'themes': [{'key': k, 'en': e, 'te': t, 'n': sum(1 for o in out if o['theme'] == k)} for k, e, t in THEMES],
        'measures': out,
    }
    for p in (OUT_SITE, OUT_SEED):
        os.makedirs(os.path.dirname(p), exist_ok=True)
        json.dump(doc, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=None, separators=(',', ':'))
    print(len(out), 'measures;', ', '.join(f"{t['key']} {t['n']}" for t in doc['themes']))


if __name__ == '__main__':
    main()
