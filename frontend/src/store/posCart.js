import { create } from 'zustand';

export const usePosCart = create((set, get) => ({
  resellerId: null,
  customerId: null,
  discount: 0,
  taxPercent: 0,
  notes: '',
  walletChannel: '',
  items: [],
  setMeta: (p) => set(p),
  addItem: (product, qty = 1) => {
    const items = [...get().items];
    const i = items.findIndex((x) => x.product_id === product.id);
    if (i >= 0) items[i] = { ...items[i], quantity: items[i].quantity + qty };
    else items.push({ product_id: product.id, product, quantity: qty });
    set({ items });
  },
  setQty: (productId, quantity) => {
    const q = Math.max(1, Number(quantity) || 1);
    set({
      items: get().items.map((x) => (x.product_id === productId ? { ...x, quantity: q } : x)),
    });
  },
  removeItem: (productId) => set({ items: get().items.filter((x) => x.product_id !== productId) }),
  clear: () =>
    set({ items: [], resellerId: null, customerId: null, discount: 0, taxPercent: 0, notes: '', walletChannel: '' }),
}));
