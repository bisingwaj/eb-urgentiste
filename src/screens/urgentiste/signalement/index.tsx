import React from 'react';
import { View, StatusBar, Animated } from 'react-native';
import { useSafeAreaInsets, SafeAreaView } from "react-native-safe-area-context";
import { styles } from './styles';
import { useSignalementLogic } from './useSignalementLogic';
import { MissionTimeline } from './components/MissionTimeline';
import { VictimContactStrip } from './components/VictimContactStrip';
import { TerrainPhotosStrip } from './components/TerrainPhotosStrip';
import { StepStandby } from './components/StepStandby';
import { StepReception } from './components/StepReception';
import { StepArrival } from './components/StepArrival';
import { StepAssessment } from './components/StepAssessment';
import { StepAid } from './components/StepAid';
import { StepDecision } from './components/StepDecision';
import { StepAssignment } from './components/StepAssignment';
import { StepTransportMode } from './components/StepTransportMode';
import { StepTransport } from './components/StepTransport';
import { StepClosure } from './components/StepClosure';
import { FullscreenMapModal } from '../../../components/map/FullscreenMapModal';
import { MapboxMapView } from '../../../components/map/MapboxMapView';
import { MePuck } from '../../../components/map/mapMarkers';
import Mapbox from "@rnmapbox/maps";
import { HeartPulse, Hospital as HospitalIcon } from "lucide-react-native";
import { MaterialIcons } from '@expo/vector-icons';
import { AppTouchableOpacity } from '../../../components/ui/AppTouchableOpacity';

