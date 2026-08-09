"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import Modal from "./Modal";
import ConfirmDialog from "./ConfirmDialog";
import { useToast } from "./Toast";
import { formatPrice, formatDuration } from "@/lib/jalaali";
import CustomerNameAutocomplete from "./CustomerNameAutocomplete";
import { normalizePhone } from "@/lib/phone";

interface InvoiceItem {
  id: number;
  name: string;
  quantity: number;
  unitPrice: string;
  totalPrice: string;
}

interface ShareItem {
  id: number;
  invoiceId: number;
  label: string;
  phone: string | null;
  amount: string;
  paymentMethod: string | null;
  status: string;
  debtorId: number | null;
  settledAt: string | null;
}

interface Invoice {
  id: number;
  invoiceNumber: string;
  customerName: string | null;
  customerPhone: string | null;
  tableType: string | null;
  tableName: string | null;
  startTime: string | null;
  endTime: string | null;
  durationMinutes: number | null;
  pricePerHour: string | null;
  gamePrice: string;
  cafeTotal: string;
  subtotal: string;
  discountType: string | null;
  discountValue: string | null;
  discountAmount: string | null;
  totalAmount: string;
  paymentMethod: string | null;
  status: string;
  isPartial: boolean;
  isSplit: boolean;
  shares: ShareItem[];
  notes: string | null;
  issuedAt: string;
  issuedByUsername: string | null;
  settledAt: string | null;
  jalaaliDate: string | null;
  items: InvoiceItem[];
}

interface Debtor {
  id: number;
  name: string;
  phone: string | null;
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  paid: { label: "تسویه شده", color: "#5ee89b" },
  pending: { label: "در انتظار", color: "#e0b23a" },
  debt: { label: "بدهکاری", color: "#f27f8a" },
};

const PAYMENT_MAP: Record<string, string> = {
  cash: "💵 نقدی",
  card: "💳 کارت",
  debt: "📋 بدهکاری",
};

const TYPE_MAP: Record<string, string> = {
  snooker: "🎱 اسنوکر",
  eightball: "🎳 ایت‌بال",
  playstation: "🎮 پلی‌استیشن",
};

const RANGE_OPTIONS = [
  { id: "7", label: "۷ روز اخیر" },
  { id: "30", label: "۳۰ روز اخیر" },
  { id: "", label: "همه" },
];

