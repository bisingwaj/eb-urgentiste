/**
 * Proposer téléphone / app in-app victime uniquement tant que l’unité n’est pas encore sur place.
 * Après `on_scene`, l’urgentiste est avec la victime : pas d’appel depuis ces écrans.
 */
export function canOfferVictimContactCalls(dispatchStatus: string | null | undefined): boolean {
  return dispatchStatus === 'dispatched' || dispatchStatus === 'en_route';
}
