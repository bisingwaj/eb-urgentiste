import sys

filepath = 'src/screens/urgentiste/LiveMapTab.tsx'

with open(filepath, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# 1. Ajouter l'import
import_statement = "import { LiveMapTacticalCard } from './components/LiveMapTacticalCard';\n"
lines.insert(26, import_statement)

content = "".join(lines)

# 2. Remplacer le JSX de la TacticalCard
card_start = "        {selection && destLngLat && ("
card_end = "        {/* ── Floating Action Buttons (Center right) ── */}"

s_card = content.find(card_start)
e_card = content.find(card_end)

if s_card != -1 and e_card != -1:
    card_replacement = """        <LiveMapTacticalCard
          selection={selection}
          destLngLat={destLngLat}
          selectionTitle={selectionTitle}
          selectionSubtitle={selectionSubtitle}
          clearSelection={clearSelection}
          routeLoading={routeLoading}
          selectedRoute={selectedRoute}
        />

"""
    content = content[:s_card] + card_replacement + content[e_card:]

# 3. Supprimer les styles extraits du StyleSheet
styles_to_remove = [
    "floatingInfoContainer:",
    "tacticalCard:",
    "cardHeader:",
    "statusDot:",
    "unitName:",
    "caseRef:",
    "statsRow:",
    "statItem:",
    "statDivider:",
    "statLabel:",
    "statValue:"
]

for style_name in styles_to_remove:
    style_start_str = f"  {style_name} {{"
    style_idx = content.find(style_start_str)
    if style_idx != -1:
        style_end_idx = content.find("  },\n", style_idx)
        if style_end_idx != -1:
            content = content[:style_idx] + content[style_end_idx + 5:]

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print("Extraction LiveMapTacticalCard terminee.")
