#!/usr/bin/env python3
"""Conservative pattern audit of reachable Git blobs and current source. Never prints secret values."""
import base64
import json
from pathlib import Path
import re
import subprocess

PATTERNS = {
    'private key': re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),
    'GitHub token': re.compile(rb'\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,})\b'),
    'OpenAI key': re.compile(rb'\bsk-(?:proj-)?[A-Za-z0-9_-]{40,}\b'),
    'AWS access key': re.compile(rb'\bAKIA[A-Z0-9]{16}\b'),
}

def findings(data):
    result = [kind for kind, pattern in PATTERNS.items() if pattern.search(data)]
    for match in re.finditer(rb'postgres(?:ql)?://[^\s/:]+:([^\s@]+)@', data):
        password = match.group(1).lower()
        if len(password) >= 8 and not any(part in password for part in (b'change', b'example', b'password', b'placeholder', b'${', b'ci-', b'replace')):
            result.append('database credential candidate')
    for match in re.finditer(rb'eyJ[A-Za-z0-9_-]+\.(eyJ[A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+', data):
        try:
            claims = json.loads(base64.urlsafe_b64decode(match.group(1) + b'==='))
            if claims.get('role') == 'service_role': result.append('Supabase service-role key')
        except (ValueError, UnicodeDecodeError): pass
    return sorted(set(result))

def main():
    objects = subprocess.check_output(['git', 'rev-list', '--objects', '--all'], text=True).splitlines()
    count = 0
    alerts = []
    for line in objects:
        parts = line.split(' ', 1)
        if len(parts) != 2: continue
        oid, name = parts
        if subprocess.check_output(['git','cat-file','-t',oid],text=True).strip() != 'blob': continue
        data = subprocess.check_output(['git','cat-file','blob',oid])
        count += 1
        for kind in findings(data): alerts.append(f'{kind}: history {oid[:12]} {name}')
    names = subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard'],text=True).splitlines()
    for name in names:
        path = Path(name)
        if path.is_file():
            for kind in findings(path.read_bytes()): alerts.append(f'{kind}: working tree {name}')
    print(f'Scanned {count} reachable historical blobs and the current tracked/unignored source.')
    for alert in sorted(set(alerts)): print(alert)
    if alerts:
        print('Review candidates privately; rotate confirmed secrets before publication. No values were printed.')
        return 1
    print('No matching credential patterns found. This is a pattern scan, not proof that history contains no private data.')
    return 0

if __name__ == '__main__': raise SystemExit(main())
