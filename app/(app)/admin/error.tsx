'use client'

export default function AdminError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4 text-center px-4">
      <p className="text-[#171717] font-medium">Something went wrong on this page.</p>
      <button
        onClick={reset}
        className="px-4 py-2 rounded-xl bg-[#171717] text-white text-sm font-medium hover:bg-[#404040] transition-colors cursor-pointer"
      >
        Try again
      </button>
    </div>
  )
}
