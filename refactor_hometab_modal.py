import sys

filepath = 'src/screens/urgentiste/HomeTab.tsx'

with open(filepath, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# 1. Ajouter l'import du composant
import_component = "import { EmergencyDashboardModal } from './components/EmergencyDashboardModal';\n"
lines.insert(25, import_component)

content = "".join(lines)

# 2. Remplacer le JSX de la Modal par le composant atomisé
modal_start = "      {/* EMERGENCY DASHBOARD MODAL */}\n      <Modal\n        visible={hasActiveAlert && !isModalMinimized}"
modal_end = "      </Modal>\n\n      {/* MAIN UI - Using Fixed Layout"

s_idx = content.find(modal_start)
e_idx = content.find(modal_end)

if s_idx != -1 and e_idx != -1:
    modal_replacement = """      <EmergencyDashboardModal
        hasActiveAlert={hasActiveAlert}
        isModalMinimized={isModalMinimized}
        setIsModalMinimized={setIsModalMinimized}
        activeMission={activeMission}
        getVictimMetadata={getVictimMetadata}
        calculateDistance={calculateDistance}
        setShowMapPreview={setShowMapPreview}
        getMotifDAppel={getMotifDAppel}
        capitalize={capitalize}
        handleConfirmPressIn={handleConfirmPressIn}
        handleConfirmPressOut={handleConfirmPressOut}
        confirmProgress={confirmProgress}
        navigation={navigation}
      />

      {/* MAIN UI - Using Fixed Layout"""
    content = content[:s_idx] + modal_replacement + content[e_idx + len(modal_end):]

# 3. Supprimer les styles extraits du StyleSheet de HomeTab
styles_to_remove = [
    "missionModalContainer:",
    "missionModalHeader:",
    "headerTopRow:",
    "refBadge:",
    "refBadgeTxt:",
    "minimizeBtnDashboard:",
    "urgentHeaderRow:",
    "urgentTitle:",
    "dashboardScroll:",
    "dashboardCard:",
    "cardHeaderRow:",
    "cardLabel:",
    "victimNamePrimary:",
    "victimMetaRow:",
    "metaBadge:",
    "metaBadgeLbl:",
    "metaBadgeVal:",
    "locationAddrTxt:",
    "distRow:",
    "distInfo:",
    "distVal:",
    "distUnit:",
    "mapPreviewBtn:",
    "mapPreviewBtnTxt:",
    "incidentMotifTxtSmall:",
    "symptomsList:",
    "symptomItem:",
    "symptomQuest:",
    "symptomAns:",
    "noSymptomsTxt:",
    "incidentDescTxt:",
    "missionModalFooter:",
    "emergencyActionsRow:",
    "actionHintTextModal:",
    "btnDashboardPrimary:",
    "confirmButtonProgress:",
    "btnDashboardPrimaryTxt:",
    "refuseBtn:",
    "refuseBtnTxtLabel:",
]

# Simple heuristic string extraction to remove styles. 
# Finding start and end of style blocks.
for style_name in styles_to_remove:
    style_start_str = f"  {style_name} {{"
    style_idx = content.find(style_start_str)
    if style_idx != -1:
        # Find the closing brace of the style
        style_end_idx = content.find("  },\n", style_idx)
        if style_end_idx != -1:
            content = content[:style_idx] + content[style_end_idx + 5:]

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print("Extraction EmergencyDashboardModal terminee.")
