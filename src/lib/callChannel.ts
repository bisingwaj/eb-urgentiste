/**
 * Convention alignée avec le dashboard / docs : préfixe INT + segment utilisateur + horodatage.
 * Le même `channel_name` doit être utilisé pour `call_history`, `agora-token` et `joinChannel`.
 */
export function buildInternalChannelName(authUserId: string): string {
  const slice = authUserId.replace(/-/g, '').slice(0, 8);
  return `INT-${slice}-${Date.now()}`;
}
