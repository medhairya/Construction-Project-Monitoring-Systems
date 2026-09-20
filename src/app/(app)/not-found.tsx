import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md rounded-lg border border-slate-200 bg-white px-6 py-10 text-center">
      <p className="text-sm font-semibold text-slate-900">That project could not be found.</p>
      <p className="mt-1 text-xs text-slate-600">
        Check the Project ID — the format is GJ-RB-2026-AHD-0042.
      </p>
      <Link
        href="/projects"
        className="mt-4 inline-block rounded-md bg-sky-800 px-4 py-2 text-sm font-medium text-white hover:bg-sky-900"
      >
        Search projects
      </Link>
    </div>
  );
}
