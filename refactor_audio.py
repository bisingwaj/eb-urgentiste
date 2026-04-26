import sys

filepath = 'src/screens/urgentiste/LiveMapTab.tsx'

with open(filepath, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# 1. Injecter l'import
import_statement = "import { useLiveMapAudio } from \"./liveMapHooks/useLiveMapAudio\";\n"
lines.insert(64, import_statement)

content = "".join(lines)

# 2. Remplacer l'import initial de speechSafe pour retirer speakFrench (stopSpeech est gardé si besoin ailleurs)
# En fait, stopSpeech est utilisé dans clearSelection, on va juste le récupérer depuis notre hook.
content = content.replace("import { speakFrench, stopSpeech } from \"../../lib/speechSafe\";\n", "import { stopSpeech } from \"../../lib/speechSafe\";\n")

# 3. Supprimer les effets TTS et les callbacks
tts_effect_start = "  useEffect(() => {\n    if (!autoTts || !myLocation || !selectedRoute?.steps?.length) return;\n"
tts_effect_end = "  }, [myLocation, autoTts, selectedRoute]);\n"

tts_s_idx = content.find(tts_effect_start)
tts_e_idx = content.find(tts_effect_end) + len(tts_effect_end)

if tts_s_idx != -1:
    content = content[:tts_s_idx] + content[tts_e_idx:]

tts_repeat_start = "  const speakTtsRepeat = useCallback(() => {"
tts_next_end = "  }, [selectedRoute, ttsStepIndex]);\n"

# Puisqu'il y a deux callbacks qui se suivent avec la même fin, on trouve le début du premier, et la fin du DEUXIEME.
rep_s_idx = content.find(tts_repeat_start)
next_str = "  const speakTtsNext = useCallback(() => {"
next_s_idx = content.find(next_str)
next_e_idx = content.find(tts_next_end, next_s_idx) + len(tts_next_end)

if rep_s_idx != -1 and next_e_idx != -1:
    content = content[:rep_s_idx] + content[next_e_idx:]

# 4. Injecter l'appel au hook
hook_call = "  const { speakTtsRepeat, speakTtsNext } = useLiveMapAudio(autoTts, myLocation, selectedRoute, ttsStepIndex, setTtsStepIndex, lastAnnouncedStepRef);\n"

# Plaçons le sous l'appel useLiveMapRouting
routing_hook = "  } = useLiveMapRouting(gpsReady, myCoords);\n"
r_idx = content.find(routing_hook)
if r_idx != -1:
    content = content[:r_idx + len(routing_hook)] + "\n" + hook_call + content[r_idx + len(routing_hook):]

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print("Extraction Audio TTS terminee.")
