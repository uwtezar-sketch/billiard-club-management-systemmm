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

interface ActiveTable {
  id: number;
  name: string;
  type: string;
  isActive: boolean;
  activeSession?: { id: number; customerName: string | null } | null;
}

interface Debtor {
  id: number;
  name: string;
  phone: string | null;
}

const TYPE_ICON: Record<string, string> = { snooker: "🎱", eightball: "🎳", playstation: "🎮" };

export default function CafeSection() {
  const { showToast } = useToast();
  const [menuItems, setMenuItems] = useState<CafeMenuItem[]>([]);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "debt">("cash");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [successModal, setSuccessModal] = useState(false);
  const [lastInvoice, setLastInvoice] = useState<{ invoiceNumber: string; total: number } | null>(null);

  const [targetTableId, setTargetTableId] = useState<string>("");
  const [activeTables, setActiveTables] = useState<ActiveTable[]>([]);

  const [debtorsList, setDebtorsList] = useState<Debtor[]>([]);
  const [debtorId, setDebtorId] = useState<number | "">("");
  const [newDebtorName, setNewDebtorName] = useState("");
  const [newDebtorPhone, setNewDebtorPhone] = useState("");

  const fetchMenu = useCallback(async () => {
    const res = await fetch("/api/cafe");
    setMenuItems(await res.json());
  }, []);

  const fetchActiveTables = useCallback(async () => {
    const res = await fetch("/api/tables");
    const data = await res.json();
    setActiveTables(Array.isArray(data) ? data.filter((t: ActiveTable) => t.isActive) : []);
  }, []);

  useEffect(() => { fetchMenu(); fetchActiveTables(); }, [fetchMenu, fetchActiveTables]);

  useEffect(() => {
    if (paymentMethod === "debt") {
      fetch("/api/debtors").then((r) => r.json()).then((d) => setDebtorsList(Array.isArray(d) ? d : []));
    }
  }, [paymentMethod]);

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
  const filteredMenu = menuItems.filter((m) => m.name.includes(search));

  function resetForm() {
    setCart([]);
    setCustomerName("");
    setCustomerPhone("");
    setNotes("");
    setTargetTableId("");
    setDebtorId("");
    setNewDebtorName("");
    setNewDebtorPhone("");
    setPaymentMethod("cash");
  }

  async function handleSubmit() {
    if (cart.length === 0) { showToast("سبد خرید خالی است", "error"); return; }

    if (targetTableId) {
      const table = activeTables.find((t) => String(t.id) === targetTableId);
      if (!table?.activeSession) { showToast("میز انتخاب‌شده فعال نیست", "error"); return; }
      setSubmitting(true);
      try {
        for (const c of cart) {
          await fetch(`/api/sessions/${table.activeSession.id}/cafe`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              cafeItemId: c.item.id,
              name: c.item.name,
              quantity: c.qty,
              unitPrice: Number(c.item.price),
            }),
          });
        }
        showToast(`سفارش به ${table.name} اضافه شد`, "success");
        resetForm();
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (paymentMethod === "debt" && !debtorId && !newDebtorName) {
      showToast("نام بدهکار را وارد کنید", "error");
      return;
    }

    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
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
        status: paymentMethod === "debt" ? "debt" : "paid",
        notes,
        jalaaliDate: todayJalaali(),
      };
      if (paymentMethod === "debt") {
        if (debtorId) body.debtorId = debtorId;
        else {
          body.newDebtorName = newDebtorName;
          body.newDebtorPhone = newDebtorPhone || null;
        }
      }

      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const inv = await res.json();
        setLastInvoice({ invoiceNumber: inv.invoiceNumber, total });
        setSuccessModal(true);
        resetForm();
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
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-white">☕ منوی کافه</h2>
        </div>
        {menuItems.length > 6 && (
          <input
            className="form-input mb-3"
            placeholder="جستجوی آیتم..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        )}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {filteredMenu.map((item) => (
            <button
              key={item.id}
              className="rounded-xl p-3 text-right transition-colors"
              style={{ background: "#1a2420", border: "1px solid #26332a" }}
              onClick={() => addToCart(item)}
            >
              <div className="font-medium text-white text-sm">{item.name}</div>
              <div className="text-sm mt-1" style={{ color: "#e0b23a" }}>{formatPrice(Number(item.price))}</div>
            </button>
          ))}
          {filteredMenu.length === 0 && (
            <div className="col-span-full text-center text-slate-500 text-sm py-4">آیتمی یافت نشد</div>
          )}
        </div>
      </div>

      {/* Cart */}
      {cart.length > 0 && (
        <div className="card">
          <h3 className="font-bold text-slate-300 mb-3">🛒 سبد سفارش</h3>
          <div className="space-y-2">
            {cart.map((c) => (
              <div key={c.item.id} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: "#0e1512" }}>
                <div className="text-white text-sm">{c.item.name}</div>
                <div className="flex items-center gap-2">
                  <button
                    className="w-7 h-7 rounded-full text-white text-lg leading-none"
                    style={{ background: "#26332a" }}
                    onClick={() => removeFromCart(c.item.id)}
                  >−</button>
                  <span className="text-white font-bold w-6 text-center">{c.qty}</span>
                  <button
                    className="w-7 h-7 rounded-full text-white text-lg leading-none"
                    style={{ background: "#26332a" }}
                    onClick={() => addToCart(c.item)}
                  >+</button>
                  <span className="text-sm w-24 text-left" style={{ color: "#5ee89b" }} dir="ltr">
                    {formatPrice(Number(c.item.price) * c.qty)}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="divider" />
          <div className="flex justify-between font-bold text-lg mb-4">
            <span className="text-white">جمع:</span>
            <span style={{ color: "#5ee89b" }}>{formatPrice(total)}</span>
          </div>

          {activeTables.length > 0 && (
            <div className="mb-3">
              <label className="block text-xs text-slate-400 mb-1">این سفارش برای کجاست؟</label>
              <select className="form-input" value={targetTableId} onChange={(e) => setTargetTableId(e.target.value)}>
                <option value="">🧾 فروش مستقل کافه (فاکتور جدا)</option>
                {activeTables.map((t) => (
                  <option key={t.id} value={t.id}>
                    {TYPE_ICON[t.type] || ""} افزودن به {t.name}{t.activeSession?.customerName ? ` — ${t.activeSession.customerName}` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          {!targetTableId && (
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
                {(["cash", "card", "debt"] as const).map((m) => (
                  <button
                    key={m}
                    className={`btn btn-sm flex-1 ${paymentMethod === m ? "btn-primary" : "btn-secondary"}`}
                    onClick={() => setPaymentMethod(m)}
                  >
                    {m === "cash" ? "💵 نقدی" : m === "card" ? "💳 کارت" : "📋 بدهکاری"}
                  </button>
                ))}
              </div>

              {paymentMethod === "debt" && (
                <div className="space-y-2 rounded-lg p-3" style={{ background: "#0e1512", border: "1px solid #26332a" }}>
                  <select className="form-input" value={debtorId} onChange={(e) => setDebtorId(e.target.value ? Number(e.target.value) : "")}>
                    <option value="">+ بدهکار جدید</option>
                    {debtorsList.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}{d.phone ? ` (${d.phone})` : ""}</option>
                    ))}
                  </select>
                  {!debtorId && (
                    <>
                      <input className="form-input" placeholder="نام بدهکار جدید" value={newDebtorName} onChange={(e) => setNewDebtorName(e.target.value)} />
                      <input className="form-input" placeholder="شماره تلفن (اختیاری)" dir="ltr" value={newDebtorPhone} onChange={(e) => setNewDebtorPhone(e.target.value)} />
                    </>
                  )}
                </div>
              )}

              <input className="form-input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="یادداشت..." />
            </div>
          )}

          <button
            className="btn btn-success btn-full btn-lg mt-3"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting
              ? "در حال ثبت..."
              : targetTableId
              ? "➕ افزودن به میز"
              : "✅ صدور فاکتور کافه"}
          </button>
        </div>
      )}

      <Modal open={successModal} onClose={() => setSuccessModal(false)} title="فاکتور صادر شد">
        <div className="text-center space-y-4">
          <div className="text-5xl">✅</div>
          <div className="text-white font-bold text-lg">فاکتور با موفقیت صادر شد</div>
          <div className="text-slate-400">شماره فاکتور: <span className="text-white font-mono">{lastInvoice?.invoiceNumber}</span></div>
          <div className="text-2xl font-bold" style={{ color: "#5ee89b" }}>{lastInvoice && formatPrice(lastInvoice.total)}</div>
          <button className="btn btn-primary btn-full" onClick={() => setSuccessModal(false)}>بستن</button>
        </div>
      </Modal>
    </div>
  );
}
