"""Stage the four supplied workbooks without modifying a database (requires openpyxl)."""
import hashlib
import json
import re
import uuid
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / '.migration'
FILES = ['12th passed out 2026.xlsx', 'DOC-20260912-WA0007.xlsx',
         'DOC-20260912-WA0008.xlsx', 'UG passed out 2026 database.xlsx']


def text(value):
    if value is None:
        return ''
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def phone(value):
    value = re.sub(r'\D', '', text(value))
    if len(value) == 12 and value.startswith('91'):
        value = value[2:]
    if len(value) == 11 and value.startswith('0'):
        value = value[1:]
    return value if re.fullmatch(r'[6-9]\d{9}', value) else None


def prepare():
    OUT.mkdir(exist_ok=True)
    leads, rejected, email_issues, files = [], [], [], []
    for filename, category in zip(FILES, 'ABCD'):
        path = ROOT / filename
        info = dict(file=filename, category=category, sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
                    total=0, inserted=0, duplicates=0, invalid=0)
        book = openpyxl.load_workbook(path, read_only=True, data_only=True)
        for sheet in book:
            rows = iter(sheet.values)
            headers = [text(v).upper() for v in next(rows)]
            for row_number, row in enumerate(rows, 2):
                if not any(v is not None and text(v) for v in row):
                    continue
                raw = {k: text(v) for k, v in zip(headers, row) if k}
                source = dict(file=filename, sheet=sheet.title, row=row_number, data=raw)
                info['total'] += 1
                name = raw.get('STUDENTNAME', raw.get('NAME', ''))
                mobile = phone(raw.get('MOBILE'))
                if not mobile or not 2 <= len(name) <= 200:
                    rejected.append(dict(**source, reason='Invalid mobile' if not mobile else 'Invalid name'))
                    info['invalid'] += 1
                    continue
                email = raw.get('EMAIL', '').lower()
                if email and not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email):
                    email_issues.append(dict(file=filename, row=row_number, original=email))
                    email = ''
                values = dict(id=str(uuid.uuid5(uuid.NAMESPACE_URL, f"{info['sha256']}:{sheet.title}:{row_number}")),
                              category=category, student_name=name, mobile=mobile, email=email or None,
                              address=raw.get('ADDRESS') or None,
                              city=raw.get('CITY', raw.get('DISTRICT')) or None,
                              pincode=raw.get('PINCODE', raw.get('PIN CODE')) or None,
                              country='India', medium='Excel import')
                qual = '12th (2026)' if filename.startswith('12th') else 'Graduate (2026)' if filename.startswith('UG') else None
                leads.append(dict(values, qualification=qual, _batch=filename,
                                  source_desc=filename,
                                  internal_notes='Excel source records (original values):\n' + json.dumps([source], ensure_ascii=False)))
                info['inserted'] += 1
        book.close()
        assert info['total'] == info['inserted'] + info['duplicates'] + info['invalid']
        files.append(info)
    records = leads
    report = dict(files=files, total_rows=sum(f['total'] for f in files), unique_leads=len(records),
                  distinct_phones=len({lead['mobile'] for lead in records}),
                  duplicate_rows=sum(f['duplicates'] for f in files), rejected_rows=len(rejected),
                  invalid_emails=len(email_issues))
    (OUT / 'leads.json').write_text(json.dumps(records, ensure_ascii=False), encoding='utf-8')
    (OUT / 'rejected.json').write_text(json.dumps(rejected, ensure_ascii=False, indent=2), encoding='utf-8')
    (OUT / 'email-issues.json').write_text(json.dumps(email_issues, ensure_ascii=False, indent=2), encoding='utf-8')
    (OUT / 'report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    prepare()
