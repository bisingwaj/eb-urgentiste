import sys

filepath = 'src/screens/urgentiste/LiveMapTab.tsx'

with open(filepath, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# 1. Injecter l'import à la ligne 50 (index 49)
import_statement = """import { 
  useLiveMapData, 
  PoiSelection, 
  HospitalData, 
  IncidentData, 
  RescuerData, 
  establishmentTypeLabel,
  ESTABLISHMENT_TYPE_KEYS,
  ESTABLISHMENT_TYPE_LABELS,
  normalizeEstablishmentType,
  incidentLngLat
} from "./liveMapHooks/useLiveMapData";\n"""

lines.insert(49, import_statement)

# 2. Supprimer les constantes (lignes 53 à 191 de l'original)
del lines[53:192]

content = "".join(lines)

# 3. Suppression des refs (texte exact)
content = content.replace("  const incidentFetchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(\n    null,\n  );\n", "")
content = content.replace("  const rescuerRealtimeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(\n    null,\n  );\n", "")

# 4. Suppression des states (texte exact)
content = content.replace("  const [rescuers, setRescuers] = useState<RescuerData[]>([]);\n", "")
content = content.replace("  const [hospitals, setHospitals] = useState<HospitalData[]>([]);\n", "")
content = content.replace("  const [incidents, setIncidents] = useState<IncidentData[]>([]);\n", "")

content = content.replace("  const [rescuerNames, setRescuerNames] = useState<Record<string, string>>({});\n", "")
content = content.replace("  /** Filtre multi-sélection : types d’établissements visibles sur la carte */\n  const [establishmentTypeFilter, setEstablishmentTypeFilter] = useState<\n    Record<string, boolean>\n  >(() => defaultEstablishmentFilter());\n", "")


# 5. Remplacement des useMemo
start_str = "  /** Filtre cercle 10 km (la bbox SQL peut inclure des coins hors rayon) */\n  const rescuersInView = useMemo(() => {"
end_str = "  const incidentsForMap = useMemo(() => {\n    let list = takeNearestByDistance(\n      incidentsInView,\n      userLngLat,\n      (inc) => incidentLngLat(inc),\n      MAX_INCIDENT_MARKERS_MAP,\n    );\n    if (\n      selection?.kind === \"incident\" &&\n      !list.some((i) => i.id === selection.data.id)\n    ) {\n      list = [selection.data, ...list].slice(0, MAX_INCIDENT_MARKERS_MAP);\n    }\n    return list;\n  }, [incidentsInView, userLngLat, selection]);\n"

start_idx = content.find(start_str)
end_idx = content.find(end_str)

hook_call = """  const {
    rescuersForMap,
    hospitalsForMap,
    incidentsForMap,
    rescuerNames,
    establishmentTypeFilter,
    toggleEstablishmentType,
    selectAllEstablishmentTypes,
    clearEstablishmentTypeFilter,
    fetchData
  } = useLiveMapData(isFocused, myCoords, selection, session?.user?.id);

"""

if start_idx != -1 and end_idx != -1:
    content = content[:start_idx] + hook_call + content[end_idx + len(end_str):]


# 6. Suppression de fetchData et des useEffects
fetch_start_str = "  const fetchData = useCallback(async () => {"
fetch_end_str = "      supabase.removeChannel(channel);\n    };\n  }, [fetchData, isFocused]);\n"

f_start_idx = content.find(fetch_start_str)
f_end_idx = content.find(fetch_end_str)

if f_start_idx != -1 and f_end_idx != -1:
    content = content[:f_start_idx] + content[f_end_idx + len(fetch_end_str):]

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print("Modification reussie. Index start:", start_idx, "Index fetch:", f_start_idx)
