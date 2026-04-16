import React from 'react';
import { View, Text, FlatList } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors } from '../../../../theme/colors';
import { styles } from '../styles';
import { TimelineEvent } from '../types';

interface MissionTimelineProps {
   timeline: TimelineEvent[];
}

export const MissionTimeline: React.FC<MissionTimelineProps> = ({ timeline }) => {
   return (
      <View style={styles.timelineContainer}>
         <Text style={styles.timelineHeader}>JOURNAL DE BORD (TIMELINE)</Text>
         <FlatList
            data={timeline}
            keyExtractor={(item) => item.id}
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
               <View style={styles.timelineItem}>
                  <View style={styles.timelinePointRow}>
                     <View style={styles.timelineLine} />
                     <View
                        style={[
                           styles.timelineIconBox,
                           { backgroundColor: colors.secondary + "20" },
                        ]}
                     >
                        <MaterialIcons
                           name={item.icon as any}
                           size={14}
                           color={colors.secondary}
                        />
                     </View>
                  </View>
                  <View style={styles.timelineContent}>
                     <View style={styles.timelineTextRow}>
                        <Text style={styles.timelineTime}>{item.time}</Text>
                        <Text style={styles.timelineLabel}>{item.label}</Text>
                     </View>
                     {item.status && (
                        <View style={styles.itemStatusBadge}>
                           <Text style={styles.itemStatusText}>
                              {item.status.toUpperCase()}
                           </Text>
                        </View>
                     )}
                  </View>
               </View>
            )}
         />
      </View>
   );
};
