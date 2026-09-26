import os
import json

ROADMAPS_DIR = 'public/data/roadmaps'
files = sorted([f for f in os.listdir(ROADMAPS_DIR) if f.endswith('.json')])

print(f"Auditing {len(files)} roadmaps...")

issues = []
legacy_format = []
overlapping_capstones = []
low_interview = []
short_capstone_desc = []

for f in files:
    p = os.path.join(ROADMAPS_DIR, f)
    with open(p, 'r', encoding='utf-8') as fp:
        d = json.load(fp)
    
    slug = f[:-5]
    title = d.get('title', slug)
    fmt = d.get('format')
    boost = d.get('boost', {})
    capstones = boost.get('capstone_projects', [])
    interview = boost.get('interview_focus', [])
    certs = boost.get('certifications', [])
    learn = d.get('learn', {})
    comps = learn.get('key_competencies', [])
    goal = d.get('goal', {})
    pillars = goal.get('career_pillars', [])
    roles = goal.get('target_roles', [])
    
    file_issues = []
    
    if fmt != 'tree':
        legacy_format.append(slug)
        file_issues.append(f'Legacy format ({fmt})')
    
    if len(capstones) < 2:
        file_issues.append(f'Only {len(capstones)} capstones')
    else:
        for idx, cp in enumerate(capstones):
            if len(cp.get('description', '')) < 80:
                short_capstone_desc.append((slug, idx, len(cp.get('description', ''))))
                file_issues.append(f'Capstone {idx+1} description too short ({len(cp.get("description", ""))} chars)')
        # Check title overlap
        t1 = capstones[0].get('title', '').lower()
        t2 = capstones[1].get('title', '').lower()
        w1 = set(t1.replace('&', '').replace('-', '').split())
        w2 = set(t2.replace('&', '').replace('-', '').split())
        overlap = len(w1 & w2) / max(len(w1), len(w2)) if max(len(w1), len(w2)) > 0 else 0
        if overlap >= 0.45:
            overlapping_capstones.append((slug, t1, t2))
            file_issues.append(f'Overlapping capstones: "{t1}" vs "{t2}"')
            
    if len(interview) < 4:
        low_interview.append(slug)
        file_issues.append(f'Only {len(interview)} interview focus areas')
        
    if len(comps) < 4:
        file_issues.append(f'Only {len(comps)} key competencies')
        
    if len(pillars) < 3:
        file_issues.append(f'Only {len(pillars)} career pillars')
        
    if file_issues:
        issues.append((slug, title, file_issues))

print(f"\nAudit Summary:")
print(f"- Total roadmaps: {len(files)}")
print(f"- Roadmaps with legacy format: {len(legacy_format)} -> {legacy_format}")
print(f"- Roadmaps with overlapping capstones: {len(overlapping_capstones)}")
print(f"- Roadmaps with short capstone descriptions: {len(short_capstone_desc)}")
print(f"- Roadmaps with fewer than 4 interview focus: {len(low_interview)}")
print(f"- Total roadmaps needing enhancements: {len(issues)}")

print("\nSample overlapping capstones:")
for s, t1, t2 in overlapping_capstones[:10]:
    print(f"  [{s}] 1: {t1} | 2: {t2}")