export default function HistorySection() {
  const { showToast } = useToast();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [showAdvancedDate, setShowAdvancedDate] = useState(false);
  const [daysFilter, setDaysFilter] = useState("30");
  const [statusFilter, setStatusFilter] = useState("pending");
  const [typeFilter, setTypeFilter] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("");
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleteInvoiceId, setDeleteInvoiceId] = useState<number | null>(null);

  const [editMethod, setEditMethod] = useState<string>("card");
  const [editStatus, setEditStatus] = useState<string>("pending");
  const [debtorsList, setDebtorsList] = useState<Debtor[]>([]);
  const [customerDirectory, setCustomerDirectory] = useState<{ name: string; phone: string }[]>([]);

  useEffect(() => {
    fetch("/api/customers")
      .then((r) => r.json())
      .then((d) => setCustomerDirectory(Array.isArray(d) ? d.map((c: { name: string; phone: string }) => ({ name: c.name, phone: c.phone })) : []))
      .catch(() => {});
  }, []);
  const [editDebtorId, setEditDebtorId] = useState<number | "">("");
  const [editNewDebtorName, setEditNewDebtorName] = useState("");
  const [editNewDebtorPhone, setEditNewDebtorPhone] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [editCustomerName, setEditCustomerName] = useState("");
  const [editCustomerPhone, setEditCustomerPhone] = useState("");
  const [pendingAll, setPendingAll] = useState<Invoice[]>([]);
  const [expandedGroupKey, setExpandedGroupKey] = useState<string | null>(null);
  const [bulkSettlingKey, setBulkSettlingKey] = useState<string | null>(null);
  const [bulkToDebtKey, setBulkToDebtKey] = useState<string | null>(null);
  const [bulkToDebtConfirm, setBulkToDebtConfirm] = useState<PendingGroup | null>(null);
  const [editingItems, setEditingItems] = useState(false);
  const [cafeMenuItems, setCafeMenuItems] = useState<{ id: number; name: string; price: string }[]>([]);
  const [itemActionLoading, setItemActionLoading] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (paymentFilter) params.set("paymentMethod", paymentFilter);
      if (dateFilter) params.set("date", dateFilter);
      else if (daysFilter) params.set("days", daysFilter);
      if (typeFilter) params.set("tableType", typeFilter);
      if (debouncedSearch) params.set("search", debouncedSearch);
      const res = await fetch(`/api/invoices?${params}`);
      setInvoices(await res.json());
    } catch {
      showToast("خطا در دریافت تاریخچه", "error");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, dateFilter, daysFilter, statusFilter, typeFilter, paymentFilter, showToast]);

  const fetchPendingAll = useCallback(async () => {
    try {
      const res = await fetch(`/api/invoices?status=pending`);
      setPendingAll(await res.json());
    } catch {
      // بی‌سروصدا نادیده گرفته میشه
    }
  }, []);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);
  useEffect(() => { fetchPendingAll(); }, [fetchPendingAll]);

  useEffect(() => {
    if (selectedInvoice) {
      setEditMethod(selectedInvoice.paymentMethod || "cash");
      setEditStatus(selectedInvoice.status === "debt" ? "pending" : selectedInvoice.status);
      setEditDebtorId("");
      setEditNewDebtorName(selectedInvoice.customerName || "");
      setEditNewDebtorPhone(selectedInvoice.customerPhone || "");
      setEditCustomerName(selectedInvoice.customerName || "");
      setEditCustomerPhone(selectedInvoice.customerPhone || "");
      setEditingItems(false);
    }
  }, [selectedInvoice]);

  // ── کارتِ اطلاعاتیِ مشتری (بدهی قبلی + امتیاز) تو پنجره‌ی فاکتور ────────────
  const [customerSummary, setCustomerSummary] = useState<
    Record<string, { customerId: number; name: string; points: number; debts: { date: string; description: string; amount: number }[] } | null>
  >({});
  const [debtDetailsOpen, setDebtDetailsOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!selectedInvoice) return;
    const phones = selectedInvoice.isSplit
      ? selectedInvoice.shares.map((sh) => sh.phone).filter((p): p is string => !!p)
      : [selectedInvoice.customerPhone].filter((p): p is string => !!p);
    const normalizedPhones = [...new Set(phones.map((p) => normalizePhone(p)).filter((p) => p.length >= 10))];
    if (normalizedPhones.length === 0) {
      setCustomerSummary({});
      return;
    }
    fetch(`/api/customers/quick-summary?phones=${normalizedPhones.join(",")}`)
      .then((r) => r.json())
      .then((d) => setCustomerSummary(d || {}))
      .catch(() => setCustomerSummary({}));
    setDebtDetailsOpen({});
  }, [selectedInvoice]);

  function CustomerInfoCard({ phone }: { phone: string | null | undefined }) {
    const normalized = normalizePhone(phone);
    if (normalized.length < 10) return null;
    const summary = customerSummary[normalized];
    if (!summary) return null;
    const hasDebt = summary.debts.length > 0;
    const totalDebt = summary.debts.reduce((s, d) => s + d.amount, 0);
    if (!hasDebt && summary.points <= 0) return null;
    const isOpen = !!debtDetailsOpen[normalized];
    return (
      <div className="rounded-lg p-3 space-y-2" style={{ background: "#0e1512", border: "1px solid #2f6b4f" }}>
        <div className="font-bold text-white">ℹ️ {summary.name}</div>
        {hasDebt && (
          <div className="text-sm" style={{ color: "#f27f8a" }}>💼 بدهی قبلی: {formatPrice(totalDebt)}</div>
        )}
        {summary.points > 0 && (
          <div className="text-sm" style={{ color: "#5ee89b" }}>🎁 امتیاز موجود: {summary.points.toLocaleString("fa-IR")} امتیاز</div>
        )}
        {hasDebt && (
          <button
            className="text-xs"
            style={{ color: "#5ecfe0" }}
            onClick={() => setDebtDetailsOpen((p) => ({ ...p, [normalized]: !p[normalized] }))}
          >
            📋 مشاهده جزئیات بدهی {isOpen ? "▴" : "▾"}
          </button>
        )}
        <div
          style={{
            maxHeight: isOpen ? "400px" : "0px",
            overflow: "hidden",
            transition: "max-height 0.25s ease",
          }}
        >
          <div className="rounded-lg p-2 mt-1 space-y-1" style={{ background: "#141a17" }}>
            <div className="text-[11px] text-slate-400 mb-1">🧾 جزئیات بدهی:</div>
            {summary.debts.map((d, i) => (
              <div key={i} className="flex justify-between text-xs">
                <span className="text-slate-300">{d.date} — {d.description}</span>
                <span className="text-white">{formatPrice(d.amount)}</span>
              </div>
            ))}
            <div className="border-t mt-1 pt-1 flex justify-between text-xs font-bold" style={{ borderColor: "#22282490" }}>
              <span className="text-slate-300">💰 مجموع</span>
              <span style={{ color: "#f27f8a" }}>{formatPrice(totalDebt)}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  useEffect(() => {
    if (editMethod === "debt" && selectedInvoice?.status !== "debt") {
      fetch("/api/debtors").then((r) => r.json()).then((d) => setDebtorsList(Array.isArray(d) ? d : []));
    }
  }, [editMethod, selectedInvoice]);

  async function handleDeleteInvoice() {
    if (!deleteInvoiceId) return;
    const res = await fetch(`/api/invoices/${deleteInvoiceId}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      showToast(data.error || "خطا در حذف فاکتور", "error");
      setDeleteInvoiceId(null);
      return;
    }
    showToast("فاکتور حذف شد", "success");
    setDeleteInvoiceId(null);
    setSelectedInvoice(null);
    fetchInvoices();
  }

  async function handleSavePaymentEdit() {
    if (!selectedInvoice) return;
    const body: Record<string, unknown> = {
      customerName: editCustomerName || null,
      customerPhone: editCustomerPhone || null,
    };

    // فاکتورهای تقسیم‌شده روش پرداخت/وضعیت واحد ندارن (هر سهم جدا مدیریت می‌شه بالاتر)،
    // پس فقط نام/تلفن رو می‌فرستیم و از بقیه‌ی این منطق صرف‌نظر می‌کنیم
    if (!selectedInvoice.isSplit) {
      body.paymentMethod = editMethod;

      const movingToDebt = editMethod === "debt" && selectedInvoice.status !== "debt";
      if (movingToDebt) {
        if (editDebtorId) {
          body.debtorId = editDebtorId;
        } else {
          if (!editNewDebtorName) {
            showToast("نام بدهکار را وارد کنید", "error");
            return;
          }
          body.newDebtorName = editNewDebtorName;
          body.newDebtorPhone = editNewDebtorPhone || null;
        }
      } else if (editMethod !== "debt") {
        body.status = editStatus;
      }
    }

    setSavingEdit(true);
    try {
      const res = await fetch(`/api/invoices/${selectedInvoice.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || "خطا در بروزرسانی فاکتور", "error");
        return;
      }
      showToast("فاکتور بروزرسانی شد", "success");
      setSelectedInvoice(null);
      fetchInvoices();
    } finally {
      setSavingEdit(false);
    }
  }

  interface PendingEntry {
    invoiceId: number;
    invoiceNumber: string;
    jalaaliDate: string | null;
    tableName: string | null;
    amount: number;
    shareId: number | null; // اگه این ورودی مال یک سهمِ فاکتور تقسیم‌شده باشه
    partnerLabel: string | null;
  }

  interface PendingGroup {
    key: string;
    name: string;
    phone: string | null;
    entries: PendingEntry[];
    total: number;
  }

  const [shareDebtorsList, setShareDebtorsList] = useState<Debtor[]>([]);
  const [shareDebtChoice, setShareDebtChoice] = useState<Record<number, { debtorId: number | ""; newName: string; newPhone: string }>>({});
  const [shareNameEdits, setShareNameEdits] = useState<Record<number, { label: string; phone: string }>>({});
  const [shareActionLoading, setShareActionLoading] = useState<number | null>(null);

  useEffect(() => {
    if (selectedInvoice?.isSplit) {
      fetch("/api/debtors").then((r) => r.json()).then((d) => setShareDebtorsList(Array.isArray(d) ? d : []));
      const edits: Record<number, { label: string; phone: string }> = {};
      for (const sh of selectedInvoice.shares) edits[sh.id] = { label: sh.label, phone: sh.phone || "" };
      setShareNameEdits(edits);
    }
  }, [selectedInvoice]);

  async function refreshSelectedInvoice(id: number) {
    const res = await fetch(`/api/invoices/${id}`);
    if (res.ok) {
      const data = await res.json();
      setSelectedInvoice(data);
    }
    fetchInvoices();
    fetchPendingAll();
  }

  async function settleShareAs(shareId: number, status: "paid" | "debt" | "pending", method?: "cash" | "card") {
    if (!selectedInvoice) return;
    setShareActionLoading(shareId);
    try {
      const body: Record<string, unknown> = { status };
      if (status === "paid") body.paymentMethod = method || "cash";
      if (status === "debt") {
        const choice = shareDebtChoice[shareId];
        if (choice?.debtorId) {
          body.debtorId = choice.debtorId;
        } else {
          const sh = selectedInvoice.shares.find((s) => s.id === shareId);
          body.newDebtorName = choice?.newName || sh?.label || "نامشخص";
          body.newDebtorPhone = choice?.newPhone || sh?.phone || undefined;
        }
      }
      const res = await fetch(`/api/invoices/${selectedInvoice.id}/shares/${shareId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || "خطا در تسویه سهم", "error");
        return;
      }
      showToast("سهم بروزرسانی شد", "success");
      await refreshSelectedInvoice(selectedInvoice.id);
    } finally {
      setShareActionLoading(null);
    }
  }

  async function saveShareName(shareId: number) {
    if (!selectedInvoice) return;
    const edit = shareNameEdits[shareId];
    if (!edit) return;
    setShareActionLoading(shareId);
    try {
      const res = await fetch(`/api/invoices/${selectedInvoice.id}/shares/${shareId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: edit.label, phone: edit.phone || null }),
      });
      if (!res.ok) {
        showToast("خطا در ذخیره نام", "error");
        return;
      }
      showToast("نام سهم ذخیره شد", "success");
      await refreshSelectedInvoice(selectedInvoice.id);
    } finally {
      setShareActionLoading(null);
    }
  }

  function normName(s: string | null | undefined): string {
    return (s || "").trim().toLowerCase().replace(/\s+/g, " ");
  }
  function normPhone(s: string | null | undefined): string {
    return (s || "").replace(/\D/g, "");
  }

  const pendingGroups: PendingGroup[] = (() => {
    const map = new Map<string, PendingGroup>();

    function addEntry(name: string, phone: string | null, entry: PendingEntry) {
      const key = normPhone(phone) ? `p:${normPhone(phone)}` : `n:${normName(name)}`;
      if (key === "n:" || key === "p:") return;
      if (!map.has(key)) {
        map.set(key, { key, name: name || "بدون نام", phone, entries: [], total: 0 });
      }
      const g = map.get(key)!;
      if (phone && !g.phone) g.phone = phone;
      g.entries.push(entry);
      g.total += entry.amount;
    }

    for (const inv of pendingAll) {
      if (inv.isSplit) {
        // هر سهمِ «در انتظار» زیر نام و تلفن خودش گروه‌بندی می‌شه — نه زیر نام کلی فاکتور
        for (const sh of inv.shares) {
          if (sh.status !== "pending") continue;
          const partners = inv.shares.filter((x) => x.id !== sh.id).map((x) => x.label).join("، ");
          addEntry(sh.label, sh.phone, {
            invoiceId: inv.id,
            invoiceNumber: inv.invoiceNumber,
            jalaaliDate: inv.jalaaliDate,
            tableName: inv.tableName,
            amount: Number(sh.amount),
            shareId: sh.id,
            partnerLabel: partners || null,
          });
        }
      } else {
        addEntry(inv.customerName || "بدون نام", inv.customerPhone, {
          invoiceId: inv.id,
          invoiceNumber: inv.invoiceNumber,
          jalaaliDate: inv.jalaaliDate,
          tableName: inv.tableName,
          amount: Number(inv.totalAmount),
          shareId: null,
          partnerLabel: null,
        });
      }
    }

    return [...map.values()].filter((g) => g.entries.length >= 2).sort((a, b) => b.total - a.total);
  })();

  async function handleBulkSettle(group: PendingGroup) {
    setBulkSettlingKey(group.key);
    try {
      for (const entry of group.entries) {
        if (entry.shareId) {
          await fetch(`/api/invoices/${entry.invoiceId}/shares/${entry.shareId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "paid", paymentMethod: "card" }),
          });
        } else {
          await fetch(`/api/invoices/${entry.invoiceId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "paid", paymentMethod: "card" }),
          });
        }
      }
      showToast(`همه‌ی فاکتورهای ${group.name} تسویه شد`, "success");
      fetchInvoices();
      fetchPendingAll();
    } finally {
      setBulkSettlingKey(null);
    }
  }

  // انتقالِ همه‌ی فاکتورهای در انتظارِ یک مشتری به بدهکاری، با همون منطقِ «ثبت به‌عنوان بدهکاری»یِ
  // پنجره‌ی فاکتور تکی (findOrCreateDebtor سمتِ سرور خودش جلوی بدهکارِ تکراری رو می‌گیره)
  async function handleBulkToDebt(group: PendingGroup) {
    setBulkToDebtKey(group.key);
    try {
      for (const entry of group.entries) {
        if (entry.shareId) {
          await fetch(`/api/invoices/${entry.invoiceId}/shares/${entry.shareId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "debt", newDebtorName: group.name, newDebtorPhone: group.phone || undefined }),
          });
        } else {
          await fetch(`/api/invoices/${entry.invoiceId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ paymentMethod: "debt", newDebtorName: group.name, newDebtorPhone: group.phone || undefined }),
          });
        }
      }
      showToast(`همه‌ی فاکتورهای ${group.name} به بدهکاری منتقل شد`, "success");
      fetchInvoices();
      fetchPendingAll();
    } finally {
      setBulkToDebtKey(null);
    }
  }

  // بدهیِ قبلیِ هر گروه (به‌تفکیک شماره‌ی مشتری) — همون endpoint سبکی که برای کارتِ پنجره‌ی فاکتور تکی هم استفاده شد
  const [groupSummary, setGroupSummary] = useState<
    Record<string, { customerId: number; name: string; points: number; debts: { date: string; description: string; amount: number }[] } | null>
  >({});

  useEffect(() => {
    const phones = [...new Set(pendingAll.flatMap((inv) => (inv.isSplit ? inv.shares.map((s) => s.phone) : [inv.customerPhone])))]
      .filter((p): p is string => !!p)
      .map((p) => normalizePhone(p))
      .filter((p) => p.length >= 10);
    const normalized = [...new Set(phones)];
    if (normalized.length === 0) {
      setGroupSummary({});
      return;
    }
    fetch(`/api/customers/quick-summary?phones=${normalized.join(",")}`)
      .then((r) => r.json())
      .then((d) => setGroupSummary(d || {}))
      .catch(() => setGroupSummary({}));
  }, [pendingAll]);

  async function fetchCafeMenuItems() {
    try {
      const res = await fetch("/api/cafe");
      setCafeMenuItems(await res.json());
    } catch {
      showToast("خطا در دریافت منوی کافه", "error");
    }
  }

  async function handleAddCafeItem(item: { id: number; name: string; price: string }) {
    if (!selectedInvoice) return;
    setItemActionLoading(true);
    try {
      const res = await fetch(`/api/invoices/${selectedInvoice.id}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cafeItemId: item.id, name: item.name, quantity: 1, unitPrice: Number(item.price) }),
      });
      if (!res.ok) {
        showToast("خطا در افزودن آیتم", "error");
        return;
      }
      const updated = await res.json();
      setSelectedInvoice(updated);
      fetchInvoices();
      showToast(`${item.name} اضافه شد`, "success");
    } finally {
      setItemActionLoading(false);
    }
  }

  async function handleRemoveCafeItem(itemId: number) {
    if (!selectedInvoice) return;
    setItemActionLoading(true);
    try {
      const res = await fetch(`/api/invoices/${selectedInvoice.id}/items?itemId=${itemId}`, { method: "DELETE" });
      if (!res.ok) {
        showToast("خطا در حذف آیتم", "error");
        return;
      }
      const updated = await res.json();
      setSelectedInvoice(updated);
      fetchInvoices();
    } finally {
      setItemActionLoading(false);
    }
  }

  const totalAmountSum = invoices.reduce((s, i) => s + Number(i.totalAmount), 0);

  // فاکتورهای تقسیم‌شده رو به‌ازای هر سهم یک ردیف جدا می‌کنیم، به همراه نام «یار بازی» (بقیه‌ی سهم‌ها)
  const displayRows = useMemo(() => {
    const rows: { invoice: Invoice; share: ShareItem | null; partnerLabel: string | null }[] = [];
    for (const inv of invoices) {
      if (inv.isSplit && inv.shares.length > 0) {
        for (const sh of inv.shares) {
          const partners = inv.shares.filter((s) => s.id !== sh.id).map((s) => s.label).join("، ");
          rows.push({ invoice: inv, share: sh, partnerLabel: partners || null });
        }
      } else {
        rows.push({ invoice: inv, share: null, partnerLabel: null });
      }
    }
    return rows;
  }, [invoices]);

  function handleExportExcel() {
    const headers = ["شماره فاکتور", "تاریخ", "ساعت", "نام مشتری", "تلفن", "میز", "مدت (دقیقه)", "مبلغ", "وضعیت", "روش پرداخت", "ثبت‌کننده"];
    const statusText: Record<string, string> = { paid: "تسویه شده", pending: "در انتظار", debt: "بدهکاری" };
    const paymentText: Record<string, string> = { cash: "نقدی", card: "کارت", debt: "بدهکاری" };
    const rows = invoices.map((inv) => [
      inv.invoiceNumber,
      inv.jalaaliDate || "",
      new Date(inv.issuedAt).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" }),
      inv.customerName || "بدون نام",
      inv.customerPhone || "",
      inv.tableName || "",
      inv.durationMinutes ?? "",
      inv.totalAmount,
      statusText[inv.status] || inv.status,
      inv.paymentMethod ? paymentText[inv.paymentMethod] || inv.paymentMethod : "",
      inv.issuedByUsername || "",
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `تاریخچه-فاکتورها-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="card space-y-3 sticky top-0 z-10" style={{ background: "#121912" }}>
        <input
          className="form-input"
          placeholder="جستجو نام یا شماره فاکتور..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {/* بازه زمانی */}
        <div className="flex gap-2 flex-wrap items-center">
          {RANGE_OPTIONS.map((r) => (
            <button
              key={r.id}
              className={`btn btn-sm ${!dateFilter && daysFilter === r.id ? "btn-primary" : "btn-secondary"}`}
              onClick={() => { setDateFilter(""); setDaysFilter(r.id); }}
            >
              {r.label}
            </button>
          ))}
          <button
            className={`btn btn-sm ${dateFilter ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setShowAdvancedDate((v) => !v)}
          >
            📅 تاریخ خاص
          </button>
        </div>
        {showAdvancedDate && (
          <input
            className="form-input w-full"
            placeholder="تاریخ شمسی (مثلاً 1403/04/25)"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            dir="ltr"
          />
        )}

        {/* وضعیت */}
        <div className="flex gap-2 flex-wrap">
          <button
            className={`btn btn-sm ${!statusFilter ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setStatusFilter("")}
          >همه وضعیت‌ها</button>
          {["paid", "pending", "debt"].map((s) => (
            <button
              key={s}
              className={`btn btn-sm ${statusFilter === s ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setStatusFilter(statusFilter === s ? "" : s)}
            >
              {STATUS_MAP[s]?.label}
            </button>
          ))}
        </div>

        {/* نوع میز و روش پرداخت */}
        <div className="flex gap-2 flex-wrap">
          {["snooker", "eightball", "playstation"].map((t) => (
            <button
              key={t}
              className={`btn btn-sm ${typeFilter === t ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setTypeFilter(typeFilter === t ? "" : t)}
            >
              {TYPE_MAP[t]}
            </button>
          ))}
          <div className="h-4 w-px bg-slate-600 self-center" />
          {["cash", "card", "debt"].map((p) => (
            <button
              key={p}
              className={`btn btn-sm ${paymentFilter === p ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setPaymentFilter(paymentFilter === p ? "" : p)}
            >
              {PAYMENT_MAP[p]}
            </button>
          ))}
        </div>
      </div>

      {/* Pending grouped by customer */}
      {pendingGroups.length > 0 && (
        <div className="card" style={{ borderColor: "#8f1d2c" }}>
          <h3 className="font-bold mb-3" style={{ color: "#f27f8a" }}>
            🔴 فاکتورهای در انتظارِ چندباره (به‌تفکیک مشتری)
          </h3>
          <div className="space-y-2">
            {pendingGroups.map((g) => {
              const isExpanded = expandedGroupKey === g.key;
              return (
                <div key={g.key} className="rounded-lg p-3" style={{ background: "#3d101622", border: "1px solid #8f1d2c55" }}>
                  <div
                    className="flex items-center justify-between cursor-pointer"
                    onClick={() => setExpandedGroupKey(isExpanded ? null : g.key)}
                  >
                    <div>
                      <div className="text-white font-medium">{g.name}</div>
                      <div className="text-xs text-slate-400">
                        {g.entries.length.toLocaleString("fa-IR")} فاکتور در انتظار
                        {g.phone && <span dir="ltr"> — {g.phone}</span>}
                      </div>
                    </div>
                    <div className="font-bold" style={{ color: "#f27f8a" }}>{formatPrice(g.total)}</div>
                  </div>

                  {isExpanded && (
                    <div className="mt-3 space-y-2">
                      {(() => {
                        const normalized = normalizePhone(g.phone);
                        const summary = normalized.length >= 10 ? groupSummary[normalized] : null;
                        const hasDebt = !!summary && summary.debts.length > 0;
                        if (!hasDebt) return null;
                        const totalDebt = summary!.debts.reduce((s, d) => s + d.amount, 0);
                        const isOpen = !!debtDetailsOpen[normalized];
                        return (
                          <div className="rounded-lg p-3 space-y-2" style={{ background: "#0e1512", border: "1px solid #8f1d2c55" }}>
                            <div className="text-sm" style={{ color: "#f27f8a" }}>💼 بدهی قبلی: {formatPrice(totalDebt)}</div>
                            <button
                              className="text-xs"
                              style={{ color: "#5ecfe0" }}
                              onClick={(e) => { e.stopPropagation(); setDebtDetailsOpen((p) => ({ ...p, [normalized]: !p[normalized] })); }}
                            >
                              📋 مشاهده جزئیات بدهی {isOpen ? "▴" : "▾"}
                            </button>
                            <div style={{ maxHeight: isOpen ? "400px" : "0px", overflow: "hidden", transition: "max-height 0.25s ease" }}>
                              <div className="rounded-lg p-2 mt-1 space-y-1" style={{ background: "#141a17" }}>
                                <div className="text-[11px] text-slate-400 mb-1">🧾 جزئیات بدهی:</div>
                                {summary!.debts.map((d, i) => (
                                  <div key={i} className="flex justify-between text-xs">
                                    <span className="text-slate-300">{d.date} — {d.description}</span>
                                    <span className="text-white">{formatPrice(d.amount)}</span>
                                  </div>
                                ))}
                                <div className="border-t mt-1 pt-1 flex justify-between text-xs font-bold" style={{ borderColor: "#22282490" }}>
                                  <span className="text-slate-300">💰 مجموع</span>
                                  <span style={{ color: "#f27f8a" }}>{formatPrice(totalDebt)}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                      {g.entries.map((entry) => (
                        <div key={`${entry.invoiceId}-${entry.shareId || "full"}`} className="flex justify-between text-xs rounded px-3 py-2" style={{ background: "#0e1512" }}>
                          <span className="text-slate-300">
                            {entry.invoiceNumber} — {entry.jalaaliDate} — {entry.tableName || ""}
                            {entry.partnerLabel && (
                              <span style={{ color: "#b794f6" }}> — 🤝 با {entry.partnerLabel}</span>
                            )}
                          </span>
                          <span style={{ color: "#f27f8a" }}>{formatPrice(entry.amount)}</span>
                        </div>
                      ))}
                      <button
                        className="btn btn-success btn-sm btn-full"
                        onClick={() => handleBulkSettle(g)}
                        disabled={bulkSettlingKey === g.key || bulkToDebtKey === g.key}
                      >
                        {bulkSettlingKey === g.key ? "در حال تسویه..." : `✅ تسویه همه (${formatPrice(g.total)})`}
                      </button>
                      <button
                        className="btn btn-secondary btn-sm btn-full"
                        onClick={() => setBulkToDebtConfirm(g)}
                        disabled={bulkSettlingKey === g.key || bulkToDebtKey === g.key}
                      >
                        {bulkToDebtKey === g.key ? "در حال انتقال..." : "📋 انتقال همه به بدهکاری"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Summary */}
      {!loading && invoices.length > 0 && (
        <div className="rounded-xl p-3 flex items-center justify-between gap-2 flex-wrap" style={{ background: "#0d3b2622", border: "1px solid #1a7a4c55" }}>
          <span className="text-sm text-slate-400">{invoices.length.toLocaleString("fa-IR")} فاکتور</span>
          <div className="flex items-center gap-3">
            <span className="font-bold" style={{ color: "#5ee89b" }}>{formatPrice(totalAmountSum)}</span>
            <button className="btn btn-secondary btn-sm" onClick={handleExportExcel}>
              ⬇️ اکسل
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton" style={{ height: "76px" }} />
          ))}
        </div>
      ) : invoices.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-4xl mb-2">📂</div>
          <div className="text-slate-500">فاکتوری با این فیلترها پیدا نشد</div>
        </div>
      ) : (
        <div className="space-y-2">
          {displayRows.map(({ invoice: inv, share, partnerLabel }) => {
            const s = STATUS_MAP[share ? share.status : inv.status] || { label: share ? share.status : inv.status, color: "#8a9488" };
            const time = new Date(inv.issuedAt).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" });
            const displayName = share ? share.label : inv.customerName || "بدون نام";
            const displayAmount = share ? Number(share.amount) : Number(inv.totalAmount);
            const displayMethod = share ? share.paymentMethod : inv.paymentMethod;
            return (
              <div
                key={share ? `${inv.id}-${share.id}` : inv.id}
                className="card cursor-pointer transition-colors"
                onClick={() => setSelectedInvoice(inv)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-slate-500 font-mono">{inv.invoiceNumber}</span>
                      <span
                        className="badge text-xs"
                        style={{ background: s.color + "22", color: s.color }}
                      >
                        {s.label}
                      </span>
                      {inv.isPartial && (
                        <span className="badge text-xs" style={{ background: "#2a8fa022", color: "#5ecfe0" }}>جزئی</span>
                      )}
                      {share && (
                        <span className="badge text-xs" style={{ background: "#6d3fa022", color: "#b794f6" }}>➗ تقسیم‌شده</span>
                      )}
                    </div>
                    <div className="mt-1 font-medium text-white">
                      {displayName}
                    </div>
                    {partnerLabel && (
                      <div className="text-xs mt-0.5" style={{ color: "#b794f6" }}>
                        🤝 یار بازی: {partnerLabel}
                      </div>
                    )}
                    <div className="text-xs text-slate-400 flex gap-3 flex-wrap mt-1">
                      {inv.tableName && <span>{TYPE_MAP[inv.tableType || ""] || ""} {inv.tableName}</span>}
                      {inv.durationMinutes && <span>⏱ {formatDuration(inv.durationMinutes)}</span>}
                      <span>📅 {inv.jalaaliDate} — {time}</span>
                      {inv.issuedByUsername && <span>👤 {inv.issuedByUsername}</span>}
                    </div>
                  </div>
                  <div className="text-left">
                    <div className="font-bold" style={{ color: "#5ee89b" }}>{formatPrice(displayAmount)}</div>
                    {displayMethod && (
                      <div className="text-xs text-slate-400">{PAYMENT_MAP[displayMethod]}</div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Invoice Detail Modal */}
      <Modal
        open={!!selectedInvoice}
        onClose={() => setSelectedInvoice(null)}
        title={`فاکتور ${selectedInvoice?.invoiceNumber || ""}`}
        size="lg"
      >
        {selectedInvoice && (
          <div className="space-y-4 text-sm">
            {!selectedInvoice.isSplit && <CustomerInfoCard phone={selectedInvoice.customerPhone} />}
            <div className="rounded-lg p-3 space-y-2" style={{ background: "#0e1512" }}>
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <label className="block text-[10px] text-slate-500 mb-1">نام مشتری</label>
                  <CustomerNameAutocomplete
                    value={editCustomerName}
                    directory={customerDirectory}
                    placeholder="بدون نام"
                    onChange={(name, phone) => {
                      setEditCustomerName(name);
                      if (phone && !editCustomerPhone) setEditCustomerPhone(phone);
                    }}
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-[10px] text-slate-500 mb-1">تلفن</label>
                  <input className="form-input" value={editCustomerPhone} onChange={(e) => setEditCustomerPhone(e.target.value)} dir="ltr" placeholder="—" />
                </div>
              </div>
              <div className="text-[10px] text-slate-600">این با دکمه‌ی «ذخیره تغییرات» پایین صفحه ثبت می‌شه.</div>
            </div>
            <div className="grid grid-cols-2 gap-2 rounded-lg p-3" style={{ background: "#0e1512" }}>
              <div><span className="text-slate-400">میز:</span> <span className="text-white">{selectedInvoice.tableName || "—"}</span></div>
              <div><span className="text-slate-400">تاریخ:</span> <span className="text-white">{selectedInvoice.jalaaliDate}</span></div>
              {selectedInvoice.issuedByUsername && (
                <div><span className="text-slate-400">ثبت‌شده توسط:</span> <span className="text-white">{selectedInvoice.issuedByUsername}</span></div>
              )}
              {selectedInvoice.startTime && (
                <div><span className="text-slate-400">شروع:</span> <span className="text-white">{new Date(selectedInvoice.startTime).toTimeString().slice(0, 5)}</span></div>
              )}
              {selectedInvoice.endTime && (
                <div><span className="text-slate-400">پایان:</span> <span className="text-white">{new Date(selectedInvoice.endTime).toTimeString().slice(0, 5)}</span></div>
              )}
              {selectedInvoice.durationMinutes && (
                <div><span className="text-slate-400">مدت:</span> <span className="text-white">{formatDuration(selectedInvoice.durationMinutes)}</span></div>
              )}
            </div>

            {selectedInvoice.isSplit && (
              <div className="rounded-lg p-3 space-y-3" style={{ background: "#1a1330", border: "1px solid #6d3fa055" }}>
                <div className="font-bold" style={{ color: "#b794f6" }}>➗ این فاکتور بین {selectedInvoice.shares.length.toLocaleString("fa-IR")} نفر تقسیم شده</div>
                {selectedInvoice.shares.map((sh) => {
                  const partners = selectedInvoice.shares.filter((x) => x.id !== sh.id).map((x) => x.label).join("، ");
                  const st = STATUS_MAP[sh.status] || { label: sh.status, color: "#8a9488" };
                  const nameEdit = shareNameEdits[sh.id] || { label: sh.label, phone: sh.phone || "" };
                  return (
                    <div key={sh.id} className="rounded-lg p-3 space-y-2" style={{ background: "#0e1512" }}>
                      <div className="flex gap-2 items-end">
                        <div className="flex-1">
                          <label className="block text-[10px] text-slate-500 mb-1">نام مشتری</label>
                          <CustomerNameAutocomplete
                            value={nameEdit.label}
                            directory={customerDirectory}
                            onChange={(name, phone) => {
                              setShareNameEdits((p) => ({
                                ...p,
                                [sh.id]: { label: name, phone: phone && !nameEdit.phone ? phone : nameEdit.phone },
                              }));
                            }}
                          />
                        </div>
                        <div className="flex-1">
                          <label className="block text-[10px] text-slate-500 mb-1">تلفن</label>
                          <input
                            className="form-input"
                            dir="ltr"
                            value={nameEdit.phone}
                            onChange={(e) => setShareNameEdits((p) => ({ ...p, [sh.id]: { ...nameEdit, phone: e.target.value } }))}
                          />
                        </div>
                        <button
                          className="btn btn-primary btn-sm"
                          disabled={shareActionLoading === sh.id}
                          onClick={() => saveShareName(sh.id)}
                        >💾</button>
                      </div>
                      <CustomerInfoCard phone={sh.phone} />

                      {partners && (
                        <div className="text-xs" style={{ color: "#b794f6" }}>🤝 یار بازی: {partners}</div>
                      )}

                      <div className="flex items-center justify-between">
                        <span className="badge text-xs" style={{ background: st.color + "22", color: st.color }}>{st.label}</span>
                        <span className="font-bold" style={{ color: "#5ee89b" }}>{formatPrice(Number(sh.amount))}</span>
                      </div>

                      {sh.status !== "paid" && (
                        <div className="flex gap-2">
                          <button className="btn btn-success btn-sm flex-1" disabled={shareActionLoading === sh.id} onClick={() => settleShareAs(sh.id, "paid", "cash")}>💵 نقد</button>
                          <button className="btn btn-success btn-sm flex-1" disabled={shareActionLoading === sh.id} onClick={() => settleShareAs(sh.id, "paid", "card")}>💳 کارت</button>
                        </div>
                      )}

                      {sh.status === "pending" && (
                        <div className="space-y-2">
                          <select
                            className="form-input"
                            value={shareDebtChoice[sh.id]?.debtorId || ""}
                            onChange={(e) =>
                              setShareDebtChoice((p) => ({
                                ...p,
                                [sh.id]: { ...(p[sh.id] || { newName: "", newPhone: "" }), debtorId: e.target.value ? Number(e.target.value) : "" },
                              }))
                            }
                          >
                            <option value="">تبدیل به بدهکاری برای مشتری جدید...</option>
                            {shareDebtorsList.map((d) => (
                              <option key={d.id} value={d.id}>{d.name}{d.phone ? ` (${d.phone})` : ""}</option>
                            ))}
                          </select>
                          <button className="btn btn-secondary btn-sm btn-full" disabled={shareActionLoading === sh.id} onClick={() => settleShareAs(sh.id, "debt")}>
                            📋 ثبت به‌عنوان بدهکاری
                          </button>
                        </div>
                      )}

                      {sh.status === "debt" && (
                        <button className="btn btn-secondary btn-sm btn-full" disabled={shareActionLoading === sh.id} onClick={() => settleShareAs(sh.id, "paid", "cash")}>
                          ✅ بدهی تسویه شد (نقدی)
                        </button>
                      )}

                      {sh.status === "paid" && (
                        <button className="btn btn-secondary btn-sm btn-full" disabled={shareActionLoading === sh.id} onClick={() => settleShareAs(sh.id, "pending")}>
                          ↩️ بازگردانی به «در انتظار»
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-400">هزینه بازی:</span>
                <span className="text-white">{formatPrice(Number(selectedInvoice.gamePrice))}</span>
              </div>

              <div className="flex items-center justify-between">
                <div className="text-slate-400 font-bold">آیتم‌های کافه:</div>
                <button
                  className="btn btn-secondary btn-sm text-xs"
                  onClick={() => {
                    const next = !editingItems;
                    setEditingItems(next);
                    if (next && cafeMenuItems.length === 0) fetchCafeMenuItems();
                  }}
                >
                  {editingItems ? "بستن" : "✏️ ویرایش"}
                </button>
              </div>

              {selectedInvoice.items.length > 0 ? (
                selectedInvoice.items.map((item) => (
                  <div key={item.id} className="flex justify-between items-center pr-4">
                    <span className="text-white">{item.name} ×{item.quantity}</span>
                    <div className="flex items-center gap-2">
                      <span style={{ color: "#5ee89b" }}>{formatPrice(Number(item.totalPrice))}</span>
                      {editingItems && (
                        <button
                          className="w-8 h-8 flex items-center justify-center rounded-full text-sm"
                          style={{ color: "#f27f8a" }}
                          onClick={() => handleRemoveCafeItem(item.id)}
                          disabled={itemActionLoading}
                        >✕</button>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-xs text-slate-500 pr-4">آیتمی ثبت نشده</div>
              )}

              {Number(selectedInvoice.cafeTotal) > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-400">جمع کافه:</span>
                  <span className="text-white">{formatPrice(Number(selectedInvoice.cafeTotal))}</span>
                </div>
              )}

              {editingItems && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 pt-1">
                  {cafeMenuItems.map((item) => (
                    <button
                      key={item.id}
                      className="rounded-lg p-2 text-right text-sm"
                      style={{ background: "#1a2420" }}
                      onClick={() => handleAddCafeItem(item)}
                      disabled={itemActionLoading}
                    >
                      <div className="text-white font-medium text-xs">{item.name}</div>
                      <div className="text-xs" style={{ color: "#e0b23a" }}>{formatPrice(Number(item.price))}</div>
                    </button>
                  ))}
                </div>
              )}

              {Number(selectedInvoice.discountAmount) > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-400">تخفیف:</span>
                  <span style={{ color: "#f27f8a" }}>-{formatPrice(Number(selectedInvoice.discountAmount))}</span>
                </div>
              )}
              <div className="divider" />
              <div className="flex justify-between font-bold text-base">
                <span className="text-white">مبلغ نهایی:</span>
                <span style={{ color: "#5ee89b" }}>{formatPrice(Number(selectedInvoice.totalAmount))}</span>
              </div>
            </div>

            {selectedInvoice.notes && (
              <div className="rounded-lg p-3" style={{ background: "#0e1512" }}>
                <span className="text-slate-400 text-xs">یادداشت: </span>
                <span className="text-white">{selectedInvoice.notes}</span>
              </div>
            )}

            {/* ویرایش روش پرداخت و وضعیت تسویه — فقط برای فاکتورهای غیرتقسیم‌شده (برای تقسیم‌شده‌ها بالاتر، هر سهم جدا مدیریت می‌شه) */}
            {!selectedInvoice.isSplit && (
            <div className="rounded-lg p-3 space-y-3" style={{ background: "#0e1512", border: "1px solid #26332a" }}>
              <div>
                <div className="text-xs text-slate-400 mb-2">روش پرداخت</div>
                <div className="flex gap-2">
                  {(["cash", "card", "debt"] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setEditMethod(m)}
                      className={`btn btn-sm flex-1 ${editMethod === m ? "btn-primary" : "btn-secondary"}`}
                    >
                      {PAYMENT_MAP[m]}
                    </button>
                  ))}
                </div>
              </div>

              {editMethod === "debt" && selectedInvoice.status !== "debt" && (
                <div className="space-y-2">
                  <div className="text-xs text-slate-400">انتخاب بدهکار</div>
                  <select
                    className="form-input"
                    value={editDebtorId}
                    onChange={(e) => setEditDebtorId(e.target.value ? Number(e.target.value) : "")}
                  >
                    <option value="">+ بدهکار جدید</option>
                    {debtorsList.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}{d.phone ? ` (${d.phone})` : ""}</option>
                    ))}
                  </select>
                  {!editDebtorId && (
                    <>
                      <CustomerNameAutocomplete
                        value={editNewDebtorName}
                        directory={customerDirectory}
                        placeholder="نام بدهکار جدید"
                        onChange={(name, phone) => {
                          setEditNewDebtorName(name);
                          if (phone && !editNewDebtorPhone) setEditNewDebtorPhone(phone);
                        }}
                      />
                      <input
                        className="form-input"
                        placeholder="شماره تلفن (اختیاری)"
                        dir="ltr"
                        value={editNewDebtorPhone}
                        onChange={(e) => setEditNewDebtorPhone(e.target.value)}
                      />
                    </>
                  )}
                </div>
              )}

              {editMethod === "debt" && selectedInvoice.status === "debt" && (
                <div className="text-xs" style={{ color: "#e0b23a" }}>این فاکتور همین الان هم روی بدهکاری ثبت شده.</div>
              )}

              {editMethod !== "debt" && (
                <div>
                  <div className="text-xs text-slate-400 mb-2">وضعیت تسویه</div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditStatus("pending")}
                      className={`btn btn-sm flex-1 ${editStatus === "pending" ? "btn-primary" : "btn-secondary"}`}
                    >
                      ⏳ در انتظار
                    </button>
                    <button
                      onClick={() => setEditStatus("paid")}
                      className={`btn btn-sm flex-1 ${editStatus === "paid" ? "btn-success" : "btn-secondary"}`}
                    >
                      ✅ تسویه شده
                    </button>
                  </div>
                </div>
              )}
            </div>
            )}

            {/* یک دکمه‌ی ذخیره‌ی واحد برای همه‌ی تغییرات این پنجره (نام مشتری + پرداخت) */}
            <button
              className="btn btn-primary btn-full"
              onClick={handleSavePaymentEdit}
              disabled={savingEdit}
            >
              💾 ذخیره تغییرات
            </button>

            <button
              className="btn btn-danger btn-full"
              onClick={() => setDeleteInvoiceId(selectedInvoice.id)}
            >
              🗑️ حذف این فاکتور
            </button>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteInvoiceId}
        message="آیا از حذف این فاکتور مطمئنید؟ این کار قابل بازگشت نیست."
        onConfirm={handleDeleteInvoice}
        onCancel={() => setDeleteInvoiceId(null)}
        danger
      />

      <ConfirmDialog
        open={!!bulkToDebtConfirm}
        message={
          bulkToDebtConfirm
            ? `آیا مطمئنی می‌خوای همه‌ی ${bulkToDebtConfirm.entries.length.toLocaleString("fa-IR")} فاکتور ${bulkToDebtConfirm.name} رو به بدهکاری منتقل کنی؟`
            : ""
        }
        onConfirm={() => { if (bulkToDebtConfirm) handleBulkToDebt(bulkToDebtConfirm); setBulkToDebtConfirm(null); }}
        onCancel={() => setBulkToDebtConfirm(null)}
        danger
      />
    </div>
  );
}
