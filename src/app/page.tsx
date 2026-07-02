"use client";
import { useState, useEffect } from "react";
import { ToastProvider } from "@/components/Toast";
import TablesSection from "@/components/TablesSection";
import ReservationsSection from "@/components/ReservationsSection";
import DebtorsSection from "@/components/DebtorsSection";
import HistorySection from "@/components/HistorySection";
import DailyReportSection from "@/components/DailyReportSection";
import SettingsSection from "@/components/SettingsSection";
import DashboardSection from "@/components/DashboardSection";
import CafeSection from "@/components/CafeSection";
import { todayJalaali } from "@/lib/jalaali";

type Tab = "tables" | "cafe" | "reservations" | "debtors" | "history" | "report" | "dashboard" | "settings";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "tables", label: "میزها", icon: "🎱" },
  { id: "cafe", label: "کافه", icon: "☕" },
  { id: "reservations", label: "رزروها", icon: "📅" },
  { id: "debtors", label: "بدهکاران", icon: "📋" },
  { id: "history", label: "تاریخچه", icon: "📂" },
  { id: "report", label: "گزارش", icon: "📊" },
  { id: "dashboard", label: "داشبورد", icon: "📈" },
  { id: "settings", label: "تنظیمات", icon: "⚙️" },
];

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("tables");
  const [currentTime, setCurrentTime] = useState("");
  const [currentDate, setCurrentDate] = useState("");

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" }));
      setCurrentDate(todayJalaali());
    };
    update();
    const interval = setInterval(update, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <ToastProvider>
      <div className="min-h-screen flex flex-col" style={{ maxWidth: "480px", margin: "0 auto" }}>
        {/* Header */}
        <header
          className="sticky top-0 z-50 px-4 py-3"
          style={{
            background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
            borderBottom: "1px solid #334155",
            backdropFilter: "blur(12px)",
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-black text-white tracking-tight">
                🎱 بیلیارد ارم
              </h1>
              <p className="text-xs text-slate-400">سامانه مدیریت هوشمند</p>
            </div>
            <div className="text-left">
              <div className="text-lg font-bold text-blue-400">{currentTime}</div>
              <div className="text-xs text-slate-500">{currentDate}</div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-4 pb-24">
          {activeTab === "tables" && <TablesSection />}
          {activeTab === "cafe" && <CafeSection />}
          {activeTab === "reservations" && <ReservationsSection />}
          {activeTab === "debtors" && <DebtorsSection />}
          {activeTab === "history" && <HistorySection />}
          {activeTab === "report" && <DailyReportSection />}
          {activeTab === "dashboard" && <DashboardSection />}
          {activeTab === "settings" && <SettingsSection />}
        </main>

        {/* Bottom Navigation */}
        <nav
          className="fixed bottom-0 left-0 right-0 z-50 px-1 py-1"
          style={{
            background: "linear-gradient(to top, #0f172a, #0f172acc)",
            borderTop: "1px solid #334155",
            backdropFilter: "blur(12px)",
            maxWidth: "480px",
            margin: "0 auto",
            paddingBottom: "env(safe-area-inset-bottom, 8px)",
          }}
        >
          <div className="flex justify-around overflow-x-auto">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                className={`nav-item flex-shrink-0 ${activeTab === tab.id ? "active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <span className="text-xl">{tab.icon}</span>
                <span className="text-xs">{tab.label}</span>
              </button>
            ))}
          </div>
        </nav>
      </div>
    </ToastProvider>
  );
}
