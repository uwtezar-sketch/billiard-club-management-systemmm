"use client";
import { useState, useEffect } from "react";
import Modal from "./Modal";
import { formatDuration, calcPrice, formatPrice, toJalaali } from "@/lib/jalaali";
import { useToast } from "./Toast";
import CustomerNameAutocomplete from "./CustomerNameAutocomplete";
import { normalizePhone } from "@/lib/phone";

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

interface ShareForm {
  key: string;
  label: string;
  phone: string;
  amount: string; // متن، برای راحتی ویرایش دستی
  status: "paid" | "debt" | "pending";
  paymentMethod: "cash" | "card" | null; // فقط وقتی status='paid'
  debtorId: number | null;
  newDebtorName: string;
  newDebtorPhone: string;
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
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "debt">("card");
  const [invoiceStatus, setInvoiceStatus] = useState<"paid" | "debt" | "pending">("paid");
  const [notes, setNotes] = useState("");
  const [debtors, setDebtors] = useState<Debtor[]>([]);
  const [customerDirectory, setCustomerDirectory] = useState<{ id: number; name: string; phone: string }[]>([]);

  useEffect(() => {
    fetch("/api/customers")
      .then((r) => r.json())
      .then((d) => setCustomerDirectory(Array.isArray(d) ? d.map((c: { id: number; name: string; phone: string }) => ({ id: c.id, name: c.name, phone: c.phone })) : []))
      .catch(() => {});
  }, []);

  // ── امتیاز وفاداری هنگام تسویه (Smart Loyalty) ────────────────────────
  const normalizedInvoicePhone = normalizePhone(customerPhone);
  const matchedCustomer = normalizedInvoicePhone.length >= 10 ? customerDirectory.find((c) => normalizePhone(c.phone) === normalizedInvoicePhone) || null : null;
  const [loyaltyDetail, setLoyaltyDetail] = useState<{ loyaltyPoints: number; smartLoyalty: { effectivePointValue: number; maxDiscountPercent: number; score: number; tier: string; mode: string } } | null>(null);
  const [usePoints, setUsePoints] = useState(false);
  const [pointsInput, setPointsInput] = useState("");

