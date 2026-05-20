import { create } from 'zustand';

export const usePosCart = create((set, get) => ({
  customerId: null,
  discount: 0,
  taxPercent: 0,
  notes: '',
  items: [],
  setMeta: (p) => set(p),
  addItem: (variant, qty = 1) => {
    const items = [...get().items];
    const i = items.findIndex((x) => x.variant_id === variant.id);
    if (i >= 0) items[i] = { ...items[i], quantity: items[i].quantity + qty };
    else items.push({ variant_id: variant.id, variant, quantity: qty });
    set({ items });
  },
  setQty: (variantId, quantity) => {
    const q = Math.max(1, Number(quantity) || 1);
    set({
      items: get().items.map((x) => (x.variant_id === variantId ? { ...x, quantity: q } : x)),
    });
  },
  removeItem: (variantId) => set({ items: get().items.filter((x) => x.variant_id !== variantId) }),
  clear: () => set({ items: [], customerId: null, discount: 0, taxPercent: 0, notes: '' }),
}));
