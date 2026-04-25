import sys

filepath = 'src/screens/urgentiste/HomeTab.tsx'

with open(filepath, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# 1. Injecter les imports
import_statements = "import { useHomeDuty } from './homeHooks/useHomeDuty';\nimport { useHomeMissionPreview } from './homeHooks/useHomeMissionPreview';\n"
lines.insert(12, import_statements)

content = "".join(lines)

# 2. Remplacer les hooks locaux par l'appel de hooks
state_start_str = "  const [isDutyActive, setIsDutyActive] = useState(profile?.available ?? false);\n"
call_central_str = "  const handleCallCentral = () => {\n"

s_idx = content.find(state_start_str)
e_idx = content.find(call_central_str)

if s_idx != -1 and e_idx != -1:
    hooks_call = """
  const { isDutyActive, unitName, isHolding, holdProgress, handlePressIn, handlePressOut } = useHomeDuty(profile, isConnected, showDialog, refreshProfile);
  const {
    confirmProgress,
    isModalMinimized,
    setIsModalMinimized,
    userLocation,
    showMapPreview,
    setShowMapPreview,
    activeRoute,
    routeBounds,
    hasActiveAlert,
    isMissionAccepted,
    handleConfirmPressIn,
    handleConfirmPressOut,
    calculateDistance,
    getVictimMetadata,
    getMotifDAppel,
    capitalize
  } = useHomeMissionPreview(activeMission, navigation, updateDispatchStatus);
  const [isCalling, setIsCalling] = useState(false);
  const [showSymptoms, setShowSymptoms] = useState(false);

  const isPhonePulseActive = isCalling || !!activeCall;
"""
    content = content[:s_idx] + hooks_call + content[e_idx:]

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print("Extraction de HomeTab terminee.")
