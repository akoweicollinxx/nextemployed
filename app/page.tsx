"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { track } from "@/lib/track";
import { TESTIMONIALS } from "@/lib/testimonials";
import type { Testimonial } from "@/lib/testimonials";

// ---------------------------------------------------------------------------
// Scroll-fade hook — no dependencies, pure IntersectionObserver
// ---------------------------------------------------------------------------
function useInView(threshold = 0.15) {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(false);
  // Callback ref so IntersectionObserver is set up when the element actually
  // mounts — useRef + useEffect([threshold]) misses late-mounting elements
  // (e.g. when the parent renders a loading spinner first and switches to real
  // content after an async check, the effect runs with ref.current = null and
  // the threshold dep never changes to trigger a re-run).
  const ref = useCallback((node: HTMLDivElement | null) => { setEl(node); }, []);
  useEffect(() => {
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setInView(true); },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [el, threshold]);
  return [ref, inView] as const;
}

function fade(inView: boolean, delay = "") {
  return `transition-all duration-700 ${delay} ${
    inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
  }`;
}

// ---------------------------------------------------------------------------
// Static data
// ---------------------------------------------------------------------------
const STEPS = [
  {
    n: "1",
    icon: "📋",
    title: "Paste the job description",
    desc: "We read what they actually want, not what the title says.",
  },
  {
    n: "2",
    icon: "📄",
    title: "Upload your CV",
    desc: "We find the gaps and rewrite the weak bits.",
  },
  {
    n: "3",
    icon: "🎙️",
    title: "Practice the interview",
    desc: "AI interviewer trained on the role. Get a scorecard, not a vibe check.",
  },
];

