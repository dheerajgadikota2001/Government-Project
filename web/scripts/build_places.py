"""Preview copy of the backend's place readings: same seed, same rules, keyed by the live project id."""
import glob, json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.join(HERE, '..', '..', 'work', 'paging-device', 'backend')
sys.path.insert(0, BACKEND)
from app.services.project_places import readings_by_project, load, summary  # noqa: E402
seed, index = load()
readings = readings_by_project(seed, index)
ids = {}
for f in glob.glob(os.path.join(HERE, '..', '..', 'live', 'reg', '*.json')) + [os.path.join(HERE, '..', '..', 'live', 'reg613.json')]:
    d = json.load(open(f)); ids[(d['source_portal'], d.get('external_id'))] = d['id']
out = {}
for key, rows in readings.items():
    pid = ids.get(key)
    if pid is None:
        raise SystemExit(f'no live project for {key}')
    out[str(pid)] = {'summary': summary(rows), 'readings': rows}
json.dump(out, open(os.path.join(HERE, '..', 'src', 'data', 'places.json'), 'w', encoding='utf-8'), ensure_ascii=False)
print(len(out), 'projects with readings')
