'use client'

import { SignUp } from '@clerk/nextjs'

export default function Page() {
  return (
    <main className="relative min-h-screen w-full flex items-center justify-center bg-black overflow-hidden">
      <div className="absolute inset-0 z-0 bg-gradient-to-br from-black via-purple-900/60 to-black" />
      <div className="absolute top-1/3 left-[20%] w-64 h-64 bg-purple-500/20 rounded-full blur-3xl z-0" />
      <div className="absolute bottom-1/3 right-[15%] w-80 h-80 bg-cyan-500/20 rounded-full blur-3xl z-0" />

      <div className="relative z-10 w-full max-w-md px-4">
        <div className="p-4 border border-purple-500/30 rounded-3xl backdrop-blur-xl bg-white/5 shadow-2xl">
          <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" />
        </div>
      </div>
    </main>
  )
}
