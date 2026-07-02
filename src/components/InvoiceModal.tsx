"use client";
import { useState, useEffect } from "react";
import Modal from "./Modal";
import { formatDuration, calcPrice, formatPrice, toJalaali } from "@/lib/jalaali";
import { useToast } from "./Toast";

interface Session {
  id: number;
  tableId: number;
  customerName: string | null;
  customerPhone: string | null;
  startTime: string;
  pricePerHour: string;
  notes: string | null;
  status: string;
}

interface Table {
  id: number;
  name: string;
  type: string;
}

interface CafeOrder {
  id: number;
  cafeItemId: number | null;
  name: string;
  quantity: number;
  unitPrice: string;
  totalPrice: string;
  customerName: string | null;
}

interface CafeMenuItem {
  id: number;
  name: string;
  price: string;
}

interface Debtor {
  id: number;
  name: string;
  phone: string | null;
}

interface InvoiceModalProps {
  open: boolean;
  session: Session;
  table: Table;
  cafeOrders: CafeOrder[];
  isPartial: boolean;
  menuItems: CafeMenuItem[];
  onClose: () => void;
  onSuccess: () => void;
}

export default function InvoiceModal({
  open,
  session,
  table,
  cafeOrders,
  isPartial,
  menuItems,
  onClose,
  onSuccess,
}: InvoiceModalProps) {
  const { showToast } = useToast();
  const now = new Date();
  const startTime = new Date(session.startTime);
  const durationMinutes = Math.floor((now.getTime() - startTime.getTime()) / 60000);

  const [customerName, setCustomerName] = useState(session.customerName || "");
  const [customerPhone, setCustomerPhone] = useState(session.customerPhone || "");
  const [endTime, setEndTime] = useState(`${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`);
  const [selectedCafeItems, setSelectedCafeItems] = useState<CafeOrder[]>(cafeOrders);
  const [discountType, setDiscountType] = useState<"none" | "percent" | "fixed">("none");
  const [discountValue, setDiscountValue] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "debt">("cash");
  const [invoiceStatus, setInvoiceStatus] = useState<"paid" | "debt" | "pending">("paid");
  const [notes, setNotes] = useState("");
  const [debtors, setDebtors] = useState<Debtor[]>([]);
  const [selectedDebtorId, setSelectedDebtorId] = useState<number | null>(null);
  const [newDebtorName, setNewDebtorName] = useState(session.customerName || "");
  const [newDebtorPhone, setNewDebtorPhone] = useState(session.customerPhone || "");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (paymentMethod === "debt") {
      fetch("/api/debtors").then((r) => r.json()).then((d) => setDebtors(Array.isArray(d) ? d : []));
    }
  }, [paymentMethod]);

  const actualEnd = new Date();
  if (endTime) {
    const [h, m] = endTime.split(":").map(Number);
    actualEnd.setHours(h, m, 0, 0);
  }
  const actualDuration = Math.max(1, Math.floor((actualEnd.getTime() - startTime.getTime()) / 60000));
  const gamePrice = calcPrice(actualDuration, Number(session.pricePerHour));
  const cafeTotal = selectedCafeItems.reduce((s, o) => s + Number(o.totalPrice), 0);
  const subtotal = gamePrice + cafeTotal;

  let discountAmount = 0;
  if (discountType === "percent") discountAmount = Math.round(subtotal * (Number(discountValue || 0) / 100));
  if (discountType === "fixed") discountAmount = Number(discountValue || 0);
  const totalAmount = Math.max(0, subtotal - discountAmount);

  function addMenuItemToInvoice(item: CafeMenuItem) {
    const existing = selectedCafeItems.find((o) => o.name === item.name && !o.id);
    if (existing) {
      setSelectedCafeItems((prev) =>
        prev.map((o) =>
          o === existing
            ? { ...o, quantity: o.quantity + 1, totalPrice: String((o.quantity + 1) * Number(o.unitPrice)) }
            : o
        )
      );
    } else {
      setSelectedCafeItems((prev) => [
        ...prev,
        {
          id: 0,
          name: item.name,
          quantity: 1,
          unitPrice: item.price,
          totalPrice: item.price,
          customerName: null,
        },
      ]);
    }
  }

  function removeFromInvoice(idx: number) {
    setSelectedCafeItems((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit() {
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      const body: Record<string, unknown> = {
        sessionId: isPartial ? null : session.id,
        tableId: table.id,
        customerName: customerName || null,
        customerPhone: customerPhone || null,
        tableType: table.type,
        tableName: table.name,
        startTime: session.startTime,
        endTime: actualEnd.toISOString(),
        durationMinutes: actualDuration,
        pricePerHour: Number(session.pricePerHour),
        gamePrice,
        cafeItems: selectedCafeItems.map((o) => ({
          cafeItemId: o.id || null,
          name: o.name,
          quantity: o.quantity,
          unitPrice: Number(o.unitPrice),
          totalPrice: Number(o.totalPrice),
        })),
        discountType: discountType === "none" ? null : discountType,
        discountValue: discountType !== "none" ? Number(discountValue || 0) : 0,
        paymentMethod,
        status: paymentMethod === "debt" ? "debt" : invoiceStatus,
        isPartial,
        notes,
      };

      if (paymentMethod === "debt") {
        body.debtorId = selectedDebtorId || null;
        if (!selectedDebtorId) {
          body.newDebtorName = newDebtorName || customerName || "نامشخص";
          body.newDebtorPhone = newDebtorPhone || customerPhone || null;
        }
      }

      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        onSuccess();
      } else {
        const err = await res.json();
        showToast(err.error || "خطا در صدور فاکتور", "error");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isPartial ? "فاکتور جزئی" : "فاکتور نهایی"}
      size="lg"
    >
      <div className="space-y-4">
        {/* Info banner */}
        <div className="bg-slate-800 rounded-lg p-3 text-sm">
          <div className="grid grid-cols-2 gap-2 text-slate-300">
            <div>📍 <span className="text-white">{table.name}</span></div>
            <div>⏱ <span className="text-white">{formatDuration(actualDuration)}</span></div>
            <div>🕐 شروع: <span className="text-white">{startTime.toTimeString().slice(0, 5)}</span></div>
            <div>💰 قیمت/ساعت: <span className="text-white">{formatPrice(Number(session.pricePerHour))}</span></div>
          </div>
        </div>

        {/* End Time */}
        {!isPartial && (
          <div>
            <label className="block text-sm text-slate-400 mb-1">ساعت پایان</label>
            <input type="time" className="form-input" value={endTime} onChange={(e) => setEndTime(e.target.value)} dir="ltr" />
          </div>
        )}

        {/* Customer */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm text-slate-400 mb-1">نام مشتری</label>
            <input className="form-input" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="اختیاری" />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">شماره تلفن</label>
            <input className="form-input" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="09..." type="tel" dir="ltr" />
          </div>
        </div>

        {/* Cafe Items */}
        <div className="card">
          <h3 className="text-sm font-bold text-slate-300 mb-2">☕ آیتم‌های کافه</h3>
          {selectedCafeItems.length > 0 && (
            <div className="space-y-1 mb-3">
              {selectedCafeItems.map((item, idx) => (
                <div key={idx} className="flex justify-between items-center bg-slate-800 rounded px-3 py-2 text-sm">
                  <div>
                    <span className="text-white">{item.name}</span>
                    <span className="text-slate-400 mr-2">×{item.quantity}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-green-400">{formatPrice(Number(item.totalPrice))}</span>
                    <button className="text-red-400 text-xs" onClick={() => removeFromInvoice(idx)}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {menuItems.map((item) => (
              <button
                key={item.id}
                className="bg-slate-700 hover:bg-slate-600 rounded-lg p-2 text-right text-xs transition-colors"
                onClick={() => addMenuItemToInvoice(item)}
              >
                <div className="text-white font-medium">{item.name}</div>
                <div className="text-green-400">{formatPrice(Number(item.price))}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Discount */}
        <div className="card">
          <h3 className="text-sm font-bold text-slate-300 mb-2">🏷️ تخفیف</h3>
          <div className="flex gap-2 mb-2">
            {(["none", "percent", "fixed"] as const).map((t) => (
              <button
                key={t}
                className={`btn btn-sm ${discountType === t ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setDiscountType(t)}
              >
                {t === "none" ? "بدون تخفیف" : t === "percent" ? "درصدی" : "مبلغ ثابت"}
              </button>
            ))}
          </div>
          {discountType !== "none" && (
            <input
              type="number"
              className="form-input"
              placeholder={discountType === "percent" ? "درصد تخفیف..." : "مبلغ تخفیف (تومان)..."}
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
              dir="ltr"
            />
          )}
        </div>

        {/* Payment Method */}
        <div>
          <label className="block text-sm text-slate-400 mb-2">روش پرداخت</label>
          <div className="grid grid-cols-3 gap-2">
            {(["cash", "card", "debt"] as const).map((m) => (
              <button
                key={m}
                className={`btn btn-sm ${paymentMethod === m ? "btn-primary" : "btn-secondary"}`}
                onClick={() => {
                  setPaymentMethod(m);
                  if (m === "debt") setInvoiceStatus("debt");
                  else setInvoiceStatus("paid");
                }}
              >
                {m === "cash" ? "💵 نقدی" : m === "card" ? "💳 کارت" : "📋 بدهکاری"}
              </button>
            ))}
          </div>
        </div>

        {/* Debt Options */}
        {paymentMethod === "debt" && (
          <div className="card bg-red-950/30 border-red-800">
            <h3 className="text-sm font-bold text-red-400 mb-2">انتقال به حساب بدهکاری</h3>
            <div className="space-y-2">
              <select
                className="form-input"
                value={selectedDebtorId || ""}
                onChange={(e) => setSelectedDebtorId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">مشتری جدید...</option>
                {debtors.map((d) => (
                  <option key={d.id} value={d.id}>{d.name} {d.phone ? `(${d.phone})` : ""}</option>
                ))}
              </select>
              {!selectedDebtorId && (
                <div className="grid grid-cols-2 gap-2">
                  <input
                    className="form-input"
                    placeholder="نام مشتری..."
                    value={newDebtorName}
                    onChange={(e) => setNewDebtorName(e.target.value)}
                  />
                  <input
                    className="form-input"
                    placeholder="شماره تلفن..."
                    value={newDebtorPhone}
                    onChange={(e) => setNewDebtorPhone(e.target.value)}
                    type="tel"
                    dir="ltr"
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Status for non-debt */}
        {paymentMethod !== "debt" && (
          <div>
            <label className="block text-sm text-slate-400 mb-2">وضعیت تسویه</label>
            <div className="grid grid-cols-3 gap-2">
              {(["paid", "pending"] as const).map((s) => (
                <button
                  key={s}
                  className={`btn btn-sm ${invoiceStatus === s ? "btn-primary" : "btn-secondary"}`}
                  onClick={() => setInvoiceStatus(s)}
                >
                  {s === "paid" ? "✅ تسویه شده" : "⏳ در انتظار"}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        <div>
          <label className="block text-sm text-slate-400 mb-1">یادداشت</label>
          <input className="form-input" placeholder="یادداشت آزاد..." value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        {/* Summary */}
        <div className="bg-slate-800 rounded-xl p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">هزینه بازی ({formatDuration(actualDuration)}):</span>
            <span className="text-white">{formatPrice(gamePrice)}</span>
          </div>
          {cafeTotal > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">جمع کافه:</span>
              <span className="text-white">{formatPrice(cafeTotal)}</span>
            </div>
          )}
          {discountAmount > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">تخفیف:</span>
              <span className="text-red-400">-{formatPrice(discountAmount)}</span>
            </div>
          )}
          <div className="divider" />
          <div className="flex justify-between font-bold text-lg">
            <span className="text-white">مبلغ نهایی:</span>
            <span className="text-green-400">{formatPrice(totalAmount)}</span>
          </div>
        </div>

        <div className="flex gap-3">
          <button className="btn btn-secondary flex-1" onClick={onClose}>انصراف</button>
          <button
            className="btn btn-success flex-1 btn-lg"
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? "در حال صدور..." : "✅ صدور فاکتور"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
