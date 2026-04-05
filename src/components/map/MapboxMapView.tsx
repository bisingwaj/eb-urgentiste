import React, { forwardRef } from 'react';
import Mapbox from '@rnmapbox/maps';
import type { ViewProps } from 'react-native';

export type MapboxMapViewProps = React.ComponentProps<typeof Mapbox.MapView>;

/**
 * Carte Mapbox avec logo masqué (logoEnabled=false).
 * L’attribution (icône « i ») reste activée par défaut pour respecter les conditions Mapbox.
 */
export const MapboxMapView = forwardRef<Mapbox.MapView, MapboxMapViewProps>(function MapboxMapView(
  {
    logoEnabled = false,
    attributionEnabled = true,
    ...rest
  },
  ref,
) {
  return (
    <Mapbox.MapView
      ref={ref}
      logoEnabled={logoEnabled}
      attributionEnabled={attributionEnabled}
      {...rest}
    />
  );
});
