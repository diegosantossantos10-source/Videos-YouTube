"""Lista de frames de prueba de un episodio: mitad de cada plano y el momento de máxima información de tarjetas/CTA."""
import json, sys
tl = json.load(open(sys.argv[1] + "/build/timeline.json", encoding="utf-8"))
fr = []
for b in tl["beats"]:
    if b["type"] == "card":
        fr.append(int((b["end"] - 0.5) * 30))
    elif b.get("cta"):
        fr.append(int((b["start"] + b["ev"]["tap"] + 0.9) * 30))
    else:
        fr.append(int((b["start"] + b["end"]) / 2 * 30))
print(",".join(map(str, fr)))
