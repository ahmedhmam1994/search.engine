"use client";
import { useState, useCallback, Suspense } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Calendar, TrendingUp, Package, AlertTriangle, Search, Loader2, ChevronRight, LogOut, Download } from "lucide-react";

type TicketData = {
  from_date: string; to_date: string; tag: string;
  total_checked: number; total_lost_in_transit: number;
  daily_counts: Record<string, number>;
  tickets: Array<{ id: number; subject: string; created: string; status: string }>;
};

type PartialState = {
  from: string; to: string; tag: string; cursor: string | null;
  totalChecked: number; dailyCounts: Record<string, number>;
  tickets: TicketData["tickets"]; pages: number;
};

const GORGIAS_SUBDOMAIN = process.env.NEXT_PUBLIC_GORGIAS_SUBDOMAIN;
const AUTH_ERROR_MESSAGES: Record<string, string> = {
  AccessDenied: "Your email isn't authorized to access ProwlDesk. Contact an admin to be added.",
};
const DEFAULT_TAG = "Lost in Transit";
const MAX_DAYS = 90;
const MAX_PAGE_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 500;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPageWithRetry(from: string, to: string, cursor: string | null, tag: string) {
  for (let attempt = 1; attempt <= MAX_PAGE_RETRIES; attempt++) {
    let res: Response;
    try {
      res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from_date: from, to_date: to, cursor, tag }),
      });
    } catch {
      if (attempt === MAX_PAGE_RETRIES) throw new Error("Network error — please check your connection and try again.");
      await sleep(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
      continue;
    }

    if (res.status === 429) throw new Error("Too many requests — please wait a moment and try again.");
    if (res.status === 401) throw new Error("Unauthorized");

    if (!res.ok) {
      if (res.status >= 500 && attempt < MAX_PAGE_RETRIES) {
        await sleep(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
        continue;
      }
      throw new Error((await res.json().catch(() => null))?.error || "Failed");
    }

    return res.json();
  }
  throw new Error("Failed after multiple attempts.");
}

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

