// Where Stripe sends people back after paying or setting up payouts.
(() => {
  const status = new URLSearchParams(location.search).get('status');
  const text = {
    paid: ['Thanks for your order', 'Your payment went through. You’ll see the order as paid in Mäka under Settings & safety → Orders once the store’s payment provider confirms it, usually within a minute.'],
    cancelled: ['Payment not completed', 'No payment was taken. Your order is still saved in Mäka, where you can pay or cancel it.'],
    onboarded: ['Payout details sent', 'Thanks. Go back to Mäka → Studio to check whether your store can accept payments. Some details may still be under review.'],
    onboarding_expired: ['Link expired', 'Go back to Mäka → Studio and tap “Accept payments” again to continue.'],
  }[status] || ['Back to Mäka', ''];
  document.getElementById('t').textContent = text[0];
  document.getElementById('m').textContent = text[1];
  document.title = text[0] + ' · Mäka';
})();
