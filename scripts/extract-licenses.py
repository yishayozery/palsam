import openpyxl, sys, io, json, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

wb = openpyxl.load_workbook('4/אלפון מלא 22.06.2026.xlsx', read_only=True, data_only=True)
ws = wb.worksheets[0]

results = []
license_types = set()
permit_types = set()
cert_types = set()

for i, row in enumerate(ws.iter_rows(min_row=2, values_only=True)):
    vals = list(row)
    pn = str(vals[0]).strip() if vals[0] else ''
    if not pn: continue

    license_type = str(vals[16]).strip() if vals[16] else ''
    license_detail = str(vals[17]).strip() if vals[17] else ''
    permits_raw = str(vals[18]).strip() if vals[18] else ''
    certs_raw = str(vals[19]).strip() if vals[19] else ''

    if license_type and license_type != 'לא הוזן' and license_type != 'None':
        license_types.add(license_type)
    if license_detail and license_detail != 'לא הוזן' and license_detail != 'None':
        license_types.add(license_detail)

    # Parse permits (comma separated, may have (number) suffix)
    permits = []
    if permits_raw and permits_raw != 'לא הוזן' and permits_raw != 'None':
        for p in permits_raw.split(','):
            p = p.strip()
            if p:
                clean = re.sub(r'\s*\(\d+\)\s*$', '', p).strip()
                if clean:
                    permits.append(clean)
                    permit_types.add(clean)

    # Parse certifications
    certs = []
    if certs_raw and certs_raw != 'לא הוזן' and certs_raw != 'None':
        for c in certs_raw.split(','):
            c = c.strip()
            if c:
                certs.append(c)
                cert_types.add(c)

    if permits or certs or (license_type and license_type != 'לא הוזן' and license_type != 'None'):
        results.append({
            'pn': pn.replace('.0', ''),
            'licenseType': license_type if license_type != 'לא הוזן' and license_type != 'None' else '',
            'licenseDetail': license_detail if license_detail != 'לא הוזן' and license_detail != 'None' else '',
            'permits': permits,
            'certs': certs,
        })

wb.close()

print(f"Soldiers with license/cert data: {len(results)}")
print(f"\nLicense types: {sorted(license_types)}")
print(f"\nPermit types: {sorted(permit_types)}")
print(f"\nCertification types: {sorted(cert_types)}")

print(f"\nSample records:")
for r in results[:10]:
    print(f"  {r}")

with open('4/licenses-certs.json', 'w', encoding='utf-8') as f:
    json.dump({'soldiers': results, 'permitTypes': sorted(permit_types), 'certTypes': sorted(cert_types)}, f, ensure_ascii=False, indent=2)
print(f"\nSaved to 4/licenses-certs.json")
