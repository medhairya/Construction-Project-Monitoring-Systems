"use client";

import { useEffect } from "react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-md rounded-lg border border-red-200 bg-red-50 px-6 py-10 text-center">
      <p className="text-sm font-semibold text-red-900">Something went wrong on this page.</p>
      <p className="mt-1 text-xs text-red-700">
        {error.message || "The page could not be rendered."}
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-4 rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800"
      >
        Try again
      </button>
    </div>
  );
}
