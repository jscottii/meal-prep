// Small bits of screen state shared across pages.
export const ui = $state({
  cart: sessionStorage.getItem('wfd-cart') || 'home',   // 'home' | cart id | 'new'
  cartPicker: false,
  receipt: false,
  calendar: false,
});
export function openCart(id) { ui.cart = id; ui.cartPicker = false; try { sessionStorage.setItem('wfd-cart', id); } catch {} }
