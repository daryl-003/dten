import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import knustLogo from "@/assets/partners/knust.png";
import uccLogo from "@/assets/partners/ucc.png";
import umatLogo from "@/assets/partners/umat.jpg";
import ugLogo from "@/assets/partners/ug.svg";
import gctuLogo from "@/assets/partners/gctu.png";
import atuLogo from "@/assets/partners/atu.png";
import ashesiLogo from "@/assets/partners/ashesi.webp";
import mestLogo from "@/assets/partners/mest.png";

type Partner = {
  name: string;
  abbr: string;
  tagline: string;
  logo?: string;
};

/** Approved (live) logo shown publicly. */
export const GTL_LOGO_SETTING_KEY = "partner_logo_gtl";
/** Uploaded but not yet approved — never rendered publicly. */
export const GTL_LOGO_PENDING_KEY = "partner_logo_gtl_pending";

const CACHE_KEY = "dten:partner-logos:v1";
const CACHE_TTL = 1000 * 60 * 60 * 6; // 6 hours

const basePartners: Partner[] = [
  { name: "Kwame Nkrumah University of Science & Technology", abbr: "KNUST", tagline: "Nyansa, Adwene na Nsi", logo: knustLogo },
  { name: "University of Cape Coast", abbr: "UCC", tagline: "Veritas Nobis Lumen", logo: uccLogo },
  { name: "University of Mines & Technology", abbr: "UMaT", tagline: "Knowledge, Truth and Excellence", logo: umatLogo },
  { name: "University of Ghana", abbr: "UG", tagline: "Integri Procedamus", logo: ugLogo },
  { name: "Ghana Communication Technology University", abbr: "GCTU", tagline: "Technology for Development", logo: gctuLogo },
  { name: "Accra Technical University", abbr: "ATU", tagline: "Skills for Industry", logo: atuLogo },
  { name: "Ashesi University", abbr: "Ashesi", tagline: "Scholarship, Leadership, Citizenship", logo: ashesiLogo },
  { name: "MEST Africa", abbr: "MEST", tagline: "Entrepreneurial Training", logo: mestLogo },
  { name: "Ghana Tech Lab", abbr: "GTL", tagline: "Innovation & Digital Skills" },
];

const PER_SLIDE = 3;

const readCache = (): string | null => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { value: string; ts: number };
    if (Date.now() - parsed.ts > CACHE_TTL) return null;
    return parsed.value || null;
  } catch {
    return null;
  }
};

const writeCache = (value: string) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ value, ts: Date.now() }));
  } catch {
    /* storage unavailable — ignore */
  }
};

const LogoBadge = ({ partner }: { partner: Partner }) => {
  const [failed, setFailed] = useState(false);
  const showFallback = !partner.logo || failed;

  return (
    <div className="flex h-24 w-36 items-center justify-center rounded-2xl border border-primary/30 bg-white p-3 shadow-[0_0_40px_-12px_hsl(var(--primary)/0.5)] sm:h-28 sm:w-44 sm:p-4">
      {showFallback ? (
        <div
          role="img"
          aria-label={`${partner.name} logo unavailable`}
          className="flex h-full w-full flex-col items-center justify-center gap-1 rounded-xl bg-slate-100 text-slate-600"
        >
          <span className="font-mono text-base font-bold tracking-[0.2em] sm:text-lg">{partner.abbr}</span>
          <span className="px-2 text-center text-[8px] font-medium uppercase tracking-widest text-slate-400">
            Logo coming soon
          </span>
        </div>
      ) : (
        <img
          src={partner.logo}
          alt={`${partner.name} official logo`}
          loading="lazy"
          decoding="async"
          width={176}
          height={112}
          sizes="(max-width: 640px) 144px, 176px"
          onError={() => setFailed(true)}
          className="max-h-full max-w-full object-contain"
        />
      )}
    </div>
  );
};

const PartnersCarousel = () => {
  const [gtlLogo, setGtlLogo] = useState<string | null>(() => readCache());

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", GTL_LOGO_SETTING_KEY)
        .maybeSingle();
      const value = (data?.value as string) || "";
      setGtlLogo(value || null);
      writeCache(value);
    })();
  }, []);

  const partners = basePartners.map((p) =>
    p.abbr === "GTL" && gtlLogo ? { ...p, logo: gtlLogo } : p
  );

  const slides: Partner[][] = [];
  for (let i = 0; i < partners.length; i += PER_SLIDE) slides.push(partners.slice(i, i + PER_SLIDE));

  const [index, setIndex] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setIndex((i) => (i + 1) % slides.length), 4000);
    return () => clearInterval(t);
  }, [slides.length]);

  const current = slides[Math.min(index, slides.length - 1)] ?? [];

  return (
    <section className="border-y border-border bg-card/40">
      <div className="mx-auto max-w-[1600px] px-6 py-14 md:px-12">
        <p className="mb-10 text-center text-[10px] font-mono uppercase tracking-[0.4em] text-muted-foreground">
          // Trusted by partners across Ghana &amp; West Africa
        </p>

        <div className="relative min-h-[190px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.5 }}
              className="grid gap-8 sm:grid-cols-3"
            >
              {current.map((p) => (
                <div key={p.abbr} className="flex flex-col items-center justify-center gap-3 px-4 text-center">
                  <LogoBadge partner={p} />
                  <p className="text-xs font-mono font-bold uppercase tracking-[0.3em] text-primary">{p.abbr}</p>
                  <p className="text-sm font-semibold leading-snug text-foreground/80">{p.name}</p>
                  <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground">{p.tagline}</p>
                </div>
              ))}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="mt-10 flex items-center justify-center gap-2.5">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setIndex(i)}
              aria-label={`Go to partner slide ${i + 1}`}
              className={`h-2 rounded-full transition-all ${
                i === index ? "w-6 bg-primary" : "w-2 bg-muted-foreground/40 hover:bg-muted-foreground/70"
              }`}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

export default PartnersCarousel;
