import React from 'react';
import { View, Text, ScrollView, Image, Pressable, ActivityIndicator, Platform } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors } from '../../../../theme/colors';
import { styles } from '../styles';
import { MissionStep } from '../types';

interface TerrainPhotosStripProps {
   step: MissionStep;
   selectedMission: any;
   terrainPhotoUrls: string[];
   terrainPhotoBusy: boolean;
   onPickPhoto: (source: "camera" | "library") => void;
}

export const TerrainPhotosStrip: React.FC<TerrainPhotosStripProps> = ({
   step,
   selectedMission,
   terrainPhotoUrls,
   terrainPhotoBusy,
   onPickPhoto
}) => {
   if (step === "standby" || !selectedMission) return null;
   
   return (
      <View style={styles.terrainPhotosStrip}>
         <View style={styles.terrainPhotosStripHeader}>
            <MaterialIcons name="photo-library" size={18} color={colors.secondary} />
            <View style={{ flex: 1 }}>
               <Text style={styles.terrainPhotosStripTitle}>Photos terrain</Text>
               <Text style={styles.terrainPhotosStripHint}>
                  Commencez par la galerie — la caméra est en seconde option.
               </Text>
            </View>
         </View>
         <ScrollView
            horizontal
            nestedScrollEnabled
            keyboardShouldPersistTaps="always"
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.terrainPhotosScroll}
         >
            {terrainPhotoUrls.map((url) => (
               <Image key={url} source={{ uri: url }} style={styles.terrainPhotoThumb} />
            ))}
            <View style={styles.terrainPhotoActions}>
               <Pressable
                  style={({ pressed }) => [
                     styles.terrainPhotoAddBtn,
                     styles.terrainPhotoAddBtnPrimary,
                     terrainPhotoBusy && { opacity: 0.6 },
                     pressed && !terrainPhotoBusy && { opacity: 0.85 },
                  ]}
                  onPress={() => onPickPhoto("library")}
                  disabled={terrainPhotoBusy}
                  accessibilityLabel="Choisir une photo dans la galerie"
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                  {...(Platform.OS === "android" ? { collapsable: false } : {})}
               >
                  {terrainPhotoBusy ? (
                     <ActivityIndicator color={colors.secondary} size="small" />
                  ) : (
                     <>
                        <MaterialIcons name="photo-library" size={24} color={colors.secondary} />
                        <Text style={styles.terrainPhotoAddText}>Galerie</Text>
                     </>
                  )}
               </Pressable>
               <Pressable
                  style={({ pressed }) => [
                     styles.terrainPhotoAddBtn,
                     styles.terrainPhotoAddBtnSecondary,
                     terrainPhotoBusy && { opacity: 0.6 },
                     pressed && !terrainPhotoBusy && { opacity: 0.85 },
                  ]}
                  onPress={() => onPickPhoto("camera")}
                  disabled={terrainPhotoBusy}
                  accessibilityLabel="Prendre une photo avec la caméra"
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                  {...(Platform.OS === "android" ? { collapsable: false } : {})}
               >
                  {terrainPhotoBusy ? (
                     <ActivityIndicator color={colors.secondary} size="small" />
                  ) : (
                     <>
                        <MaterialIcons name="photo-camera" size={22} color="rgba(255,255,255,0.55)" />
                        <Text style={styles.terrainPhotoAddTextSecondary}>Caméra</Text>
                     </>
                  )}
               </Pressable>
            </View>
         </ScrollView>
      </View>
   );
};
