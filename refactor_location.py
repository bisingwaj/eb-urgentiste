import sys

filepath = 'src/screens/urgentiste/LiveMapTab.tsx'

with open(filepath, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# 1. Injecter l'import
import_statement = "import { useLiveMapLocation } from \"./liveMapHooks/useLiveMapLocation\";\n"
lines.insert(63, import_statement)

content = "".join(lines)

# 2. Remplacer les déclarations d'état par le hook
state_start = "  const [myLocation, setMyLocation] = useState<Location.LocationObject | null>(\n    null,\n  );\n  const [gpsReady, setGpsReady] = useState(false);\n"
state_end = "  const [battery] = useState(87);\n"

# Extraire le bloc d'état et le bloc myCoords
s_idx = content.find(state_start)
e_idx = content.find(state_end) + len(state_end)

hook_call = "  const { myLocation, gpsReady, speed, accuracy, battery, headingResolved, myCoords } = useLiveMapLocation(isFocused);\n"

if s_idx != -1:
    content = content[:s_idx] + hook_call + content[e_idx:]


mycoords_start = "  const myCoords = useMemo(\n    () =>"
mycoords_end = "    [myLocation],\n  );\n"
c_s_idx = content.find(mycoords_start)
c_e_idx = content.find(mycoords_end) + len(mycoords_end)

if c_s_idx != -1:
    content = content[:c_s_idx] + content[c_e_idx:]


# 3. Supprimer la constante DEFAULT_COORDS qui a été déplacée
content = content.replace("const DEFAULT_COORDS = { latitude: -4.3224, longitude: 15.307 };\n", "")
content = content.replace("import { useMapPuckHeading } from \"../../hooks/useMapPuckHeading\";\n", "")


# 4. Supprimer le bloc d'effets GPS (updateTelemetry et watchPositionAsync)
effect_start = "  const updateTelemetry = useCallback((loc: Location.LocationObject) => {"
effect_end = "      sub?.remove();\n    };\n  }, [isFocused, updateTelemetry]);\n"

eff_s_idx = content.find(effect_start)
eff_e_idx = content.find(effect_end) + len(effect_end)

if eff_s_idx != -1:
    content = content[:eff_s_idx] + content[eff_e_idx:]

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print("Extraction de location terminee. Succes.")
