import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as Icons from 'lucide-react';
import { Star, Search, ArrowRight, Check } from 'lucide-react';
import Header from '../components/Header';
import Footer from '../components/Footer';
import ToolCard from '../components/ToolCard';
import { TOOLS, CATEGORIES, STATS, STEPS, FEATURES, TESTIMONIALS, FAQS, ICON_TILE } from '../mock';

const Home = () => {
  const navigate = useNavigate();
  const [cat, setCat] = useState('all');
  const [query, setQuery] = useState('');
  const [openFaq, setOpenFaq] = useState(0);

  useEffect(() => {
    if (window.location.hash) {
      const el = document.querySelector(window.location.hash);
      if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth' }), 200);
    }
  }, []);

  const filtered = TOOLS.filter((t) => {
    const inCat = cat === 'all' || t.category === cat;
    const inQuery = !query || t.name.toLowerCase().includes(query.toLowerCase()) || t.desc.toLowerCase().includes(query.toLowerCase());
    return inCat && inQuery;
  });

  // Curated "Most popular tools" — explicitly includes PDF to JPG (and JPG to PDF).
  const POPULAR_SLUGS = ['merge-pdf', 'split-pdf', 'compress-pdf', 'organize-pdf', 'pdf-to-jpg', 'jpg-to-pdf'];
  const popular = POPULAR_SLUGS
    .map((s) => TOOLS.find((t) => t.slug === s && t.ready))
    .filter(Boolean);

  return (
    <div className="min-h-screen bg-white dark:bg-[#0a0d16] text-slate-900 dark:text-slate-100 transition-colors">
      <Header />

      {/* HERO */}
      <section className="relative overflow-hidden grid-hero grain">
        <div className="absolute -top-24 -left-24 w-[38rem] h-[38rem] rounded-full bg-rose-500/20 blur-[120px] aurora-blob" />
        <div className="absolute top-10 right-0 w-[26rem] h-[26rem] rounded-full bg-amber-400/10 blur-[120px] aurora-blob" style={{ animationDelay: '3s' }} />
        <div className="absolute -bottom-40 -right-24 w-[34rem] h-[34rem] rounded-full bg-violet-500/15 blur-[120px] aurora-blob" style={{ animationDelay: '6s' }} />
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 pt-16 pb-14 sm:pt-24 sm:pb-20">
          <div className="max-w-3xl mx-auto text-center">
            <div className="reveal inline-flex items-center gap-2 rounded-full border border-slate-200 dark:border-white/10 bg-white/70 dark:bg-white/5 px-3.5 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> 30 tools · free · private in your browser
            </div>
            <h1 className="reveal font-display font-extrabold tracking-tight text-4xl sm:text-6xl leading-[1.05] mt-6">
              Every <span className="brand-gradient-text">PDF tool</span> you need,<br className="hidden sm:block" /> in one beautiful place
            </h1>
            <p className="reveal text-base sm:text-lg text-slate-500 dark:text-slate-400 mt-5 max-w-2xl mx-auto leading-relaxed">
              Merge, split, compress, convert and edit your documents in seconds. Fast, secure and delightfully simple — on any device.
            </p>
            <div className="reveal mt-8 max-w-xl mx-auto relative z-40">
              <Search className="absolute left-4 top-6 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                value={query}
                onChange={(e) => { setQuery(e.target.value); }}
                placeholder="Search a tool — merge, split, compress..."
                className="w-full rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 pl-12 pr-4 py-4 text-sm outline-none focus:ring-2 focus:ring-rose-400/60 focus:border-rose-300 transition shadow-sm"
                data-testid="hero-search-input"
              />
              {query.trim() && (
                <div data-testid="search-suggestions" className="absolute left-0 right-0 top-full mt-3 z-30 bg-white dark:bg-[#10141f] rounded-2xl border border-slate-200 dark:border-white/10 shadow-[0_24px_60px_-15px_rgba(15,23,42,0.25)] dark:shadow-[0_24px_60px_-15px_rgba(0,0,0,0.7)] ring-1 ring-black/[0.03] overflow-hidden text-left reveal">
                  <div className="flex items-center justify-between px-4 pt-3 pb-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">Search results</span>
                    {filtered.length > 0 && <span className="text-[10px] font-bold text-rose-500 bg-rose-500/10 px-2 py-0.5 rounded-full">{filtered.length} tool{filtered.length > 1 ? 's' : ''}</span>}
                  </div>
                  <div className="max-h-80 overflow-y-auto px-2 pb-2 space-y-0.5">
                    {filtered.length === 0 ? (
                      <div className="px-4 py-8 text-center">
                        <Icons.SearchX className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                        <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">No tool found for "{query}"</p>
                        <p className="text-xs text-slate-400 mt-1">Try "merge", "compress" or "word"</p>
                      </div>
                    ) : (
                      filtered.slice(0, 8).map((t) => {
                        const SIcon = Icons[t.icon] || Icons.FileText;
                        const catLabel = (CATEGORIES.find((c) => c.id === t.category) || {}).label;
                        return (
                          <button key={t.slug} data-testid={`search-result-${t.slug}`} onClick={() => navigate(`/tool/${t.slug}`)}
                            className="w-full flex items-center gap-3.5 px-3 py-3 rounded-xl hover:bg-rose-50/80 dark:hover:bg-rose-500/[0.08] border border-transparent hover:border-rose-200/70 dark:hover:border-rose-500/20 transition-all group">
                            <span className={`grid place-items-center w-10 h-10 rounded-xl shrink-0 ${ICON_TILE[t.color] || ICON_TILE.rose} group-hover:scale-110 transition-transform`}><SIcon className="w-5 h-5" /></span>
                            <span className="flex-1 min-w-0">
                              <span className="block text-sm font-bold text-slate-800 dark:text-slate-100 group-hover:text-rose-500 transition-colors">{t.name}</span>
                              <span className="block text-xs text-slate-500 dark:text-slate-400 truncate">{t.desc}</span>
                            </span>
                            {catLabel && <span className="hidden sm:block text-[10px] font-semibold text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-white/5 px-2 py-1 rounded-lg shrink-0">{catLabel}</span>}
                            <Icons.ArrowRight className="w-4 h-4 text-rose-500 opacity-0 group-hover:opacity-100 -translate-x-1 group-hover:translate-x-0 transition-all shrink-0" />
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="reveal mt-8">
              <p className="text-xs font-bold uppercase tracking-widest text-rose-500 mb-4">Most popular tools</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 max-w-3xl mx-auto">
                {popular.map((t) => {
                  const Icon = Icons[t.icon] || Icons.FileText;
                  return (
                    <button key={t.slug} onClick={() => navigate(`/tool/${t.slug}`)}
                      className="premium-card group flex flex-col items-center gap-2.5 rounded-2xl px-3 py-5">
                      <span className={`grid place-items-center w-12 h-12 rounded-xl ${ICON_TILE[t.color] || ICON_TILE.rose} group-hover:scale-110 transition-transform`}>
                        <Icon className="w-6 h-6" strokeWidth={2} />
                      </span>
                      <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 group-hover:text-rose-500 transition-colors text-center leading-tight">{t.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="reveal mt-14 grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-4xl mx-auto">
            {STATS.map((s) => (
              <div key={s.label} className="premium-card text-center rounded-2xl py-6">
                <div className="font-display font-extrabold text-2xl sm:text-3xl brand-gradient-text">{s.value}</div>
                <div className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TOOLS */}
      <section id="tools" className="max-w-7xl mx-auto px-4 sm:px-6 py-16 sm:py-20 scroll-mt-20">
        <div className="text-center mb-8">
          <h2 className="font-display font-bold text-3xl sm:text-4xl">All the tools, right here</h2>
          <p className="text-slate-500 dark:text-slate-400 mt-3">Pick a tool and get to work. No installs, no clutter.</p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2 mb-10">
          {CATEGORIES.map((c) => (
            <button key={c.id} onClick={() => setCat(c.id)}
              className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${cat === c.id ? 'btn-primary text-white' : 'border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5'}`}>
              {c.label}
            </button>
          ))}
        </div>
        {filtered.length === 0 ? (
          <p className="text-center text-slate-500 dark:text-slate-400 py-10">No tools match “{query}”.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((t, i) => <ToolCard key={t.slug} tool={t} index={i} />)}
          </div>
        )}
      </section>

      {/* HOW IT WORKS */}
      <section id="how" className="relative scroll-mt-20 py-16 sm:py-20 bg-slate-50 dark:bg-white/[0.02] border-y border-slate-200 dark:border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <span className="text-xs font-bold uppercase tracking-widest text-rose-500">Simple as 1–2–3</span>
            <h2 className="font-display font-bold text-3xl sm:text-4xl mt-3">How it works</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {STEPS.map((s, i) => {
              const Icon = Icons[s.icon] || Icons.Circle;
              return (
                <div key={s.title} className="relative rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-7">
                  <div className="absolute -top-3 -left-3 grid place-items-center w-9 h-9 rounded-xl btn-primary text-white font-bold text-sm">{i + 1}</div>
                  <div className="grid place-items-center w-12 h-12 rounded-xl bg-rose-500/10 text-rose-500"><Icon className="w-6 h-6" /></div>
                  <h3 className="font-display font-semibold text-lg mt-4">{s.title}</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">{s.text}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="max-w-7xl mx-auto px-4 sm:px-6 py-16 sm:py-20 scroll-mt-20">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <span className="text-xs font-bold uppercase tracking-widest text-rose-500">Why LovePDF</span>
            <h2 className="font-display font-bold text-3xl sm:text-4xl mt-3">Built for speed, trust and joy</h2>
            <p className="text-slate-500 dark:text-slate-400 mt-4 leading-relaxed">We obsess over the tiny details so your PDF chores feel effortless — and even a little fun.</p>
            <ul className="mt-6 space-y-3">
              {['No watermarks on your files', 'Works offline for instant tools', 'Beautiful light & dark themes', 'Free to start, no sign up'].map((t) => (
                <li key={t} className="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-200">
                  <span className="grid place-items-center w-5 h-5 rounded-full bg-emerald-500/15 text-emerald-500"><Check className="w-3.5 h-3.5" /></span>{t}
                </li>
              ))}
            </ul>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {FEATURES.map((f) => {
              const Icon = Icons[f.icon] || Icons.Sparkles;
              return (
                <div key={f.title} className="card-hover rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-6">
                  <div className="grid place-items-center w-11 h-11 rounded-xl bg-violet-500/10 text-violet-500"><Icon className="w-5 h-5" /></div>
                  <h3 className="font-display font-semibold mt-4">{f.title}</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">{f.text}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="py-16 sm:py-20 bg-slate-50 dark:bg-white/[0.02] border-y border-slate-200 dark:border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <span className="text-xs font-bold uppercase tracking-widest text-rose-500">Loved worldwide</span>
            <h2 className="font-display font-bold text-3xl sm:text-4xl mt-3">What people are saying</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {TESTIMONIALS.map((t) => (
              <div key={t.name} className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-6">
                <div className="flex gap-0.5 text-amber-400 mb-3">{Array.from({ length: t.rating }).map((_, i) => <Star key={i} className="w-4 h-4 fill-amber-400" />)}</div>
                <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">“{t.text}”</p>
                <div className="flex items-center gap-3 mt-5">
                  <div className={`grid place-items-center w-10 h-10 rounded-full text-sm font-bold ${ICON_TILE[t.color]}`}>{t.initials}</div>
                  <div>
                    <div className="text-sm font-semibold">{t.name}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="max-w-3xl mx-auto px-4 sm:px-6 py-16 sm:py-20 scroll-mt-20">
        <div className="text-center mb-10">
          <h2 className="font-display font-bold text-3xl sm:text-4xl">Frequently asked questions</h2>
        </div>
        <div className="space-y-3">
          {FAQS.map((f, i) => (
            <div key={i} className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] overflow-hidden">
              <button onClick={() => setOpenFaq(openFaq === i ? -1 : i)} className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left">
                <span className="font-medium">{f.q}</span>
                <Icons.ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${openFaq === i ? 'rotate-180' : ''}`} />
              </button>
              {openFaq === i && <div className="px-5 pb-5 text-sm text-slate-500 dark:text-slate-400 leading-relaxed reveal">{f.a}</div>}
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pb-20">
        <div className="relative overflow-hidden rounded-3xl border border-rose-200/60 dark:border-rose-500/20 bg-gradient-to-br from-rose-50 to-violet-50 dark:from-rose-500/10 dark:to-violet-500/10 p-10 sm:p-14 text-center">
          <div className="absolute -top-16 -right-10 w-72 h-72 rounded-full bg-rose-500/20 blur-3xl" />
          <h2 className="relative font-display font-extrabold text-3xl sm:text-4xl">Ready to tame your PDFs?</h2>
          <p className="relative text-slate-600 dark:text-slate-300 mt-3 max-w-xl mx-auto">Jump in and process your first document in seconds. No account needed.</p>
          <button onClick={() => document.getElementById('tools')?.scrollIntoView({ behavior: 'smooth' })} className="relative mt-7 inline-flex items-center gap-2 btn-primary text-white font-semibold px-7 py-3.5 rounded-xl transition">
            Explore all tools <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Home;