export default function SignalementScreen(props: any) {
   const insets = useSafeAreaInsets();
   const logic = useSignalementLogic(props.navigation, props.route);
   
   const {
      step, selectedMission, timeline, urgentisteLoc, urgentisteHeadingDeg, 
      routeGeoJSON, displayAddress, routeInfoText,
      assessment, setAssessment, careChecklist, decision,
      targetHospital, pendingStructureInfo, transportMode, 
      receptionCameraBounds, hospitalRouteGeoJSON, hospitalRouteDuration, hospitalRouteDistance, hospitalRouteCameraBounds,
      fadeAnim, mapFullscreenOpen, setMapFullscreenOpen,
      voipLoading, terrainPhotoBusy, radarAnim, notifyAnim, isAssigned,
      handleArrivalOnScene, handleConfirmAssessment, handleToggleCare, handleConfirmAid,
      handleDecideTransport, handleSelectTransportMode, handleArrivedAtHospital, handleDepartVersStructure,
      pickAndUploadTerrainPhoto, runVictimVoip, runVictimPstn,
      pan, panResponder, transitionTo, formatTime
   } = logic;

   const renderStepInlineHeader = () => (
      <View style={styles.stepInlineHeader}>
         <AppTouchableOpacity
            onPress={() => props.navigation.goBack()}
            style={styles.stepInlineBack}
         >
            <MaterialIcons name="arrow-back" color="#FFF" size={24} />
         </AppTouchableOpacity>
          <View style={styles.stepInlineTextCol}>
             <Text style={styles.stepInlineTitle}>{selectedMission?.type || "Mission"}</Text>
             <Text style={styles.stepInlineSub}>{displayAddress}</Text>
          </View>
      </View>
   );

   const renderVictimContactStrip = () => (
      <VictimContactStrip 
         selectedMission={selectedMission}
         voipLoading={voipLoading}
         onCallPstn={runVictimPstn}
         onCallVoip={runVictimVoip}
      />
   );

   // Map content for the fullscreen modal
   const renderFullscreenMapChildren = () => {
      // Logic for drawing markers based on step
      const isHospitalStep = step === "assignment" || step === "transport" || step === "transport_mode";
      const destCoords = isHospitalStep && targetHospital?.coords 
         ? [targetHospital.coords.longitude, targetHospital.coords.latitude]
         : [selectedMission?.location?.lng || 15.307045, selectedMission?.location?.lat || -4.322447];
      
      const routeData = isHospitalStep ? logic.hospitalRouteGeoJSON : routeGeoJSON;
      const bounds = isHospitalStep ? logic.hospitalRouteCameraBounds : receptionCameraBounds;

      return (
         <>
            <Mapbox.Camera
               bounds={bounds}
               animationMode="flyTo"
               animationDuration={1000}
            />
            
            <Mapbox.PointAnnotation id="dest-marker" coordinate={destCoords as [number, number]}>
               <View style={isHospitalStep ? styles.hospitalMarker : styles.victimMarker}>
                  {isHospitalStep ? (
                     <HospitalIcon size={16} color="#FFF" strokeWidth={2.5} />
                  ) : (
                     <HeartPulse size={16} color="#FFF" strokeWidth={2.5} />
                  )}
               </View>
            </Mapbox.PointAnnotation>

            {urgentisteLoc && (
               <Mapbox.PointAnnotation id="my-unit-fs" coordinate={[urgentisteLoc.coords.longitude, urgentisteLoc.coords.latitude]}>
                  <MePuck headingDeg={urgentisteHeadingDeg} size={32} />
               </Mapbox.PointAnnotation>
            )}

            {routeData && (
               <Mapbox.ShapeSource id="route-fs" shape={routeData}>
                  <Mapbox.LineLayer 
                     id="route-fs-line" 
                     style={{ 
                        lineColor: isHospitalStep ? '#34C759' : '#4A90D9', 
                        lineWidth: 5, 
                        lineOpacity: 0.9 
                     }} 
                  />
               </Mapbox.ShapeSource>
            )}
         </>
      );
   };

   return (
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
         <StatusBar barStyle="light-content" />
         
         <View style={styles.mainWrapper}>
            <Animated.View style={[styles.contentArea, { opacity: fadeAnim }]}>
               
               <TerrainPhotosStrip 
                  step={step}
                  selectedMission={selectedMission}
                  terrainPhotoUrls={selectedMission?.media_urls || []}
                  terrainPhotoBusy={terrainPhotoBusy}
                  onPickPhoto={pickAndUploadTerrainPhoto}
               />

               {step === "standby" && (
                  <StepStandby 
                     selectedMission={selectedMission}
                     isAssigned={isAssigned}
                     radarAnim={radarAnim}
                     notifyAnim={notifyAnim}
                     displayAddress={displayAddress}
                     onConsultAlert={(m) => transitionTo("reception", m)}
                     onBack={() => props.navigation.goBack()}
                  />
               )}

               {step === "reception" && selectedMission && (
                  <StepReception 
                     selectedMission={selectedMission}
                     urgentisteLoc={urgentisteLoc}
                     urgentisteHeadingDeg={urgentisteHeadingDeg}
                     routeGeoJSON={routeGeoJSON}
                     routeInfoText={routeInfoText}
                     receptionCameraBounds={receptionCameraBounds}
                     displayAddress={displayAddress}
                     pan={pan}
                     panResponder={panResponder}
                     insets={insets}
                     onBack={() => props.navigation.goBack()}
                     onOpenFullscreenMap={() => setMapFullscreenOpen(true)}
                     renderVictimContactStrip={renderVictimContactStrip}
                  />
               )}

               {step === "arrival" && selectedMission && (
                  <StepArrival 
                     selectedMission={selectedMission}
                     urgentisteLoc={urgentisteLoc}
                     urgentisteHeadingDeg={urgentisteHeadingDeg}
                     routeGeoJSON={routeGeoJSON}
                     receptionCameraBounds={receptionCameraBounds}
                     displayAddress={displayAddress}
                     elapsedSeconds={logic.elapsedSeconds}
                     formatTime={formatTime}
                     insets={insets}
                     onBack={() => props.navigation.goBack()}
                     onOpenFullscreenMap={() => setMapFullscreenOpen(true)}
                     onArrivalOnScene={handleArrivalOnScene}
                  />
               )}

               {step === "assessment" && (
                  <StepAssessment 
                     assessment={assessment}
                     setAssessment={setAssessment}
                     renderStepInlineHeader={renderStepInlineHeader}
                     onConfirmAssessment={handleConfirmAssessment}
                  />
               )}

               {step === "aid" && (
                  <StepAid 
                     careChecklist={careChecklist}
                     onToggleCare={handleToggleCare}
                     onConfirmAid={handleConfirmAid}
                     renderStepInlineHeader={renderStepInlineHeader}
                  />
               )}

               {step === "decision" && (
                  <StepDecision 
                     onDecideTransport={handleDecideTransport}
                     renderStepInlineHeader={renderStepInlineHeader}
                  />
               )}

               {step === "assignment" && (
                  <StepAssignment 
                     pendingStructureInfo={pendingStructureInfo}
                     targetHospital={targetHospital}
                     urgentisteLoc={urgentisteLoc}
                     urgentisteHeadingDeg={urgentisteHeadingDeg}
                     hospitalRouteGeoJSON={logic.hospitalRouteGeoJSON}
                     hospitalRouteDuration={logic.hospitalRouteDuration}
                     hospitalRouteDistance={logic.hospitalRouteDistance}
                     hospitalRouteCameraBounds={logic.hospitalRouteCameraBounds}
                     departingEnRoute={logic.departingEnRoute}
                     onDepartVersStructure={handleDepartVersStructure}
                     onOpenFullscreenMap={() => setMapFullscreenOpen(true)}
                     renderStepInlineHeader={renderStepInlineHeader}
                  />
               )}

               {step === "transport_mode" && (
                  <StepTransportMode 
                     transportMode={transportMode}
                     onSelectTransportMode={handleSelectTransportMode}
                     renderStepInlineHeader={renderStepInlineHeader}
                  />
               )}

               {step === "transport" && targetHospital && (
                  <StepTransport 
                     targetHospital={targetHospital}
                     urgentisteLoc={urgentisteLoc}
                     urgentisteHeadingDeg={urgentisteHeadingDeg}
                     hospitalRouteGeoJSON={logic.hospitalRouteGeoJSON}
                     hospitalRouteDuration={logic.hospitalRouteDuration}
                     hospitalRouteDistance={logic.hospitalRouteDistance}
                     hospitalRouteCameraBounds={logic.hospitalRouteCameraBounds}
                     transportMode={transportMode}
                     insets={insets}
                     onBack={() => props.navigation.goBack()}
                     onOpenFullscreenMap={() => setMapFullscreenOpen(true)}
                     onArrivedAtHospital={handleArrivedAtHospital}
                  />
               )}

               {step === "closure" && (
                  <StepClosure 
                     onReturnToDashboard={() => props.navigation.goBack()}
                     renderStepInlineHeader={renderStepInlineHeader}
                  />
               )}

            </Animated.View>

            {selectedMission && step !== "standby" && step !== "closure" && (
               <View style={styles.timelineSidebar}>
                  <MissionTimeline timeline={timeline} />
               </View>
            )}
         </View>

         <FullscreenMapModal
            visible={mapFullscreenOpen}
            onClose={() => setMapFullscreenOpen(false)}
         >
            {renderFullscreenMapChildren()}
         </FullscreenMapModal>
      </SafeAreaView>
   );
}

const Text = ({ children, style }: any) => <Animated.Text style={style}>{children}</Animated.Text>;
