import sys

filepath = 'src/screens/urgentiste/HomeTab.tsx'

with open(filepath, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# 1. Ajouter les imports
import_statements = "import { PulseRadar } from './components/PulseRadar';\nimport { AlertPulseIcon } from './components/AlertPulseIcon';\n"
lines.insert(28, import_statements)

content = "".join(lines)

# 2. Supprimer la déclaration de PulseRadar
pr_start = "// Helper component for pulsing the radar core"
pr_end = "};\n\n// Minimal Alert Pulse for Minimized Dashboard"

s_idx = content.find(pr_start)
e_idx = content.find(pr_end)

if s_idx != -1 and e_idx != -1:
    content = content[:s_idx] + content[e_idx:]

# 3. Supprimer la déclaration de AlertPulseIcon
api_start = "// Minimal Alert Pulse for Minimized Dashboard"
api_end = "};\n\nexport function HomeTab({ navigation }: any) {"

s_api_idx = content.find(api_start)
e_api_idx = content.find(api_end)

if s_api_idx != -1 and e_api_idx != -1:
    content = content[:s_api_idx] + content[e_api_idx:]

# 4. Supprimer les styles extraits du StyleSheet de HomeTab
styles_to_remove = [
    "radarContainer:",
    "radarWave:",
    "radarCore:",
    "alertIconPulseContainer:",
    "alertRadarWave:"
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

print("Extraction Radar Icons terminee.")