function Card({ children, className = "", innerClassName = "", accent = false }: { children: React.ReactNode; className?: string; innerClassName?: string; accent?: boolean }) {
  return (
    <div className={`p-1.5 rounded-[2rem] bg-black/[0.02] ring-1 ${accent ? "ring-[#D4A853]/40" : "ring-black/5"} shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_28px_-12px_rgba(184,134,11,0.18)] ${className}`}>
      <div className={`bg-white rounded-[calc(2rem-0.375rem)] shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)] h-full ${innerClassName}`}>
        {children}
      </div>
    </div>
  );
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
  const [tag, setTag] = useState(DEFAULT_TAG);
  const [data, setData] = useState<TicketData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ticketFilter, setTicketFilter] = useState("");

  const [progress, setProgress] = useState<{ pages: number; checked: number } | null>(null);
  const [partial, setPartial] = useState<PartialState | null>(null);

  const applyPreset = useCallback((days: number, alignToMonthStart = false) => {
    const end = new Date();
    const start = new Date();
    if (alignToMonthStart) start.setUTCDate(1);
    else start.setUTCDate(start.getUTCDate() - (days - 1));
    setFromDate(start.toISOString().slice(0, 10));
    setToDate(end.toISOString().slice(0, 10));
  }, []);

  const runQuery = useCallback(async (resume?: PartialState) => {
    setLoading(true); setError("");
    if (!resume) { setData(null); setPartial(null); setTicketFilter(""); }
    setProgress(null);

    let from: string, to: string, runTag: string, cursor: string | null;
    let totalChecked: number, pages: number;
    let dailyCounts: Record<string, number>;
    let tickets: TicketData["tickets"];

    if (resume) {
      ({ from, to, tag: runTag, cursor, totalChecked, dailyCounts, tickets, pages } = resume);
    } else {
      try {
        const today = new Date().toISOString().slice(0, 10);
        from = fromDate;
        to = toDate;
        if (!from) {
          const start = new Date();
          start.setUTCDate(start.getUTCDate() - 6);
          from = start.toISOString().slice(0, 10);
          to = today;
        } else if (!to) {
          to = today;
        }

        const spanDays = (Date.parse(to) - Date.parse(from)) / 86_400_000 + 1;
        if (spanDays > MAX_DAYS) {
          throw new Error(`Date range too wide — pick at most ${MAX_DAYS} days.`);
        }

        runTag = tag.trim() || DEFAULT_TAG;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
        setLoading(false); setProgress(null);
        return;
      }
      cursor = null; totalChecked = 0; dailyCounts = {}; tickets = []; pages = 0;
    }

    try {
      let done = false;
      while (!done) {
        const page = await fetchPageWithRetry(from, to, cursor, runTag);

        pages++;
        totalChecked += page.checked;
        tickets.push(...page.tickets);
        for (const [day, count] of Object.entries(page.daily_counts as Record<string, number>)) {
          dailyCounts[day] = (dailyCounts[day] || 0) + count;
        }
        setProgress({ pages, checked: totalChecked });

        done = page.done;
        cursor = page.next_cursor;
      }

      setData({
        from_date: from,
        to_date: to,
        tag: runTag,
        total_checked: totalChecked,
        total_lost_in_transit: tickets.length,
        daily_counts: dailyCounts,
        tickets,
      });
      setPartial(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setPartial(pages > 0 ? { from, to, tag: runTag, cursor, totalChecked, dailyCounts, tickets, pages } : null);
    } finally { setLoading(false); setProgress(null); }
  }, [fromDate, toDate, tag]);

  const maxDaily = data ? Math.max(1, ...Object.values(data.daily_counts)) : 1;
  const days = data ? Object.entries(data.daily_counts).sort() : [];
  const rate = data && data.total_checked > 0 ? ((data.total_lost_in_transit / data.total_checked) * 100).toFixed(2) : "0.00";
  const filteredTickets = data
    ? data.tickets.filter((t) => {
        const q = ticketFilter.trim().toLowerCase();
        if (!q) return true;
        return t.subject.toLowerCase().includes(q) || t.status.toLowerCase().includes(q) || String(t.id).includes(q);
      })
    : [];

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
        <Card className="mb-8" innerClassName="p-6">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[180px]"><label htmlFor="from-date" className="block text-xs font-semibold text-[#6B6B7B] uppercase tracking-wider mb-1.5">From Date</label><div className="relative"><Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#B8860B]" aria-hidden="true" /><input id="from-date" type="date" value={fromDate} onChange={e=>setFromDate(e.target.value)} className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[#E8E1D5] bg-[#FAF8F5] text-sm text-[#1A1A2E] focus:ring-2 focus:ring-[#D4A853]/30 transition-all" /></div></div>
            <div className="flex-1 min-w-[180px]"><label htmlFor="to-date" className="block text-xs font-semibold text-[#6B6B7B] uppercase tracking-wider mb-1.5">To Date</label><div className="relative"><Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#B8860B]" aria-hidden="true" /><input id="to-date" type="date" value={toDate} onChange={e=>setToDate(e.target.value)} className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[#E8E1D5] bg-[#FAF8F5] text-sm text-[#1A1A2E] focus:ring-2 focus:ring-[#D4A853]/30 transition-all" /></div></div>
            <div className="flex-1 min-w-[180px]"><label htmlFor="tag" className="block text-xs font-semibold text-[#6B6B7B] uppercase tracking-wider mb-1.5">Tag</label><input id="tag" type="text" value={tag} onChange={e=>setTag(e.target.value)} placeholder={DEFAULT_TAG} className="w-full px-4 py-2.5 rounded-xl border border-[#E8E1D5] bg-[#FAF8F5] text-sm text-[#1A1A2E] focus:ring-2 focus:ring-[#D4A853]/30 transition-all" /></div>
            <button onClick={() => runQuery()} disabled={loading} className="group px-6 py-2.5 bg-[#B8860B] hover:bg-[#8B6508] disabled:opacity-50 text-white rounded-full text-sm font-semibold flex items-center gap-2.5 cursor-pointer transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98]">
              {loading?"Running...":"Run Report"}
              <span className="w-7 h-7 rounded-full bg-white/15 flex items-center justify-center transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-0.5">
                {loading?<Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true"/>:<Search className="w-3.5 h-3.5" aria-hidden="true"/>}
              </span>
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs text-[#6B6B7B]">Quick range:</span>
            <button onClick={() => applyPreset(7)} className="px-3 py-1 rounded-full border border-[#E8E1D5] text-xs text-[#8B6508] hover:bg-[#F5F0E8] cursor-pointer">Last 7 days</button>
            <button onClick={() => applyPreset(30)} className="px-3 py-1 rounded-full border border-[#E8E1D5] text-xs text-[#8B6508] hover:bg-[#F5F0E8] cursor-pointer">Last 30 days</button>
            <button onClick={() => applyPreset(0, true)} className="px-3 py-1 rounded-full border border-[#E8E1D5] text-xs text-[#8B6508] hover:bg-[#F5F0E8] cursor-pointer">This month</button>
            <span className="text-xs text-[#6B6B7B] ml-2">Leave dates empty for last 7 days</span>
          </div>
        </Card>
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-8 text-sm text-red-700 flex items-center justify-between gap-2" role="alert">
            <span className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 flex-shrink-0" aria-hidden="true" />{error}{partial && ` (checked ${partial.totalChecked.toLocaleString()} tickets across ${partial.pages} page${partial.pages === 1 ? "" : "s"} before this)`}</span>
            {partial && <button onClick={() => runQuery(partial)} disabled={loading} className="flex-shrink-0 px-4 py-1.5 bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white rounded-lg text-xs font-semibold cursor-pointer">Resume</button>}
          </div>
        )}
        {loading && <>
          {progress && <p className="text-center text-xs text-[#6B6B7B] mb-4">Checked {progress.checked.toLocaleString()} tickets across {progress.pages} page{progress.pages===1?"":"s"}…</p>}
          <div className="space-y-6 animate-pulse"><div className="grid grid-cols-3 gap-4">{[1,2,3].map(i=><Card key={i}><div className="h-28"/></Card>)}</div><Card><div className="h-64"/></Card><Card><div className="h-48"/></Card></div>
        </>}
        {data && !loading && <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <Card className="animate-in fade-in slide-in-from-bottom-4 duration-700" innerClassName="p-6"><div className="flex items-center gap-2 mb-3"><div className="w-8 h-8 rounded-lg bg-[#F5F0E8] flex items-center justify-center"><Package className="w-4 h-4 text-[#8B6508]" aria-hidden="true"/></div><span className="text-xs font-semibold text-[#6B6B7B] uppercase tracking-wider">Tickets Checked</span></div><p className="text-3xl font-bold text-[#1A1A2E]" style={{fontFamily:"var(--font-heading)"}}>{data.total_checked.toLocaleString()}</p></Card>
            <Card accent className="animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100" innerClassName="p-6"><div className="flex items-center gap-2 mb-3"><div className="w-8 h-8 rounded-lg bg-[#B8860B] flex items-center justify-center"><AlertTriangle className="w-4 h-4 text-white" aria-hidden="true"/></div><span className="text-xs font-semibold text-[#6B6B7B] uppercase tracking-wider truncate" title={data.tag}>{data.tag}</span></div><p className="text-3xl font-bold text-[#B8860B]" style={{fontFamily:"var(--font-heading)"}}>{data.total_lost_in_transit}</p></Card>
            <Card className="animate-in fade-in slide-in-from-bottom-4 duration-700 delay-150" innerClassName="p-6"><div className="flex items-center gap-2 mb-3"><div className="w-8 h-8 rounded-lg bg-[#F5F0E8] flex items-center justify-center"><TrendingUp className="w-4 h-4 text-[#8B6508]" aria-hidden="true"/></div><span className="text-xs font-semibold text-[#6B6B7B] uppercase tracking-wider">Rate</span></div><p className="text-3xl font-bold text-[#1A1A2E]" style={{fontFamily:"var(--font-heading)"}}>{rate}%</p></Card>
          </div>
          <div className="flex items-center justify-center gap-2 mb-6 text-sm text-[#6B6B7B]"><Calendar className="w-3.5 h-3.5" aria-hidden="true"/><span>{data.from_date}</span><ChevronRight className="w-3.5 h-3.5" aria-hidden="true"/><span>{data.to_date}</span></div>
          <Card className="mb-8" innerClassName="p-6"><h2 className="text-sm font-semibold text-[#6B6B7B] uppercase tracking-wider mb-6">Daily Breakdown</h2><div className="space-y-2">{days.map(([day,count],i)=><div key={day} className="flex items-center gap-4 animate-in fade-in slide-in-from-bottom-2 duration-500" style={{animationDelay:`${Math.min(i*20,600)}ms`,animationFillMode:"backwards"}}><span className="w-20 text-xs text-[#6B6B7B] text-right font-medium flex-shrink-0">{new Date(day+"T00:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"})}</span><div className="flex-1 h-8 bg-[#F5F0E8] rounded-lg overflow-hidden"><div className="gold-bar h-full rounded-lg transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] flex items-center px-2.5" style={{width:`${Math.max(8,(count/maxDaily)*100)}%`}}>{count>0&&<span className="text-xs font-bold text-white">{count}</span>}</div></div></div>)}{days.length===0&&<p className="text-center text-[#6B6B7B] text-sm py-8">No data</p>}</div></Card>
          <Card innerClassName="overflow-hidden">
            <div className="px-6 py-4 border-b border-[#E8E1D5] flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-[#6B6B7B] uppercase tracking-wider">Matched Tickets ({filteredTickets.length}{filteredTickets.length !== data.tickets.length ? ` of ${data.tickets.length}` : ""})</h2>
              <div className="flex items-center gap-3">
                <input type="text" value={ticketFilter} onChange={e=>setTicketFilter(e.target.value)} placeholder="Filter by subject, status, or #id" className="px-3 py-1.5 rounded-lg border border-[#E8E1D5] bg-[#FAF8F5] text-xs text-[#1A1A2E] focus:ring-2 focus:ring-[#D4A853]/30 transition-all w-56" />
                <button onClick={() => downloadCsv({ ...data, tickets: filteredTickets })} className="flex items-center gap-1.5 text-xs font-semibold text-[#8B6508] hover:text-[#B8860B] cursor-pointer">
                  <Download className="w-3.5 h-3.5" aria-hidden="true" />Export CSV
                </button>
              </div>
            </div>
            <div className="divide-y divide-[#E8E1D5] max-h-96 overflow-y-auto">{filteredTickets.map(t=>{
              const url = ticketUrl(t.id);
              const idLabel = <span className="text-xs text-[#8B6508] font-medium w-28 flex-shrink-0">#{t.id}</span>;
              return <div key={t.id} className="px-6 py-3 flex items-center justify-between hover:bg-[#FAF8F5] transition-colors"><div className="flex items-center gap-3 min-w-0">{url ? <a href={url} target="_blank" rel="noopener noreferrer" className="hover:underline">{idLabel}</a> : idLabel}<span className="text-sm text-[#1A1A2E] truncate max-w-md">{t.subject}</span></div><span className="text-xs px-2.5 py-1 rounded-full bg-[#F5F0E8] text-[#8B6508] font-medium ml-2">{t.status}</span></div>;
            })}{filteredTickets.length === 0 && <p className="text-center text-[#6B6B7B] text-sm py-8">No tickets match this filter</p>}</div>
          </Card>
        </>}
        {!data && !loading && <div className="text-center py-20"><div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[#F5F0E8] flex items-center justify-center"><Search className="w-6 h-6 text-[#B8860B]" aria-hidden="true"/></div><h2 className="text-lg font-semibold text-[#1A1A2E] mb-1" style={{fontFamily:"var(--font-heading)"}}>Ready to Analyze</h2><p className="text-sm text-[#6B6B7B]">Choose a date range and run the report</p></div>}
      </main>
      <footer className="border-t border-[#E8E1D5] py-4 text-center text-xs text-[#6B6B7B]">ProwlDesk · Lost in Transit Tracker</footer>
    </div>
  );
}
