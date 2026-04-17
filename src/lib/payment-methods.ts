export type PaymentMethodId =
  | "cashapp"
  | "zelle"
  | "paypal"
  | "applepay"
  | "bitcoin"
  | "chime"
  | "card";

export interface PaymentMethod {
  id: PaymentMethodId;
  name: string;
  description: string;
  emoji: string;
}

export const PAYMENT_METHODS: PaymentMethod[] = [
  { id: "cashapp", name: "CashApp", description: "Send via $cashtag", emoji: "💵" },
  { id: "zelle", name: "Zelle", description: "Bank-to-bank transfer", emoji: "🏦" },
  { id: "paypal", name: "PayPal", description: "Email or PayPal.me link", emoji: "🅿️" },
  { id: "applepay", name: "Apple Pay", description: "Phone number transfer", emoji: "" },
  { id: "bitcoin", name: "Bitcoin", description: "Wallet address", emoji: "₿" },
  { id: "chime", name: "Chime", description: "ChimeSign / Pay Anyone", emoji: "💳" },
  { id: "card", name: "Credit Card", description: "Manual card entry (simulation)", emoji: "💳" },
];

export function getPaymentMethod(id: string): PaymentMethod | undefined {
  return PAYMENT_METHODS.find((m) => m.id === id);
}