  useEffect(() => {
    if (!matchedCustomer) {
      setLoyaltyDetail(null);
      setUsePoints(false);
      setPointsInput("");
      return;
    }
    fetch(`/api/customers/${matchedCustomer.id}`)
      .then((r) => r.json())
      .then((d) => setLoyaltyDetail({ loyaltyPoints: d.loyaltyPoints || 0, smartLoyalty: d.smartLoyalty }))
      .catch(() => setLoyaltyDetail(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchedCustomer?.id]);
  const [selectedDebtorId, setSelectedDebtorId] = useState<number | null>(null);
  const [newDebtorName, setNewDebtorName] = useState(session.customerName || "");
  const [newDebtorPhone, setNewDebtorPhone] = useState(session.customerPhone || "");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── ویرایش دستی مبلغ نهایی ─────────────────────────────────────────────
  const [isManualTotal, setIsManualTotal] = useState(false);
  const [manualTotalInput, setManualTotalInput] = useState("");

  // ── تقسیم فاکتور بین چند نفر ──────────────────────────────────────────
  const [isSplitMode, setIsSplitMode] = useState(false);
  const [shares, setShares] = useState<ShareForm[]>([]);

  function makeShare(label: string, amount: number): ShareForm {
    return {
      key: Math.random().toString(36).slice(2),
      label,
      phone: "",
      amount: String(amount),
      status: "pending",
      paymentMethod: "card",
      debtorId: null,
      newDebtorName: "",
      newDebtorPhone: "",
    };
  }

  function enableSplitMode() {
    setIsSplitMode(true);
    const half1 = Math.round(referenceTotal / 2);
    const half2 = referenceTotal - half1;
    setShares([makeShare("", half1), makeShare("", half2)]);
  }

  function disableSplitMode() {
    setIsSplitMode(false);
    setShares([]);
  }

  function addShare() {
    setShares((prev) => [...prev, makeShare("", 0)]);
  }

  function removeShare(key: string) {
    setShares((prev) => prev.filter((s) => s.key !== key));
  }

  function updateShare(key: string, patch: Partial<ShareForm>) {
    setShares((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  }

  function splitEqually() {
    setShares((prev) => {
      if (prev.length === 0) return prev;
      const base = Math.floor(referenceTotal / prev.length);
      const remainder = referenceTotal - base * prev.length;
      return prev.map((s, i) => ({ ...s, amount: String(base + (i === prev.length - 1 ? remainder : 0)) }));
    });
  }

  useEffect(() => {
    if (paymentMethod === "debt" || isSplitMode) {
      fetch("/api/debtors").then((r) => r.json()).then((d) => setDebtors(Array.isArray(d) ? d : []));
    }
  }, [paymentMethod, isSplitMode]);

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

  // ── سقفِ تخفیفِ امتیازی: بر اساس مبلغِ قابل‌پرداخت بعد از تخفیف عادی، قبل از تخفیف امتیازی ─────
  const amountBeforePointsDiscount = Math.max(0, subtotal - discountAmount);
  const effectivePointValue = loyaltyDetail?.smartLoyalty.effectivePointValue || 500;
  const maxDiscountPercent = loyaltyDetail?.smartLoyalty.maxDiscountPercent ?? 10;
  const maxPointsByCap = effectivePointValue > 0 ? Math.floor((amountBeforePointsDiscount * (maxDiscountPercent / 100)) / effectivePointValue) : 0;
  const maxRedeemablePoints = !isSplitMode && loyaltyDetail ? Math.max(0, Math.min(loyaltyDetail.loyaltyPoints, maxPointsByCap)) : 0;
  const pointsToRedeem = usePoints ? Math.max(0, Math.min(Number(pointsInput) || 0, maxRedeemablePoints)) : 0;
  const pointsDiscountAmount = pointsToRedeem * effectivePointValue;

  const totalAmount = Math.max(0, amountBeforePointsDiscount - pointsDiscountAmount);
  const referenceTotal = isManualTotal && manualTotalInput !== "" ? Math.max(0, Number(manualTotalInput)) : totalAmount;
  const sharesSum = shares.reduce((s, sh) => s + (Number(sh.amount) || 0), 0);
  const sharesMismatch = isSplitMode && sharesSum !== referenceTotal;

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
          cafeItemId: item.id,
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
    if (isSplitMode) {
      if (shares.length < 2) {
        showToast("برای تقسیم فاکتور حداقل به ۲ سهم نیاز است", "error");
        return;
      }
      if (sharesMismatch) {
        showToast("جمع سهم‌ها با مبلغ نهایی فاکتور برابر نیست", "error");
        return;
      }
      for (const s of shares) {
        if (s.status === "debt" && !s.debtorId && !s.newDebtorName.trim()) {
          showToast(`برای سهم «${s.label}» باید بدهکار مشخص شود`, "error");
          return;
        }
      }
    }
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
          cafeItemId: o.cafeItemId || null,
          name: o.name,
          quantity: o.quantity,
          unitPrice: Number(o.unitPrice),
          totalPrice: Number(o.totalPrice),
        })),
        discountType: discountType === "none" ? null : discountType,
        discountValue: discountType !== "none" ? Number(discountValue || 0) : 0,
        isPartial,
        notes,
      };

