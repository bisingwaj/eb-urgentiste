import React from 'react';
import { View, Text } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { styles } from '../styles';
import { AppTouchableOpacity } from '../../../../components/ui/AppTouchableOpacity';
import { AssessmentSchema } from '../types';
import { DynamicFormEngine } from './DynamicFormEngine';

interface StepAssessmentProps {
   assessment: any;
   setAssessment: (a: any) => void;
   assessmentSchema: AssessmentSchema;
   setManualSchemaType: (type: string) => void;
   renderStepInlineHeader: () => React.ReactNode;
   onConfirmAssessment: () => void;
}

export const StepAssessment: React.FC<StepAssessmentProps> = ({
   assessment,
   setAssessment,
   assessmentSchema,
   setManualSchemaType,
   renderStepInlineHeader,
   onConfirmAssessment
}) => {
   return (
      <View style={styles.stepBase}>
         {renderStepInlineHeader()}
         
         <DynamicFormEngine 
            schema={assessmentSchema}
            assessment={assessment}
            setAssessment={setAssessment}
            onConfirmAssessment={onConfirmAssessment}
            onSchemaChange={setManualSchemaType}
         />
      </View>
   );
};
