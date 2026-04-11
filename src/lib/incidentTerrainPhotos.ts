import { readAsStringAsync, EncodingType } from 'expo-file-system/legacy';
import { supabase } from './supabase';

/** Bucket Storage Supabase (lecture publique des URLs pour affichage). À créer côté projet + politiques RLS. */
export const INCIDENT_MEDIA_BUCKET =
  process.env.EXPO_PUBLIC_INCIDENT_MEDIA_BUCKET?.trim() || 'incident-media';

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = globalThis.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Les URIs `content://` / `file://` renvoyées par la caméra sur Android ne sont pas lisibles
 * avec `fetch(uri)` — il faut passer par le module fichier natif.
 */
async function localImageUriToArrayBuffer(uri: string): Promise<ArrayBuffer> {
  if (uri.startsWith('http://') || uri.startsWith('https://')) {
    const res = await fetch(uri);
    if (!res.ok) return Promise.reject(new Error(`Téléchargement impossible (${res.status})`));
    return res.arrayBuffer();
  }
  const base64 = await readAsStringAsync(uri, { encoding: EncodingType.Base64 });
  return base64ToArrayBuffer(base64);
}

/**
 * Envoie une image vers Storage puis retourne l’URL publique.
 * Chemin : `{incidentId}/{timestamp}.{ext}`
 */
export async function uploadIncidentTerrainPhotoToStorage(
  incidentId: string,
  localUri: string,
  mimeType: string,
): Promise<string> {
  const isPng = mimeType.toLowerCase().includes('png');
  const ext = isPng ? 'png' : 'jpg';
  const contentType = isPng ? 'image/png' : 'image/jpeg';
  const path = `${incidentId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const arrayBuffer = await localImageUriToArrayBuffer(localUri);

  const { error: uploadError } = await supabase.storage
    .from(INCIDENT_MEDIA_BUCKET)
    .upload(path, arrayBuffer, {
      contentType,
      upsert: false,
    });

  if (uploadError) throw uploadError;

  const { data: pub } = supabase.storage.from(INCIDENT_MEDIA_BUCKET).getPublicUrl(path);
  return pub.publicUrl;
}
