import sys

filepath = 'src/screens/urgentiste/LiveMapTab.tsx'

with open(filepath, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# 1. Injecter l'import
import_statement = "import { useLiveMapRouting } from \"./liveMapHooks/useLiveMapRouting\";\n"
lines.insert(62, import_statement)

content = "".join(lines)

# 2. Suppression des refs (lastAnnouncedStepRef)
content = content.replace("  const lastAnnouncedStepRef = useRef(-1);\n", "")

# 3. Suppression des variables d'état de routing
content = content.replace("  const [selection, setSelection] = useState<PoiSelection | null>(null);\n", "")
content = content.replace("  const [routeList, setRouteList] = useState<RouteResult[]>([]);\n", "")
content = content.replace("  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);\n", "")
content = content.replace("  const [routeCriterion, setRouteCriterion] =\n    useState<RouteCriterion>(\"fastest\");\n", "")
content = content.replace("  const [routeInfo, setRouteInfo] = useState<{\n    distance: number;\n    duration: number;\n  } | null>(null);\n", "")
content = content.replace("  const [routeLoading, setRouteLoading] = useState(false);\n", "")
content = content.replace("  const [ttsStepIndex, setTtsStepIndex] = useState(0);\n", "")
content = content.replace("  const [autoTts, setAutoTts] = useState(false);\n", "")

# 4. Suppression de routeCriterionRef
content = content.replace("  const routeCriterionRef = useRef(routeCriterion);\n  routeCriterionRef.current = routeCriterion;\n\n", "")

# 5. Injection de l'appel au Hook useLiveMapRouting
hook_call = """  const {
    selection,
    setSelection,
    routeList,
    selectedRouteIndex,
    setSelectedRouteIndex,
    routeCriterion,
    setRouteCriterion,
    routeInfo,
    routeLoading,
    selectedRoute,
    destLngLat,
    ttsStepIndex,
    setTtsStepIndex,
    autoTts,
    setAutoTts,
    lastAnnouncedStepRef
  } = useLiveMapRouting(gpsReady, myCoords);

"""

# On va le placer juste avant le hook useLiveMapData
data_hook_start = "  const {\n    rescuersForMap,"
content = content.replace(data_hook_start, hook_call + data_hook_start)

# 6. Suppression de toute la logique de routing (destLngLat, selectedRoute et 3 useEffects)
# Il faut chercher de `  const destLngLat = useMemo` jusqu'à la fin de `  const selectedRoute = routeList[selectedRouteIndex] ?? null;`
start_str = "  const destLngLat = useMemo((): [number, number] | null => {"
end_str = "  const selectedRoute = routeList[selectedRouteIndex] ?? null;\n"

start_idx = content.find(start_str)
end_idx = content.find(end_str)

if start_idx != -1 and end_idx != -1:
    content = content[:start_idx] + content[end_idx + len(end_str):]
else:
    print("Erreur : Impossible de trouver le bloc complet de routing.")

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print("Extraction de routing terminee. Index:", start_idx)
