// Real-money gem packs. Prices are server-authoritative (never trust a
// client-sent amount) and expressed in the smallest currency unit (cents).
export const PAYMENT_CURRENCY = 'usd';

export interface GemPack {
  id: string;
  name: string;
  gems: number;
  priceCents: number;
}

export const GEM_PACKS: GemPack[] = [
  { id: 'handful', name: 'Handful of Gems', gems: 100, priceCents: 199 },
  { id: 'pouch', name: 'Pouch of Gems', gems: 550, priceCents: 999 },
  { id: 'chest', name: 'Chest of Gems', gems: 1200, priceCents: 1999 },
  { id: 'vault', name: 'Vault of Gems', gems: 3000, priceCents: 4499 },
];

export function findGemPack(id: string): GemPack | undefined {
  return GEM_PACKS.find((pack) => pack.id === id);
}
