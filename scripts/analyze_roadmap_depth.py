import os
import json

ROADMAPS_DIR = 'public/data/roadmaps'
files = sorted([f for f in os.listdir(ROADMAPS_DIR) if f.endswith('.json')])

print(f"Inspecting {len(files)} roadmaps for practical student value...\n")

stats = []
for f in files:
    slug = f[:-5]
    with open(os.path.join(ROADMAPS_DIR, f), 'r', encoding='utf-8') as fp:
        d = json.load(fp)
    
    def analyze_nodes(nodes, depth=1):
        count = 0
        max_d = depth
        short_descs = 0
        total_desc_len = 0
        for n in nodes:
            count += 1
            desc = n.get('description', '')
            total_desc_len += len(desc)
            if len(desc) < 60:
                short_descs += 1
            children = n.get('children', [])
            if children:
                sub_c, sub_d, sub_short, sub_len = analyze_nodes(children, depth+1)
                count += sub_c
                max_d = max(max_d, sub_d)
                short_descs += sub_short
                total_desc_len += sub_len
        return count, max_d, short_descs, total_desc_len
    
    tree = d.get('tree', [])
    c, md, short_c, total_len = analyze_nodes(tree)
    avg_desc = total_len / max(c, 1)
    
    boost = d.get('boost', {})
    cps = boost.get('capstone_projects', [])
    certs = boost.get('certifications', [])
    interviews = boost.get('interview_focus', [])
    
    stats.append({
        'slug': slug,
        'title': d.get('title'),
        'nodes': c,
        'max_depth': md,
        'short_nodes': short_c,
        'avg_desc_len': round(avg_desc),
        'capstones': len(cps),
        'certs': len(certs),
        'interviews': len(interviews)
    })

low_node_count = [s for s in stats if s['nodes'] < 15]
print(f"Roadmaps with < 15 nodes: {len(low_node_count)}")
for s in low_node_count:
    print(f"  - {s['slug']}: {s['nodes']} nodes")

low_avg_desc = [s for s in stats if s['avg_desc_len'] < 100]
print(f"\nRoadmaps with low avg description length (< 100 chars): {len(low_avg_desc)}")
for s in low_avg_desc:
    print(f"  - {s['slug']}: avg {s['avg_desc_len']} chars")

short_nodes_total = sum(s['short_nodes'] for s in stats)
print(f"\nTotal nodes across all roadmaps with short descriptions (< 60 chars): {short_nodes_total}")

print(f"\nDetailed Distribution:")
print(f"- Node count: min={min(s['nodes'] for s in stats)}, max={max(s['nodes'] for s in stats)}, avg={sum(s['nodes'] for s in stats)/len(stats):.1f}")
print(f"- Avg description length across all: {sum(s['avg_desc_len'] for s in stats)/len(stats):.1f} chars")
print(f"- Capstones per roadmap: min={min(s['capstones'] for s in stats)}, max={max(s['capstones'] for s in stats)}")
print(f"- Interview focus per roadmap: min={min(s['interviews'] for s in stats)}, max={max(s['interviews'] for s in stats)}")
print(f"- Certifications per roadmap: min={min(s['certs'] for s in stats)}, max={max(s['certs'] for s in stats)}")
