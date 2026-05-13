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
    if (get().walletChannel) return;
    const items = [...get().items];
    const i = items.findIndex((x) => x.kind === 'product' && x.product_id === product.id);
    if (i >= 0) items[i] = { ...items[i], quantity: items[i].quantity + qty };
    else items.push({ kind: 'product', product_id: product.id, product, quantity: qty });
    set({ items });
  },
  addWalletProduct: (wcp, qty = 1) => {
    const items = [...get().items];
    const i = items.findIndex((x) => x.kind === 'wallet_product' && x.wallet_channel_product_id === wcp.id);
    const unit = Number(wcp.default_sale_price) || 0;
    if (i >= 0) items[i] = { ...items[i], quantity: items[i].quantity + qty };
    else
      items.push({
        kind: 'wallet_product',
        wallet_channel_product_id: wcp.id,
        wcp,
        quantity: qty,
        unit_price: unit,
      });
    set({ items });
  },
  setQty: (productId, quantity) => {
    const q = Math.max(1, Number(quantity) || 1);
    set({
      items: get().items.map((x) => (x.kind === 'product' && x.product_id === productId ? { ...x, quantity: q } : x)),
    });
  },
  setWalletQty: (walletChannelProductId, quantity) => {
    const q = Math.max(1, Number(quantity) || 1);
    set({
      items: get().items.map((x) =>
        x.kind === 'wallet_product' && x.wallet_channel_product_id === walletChannelProductId ? { ...x, quantity: q } : x
      ),
    });
  },
  setWalletUnitPrice: (walletChannelProductId, price) => {
    const u = Math.max(0, Number(price) || 0);
    set({
      items: get().items.map((x) =>
        x.kind === 'wallet_product' && x.wallet_channel_product_id === walletChannelProductId ? { ...x, unit_price: u } : x
      ),
    });
  },
  removeItem: (productId) => set({ items: get().items.filter((x) => !(x.kind === 'product' && x.product_id === productId)) }),
  removeWalletItem: (walletChannelProductId) =>
    set({ items: get().items.filter((x) => !(x.kind === 'wallet_product' && x.wallet_channel_product_id === walletChannelProductId)) }),
  clear: () =>
    set({ items: [], resellerId: null, customerId: null, discount: 0, taxPercent: 0, notes: '', walletChannel: '' }),
}));
