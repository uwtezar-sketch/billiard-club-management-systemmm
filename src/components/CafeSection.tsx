"use client";
import { useState, useEffect, useCallback } from "react";
import { useToast } from "./Toast";
import Modal from "./Modal";
import { formatPrice, todayJalaali } from "@/lib/jalaali";

interface CafeMenuItem {
  id: number;
  name: string;
  price: string;
}

interface CartItem {
  item: CafeMenuItem;
  qty: number;
}

export default function CafeSection() {
  const { showToast } = useToast();
  const [menuItems, setMenuItems] = useState<CafeMenuItem[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card">("cash");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [successModal, setSuccessModal] = useState(false);
  const [lastInvoice, setLastInvoice] = useState<{ invoiceNumber: string; total: number } | null>(null);

  const fetchMenu = useCallback(async () => {
    const res = await fetch("/api/cafe");
    setMenuItems(await res.json());
  }, []);

  useEffect(() => { fetchMenu(); }, [fetchMenu]);

  function addToCart(item: CafeMenuItem) {
    setCart((prev) => {
      const existing = prev.find((c) => c.item.id === item.id);
      if (existing) return prev.map((c) => c.item.id === item.id ? { ...c, qty: c.qty + 1 } : c);
      return [...prev, { item, qty: 1 }];
    });
  }

  function removeFromCart(itemId: number) {
    setCart((prev) => {
      const existing = prev.find((c) => c.item.id === itemId);
      if (existing && existing.qty > 1) return prev.map((c) => c.item.id === itemId ? { ...c, qty: c.qty - 1 } : c);
      return prev.filter((c) => c.item.id !== itemId);
    });
  }

  const total = cart.reduce((s, c) => s + Number(c.item.price) * c.qty, 0);

  async function handleSubmit() {
    if (cart.length === 0) { showToast("سبد خرید خالی است", "error"); return; }
    setSubmitting(true);
    try {
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: customerName || null,
          customerPhone: customerPhone || null,
          tableType: null,
          tableName: "کافه",
          gamePrice: 0,
          cafeItems: cart.map((c) => ({
            cafeItemId: c.item.id,
            name: c.item.name,
            quantity: c.qty,
            unitPrice: Number(c.item.price),
            totalPrice: Number(c.item.price) * c.qty,
          })),
          discountType: null,
          discountValue: 0,
          paymentMethod,
          status: "paid",
          notes,
          jalaaliDate: todayJalaali(),
        }),
      });
      if (res.ok) {
        const inv = await res.json();
        setLastInvoice({ invoiceNumber: inv.invoiceNumber, total });
        setSuccessModal(true);
        setCart([]);
        setCustomerName("");
        setCustomerPhone("");
        setNotes("");
      } else {
        showToast("خطا در صدور فاکتور", "error");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <h2 className="font-bold text-white mb-3">☕ منوی کافه</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {menuItems.map((item) => (
            <button
              key={item.id}
              className="bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-xl p-3 text-right transition-colors"
              onClick={() => addToCart(item)}
            >
              <div className="font-medium text-white text-sm">{item.name}</div>
              <div className="text-green-400 text-sm mt-1">{formatPrice(Number(item.price))}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Cart */}
      {cart.length > 0 && (
        <div className="card">
          <h3 className="font-bold text-slate-300 mb-3">🛒 سبد سفارش</h3>
          <div className="space-y-2">
            {cart.map((c) => (
              <div key={c.item.id} className="flex items-center justify-between bg-slate-800 rounded-lg px-3 py-2">
                <div className="text-white text-sm">{c.item.name}</div>
                <div className="flex items-center gap-2">
                  <button
                    className="w-7 h-7 bg-slate-700 hover:bg-slate-600 rounded-full text-white text-lg leading-none"
                    onClick={() => removeFromCart(c.item.id)}
                  >−</button>
                  <span className="text-white font-bold w-6 text-center">{c.qty}</span>
                  <button
                    className="w-7 h-7 bg-slate-700 hover:bg-slate-600 rounded-full text-white text-lg leading-none"
                    onClick={() => addToCart(c.item)}
                  >+</button>
                  <span className="text-green-400 text-sm w-24 text-left" dir="ltr">
                    {formatPrice(Number(c.item.price) * c.qty)}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="divider" />
          <div className="flex justify-between font-bold text-lg mb-4">
            <span className="text-white">جمع:</span>
            <span className="text-green-400">{formatPrice(total)}</span>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">نام مشتری</label>
                <input className="form-input" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="اختیاری" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">تلفن</label>
                <input className="form-input" type="tel" dir="ltr" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="09..." />
              </div>
            </div>

            <div className="flex gap-2">
              {(["cash", "card"] as const).map((m) => (
                <button
                  key={m}
                  className={`btn btn-sm flex-1 ${paymentMethod === m ? "btn-primary" : "btn-secondary"}`}
                  onClick={() => setPaymentMethod(m)}
                >
                  {m === "cash" ? "💵 نقدی" : "💳 کارت"}
                </button>
              ))}
            </div>

            <input className="form-input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="یادداشت..." />

            <button
              className="btn btn-success btn-full btn-lg"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? "در حال صدور..." : "✅ صدور فاکتور کافه"}
            </button>
          </div>
        </div>
      )}

      <Modal open={successModal} onClose={() => setSuccessModal(false)} title="فاکتور صادر شد">
        <div className="text-center space-y-4">
          <div className="text-5xl">✅</div>
          <div className="text-white font-bold text-lg">فاکتور با موفقیت صادر شد</div>
          <div className="text-slate-400">شماره فاکتور: <span className="text-white font-mono">{lastInvoice?.invoiceNumber}</span></div>
          <div className="text-2xl font-bold text-green-400">{lastInvoice && formatPrice(lastInvoice.total)}</div>
          <button className="btn btn-primary btn-full" onClick={() => setSuccessModal(false)}>بستن</button>
        </div>
      </Modal>
    </div>
  );
}