      if (isSplitMode) {
        body.shares = shares.map((s) => ({
          label: s.label || "بدون‌نام",
          phone: s.phone || undefined,
          amount: Number(s.amount) || 0,
          status: s.status,
          paymentMethod: s.status === "paid" ? s.paymentMethod || "card" : s.status === "debt" ? "debt" : null,
          debtorId: s.status === "debt" ? s.debtorId || undefined : undefined,
          newDebtorName: s.status === "debt" && !s.debtorId ? s.newDebtorName || "نامشخص" : undefined,
          newDebtorPhone: s.status === "debt" && !s.debtorId ? s.newDebtorPhone || undefined : undefined,
        }));
      } else {
        body.paymentMethod = paymentMethod;
        body.status = paymentMethod === "debt" ? "debt" : invoiceStatus;
        if (isManualTotal && manualTotalInput !== "") {
          body.manualTotal = Math.max(0, Number(manualTotalInput));
        } else if (pointsToRedeem > 0) {
          // مبلغ نهایی باید شاملِ تخفیفِ امتیازی هم باشه — چون discountType/discountValue فقط
          // تخفیفِ دستیِ عادی رو می‌شناسه، از manualTotal برای اعمال مبلغِ واقعیِ محاسبه‌شده استفاده می‌کنیم
          body.manualTotal = totalAmount;
        }
        if (paymentMethod === "debt") {
          body.debtorId = selectedDebtorId || null;
          if (!selectedDebtorId) {
            body.newDebtorName = newDebtorName || customerName || "نامشخص";
            body.newDebtorPhone = newDebtorPhone || customerPhone || null;
          }
        }
      }

      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const createdInvoice = await res.json().catch(() => null);
        if (!isSplitMode && pointsToRedeem > 0 && matchedCustomer) {
          try {
            await fetch(`/api/customers/${matchedCustomer.id}/points`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                points: pointsToRedeem,
                note: createdInvoice?.invoiceNumber ? `تخفیف هنگام تسویه فاکتور ${createdInvoice.invoiceNumber}` : "تخفیف هنگام تسویه فاکتور",
                capBasisAmount: amountBeforePointsDiscount,
                invoiceId: createdInvoice?.id || undefined,
              }),
            });
          } catch {
            // فاکتور با موفقیت ثبت شده؛ اگه ثبتِ استفاده از امتیاز شکست بخوره، جلوی کارِ کارمند رو نمی‌گیریم
          }
        }
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
            <CustomerNameAutocomplete
              value={customerName}
              directory={customerDirectory}
              placeholder="اختیاری"
              onChange={(name, phone) => {
                setCustomerName(name);
                if (phone && !customerPhone) setCustomerPhone(phone);
              }}
            />
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

        {/* استفاده از امتیاز وفاداری */}
        {!isSplitMode && matchedCustomer && loyaltyDetail && loyaltyDetail.loyaltyPoints > 0 && (
          <div className="card" style={{ borderColor: "#2f6b4f" }}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-bold" style={{ color: "#5ee89b" }}>🎁 امتیاز وفاداری این مشتری</h3>
              <button
                className={`btn btn-sm ${usePoints ? "btn-primary" : "btn-secondary"}`}
                onClick={() => {
                  if (usePoints) {
                    setUsePoints(false);
                    setPointsInput("");
                  } else {
                    setUsePoints(true);
                    setPointsInput(String(maxRedeemablePoints));
                  }
                }}
              >
                {usePoints ? "✕ لغو" : "استفاده کن"}
              </button>
            </div>
            <div className="text-xs text-slate-500">
              {loyaltyDetail.loyaltyPoints.toLocaleString("fa-IR")} امتیاز موجود — حداکثر {maxRedeemablePoints.toLocaleString("fa-IR")} امتیاز روی این فاکتور (سقف {maxDiscountPercent.toLocaleString("fa-IR")}٪)
            </div>
            <div className="text-[10px] text-slate-600 mt-0.5">
              🧠 امتیازِ اعتماد این مشتری: {loyaltyDetail.smartLoyalty.score.toLocaleString("fa-IR")} ({loyaltyDetail.smartLoyalty.mode === "active" ? "فعال" : "سایه"})
            </div>
            {usePoints && (
              <div className="mt-2 space-y-1">
                <input
                  type="number"
                  className="form-input"
                  value={pointsInput}
                  onChange={(e) => setPointsInput(e.target.value)}
                  dir="ltr"
                  max={maxRedeemablePoints}
                />
                <div className="text-xs text-green-400">تخفیفِ اعمال‌شده: {formatPrice(pointsDiscountAmount)}</div>
              </div>
            )}
          </div>
        )}

        {/* ویرایش دستی مبلغ نهایی */}
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold text-slate-300">✏️ ویرایش دستی مبلغ نهایی</h3>
            <button
              className={`btn btn-sm ${isManualTotal ? "btn-primary" : "btn-secondary"}`}
              onClick={() => {
                if (isManualTotal) {
                  setIsManualTotal(false);
                  setManualTotalInput("");
                } else {
                  setIsManualTotal(true);
                  setManualTotalInput(String(totalAmount));
                }
              }}
            >
              {isManualTotal ? "✕ لغو" : "ویرایش"}
            </button>
          </div>
          {isManualTotal && (
            <div className="space-y-1">
              <input
                type="number"
                className="form-input"
                value={manualTotalInput}
                onChange={(e) => setManualTotalInput(e.target.value)}
                dir="ltr"
              />
              <div className="text-xs text-slate-500">مبلغ محاسبه‌شده توسط سیستم: {formatPrice(totalAmount)}</div>
            </div>
          )}
        </div>
        <div>
          <button
            className={`btn btn-sm w-full ${isSplitMode ? "btn-primary" : "btn-secondary"}`}
            onClick={() => (isSplitMode ? disableSplitMode() : enableSplitMode())}
          >
            {isSplitMode ? "✕ لغو تقسیم فاکتور" : "➗ تقسیم فاکتور بین چند نفر"}
          </button>
        </div>

        {isSplitMode ? (
          <div className="card space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-300">سهم‌های فاکتور</h3>
              <div className="flex gap-2">
                <button className="btn btn-xs btn-secondary" onClick={splitEqually}>تقسیم مساوی</button>
                <button className="btn btn-xs btn-secondary" onClick={addShare}>+ افزودن نفر</button>
              </div>
            </div>

            {shares.map((s) => (
              <div key={s.key} className="bg-slate-800 rounded-lg p-3 space-y-2">
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <label className="block text-[10px] text-slate-500 mb-1">نام مشتری</label>
                    <CustomerNameAutocomplete
                      value={s.label}
                      directory={customerDirectory}
                      placeholder="مثلاً علی"
                      onChange={(name, phone) => updateShare(s.key, { label: name, phone: phone && !s.phone ? phone : s.phone })}
                    />
                  </div>
                  {shares.length > 2 && (
                    <button className="text-red-400 text-xs px-2 pb-2" onClick={() => removeShare(s.key)}>✕ حذف</button>
                  )}
                </div>

                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="block text-[10px] text-slate-500 mb-1">تلفن (اختیاری)</label>
                    <input
                      className="form-input w-full"
                      value={s.phone}
                      onChange={(e) => updateShare(s.key, { phone: e.target.value })}
                      type="tel"
                      dir="ltr"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-[10px] text-slate-500 mb-1">مبلغ سهم</label>
                    <input
                      className="form-input w-full"
                      type="number"
                      dir="ltr"
                      value={s.amount}
                      onChange={(e) => updateShare(s.key, { amount: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-1">
                  {(["paid", "debt", "pending"] as const).map((st) => (
                    <button
                      key={st}
                      className={`btn btn-xs col-span-1 ${s.status === st ? "btn-primary" : "btn-secondary"}`}
                      onClick={() => updateShare(s.key, { status: st })}
                    >
                      {st === "paid" ? "✅ تسویه" : st === "debt" ? "📋 بدهی" : "⏳ انتظار"}
                    </button>
                  ))}
                </div>

                {s.status === "paid" && (
                  <div className="flex gap-2">
                    {(["cash", "card"] as const).map((m) => (
                      <button
                        key={m}
                        className={`btn btn-xs flex-1 ${s.paymentMethod === m ? "btn-primary" : "btn-secondary"}`}
                        onClick={() => updateShare(s.key, { paymentMethod: m })}
                      >
                        {m === "cash" ? "💵 نقدی" : "💳 کارت"}
                      </button>
                    ))}
                  </div>
                )}

                {s.status === "debt" && (
                  <div className="space-y-2">
                    <select
                      className="form-input"
                      value={s.debtorId || ""}
                      onChange={(e) => updateShare(s.key, { debtorId: e.target.value ? Number(e.target.value) : null })}
                    >
                      <option value="">مشتری جدید...</option>
                      {debtors.map((d) => (
                        <option key={d.id} value={d.id}>{d.name} {d.phone ? `(${d.phone})` : ""}</option>
                      ))}
                    </select>
                    {!s.debtorId && (
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          className="form-input"
                          placeholder="نام مشتری..."
                          value={s.newDebtorName}
                          onChange={(e) => updateShare(s.key, { newDebtorName: e.target.value })}
                        />
                        <input
                          className="form-input"
                          placeholder="شماره تلفن..."
                          value={s.newDebtorPhone}
                          onChange={(e) => updateShare(s.key, { newDebtorPhone: e.target.value })}
                          type="tel"
                          dir="ltr"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            <div className={`text-sm text-left ${sharesMismatch ? "text-red-400" : "text-green-400"}`} dir="ltr">
              {formatPrice(sharesSum)} / {formatPrice(totalAmount)}
              {sharesMismatch && "  ⚠️ جمع سهم‌ها با مبلغ فاکتور برابر نیست"}
            </div>
          </div>
        ) : (
          <>
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
                      <CustomerNameAutocomplete
                        value={newDebtorName}
                        directory={customerDirectory}
                        placeholder="نام مشتری..."
                        onChange={(name, phone) => {
                          setNewDebtorName(name);
                          if (phone && !newDebtorPhone) setNewDebtorPhone(phone);
                        }}
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
          </>
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
          {pointsDiscountAmount > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">🎁 تخفیفِ امتیازی ({pointsToRedeem.toLocaleString("fa-IR")} امتیاز):</span>
              <span className="text-red-400">-{formatPrice(pointsDiscountAmount)}</span>
            </div>
          )}
          <div className="divider" />
          <div className="flex justify-between font-bold text-lg">
            <span className="text-white">مبلغ نهایی:</span>
            <span className="text-green-400">{formatPrice(referenceTotal)}</span>
          </div>
          {isManualTotal && (
            <div className="text-xs text-yellow-500 text-left">✏️ این مبلغ به‌صورت دستی ویرایش شده</div>
          )}
        </div>

        <div className="flex gap-3">
          <button className="btn btn-secondary flex-1" onClick={onClose}>انصراف</button>
          <button
            className="btn btn-success flex-1 btn-lg"
            onClick={handleSubmit}
            disabled={isSubmitting || sharesMismatch}
          >
            {isSubmitting ? "در حال صدور..." : "✅ صدور فاکتور"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
