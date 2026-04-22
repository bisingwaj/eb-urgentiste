import React, { useState } from 'react';
import { View, Text } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors } from '../../../../theme/colors';
import { styles } from '../styles';
import { AppTouchableOpacity } from '../../../../components/ui/AppTouchableOpacity';
import { AssessmentSchema, AssessmentStep, AssessmentOption } from '../types';

interface DynamicFormEngineProps {
   schema: AssessmentSchema;
   assessment: Record<string, any>;
   setAssessment: (a: Record<string, any>) => void;
   onConfirmAssessment: () => void;
   onSchemaChange: (type: string) => void;
}

export const DynamicFormEngine: React.FC<DynamicFormEngineProps> = ({
   schema,
   assessment,
   setAssessment,
   onConfirmAssessment,
   onSchemaChange
}) => {
   const [currentStepIndex, setCurrentStepIndex] = useState(0);
   const [isTransitioning, setIsTransitioning] = useState(false);
   const [showTypeSelector, setShowTypeSelector] = useState(false);

   const currentStep = schema.steps[currentStepIndex];
   const isLastStep = currentStepIndex === schema.steps.length - 1;

   // Check if the current step has a valid answer
   const hasAnswer = assessment[currentStep?.id] !== undefined && assessment[currentStep?.id] !== null;

   const updateValue = (fieldId: string, value: any) => {
      setAssessment({ ...assessment, [fieldId]: value });
   };

   const handleTypeSwitch = (type: string) => {
      onSchemaChange(type);
      setCurrentStepIndex(0);
      setShowTypeSelector(false);
   };

   const goNext = () => {
      if (isLastStep) {
         onConfirmAssessment();
      } else {
         setCurrentStepIndex(currentStepIndex + 1);
         setIsTransitioning(false);
      }
   };

   const goPrev = () => {
      if (currentStepIndex > 0) {
         setCurrentStepIndex(currentStepIndex - 1);
      }
   };

   const renderTypeSelector = () => {
      const types = [
         { id: 'medical', label: 'MÉDICAL', icon: 'medical-services', color: colors.secondary },
         { id: 'trauma', label: 'TRAUMATOLOGIE', icon: 'healing', color: '#FF9800' },
         { id: 'pediatrie', label: 'PÉDIATRIE', icon: 'child-care', color: '#E91E63' },
      ];

      const active = types.find(t => t.id === schema.incident_type) || types[0];

      return (
         <View style={{ marginBottom: 20, zIndex: 100 }}>
            <AppTouchableOpacity 
               onPress={() => setShowTypeSelector(!showTypeSelector)}
               style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: 'rgba(255,255,255,0.05)',
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.1)',
                  justifyContent: 'space-between'
               }}
            >
               <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <MaterialIcons name={active.icon as any} size={20} color={active.color} />
                  <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 13, letterSpacing: 0.5 }}>
                     TYPE : {active.label}
                  </Text>
               </View>
               <MaterialIcons name={showTypeSelector ? "expand-less" : "expand-more"} size={24} color="rgba(255,255,255,0.3)" />
            </AppTouchableOpacity>

            {showTypeSelector && (
               <View style={{ 
                  marginTop: 8, 
                  backgroundColor: '#1C1C1E', 
                  borderRadius: 12, 
                  borderWidth: 1, 
                  borderColor: 'rgba(255,255,255,0.1)',
                  overflow: 'hidden',
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  zIndex: 110,
                  shadowColor: '#000',
                  shadowOpacity: 0.5,
                  shadowRadius: 10,
                  elevation: 10
               }}>
                  {types.map(t => (
                     <AppTouchableOpacity
                        key={t.id}
                        onPress={() => handleTypeSwitch(t.id)}
                        style={{
                           paddingVertical: 14,
                           paddingHorizontal: 16,
                           flexDirection: 'row',
                           alignItems: 'center',
                           gap: 12,
                           backgroundColor: schema.incident_type === t.id ? 'rgba(255,255,255,0.05)' : 'transparent',
                           borderBottomWidth: 1,
                           borderBottomColor: 'rgba(255,255,255,0.05)'
                        }}
                     >
                        <MaterialIcons name={t.icon as any} size={20} color={t.color} />
                        <Text style={{ color: schema.incident_type === t.id ? t.color : '#FFF', fontWeight: '700' }}>{t.label}</Text>
                        {schema.incident_type === t.id && (
                           <MaterialIcons name="check" size={18} color={t.color} style={{ marginLeft: 'auto' }} />
                        )}
                     </AppTouchableOpacity>
                  ))}
               </View>
            )}
         </View>
      );
   };

   const renderBinary = (step: AssessmentStep) => {
      const currentValue = assessment[step.id];
      const options = step.options || [
         { label: "Oui", value: true, color: colors.success },
         { label: "Non", value: false, color: colors.primary }
      ];

      return (
         <View key={step.id} style={{ flex: 1, justifyContent: 'center' }}>
            <View style={{ alignItems: 'center', marginBottom: 40 }}>
               <View style={{ width: 80, height: 80, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.05)', justifyContent: 'center', alignItems: 'center', marginBottom: 20 }}>
                  <MaterialIcons
                     name={(options.find(o => o.value === currentValue)?.icon as any) || "help-outline"}
                     size={42}
                     color={currentValue !== undefined ? (options.find(o => o.value === currentValue)?.color || colors.secondary) : "rgba(255,255,255,0.2)"}
                  />
               </View>
               <Text style={{ color: '#FFF', fontSize: 26, fontWeight: '900', textAlign: 'center', lineHeight: 34 }}>{step.label}</Text>
               {step.description && (
                  <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 16, marginTop: 12, textAlign: 'center' }}>
                     {step.description}
                  </Text>
               )}
            </View>

            <View style={{ gap: 16 }}>
               {options.map((opt) => {
                  const isActive = currentValue === opt.value;
                  const activeColor = opt.color || colors.secondary;
                  return (
                     <AppTouchableOpacity
                        key={String(opt.value)}
                        style={{
                           height: 72,
                           borderRadius: 18,
                           backgroundColor: isActive ? activeColor + '20' : 'rgba(255,255,255,0.03)',
                           borderWidth: 2,
                           borderColor: isActive ? activeColor : 'rgba(255,255,255,0.05)',
                           flexDirection: 'row',
                           alignItems: 'center',
                           justifyContent: 'center',
                           paddingHorizontal: 20
                        }}
                        onPress={() => {
                           if (isTransitioning) return;
                           updateValue(step.id, opt.value);
                           
                           const advices = Array.isArray(step.advice) ? step.advice : (step.advice ? [step.advice] : []);
                           const hasAdviceForThisValue = advices.some(a => a.if.value === opt.value);
                           if (opt.value === true && !hasAdviceForThisValue) {
                              setIsTransitioning(true);
                              setTimeout(goNext, 400);
                           }
                        }}
                     >
                        <Text style={{ color: isActive ? activeColor : 'rgba(255,255,255,0.7)', fontSize: 20, fontWeight: '900' }}>
                           {opt.label}
                        </Text>
                     </AppTouchableOpacity>
                  );
               })}
            </View>
         </View>
      );
   };

   const renderChoice = (step: AssessmentStep) => {
      const currentValue = assessment[step.id];
      return (
         <View key={step.id} style={{ flex: 1, justifyContent: 'center' }}>
            <View style={{ alignItems: 'center', marginBottom: 30 }}>
               <Text style={{ color: '#FFF', fontSize: 24, fontWeight: '900', textAlign: 'center' }}>{step.label}</Text>
               {step.description && (
                  <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 16, marginTop: 10, textAlign: 'center' }}>{step.description}</Text>
               )}
            </View>
            <View style={{ gap: 12 }}>
               {step.options?.map((opt) => {
                  const isActive = currentValue === opt.value;
                  const activeColor = opt.color || colors.secondary;
                  return (
                     <AppTouchableOpacity
                        key={String(opt.value)}
                        style={{
                           paddingVertical: 20,
                           borderRadius: 16,
                           backgroundColor: isActive ? activeColor + '15' : 'rgba(255,255,255,0.03)',
                           borderWidth: 2,
                           borderColor: isActive ? activeColor : 'rgba(255,255,255,0.05)',
                           flexDirection: 'row',
                           alignItems: 'center',
                           justifyContent: 'center',
                           gap: 12
                        }}
                        onPress={() => {
                           if (isTransitioning) return;
                           updateValue(step.id, opt.value);
                           const advices = Array.isArray(step.advice) ? step.advice : (step.advice ? [step.advice] : []);
                           const hasAdviceForThisValue = advices.some(a => a.if.value === opt.value);
                           if (opt.value === 'strong' && !hasAdviceForThisValue) {
                              setIsTransitioning(true);
                              setTimeout(goNext, 400);
                           }
                        }}
                     >
                        {opt.icon && <MaterialIcons name={opt.icon as any} size={28} color={isActive ? activeColor : "rgba(255,255,255,0.2)"} />}
                        <Text style={{ color: isActive ? activeColor : 'rgba(255,255,255,0.7)', fontSize: 16, fontWeight: '800' }}>{opt.label}</Text>
                     </AppTouchableOpacity>
                  );
               })}
            </View>
         </View>
      );
   };

   const renderRange = (step: AssessmentStep) => {
      const currentValue = assessment[step.id] ?? 0;
      const getRangeColor = (val: number) => {
         if (val <= 3) return colors.success;
         if (val <= 5) return "#FFCC00";
         if (val <= 7) return "#FF9500";
         return colors.primary;
      };
      const rangeColor = getRangeColor(currentValue);

      return (
         <View key={step.id} style={{ flex: 1, justifyContent: 'center' }}>
            <View style={{ alignItems: 'center', marginBottom: 40 }}>
               <Text style={{ color: '#FFF', fontSize: 24, fontWeight: '900', textAlign: 'center' }}>{step.label}</Text>
               <Text style={{ color: rangeColor, fontSize: 72, fontWeight: '900', marginTop: 10 }}>{currentValue}</Text>
               <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, marginTop: -5, fontWeight: '800', letterSpacing: 1 }}>
                  {currentValue <= 3 ? "FAIBLE" : currentValue <= 5 ? "MODÉRÉE" : currentValue <= 7 ? "SÉVÈRE" : "CRITIQUE"}
               </Text>
            </View>
            <View style={{ height: 10, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 5, marginHorizontal: 10, position: 'relative' }}>
               <View style={{ width: `${currentValue * 10}%`, height: '100%', backgroundColor: rangeColor, borderRadius: 5 }} />
               <View style={{ position: 'absolute', top: -15, left: -10, right: -10, flexDirection: 'row', justifyContent: 'space-between' }}>
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(val => {
                     const isSelected = currentValue === val;
                     return (
                        <AppTouchableOpacity key={val} onPress={() => updateValue(step.id, val)} style={{ alignItems: 'center', width: 28, height: 40 }}>
                           <View style={{ 
                              width: 14, height: 14, borderRadius: 7, 
                              backgroundColor: isSelected ? '#FFF' : 'rgba(255,255,255,0.1)',
                              borderWidth: isSelected ? 3 : 0, borderColor: rangeColor,
                              marginTop: isSelected ? -2 : 0
                           }} />
                           {val % 2 === 0 && <Text style={{ color: isSelected ? '#FFF' : 'rgba(255,255,255,0.2)', fontSize: 10, marginTop: 6, fontWeight: isSelected ? '900' : '400' }}>{val}</Text>}
                        </AppTouchableOpacity>
                     );
                  })}
               </View>
            </View>
         </View>
      );
   };

   const renderAdvice = (step: AssessmentStep) => {
      if (!step.advice) return null;
      const advices = Array.isArray(step.advice) ? step.advice : [step.advice];
      const activeAdvices = advices.filter(a => assessment[a.if.fieldId] === a.if.value);
      if (activeAdvices.length === 0) return null;
      return (
         <View style={{ gap: 10, marginTop: 30 }}>
            {activeAdvices.map((advice, idx) => (
               <View key={idx} style={styles.smartAlertBox}>
                  <MaterialIcons name="info" size={24} color="#FFF" />
                  <Text style={{ ...styles.smartAlertBoxText, fontSize: 15, lineHeight: 22 }}>{advice.text}</Text>
               </View>
            ))}
         </View>
      );
   };

   if (!currentStep) return null;

   return (
      <View style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
         {renderTypeSelector()}

         <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, fontWeight: '800', letterSpacing: 1 }}>
               QUESTION {currentStepIndex + 1} / {schema.steps.length}
            </Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
               {schema.steps.map((_, idx) => (
                  <View key={idx} style={{ 
                     width: 8, height: 8, borderRadius: 4, 
                     backgroundColor: idx === currentStepIndex ? colors.secondary : (idx < currentStepIndex ? colors.success : 'rgba(255,255,255,0.1)')
                  }} />
               ))}
            </View>
         </View>

         {isTransitioning && (
            <View style={{ position: 'absolute', top: 100, left: 0, right: 0, zIndex: 10, alignItems: 'center' }}>
               <View style={{ backgroundColor: colors.secondary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <MaterialIcons name="sync" size={18} color="#FFF" />
                  <Text style={{ color: '#FFF', fontWeight: 'bold' }}>Passage à la suite...</Text>
               </View>
            </View>
         )}

         <View style={{ flex: 1, opacity: isTransitioning ? 0.3 : 1 }}>
            {currentStep.type === 'binary' && renderBinary(currentStep)}
            {currentStep.type === 'choice' && renderChoice(currentStep)}
            {currentStep.type === 'range' && renderRange(currentStep)}
            {renderAdvice(currentStep)}
         </View>

         <View style={{ flexDirection: 'row', gap: 12, marginTop: 20 }}>
            {currentStepIndex > 0 && (
               <AppTouchableOpacity style={{ flex: 0.3, height: 64, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.05)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }} onPress={goPrev}>
                  <MaterialIcons name="arrow-back" size={24} color="#FFF" />
               </AppTouchableOpacity>
            )}
            <AppTouchableOpacity
               style={{
                  flex: 1, height: 64, borderRadius: 20, 
                  backgroundColor: isLastStep ? colors.primary : colors.secondary,
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12,
                  opacity: (hasAnswer && !isTransitioning) ? 1 : 0.5
               }}
               disabled={!hasAnswer || isTransitioning}
               onPress={goNext}
            >
               {isLastStep && <MaterialIcons name="done-all" size={24} color="#FFF" />}
               <Text style={styles.bigActionText}>{isLastStep ? "Valider l'évaluation" : "Suivant"}</Text>
               {!isLastStep && <MaterialIcons name="arrow-forward" size={24} color="#FFF" />}
            </AppTouchableOpacity>
         </View>
      </View>
   );
};
