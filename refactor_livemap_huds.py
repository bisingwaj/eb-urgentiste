import sys

filepath = 'src/screens/urgentiste/LiveMapTab.tsx'

with open(filepath, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# 1. Ajouter les imports
import_statements = "import { LiveMapTelemetryHUD } from './components/LiveMapTelemetryHUD';\nimport { LiveMapLegendHUD } from './components/LiveMapLegendHUD';\n"
lines.insert(25, import_statements)

content = "".join(lines)

# 2. Remplacer Telemetry HUD
tel_start = "        {/* ── Bottom-left: Telemetry HUD (collapsible) ── */}"
tel_end = "        {/* ── Bottom-right: Legend HUD (collapsible) ── */}"

s_tel = content.find(tel_start)
e_tel = content.find(tel_end)

if s_tel != -1 and e_tel != -1:
    tel_replacement = """        {/* ── Bottom-left: Telemetry HUD (collapsible) ── */}
        <LiveMapTelemetryHUD 
          telemetryExpanded={telemetryExpanded}
          setTelemetryExpanded={setTelemetryExpanded}
          setLegendExpanded={setLegendExpanded}
          speed={speed}
          headingResolved={headingResolved}
          accuracy={accuracy}
          battery={battery}
        />

"""
    content = content[:s_tel] + tel_replacement + content[e_tel:]

# 3. Remplacer Legend HUD
leg_start = "        {/* ── Bottom-right: Legend HUD (collapsible) ── */}"
leg_end = "        {selection && destLngLat && ("

s_leg = content.find(leg_start)
e_leg = content.find(leg_end)

if s_leg != -1 and e_leg != -1:
    leg_replacement = """        {/* ── Bottom-right: Legend HUD (collapsible) ── */}
        <LiveMapLegendHUD 
          legendExpanded={legendExpanded}
          setLegendExpanded={setLegendExpanded}
          setTelemetryExpanded={setTelemetryExpanded}
          rescuersCount={rescuersForMap.length}
          rescuerTruncLegend={rescuerTruncLegend}
          hospitalsCount={hospitalsForMap.length}
          hospTruncLegend={hospTruncLegend}
          incidentsCount={incidentsForMap.length}
          incTruncLegend={incTruncLegend}
        />

"""
    content = content[:s_leg] + leg_replacement + content[e_leg:]

# 4. Nettoyer les styles de LiveMapTab.tsx
styles_to_remove = [
    "hudExpandedLeft:",
    "telemetryHUD:",
    "hudExpandedRight:",
    "legendHUD:",
    "hudPill:",
    "hudPillValue:",
    "hudExpandedCard:",
    "telRow:",
    "telLabel:",
    "telValue:",
    "legendRow:",
    "legendDot:",
    "legendText:"
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

print("Extraction LiveMap HUDs terminee.")
