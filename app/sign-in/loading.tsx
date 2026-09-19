export default function Loading() {
  return (
    <main className="relative min-h-screen w-full flex items-center justify-center bg-black overflow-hidden">
      <div className="absolute inset-0 z-0 bg-gradient-to-br from-black via-purple-900/60 to-black" />
      <div className="absolute top-1/3 left-[20%] w-64 h-64 bg-purple-500/20 rounded-full blur-3xl z-0" />
      <div className="absolute bottom-1/3 right-[15%] w-80 h-80 bg-cyan-500/20 rounded-full blur-3xl z-0" />

      <div className="relative z-10 w-full max-w-md px-4">
        <div className="p-8 border border-purple-500/30 rounded-3xl backdrop-blur-xl bg-white/5 shadow-2xl flex flex-col items-center gap-4 min-h-[420px] justify-center">
          <div className="w-8 h-8 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-400 text-sm">Loading…</p>
        </div>
      </div>
    </main>
  );
}
