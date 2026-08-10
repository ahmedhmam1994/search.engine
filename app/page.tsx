"use client";
import { useState, useCallback, Suspense } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Calendar, TrendingUp, Package, AlertTriangle, Search, Loader2, ChevronRight, LogOut, Download } from "lucide-react";

type TicketData = {
  from_date: string; to_date: string;
  total_checked: number; total_lost_in_transit: number;
  daily_counts: Record<string, number>;
  tickets: Array<{ id: number; subject: string; created: string; status: string }>;
};

const GORGIAS_SUBDOMAIN = process.env.NEXT_PUBLIC_GORGIAS_SUBDOMAIN;
const AUTH_ERROR_MESSAGES: Record<string, string> = {
  AccessDenied: "Your email isn't authorized to access ProwlDesk. Contact an admin to be added.",
};

function ticketUrl(id: number): string | null {
  return GORGIAS_SUBDOMAIN ? `https://${GORGIAS_SUBDOMAIN}.gorgias.com/app/ticket/${id}` : null;
}

function downloadCsv(data: TicketData) {
  const header = "id,subject,created,status";
  const rows = data.tickets.map((t) =>
    [t.id, `"${t.subject.replace(/"/g, '""')}"`, t.created, t.status].join(",")
  );
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `prowldesk-tickets-${data.from_date}-to-${data.to_date}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function SignInCard() {
  const searchParams = useSearchParams();
  const authError = searchParams.get("error");
  return (
    <div className="min-h-screen bg-[#FAF8F5] bg-grain flex items-center justify-center px-6">
      <div className="bg-white rounded-2xl border border-[#E8E1D5] p-8 shadow-sm max-w-sm w-full text-center">
        <h1 className="text-lg font-semibold text-[#1A1A2E] mb-1" style={{fontFamily:"var(--font-heading)"}}>ProwlDesk</h1>
        <p className="text-xs text-[#6B6B7B] mb-4">Sign in with your Google account to continue</p>
        {authError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-xs text-red-700 flex items-center gap-2 text-left" role="alert">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
            {AUTH_ERROR_MESSAGES[authError] || "Sign-in failed. Please try again."}
          </div>
        )}
        <button onClick={() => signIn("google")} className="w-full px-6 py-2.5 bg-[#B8860B] hover:bg-[#8B6508] text-white rounded-xl text-sm font-semibold cursor-pointer">
          Sign in with Google
        </button>
      </div>
    </div>
  );
}

export default function Home() {
  const { data: session, status } = useSession();
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [data, setData] = useState<TicketData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [progress, setProgress] = useState<{ pages: number; checked: number } | null>(null);

  const runQuery = useCallback(async () => {
    setLoading(true); setError(""); setData(null); setProgress(null);
    try {
      const body: Record<string, unknown> = {};
      if (fromDate) { body.from_date = fromDate; if (toDate) body.to_date = toDate; }
      else { body.days = 7; }
      const res = await fetch("/api/run", { method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body) });
      if (res.status === 429) throw new Error("Too many requests — please wait a moment and try again.");
      if (res.status === 401) throw new Error("Unauthorized");
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || "Failed");
      const { jobId } = await res.json();

      const deadline = Date.now() + 5 * 60_000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 1500));
        const statusRes = await fetch(`/api/run/status/${jobId}`);
        if (statusRes.status === 401) throw new Error("Unauthorized");
        if (!statusRes.ok) throw new Error("Failed");
        const job = await statusRes.json();
        if (job.status === "running") { setProgress({ pages: job.pagesFetched, checked: job.ticketsChecked }); continue; }
        if (job.status === "error") throw new Error(job.error || "Failed");
        setData(job.result);
        return;
      }
      throw new Error("Report timed out — try a smaller date range.");
    } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong."); }
    finally { setLoading(false); setProgress(null); }
  }, [fromDate, toDate]);

  const maxDaily = data ? Math.max(1, ...Object.values(data.daily_counts)) : 1;
  const days = data ? Object.entries(data.daily_counts).sort() : [];
  const rate = data && data.total_checked > 0 ? ((data.total_lost_in_transit / data.total_checked) * 100).toFixed(2) : "0.00";

  if (status === "loading") {
    return <div className="min-h-screen bg-[#FAF8F5] bg-grain flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-[#B8860B]" aria-hidden="true" /></div>;
  }

  if (!session) {
    return (
      <Suspense fallback={<div className="min-h-screen bg-[#FAF8F5] bg-grain" />}>
        <SignInCard />
      </Suspense>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF8F5] bg-grain">
      <header className="border-b border-[#E8E1D5] bg-white/80 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#B8860B] flex items-center justify-center"><Package className="w-4 h-4 text-white" aria-hidden="true" /></div>
            <div><h1 className="text-lg font-semibold text-[#1A1A2E]" style={{fontFamily:"var(--font-heading)"}}>ProwlDesk</h1><p className="text-xs text-[#6B6B7B]">Lost in Transit Tracker</p></div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#F5F0E8] text-xs text-[#8B6508] font-medium"><span className="w-1.5 h-1.5 rounded-full bg-[#B8860B] animate-pulse" aria-hidden="true" />Connected to Gorgias</div>
            <span className="text-xs text-[#6B6B7B] hidden sm:inline">{session.user?.email}</span>
            <button onClick={() => signOut()} aria-label="Sign out" title="Sign out" className="w-8 h-8 rounded-lg border border-[#E8E1D5] flex items-center justify-center text-[#6B6B7B] hover:bg-[#F5F0E8] cursor-pointer">
              <LogOut className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="bg-white rounded-2xl border border-[#E8E1D5] p-6 mb-8 shadow-sm">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[180px]"><label htmlFor="from-date" className="block text-xs font-semibold text-[#6B6B7B] uppercase tracking-wider mb-1.5">From Date</label><div className="relative"><Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#B8860B]" aria-hidden="true" /><input id="from-date" type="date" value={fromDate} onChange={e=>setFromDate(e.target.value)} className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[#E8E1D5] bg-[#FAF8F5] text-sm text-[#1A1A2E] focus:ring-2 focus:ring-[#D4A853]/30 transition-all" /></div></div>
            <div className="flex-1 min-w-[180px]"><label htmlFor="to-date" className="block text-xs font-semibold text-[#6B6B7B] uppercase tracking-wider mb-1.5">To Date</label><div className="relative"><Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#B8860B]" aria-hidden="true" /><input id="to-date" type="date" value={toDate} onChange={e=>setToDate(e.target.value)} className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[#E8E1D5] bg-[#FAF8F5] text-sm text-[#1A1A2E] focus:ring-2 focus:ring-[#D4A853]/30 transition-all" /></div></div>
            <button onClick={runQuery} disabled={loading} className="px-6 py-2.5 bg-[#B8860B] hover:bg-[#8B6508] disabled:opacity-50 text-white rounded-xl text-sm font-semibold flex items-center gap-2 cursor-pointer">{loading?<Loader2 className="w-4 h-4 animate-spin" aria-hidden="true"/>:<Search className="w-4 h-4" aria-hidden="true"/>}{loading?"Running...":"Run Report"}</button>
          </div>
          <p className="mt-3 text-xs text-[#6B6B7B]">Leave empty for last 7 days</p>
        </div>
        {error && <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-8 text-sm text-red-700 flex items-center gap-2" role="alert"><AlertTriangle className="w-4 h-4" aria-hidden="true" />{error}</div>}
        {loading && <>
          {progress && <p className="text-center text-xs text-[#6B6B7B] mb-4">Checked {progress.checked.toLocaleString()} tickets across {progress.pages} page{progress.pages===1?"":"s"}…</p>}
          <div className="space-y-6 animate-pulse"><div className="grid grid-cols-3 gap-4">{[1,2,3].map(i=><div key={i} className="bg-white rounded-2xl border border-[#E8E1D5] p-6 h-28"/>)}</div><div className="bg-white rounded-2xl border border-[#E8E1D5] p-6 h-64"/><div className="bg-white rounded-2xl border border-[#E8E1D5] p-6 h-48"/></div>
        </>}
        {data && !loading && <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div className="bg-white rounded-2xl border border-[#E8E1D5] p-6 shadow-sm"><div className="flex items-center gap-2 mb-3"><div className="w-8 h-8 rounded-lg bg-[#F5F0E8] flex items-center justify-center"><Package className="w-4 h-4 text-[#8B6508]" aria-hidden="true"/></div><span className="text-xs font-semibold text-[#6B6B7B] uppercase tracking-wider">Tickets Checked</span></div><p className="text-3xl font-bold text-[#1A1A2E]" style={{fontFamily:"var(--font-heading)"}}>{data.total_checked.toLocaleString()}</p></div>
            <div className="bg-white rounded-2xl border-2 border-[#D4A853] p-6 shadow-sm"><div className="flex items-center gap-2 mb-3"><div className="w-8 h-8 rounded-lg bg-[#B8860B] flex items-center justify-center"><AlertTriangle className="w-4 h-4 text-white" aria-hidden="true"/></div><span className="text-xs font-semibold text-[#6B6B7B] uppercase tracking-wider">Lost in Transit</span></div><p className="text-3xl font-bold text-[#B8860B]" style={{fontFamily:"var(--font-heading)"}}>{data.total_lost_in_transit}</p></div>
            <div className="bg-white rounded-2xl border border-[#E8E1D5] p-6 shadow-sm"><div className="flex items-center gap-2 mb-3"><div className="w-8 h-8 rounded-lg bg-[#F5F0E8] flex items-center justify-center"><TrendingUp className="w-4 h-4 text-[#8B6508]" aria-hidden="true"/></div><span className="text-xs font-semibold text-[#6B6B7B] uppercase tracking-wider">Rate</span></div><p className="text-3xl font-bold text-[#1A1A2E]" style={{fontFamily:"var(--font-heading)"}}>{rate}%</p></div>
          </div>
          <div className="flex items-center justify-center gap-2 mb-6 text-sm text-[#6B6B7B]"><Calendar className="w-3.5 h-3.5" aria-hidden="true"/><span>{data.from_date}</span><ChevronRight className="w-3.5 h-3.5" aria-hidden="true"/><span>{data.to_date}</span></div>
          <div className="bg-white rounded-2xl border border-[#E8E1D5] p-6 mb-8 shadow-sm"><h2 className="text-sm font-semibold text-[#6B6B7B] uppercase tracking-wider mb-6">Daily Breakdown</h2><div className="space-y-2">{days.map(([day,count])=><div key={day} className="flex items-center gap-4"><span className="w-20 text-xs text-[#6B6B7B] text-right font-medium flex-shrink-0">{new Date(day+"T00:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"})}</span><div className="flex-1 h-8 bg-[#F5F0E8] rounded-lg overflow-hidden"><div className="gold-bar h-full rounded-lg transition-all duration-500 ease-out flex items-center px-2.5" style={{width:`${Math.max(8,(count/maxDaily)*100)}%`}}>{count>0&&<span className="text-xs font-bold text-white">{count}</span>}</div></div></div>)}{days.length===0&&<p className="text-center text-[#6B6B7B] text-sm py-8">No data</p>}</div></div>
          <div className="bg-white rounded-2xl border border-[#E8E1D5] shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-[#E8E1D5] flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[#6B6B7B] uppercase tracking-wider">Matched Tickets ({data.tickets.length})</h2>
              <button onClick={() => downloadCsv(data)} className="flex items-center gap-1.5 text-xs font-semibold text-[#8B6508] hover:text-[#B8860B] cursor-pointer">
                <Download className="w-3.5 h-3.5" aria-hidden="true" />Export CSV
              </button>
            </div>
            <div className="divide-y divide-[#E8E1D5] max-h-96 overflow-y-auto">{data.tickets.map(t=>{
              const url = ticketUrl(t.id);
              const idLabel = <span className="text-xs text-[#8B6508] font-medium w-28 flex-shrink-0">#{t.id}</span>;
              return <div key={t.id} className="px-6 py-3 flex items-center justify-between hover:bg-[#FAF8F5] transition-colors"><div className="flex items-center gap-3 min-w-0">{url ? <a href={url} target="_blank" rel="noopener noreferrer" className="hover:underline">{idLabel}</a> : idLabel}<span className="text-sm text-[#1A1A2E] truncate max-w-md">{t.subject}</span></div><span className="text-xs px-2.5 py-1 rounded-full bg-[#F5F0E8] text-[#8B6508] font-medium ml-2">{t.status}</span></div>;
            })}</div>
          </div>
        </>}
        {!data && !loading && <div className="text-center py-20"><div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[#F5F0E8] flex items-center justify-center"><Search className="w-6 h-6 text-[#B8860B]" aria-hidden="true"/></div><h2 className="text-lg font-semibold text-[#1A1A2E] mb-1" style={{fontFamily:"var(--font-heading)"}}>Ready to Analyze</h2><p className="text-sm text-[#6B6B7B]">Choose a date range and run the report</p></div>}
      </main>
      <footer className="border-t border-[#E8E1D5] py-4 text-center text-xs text-[#6B6B7B]">ProwlDesk · Lost in Transit Tracker</footer>
    </div>
  );
}
