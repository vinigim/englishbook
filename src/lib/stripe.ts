import Stripe from "stripe";

// Client lazy — só instancia quando alguma propriedade é acessada (em runtime),
// não no import. Assim o build/deploy não quebra quando STRIPE_SECRET_KEY não
// está definido (por exemplo, num deploy que use apenas o módulo Lux Derma).
let _stripe: Stripe | null = null;

function getStripe(): Stripe {
  if (!_stripe) {
    const apiKey = process.env.STRIPE_SECRET_KEY;
    if (!apiKey) {
      throw new Error("STRIPE_SECRET_KEY não configurado");
    }
    _stripe = new Stripe(apiKey, {
      apiVersion: "2024-11-20.acacia",
      typescript: true,
    });
  }
  return _stripe;
}

export const stripe = new Proxy({} as Stripe, {
  get(_target, prop, receiver) {
    const client = getStripe();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
