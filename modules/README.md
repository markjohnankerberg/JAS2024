
# Donation Checkout (HubSpot Custom Module)

This package contains a drop-in custom module that implements the full one-time donation flow
(Stripe Elements + HubSpot form field routing by step) and optional "Monthly" buttons that redirect
to URLs you configure.

## Install

1. In HubSpot, go to **Settings → Tools → Website → Themes → Design Tools** (Design Manager).
2. Click **File → Import → Import module** and upload the ZIP in this folder: `donation_checkout.module.zip`.
3. The module named **Donation Checkout** will appear in your modules list.

## Configure

- **Donation Type**: choose "General" or "Other".
- **HubSpot Form**: pick your form (fields can be routed to steps by adding "step = 1", "step = 2", etc. to the **Help text** of each field).
- **One-Time Amount Buttons**: add as many as you want. Each needs a display label, amount, Stripe Product ID, and SKU/Price code.
- **Custom Amount**: set the Stripe product and SKU/Price to use when donor types a custom amount.
- **Monthly Buttons**: optional. Add label + link destinations (open in new tab or same window).
- **After Submit Messages**: customize success/stripe error/backend error texts shown in the final screen.

## Notes

- The module expects your backend endpoint `https://one-time-donations-53e8fb8377dd.herokuapp.com/` to return `{ "publishableKey": "pk_live_..." }` at GET `/` and to create a PaymentIntent at POST `/create-payment-intent`.
- The calendar premium checkbox automatically appears when the donation total is **$100+** and adds SKU `CAL-26` to the order metadata.
- For field routing, add **Help Text** like: `step = 1` (Amount), `step = 2` (Personal), `step = 3` (Billing), `step = 4` (Shipping), and anything else to **FINAL** is automatically appended to the last step.
