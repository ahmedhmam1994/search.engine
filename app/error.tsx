"use client";
import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { AlertTriangle } from "lucide-react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[#FAF8F5] bg-grain flex items-center justify-center px-6">
      <div className="bg-white rounded-2xl border border-[#E8E1D5] p-8 shadow-sm max-w-sm w-full text-center">
        <div className="w-12 h-12 mx-auto mb-4 rounded-2xl bg-red-50 flex items-center justify-center">
          <AlertTriangle className="w-6 h-6 text-red-600" aria-hidden="true" />
        </div>
        <h1 className="text-lg font-semibold text-[#1A1A2E] mb-1" style={{fontFamily:"var(--font-heading)"}}>Something went wrong</h1>
        <p className="text-sm text-[#6B6B7B] mb-4">Try again, or reload the page if this keeps happening.</p>
        <button onClick={() => reset()} className="px-6 py-2.5 bg-[#B8860B] hover:bg-[#8B6508] text-white rounded-xl text-sm font-semibold cursor-pointer">
          Try again
        </button>
      </div>
    </div>
  );
}
