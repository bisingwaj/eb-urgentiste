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
}

export const DynamicFormEngine: React.FC<DynamicFormEngineProps> = ({
   schema,
   assessment,
   setAssessment,
   onConfirmAssessment
}) => {
   const [currentStepIndex, setCurrentStepIndex] = useState(0);

   const currentStep = schema.steps[currentStepIndex];
   const isLastStep = currentStepIndex === schema.steps.length - 1;

   // Check if the current step has a valid answer
   const hasAnswer = assessment[currentStep?.id] !== undefined && assessment[currentStep?.id] !== null;

   const updateValue = (fieldId: string, value: any) => {
      setAssessment({ ...assessment, [fieldId]: value });
   };

   const goNext = () => {
      if (isLastStep) {
         onConfirmAssessment();
      } else {
         setCurrentStepIndex(currentStepIndex + 1);
      }
   };

   const goPrev = () => {
      if (currentStepIndex > 0) {
         setCurrentStepIndex(currentStepIndex - 1);
      }
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
                     color={currentValue !== undefined ? (options.find(o => o.value === currentValue)?.color || colors.secondary) : colors.secondary}
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
                           backgroundColor: isActive ? activeColor + '20' : 'rgba(255,255,255,0.05)',
                           borderWidth: 2,
                           borderColor: isActive ? activeColor : 'transparent',
                           flexDirection: 'row',
                           alignItems: 'center',
                           justifyContent: 'center',
                           paddingHorizontal: 20
                        }}
                        onPress={() => {
                           updateValue(step.id, opt.value);
                           // Auto-advance logic:
                           // 1. Must be a success/positive value (usually YES)
                           // 2. Must NOT have a blocking advice (if advice exists for this value, stay to show it)
                           const hasAdviceForThisValue = step.advice?.if.value === opt.value;
                           if (opt.value === true && !hasAdviceForThisValue) {
                              setTimeout(goNext, 300);
                           }
                        }}
                     >
                        <Text
                           style={{
                              color: isActive ? activeColor : '#FFF',
                              fontSize: 20,
                              fontWeight: '900'
                           }}
                        >
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
                  <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 16, marginTop: 10, textAlign: 'center' }}>
                     {step.description}
                  </Text>
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
                           backgroundColor: isActive ? activeColor + '15' : 'rgba(255,255,255,0.05)',
                           borderWidth: 2,
                           borderColor: isActive ? activeColor : 'transparent',
                           flexDirection: 'row',
                           alignItems: 'center',
                           justifyContent: 'center',
                           gap: 12
                        }}
                        onPress={() => updateValue(step.id, opt.value)}
                     >
                        {opt.icon && (
                           <MaterialIcons
                              name={opt.icon as any}
                              size={28}
                              color={isActive ? activeColor : "rgba(255,255,255,0.3)"}
                           />
                        )}
                        <Text
                           style={{
                              color: isActive ? activeColor : '#FFF',
                              fontSize: 16,
                              fontWeight: '800'
                           }}
                        >
                           {opt.label}
                        </Text>
                     </AppTouchableOpacity>
                  );
               })}
            </View>
         </View>
      );
   };

   const renderRange = (step: AssessmentStep) => {
      const currentValue = assessment[step.id];
      return (
         <View key={step.id} style={{ flex: 1, justifyContent: 'center' }}>
            <View style={{ alignItems: 'center', marginBottom: 40 }}>
               <Text style={{ color: '#FFF', fontSize: 24, fontWeight: '900', textAlign: 'center' }}>{step.label}</Text>
               {step.description && (
                  <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 16, marginTop: 10, textAlign: 'center' }}>
                     {step.description}
                  </Text>
               )}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
               {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => {
                  const isActive = currentValue === num;
                  return (
                     <AppTouchableOpacity
                        key={num}
                        style={{
                           width: '18%',
                           aspectRatio: 1,
                           borderRadius: 14,
                           backgroundColor: isActive ? colors.secondary : 'rgba(255,255,255,0.05)',
                           justifyContent: 'center',
                           alignItems: 'center',
                           borderWidth: 2,
                           borderColor: isActive ? colors.secondary : 'transparent'
                        }}
                        onPress={() => updateValue(step.id, num)}
                     >
                        <Text style={{
                           color: isActive ? '#FFF' : 'rgba(255,255,255,0.6)',
                           fontWeight: '900',
                           fontSize: 20
                        }}>
                           {num}
                        </Text>
                     </AppTouchableOpacity>
                  );
               })}
            </View>
         </View>
      );
   };

   const renderAdvice = (step: AssessmentStep) => {
      if (!step.advice) return null;
      const triggerValue = assessment[step.advice.if.fieldId];
      if (triggerValue !== step.advice.if.value) return null;

      return (
         <View style={{ ...styles.smartAlertBox, marginTop: 30 }}>
            <MaterialIcons name="info" size={24} color="#FFF" />
            <Text style={{ ...styles.smartAlertBoxText, fontSize: 15, lineHeight: 22 }}>
               Conseil : {step.advice.text}
            </Text>
         </View>
      );
   };

   if (!currentStep) return null;

   return (
      <View style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
         {/* Stepper Header */}
         <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, fontWeight: '800', letterSpacing: 1 }}>
               QUESTION {currentStepIndex + 1} / {schema.steps.length}
            </Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
               {schema.steps.map((_, idx) => (
                  <View
                     key={idx}
                     style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: idx === currentStepIndex ? colors.secondary :
                           (idx < currentStepIndex ? colors.success : 'rgba(255,255,255,0.1)')
                     }}
                  />
               ))}
            </View>
         </View>

         {/* Current Question */}
         <View style={{ flex: 1 }}>
            {currentStep.type === 'binary' && renderBinary(currentStep)}
            {currentStep.type === 'choice' && renderChoice(currentStep)}
            {currentStep.type === 'range' && renderRange(currentStep)}
            {renderAdvice(currentStep)}
         </View>

         {/* Bottom Navigation */}
         <View style={{ flexDirection: 'row', gap: 12, marginTop: 20 }}>
            {currentStepIndex > 0 && (
               <AppTouchableOpacity
                  style={{
                     flex: 0.3,
                     height: 64,
                     borderRadius: 20,
                     backgroundColor: 'rgba(255,255,255,0.05)',
                     justifyContent: 'center',
                     alignItems: 'center',
                     borderWidth: 1,
                     borderColor: 'rgba(255,255,255,0.1)'
                  }}
                  onPress={goPrev}
               >
                  <MaterialIcons name="arrow-back" size={24} color="#FFF" />
               </AppTouchableOpacity>
            )}

            <AppTouchableOpacity
               style={{
                  flex: 1,
                  height: 64,
                  borderRadius: 20,
                  backgroundColor: isLastStep ? colors.primary : colors.secondary,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 12,
                  opacity: hasAnswer ? 1 : 0.5
               }}
               disabled={!hasAnswer}
               onPress={goNext}
            >
               {isLastStep && <MaterialIcons name="done-all" size={24} color="#FFF" />}
               <Text style={styles.bigActionText}>
                  {isLastStep ? "Valider l'évaluation" : "Suivant"}
               </Text>
               {!isLastStep && <MaterialIcons name="arrow-forward" size={24} color="#FFF" />}
            </AppTouchableOpacity>
         </View>
      </View>
   );
};
