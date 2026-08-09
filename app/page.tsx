"use client";
import { useState, useCallback } from "react";
import { Calendar, TrendingUp, Package, AlertTriangle, Search, Loader2, ChevronRight } from "lucide-react";

type TicketData = {
  from_date: string; to_date: string;
  total_checked: number; total_lost_in_transit: number;
  daily_counts: Record<string, number>;
  tickets: Array<{ id: number; subject: string; created: string; status: string }>;
};

export default function Home() {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [data, setData] = useState<TicketData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const runQuery = useCallback(async () => {
    setLoading(true); setError(""); setData(null);
    try {
      const body: Record<string, unknown> = {};
      if (fromDate) { body.from_date = fromDate; if (toDate) body.to_date = toDate; }
      else { body.days = 7; }
      const res = await fetch("/api/run", { method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body) });
      if (!res.ok) throw new Error("Failed");
      setData(await res.json());
    } catch { setError("Something went wrong."); }
    finally { setLoading(false); }
  }, [fromDate, toDate]);

  const maxDaily = data ? Math.max(1, ...Object.values(data.daily_counts)) : 1;
  const days = data ? Object.entries(data.daily_counts).sort() : [];
  const rate = data ? ((data.total_lost_in_transit / data.total_checked) * 100).toFixed(2) : "0.00";

  return (
    <div className="min-h-screen bg-[#FAF8F5] bg-grain">
      <header className="border-b border-[#E8E1D5] bg-white/80 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#B8860B] flex items-center justify-center"><Package className="w-4 h-4 text-white" /></div>
            <div><h1 className="text-lg font-semibold text-[#1A1A2E]" style={{fontFamily:"var(--font-heading)"}}>ProwlDesk</h1><p className="text-xs text-[#6B6B7B]">Lost in Transit Tracker</p></div>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#F5F0E8] text-xs text-[#8B6508] font-medium"><span className="w-1.5 h-1.5 rounded-full bg-[#B8860B] animate-pulse" />Connected to Gorgias</div>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="bg-white rounded-2xl border border-[#E8E1D5] p-6 mb-8 shadow-sm">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[180px]"><label className="block text-xs font-semibold text-[#6B6B7B] uppercase tracking-wider mb-1.5">From Date</label><div className="relative"><Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#B8860B]" /><input type="date" value={fromDate} onChange={e=>setFromDate(e.target.value)} className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[#E8E1D5] bg-[#FAF8F5] text-sm text-[#1A1A2E] focus:ring-2 focus:ring-[#D4A853]/30 transition-all" /></div></div>
            <div className="flex-1 min-w-[180px]"><label className="block text-xs font-semibold text-[#6B6B7B] uppercase tracking-wider mb-1.5">To Date</label><div className="relative"><Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#B8860B]" /><input type="date" value={toDate} onChange={e=>setToDate(e.target.value)} className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[#E8E1D5] bg-[#FAF8F5] text-sm text-[#1A1A2E] focus:ring-2 focus:ring-[#D4A853]/30 transition-all" /></div></div>
            <button onClick={runQuery} disabled={loading} className="px-6 py-2.5 bg-[#B8860B] hover:bg-[#8B6508] disabled:opacity-50 text-white rounded-xl text-sm font-semibold flex items-center gap-2 cursor-pointer">{loading?<Loader2 className="w-4 h-4 animate-spin"/>:<Search className="w-4 h-4"/>}{loading?"Running...":"Run Report"}</button>
          </div>
          <p className="mt-3 text-xs text-[#6B6B7B]">Leave empty for last 7 days</p>
        </div>
        {error && <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-8 text-sm text-red-700 flex items-center gap-2"><AlertTriangle className="w-4 h-4" />{error}</div>}
        {loading && <div className="space-y-6 animate-pulse"><div className="grid grid-cols-3 gap-4">{[1,2,3].map(i=><div key={i} className="bg-white rounded-2xl border border-[#E8E1D5] p-6 h-28"/>)}</div><div className="bg-white rounded-2xl border border-[#E8E1D5] p-6 h-64"/><div className="bg-white rounded-2xl border border-[#E8E1D5] p-6 h-48"/></div>}
        {data && !loading && <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div className="bg-white rounded-2xl border border-[#E8E1D5] p-6 shadow-sm"><div className="flex items-center gap-2 mb-3"><div className="w-8 h-8 rounded-lg bg-[#F5F0E8] flex items-center justify-center"><Package className="w-4 h-4 text-[#8B6508]"/></div><span className="text-xs font-semibold text-[#6B6B7B] uppercase tracking-wider">Tickets Checked</span></div><p className="text-3xl font-bold text-[#1A1A2E]" style={{fontFamily:"var(--font-heading)"}}>{data.total_checked.toLocaleString()}</p></div>
            <div className="bg-white rounded-2xl border-2 border-[#D4A853] p-6 shadow-sm"><div className="flex items-center gap-2 mb-3"><div className="w-8 h-8 rounded-lg bg-[#B8860B] flex items-center justify-center"><AlertTriangle className="w-4 h-4 text-white"/></div><span className="text-xs font-semibold text-[#6B6B7B] uppercase tracking-wider">Lost in Transit</span></div><p className="text-3xl font-bold text-[#B8860B]" style={{fontFamily:"var(--font-heading)"}}>{data.total_lost_in_transit}</p></div>
            <div className="bg-white rounded-2xl border border-[#E8E1D5] p-6 shadow-sm"><div className="flex items-center gap-2 mb-3"><div className="w-8 h-8 rounded-lg bg-[#F5F0E8] flex items-center justify-center"><TrendingUp className="w-4 h-4 text-[#8B6508]"/></div><span className="text-xs font-semibold text-[#6B6B7B] uppercase tracking-wider">Rate</span></div><p className="text-3xl font-bold text-[#1A1A2E]" style={{fontFamily:"var(--font-heading)"}}>{rate}%</p></div>
          </div>
          <div className="flex items-center justify-center gap-2 mb-6 text-sm text-[#6B6B7B]"><Calendar className="w-3.5 h-3.5"/><span>{data.from_date}</span><ChevronRight className="w-3.5 h-3.5"/><span>{data.to_date}</span></div>
          <div className="bg-white rounded-2xl border border-[#E8E1D5] p-6 mb-8 shadow-sm"><h2 className="text-sm font-semibold text-[#6B6B7B] uppercase tracking-wider mb-6">Daily Breakdown</h2><div className="space-y-2">{days.map(([day,count])=><div key={day} className="flex items-center gap-4"><span className="w-20 text-xs text-[#6B6B7B] text-right font-medium flex-shrink-0">{new Date(day+"T00:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"})}</span><div className="flex-1 h-8 bg-[#F5F0E8] rounded-lg overflow-hidden"><div className="gold-bar h-full rounded-lg transition-all duration-500 ease-out flex items-center px-2.5" style={{width:`${Math.max(8,(count/maxDaily)*100)}%`}}>{count>0&&<span className="text-xs font-bold text-white">{count}</span>}</div></div></div>)}{days.length===0&&<p className="text-center text-[#6B6B7B] text-sm py-8">No data</p>}</div></div>
          <div className="bg-white rounded-2xl border border-[#E8E1D5] shadow-sm overflow-hidden"><div className="px-6 py-4 border-b border-[#E8E1D5]"><h2 className="text-sm font-semibold text-[#6B6B7B] uppercase tracking-wider">Matched Tickets ({data.tickets.length})</h2></div><div className="divide-y divide-[#E8E1D5] max-h-96 overflow-y-auto">{data.tickets.map(t=><div key={t.id} className="px-6 py-3 flex items-center justify-between hover:bg-[#FAF8F5] transition-colors"><div className="flex items-center gap-3 min-w-0"><span className="text-xs text-[#8B6508] font-medium w-28 flex-shrink-0">#{t.id}</span><span className="text-sm text-[#1A1A2E] truncate max-w-md">{t.subject}</span></div><span className="text-xs px-2.5 py-1 rounded-full bg-[#F5F0E8] text-[#8B6508] font-medium ml-2">{t.status}</span></div>)}</div></div>
        </>}
        {!data && !loading && <div className="text-center py-20"><div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[#F5F0E8] flex items-center justify-center"><Search className="w-6 h-6 text-[#B8860B]"/></div><h2 className="text-lg font-semibold text-[#1A1A2E] mb-1" style={{fontFamily:"var(--font-heading)"}}>Ready to Analyze</h2><p className="text-sm text-[#6B6B7B]">Choose a date range and run the report</p></div>}
      </main>
      <footer className="border-t border-[#E8E1D5] py-4 text-center text-xs text-[#6B6B7B]">ProwlDesk · Lost in Transit Tracker</footer>
    </div>
  );
}
