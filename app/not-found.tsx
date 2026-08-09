import Link from "next/link";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#FAF8F5] bg-grain flex items-center justify-center px-6">
      <div className="bg-white rounded-2xl border border-[#E8E1D5] p-8 shadow-sm max-w-sm w-full text-center">
        <div className="w-12 h-12 mx-auto mb-4 rounded-2xl bg-[#F5F0E8] flex items-center justify-center">
          <Compass className="w-6 h-6 text-[#B8860B]" aria-hidden="true" />
        </div>
        <h1 className="text-lg font-semibold text-[#1A1A2E] mb-1" style={{fontFamily:"var(--font-heading)"}}>Page not found</h1>
        <p className="text-sm text-[#6B6B7B] mb-4">That page doesn&apos;t exist.</p>
        <Link href="/" className="inline-block px-6 py-2.5 bg-[#B8860B] hover:bg-[#8B6508] text-white rounded-xl text-sm font-semibold">
          Back to ProwlDesk
        </Link>
      </div>
    </div>
  );
}
