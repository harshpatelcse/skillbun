import sys
import json

if len(sys.argv) < 2:
    print("Usage: python inspect_roadmap_nodes.py <slug>")
    sys.exit(1)

slug = sys.argv[1]
with open(f"public/data/roadmaps/{slug}.json", "r", encoding="utf-8") as f:
    d = json.load(f)

print(f"=== {slug} ({d.get('title')}) ===")
def print_nodes(nodes, indent=0):
    for n in nodes:
        name = n.get('name') or n.get('title') or n.get('id')
        desc = n.get('description', '')
        print("  " * indent + f"- [{n.get('id')}] {name}")
        print("  " * indent + f"  {desc}")
        print_nodes(n.get('children', []), indent + 1)

print_nodes(d.get('tree', []))