// TODO: replace ALL three numbers with real data before shipping.
// Do NOT ship with placeholder text — fake stats destroy trust faster than no stats.
// If you don't have real numbers yet, set NEXT_PUBLIC_SHOW_STATS=false.
const STATS = [
  { number: "—", label: "CVs optimised", todo: "e.g. 2,400+" },
  { number: "—", label: "Mock interviews completed", todo: "e.g. 8,100+" },
  { number: "—", label: "Avg ATS score improvement", todo: "e.g. +34 pts" },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
type Particle = { id: number; left: number; top: number; delay: number; duration: number };

export default function LandingPage() {
  const { isSignedIn, isLoaded } = useAuth();
  const router = useRouter();

  const [isClient, setIsClient] = useState(false);
  const [particles, setParticles] = useState<Particle[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
const videoTrackedRef = useRef(false);

  // Section inView refs
  const [demoRef, demoInView] = useInView();
  const [statsRef, statsInView] = useInView();
  const [stepsRef, stepsInView] = useInView();
  const [testimonialsRef, testimonialsInView] = useInView();
  const [finalRef, finalInView] = useInView();

  // Mount — particles, analytics, scroll depth
  useEffect(() => {
    setIsClient(true);
    setParticles(
      Array.from({ length: 20 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        top: Math.random() * 100,
        delay: Math.random() * 5,
        duration: 3 + Math.random() * 2,
      }))
    );
    track("homepage_viewed");

    const depths = new Set<number>();
    const onScroll = () => {
      const scrollable = document.body.scrollHeight - window.innerHeight;
      if (scrollable <= 0) return;
      const pct = (window.scrollY / scrollable) * 100;
      ([25, 50, 75, 100] as const).forEach((d) => {
        if (pct >= d && !depths.has(d)) {
          depths.add(d);
          track("homepage_scroll_depth", { depth: d });
        }
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Auth redirect
  useEffect(() => {
    if (isLoaded && isSignedIn) router.push("/dashboard");
  }, [isLoaded, isSignedIn, router]);

  // Video viewport tracking
  useEffect(() => {
    if (!isClient) return;
    const el = videoRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !videoTrackedRef.current) {
          videoTrackedRef.current = true;
          track("homepage_demo_video_viewed");
        }
      },
      { threshold: 0.5 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [isClient]);

  if (!isLoaded || isSignedIn) {
    return (
      <main className="flex items-center justify-center h-screen bg-black text-white">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
          <p>Loading...</p>
        </div>
      </main>
    );
  }

  const showStats = process.env.NEXT_PUBLIC_SHOW_STATS === "true";
  const showTestimonials =
    process.env.NEXT_PUBLIC_SHOW_TESTIMONIALS === "true" && TESTIMONIALS.length > 0;

  const scrollToDemo = () => {
    document.getElementById("demo")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-black text-white selection:bg-purple-500/30 overflow-x-hidden relative">

      {/* ── Background ─────────────────────────────────────────────────── */}
      <div className="fixed inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-br from-black via-purple-900/40 to-black" />
        <div className="absolute inset-0 opacity-20 bg-[linear-gradient(rgba(147,51,234,0.3)_1px,transparent_1px),linear-gradient(90deg,rgba(147,51,234,0.3)_1px,transparent_1px)] bg-[size:100px_100px] animate-pulse" />
      </div>
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-purple-900/20 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-cyan-900/20 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[60%] h-[60%] bg-purple-500/5 rounded-full blur-[160px]" />
        {isClient && particles.map((p) => (
          <div
            key={p.id}
            className="absolute w-1 h-1 bg-white/20 rounded-full animate-ping"
            style={{ left: `${p.left}%`, top: `${p.top}%`, animationDelay: `${p.delay}s`, animationDuration: `${p.duration}s` }}
          />
        ))}
      </div>

      {/* ── Nav ────────────────────────────────────────────────────────── */}
      <nav className="relative z-10 flex items-center justify-between px-4 py-5 sm:px-6 sm:py-8 max-w-7xl mx-auto">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-purple-500 to-cyan-500 rounded-full flex items-center justify-center">
            <div className="w-4 h-4 sm:w-6 sm:h-6 bg-white rounded-full animate-pulse" />
          </div>
          <h1 className="text-lg sm:text-2xl font-semibold bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent">
            NextEmployed
          </h1>
        </div>
        <div className="flex gap-2 sm:gap-4">
          <Link
            href="/sign-in"
            className="px-3 py-1.5 sm:px-6 sm:py-3 rounded-full border border-white/10 bg-white/5 backdrop-blur-sm text-xs sm:text-base font-medium hover:bg-white/10 transition-all whitespace-nowrap"
          >
            Sign In
          </Link>
          <Link
            href="/sign-up"
            className="px-3 py-1.5 sm:px-6 sm:py-3 rounded-full bg-gradient-to-r from-purple-600 to-cyan-600 text-white text-xs sm:text-base font-medium hover:shadow-[0_0_20px_rgba(147,51,234,0.3)] transition-all whitespace-nowrap"
          >
            Get Started
          </Link>
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 pt-16 pb-24 text-center">
        <h1 className="text-5xl sm:text-6xl md:text-8xl font-black tracking-tighter leading-[1.1] max-w-4xl mx-auto mb-6">
          You&apos;re qualified.{" "}
          <br className="hidden sm:block" />
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-purple-400 via-cyan-400 to-emerald-400 animate-gradient-x bg-[length:200%_200%]">
            Now let&apos;s make sure they know it
          </span>
        </h1>
        <p className="text-gray-400 text-lg md:text-xl max-w-2xl mx-auto leading-relaxed mb-10">
          Fix your CV, understand the role, and practice with AI before the real interview.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/try"
            onClick={() => track("homepage_try_cta_clicked", { cta: "hero" })}
            className="w-full sm:w-auto px-8 py-4 rounded-full bg-gradient-to-r from-purple-600 to-cyan-600 text-white font-bold text-lg hover:shadow-[0_0_40px_rgba(147,51,234,0.3)] transition-all transform hover:scale-105 active:scale-95 flex items-center justify-center"
          >
            Try it free — no signup
          </Link>
          <button
            onClick={scrollToDemo}
            className="w-full sm:w-auto px-8 py-4 rounded-full border border-white/10 bg-white/5 backdrop-blur-sm text-white font-bold text-lg hover:bg-white/10 transition-all"
          >
            Watch 30s demo
          </button>
        </div>
      </section>

      {/* ── Demo ───────────────────────────────────────────────────────── */}
      <section id="demo" className="relative z-10 py-20 px-6">
        <div ref={demoRef} className={`max-w-4xl mx-auto ${fade(demoInView)}`}>
          <div className="text-center mb-10">
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight mb-4">
              See the mock interview{" "}
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-cyan-400">
                in action
              </span>
            </h2>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">
              AI interviewer adapts to your answers. Get feedback on pace, filler words, and how you frame your experience.
            </p>
          </div>

          <video
            ref={videoRef}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            src="/video/demo.mp4"
            className="w-full rounded-3xl border border-white/10 shadow-2xl"
          />

          <div className="text-center mt-10">
            <Link
              href="/interview"
              onClick={() => track("homepage_try_cta_clicked", { cta: "demo" })}
              className="inline-flex px-8 py-4 rounded-full bg-gradient-to-r from-purple-600 to-cyan-600 text-white font-bold text-lg hover:shadow-[0_0_40px_rgba(147,51,234,0.3)] transition-all transform hover:scale-105 active:scale-95"
            >
              Practice a mock interview
            </Link>
          </div>
        </div>
      </section>

      {/* ── Proof Strip ────────────────────────────────────────────────── */}
      {showStats && (
        <section className="relative z-10 py-16 px-6 border-y border-white/5">
          <div ref={statsRef} className={`max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-8 text-center ${fade(statsInView)}`}>
            {STATS.map((s) => (
              <div key={s.label}>
                <div className="text-4xl sm:text-5xl font-black bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-cyan-400 mb-2">
                  {/* TODO: replace "{s.todo}" with real data */}
                  {s.number}
                </div>
                <div className="text-gray-400 text-sm">{s.label}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── How It Works ───────────────────────────────────────────────── */}
      <section className="relative z-10 py-20 px-6">
        <div ref={stepsRef} className={`max-w-5xl mx-auto ${fade(stepsInView)}`}>
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight mb-4">
              Three steps.{" "}
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-cyan-400">
                One outcome.
              </span>
            </h2>
            <p className="text-gray-400 text-lg max-w-xl mx-auto">
              From job listing to interview-ready in under 10 minutes.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            {STEPS.map((step, i) => (
              <div
                key={step.n}
                className="p-8 rounded-3xl border border-white/5 bg-white/[0.02] backdrop-blur-sm hover:border-purple-500/30 transition-colors"
                style={{ transitionDelay: `${i * 100}ms` }}
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center text-white font-bold text-sm shrink-0">
                    {step.n}
                  </div>
                  <span className="text-2xl">{step.icon}</span>
                </div>
                <h3 className="text-lg font-bold text-white mb-2">{step.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>

          <div className="text-center">
            <Link
              href="/try"
              onClick={() => track("homepage_try_cta_clicked", { cta: "how_it_works" })}
              className="inline-flex px-8 py-4 rounded-full bg-gradient-to-r from-purple-600 to-cyan-600 text-white font-bold text-lg hover:shadow-[0_0_40px_rgba(147,51,234,0.3)] transition-all transform hover:scale-105 active:scale-95"
            >
              Start free
            </Link>
          </div>
        </div>
      </section>

      {/* ── Testimonials (conditional) ─────────────────────────────────── */}
      {/* Do not enable until you have at least 3 real, attributable quotes.
          Set NEXT_PUBLIC_SHOW_TESTIMONIALS=true and populate lib/testimonials.ts */}
      {showTestimonials && (
        <section className="relative z-10 py-20 px-6 border-t border-white/5">
          <div ref={testimonialsRef} className={`max-w-5xl mx-auto ${fade(testimonialsInView)}`}>
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-center mb-12">
              What people are{" "}
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-cyan-400">
                saying
              </span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {(TESTIMONIALS as Testimonial[]).map((t, i) => (
                <div
                  key={i}
                  className="p-6 rounded-3xl border border-white/5 bg-white/[0.02] backdrop-blur-sm"
                >
                  <p className="text-gray-300 text-sm leading-relaxed mb-4">&ldquo;{t.quote}&rdquo;</p>
                  <div>
                    <p className="text-white font-semibold text-sm">{t.name}</p>
                    <p className="text-gray-500 text-xs">{t.role}, {t.company}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Final CTA ──────────────────────────────────────────────────── */}
      <section className="relative z-10 py-24 px-6">
        <div ref={finalRef} className={`max-w-2xl mx-auto text-center ${fade(finalInView)}`}>
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight mb-4">
            Ready to make sure{" "}
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-cyan-400">
              they know it?
            </span>
          </h2>
          <p className="text-gray-400 mb-8">
            One free analysis. No credit card. No spam.
          </p>
          <Link
            href="/try"
            onClick={() => track("homepage_try_cta_clicked", { cta: "final" })}
            className="inline-flex px-10 py-4 rounded-full bg-gradient-to-r from-purple-600 to-cyan-600 text-white font-bold text-lg hover:shadow-[0_0_40px_rgba(147,51,234,0.3)] transition-all transform hover:scale-105 active:scale-95"
          >
            Try it free — no signup needed
          </Link>
          <p className="text-gray-600 text-xs mt-4">
            No credit card. No spam. One free analysis.
          </p>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="relative z-10 border-t border-white/5 py-12 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <p className="text-gray-500 text-sm">© 2026 nextemployed. All rights reserved.</p>
          <div className="flex gap-8 text-sm text-gray-500">
            <Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-white transition-colors">Terms</Link>
            <a href="https://www.instagram.com/cealadigital/" className="hover:text-white transition-colors">Instagram</a>
          </div>
        </div>
      </footer>
    </div>
  );
}