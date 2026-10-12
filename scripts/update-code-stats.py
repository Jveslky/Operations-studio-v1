"""Count tracked source lines for the owner's development dashboard."""
import json
import subprocess
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXTENSIONS = {'.html', '.css', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.sql', '.py', '.sh'}


def count_sources(root):
    files = subprocess.check_output(['git', 'ls-files', '-z'], cwd=root).decode().split('\0')
    totals = Counter(application=0, database=0, tests=0)
    modules = Counter({name: 0 for name in ['Shop', 'Mobile', 'PersonalFleet', 'CommercialFleet', 'SnowDesk', 'Shared']})
    source_files = 0
    for name in filter(None, files):
        path = root / name
        if not path.is_file() or path.suffix.lower() not in EXTENSIONS:
            continue
        if any(part in {'node_modules', 'vendor', 'dist', 'build', 'generated'} for part in path.parts):
            continue
        if path.name.endswith(('.min.js', '.min.css')):
            continue
        group = 'tests' if name.startswith('tests/') else 'database' if path.suffix.lower() == '.sql' else 'application'
        lines = len(path.read_text(errors='replace').splitlines())
        totals[group] += lines
        if group == 'application':
            parts = Path(name).parts
            module = parts[1] if len(parts) > 2 and parts[0] == 'pages' and parts[1] in modules else 'Shared'
            modules[module] += lines
        source_files += 1
    return {'total': sum(totals.values()), 'files': source_files, **totals, 'modules': dict(modules)}


if __name__ == '__main__':
    stats = count_sources(ROOT)
    stats['branch'] = subprocess.check_output(['git', 'rev-parse', '--abbrev-ref', 'HEAD'], cwd=ROOT, text=True).strip()
    stats['updated_at'] = datetime.now(timezone.utc).isoformat()
    stats['commit'] = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    target = ROOT / 'data' / 'code-stats.json'
    target.parent.mkdir(exist_ok=True)
    target.write_text(json.dumps(stats, indent=2) + '\n')
    print(f"{stats['total']:,} source lines across {stats['files']} files")
