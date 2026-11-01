import { SECTION_TYPES, type Ratio, type SectionSettings, type SectionType, type Storefront, type Tile } from './types';
import { DEFAULT_STOREFRONT } from './defaults';

// Admin payloads are trusted users, but still normalise shapes so a bad request can't break the homepage render.

const str = (v: unknown, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const int = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const date = (v: unknown) => {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
};
const ratio = (v: unknown): Ratio | undefined => {
  const r = v as Partial<Ratio> | undefined;
  if (!r || !(Number(r.w) > 0) || !(Number(r.h) > 0)) return undefined;
  return { w: Math.min(100, Number(r.w)), h: Math.min(100, Number(r.h)) };
};

export function sanitizeTile(t: unknown): Tile | null {
  const o = (t ?? {}) as Record<string, unknown>;
  const image = str(o.image, 1000);
  if (!image) return null;
  return {
    image,
    imagePublicId: str(o.imagePublicId),
    poster: str(o.poster, 1000),
    mobilePoster: str(o.mobilePoster, 1000),
    mobileImage: str(o.mobileImage, 1000),
    mobileImagePublicId: str(o.mobileImagePublicId),
    link: str(o.link, 1000),
    alt: str(o.alt, 200),
    badge: str(o.badge, 30),
    hidden: o.hidden === true,
  };
}

export function sanitizeSettings(v: unknown): SectionSettings {
  const o = (v ?? {}) as Record<string, unknown>;
  const cols = o.cols as Record<string, unknown> | undefined;
  const out: SectionSettings = {};
  const r = ratio(o.ratio); if (r) out.ratio = r;
  const mr = ratio(o.mobileRatio); if (mr) out.mobileRatio = mr;
  if (cols) out.cols = { mobile: int(cols.mobile, 1, 4, 2), tablet: int(cols.tablet, 1, 6, 3), desktop: int(cols.desktop, 1, 8, 4) };
  if (o.mobileLayout === 'grid' || o.mobileLayout === 'scroll') out.mobileLayout = o.mobileLayout;
  if (o.autoplayMs !== undefined) out.autoplayMs = int(o.autoplayMs, 0, 30000, 6000);
  if (['trending', 'new', 'featured', 'top', 'offer', 'picks'].includes(String(o.source))) out.source = o.source as SectionSettings['source'];
  if (o.offerId) out.offerId = str(o.offerId, 40);
  if (o.limit !== undefined) out.limit = int(o.limit, 2, 24, 12);
  const cd = date(o.countdownTo); out.countdownTo = cd ? cd.toISOString() : null;
  if (o.viewAllLink) out.viewAllLink = str(o.viewAllLink, 500);
  if (Array.isArray(o.productSlugs)) out.productSlugs = o.productSlugs.map((s) => str(s, 120)).filter(Boolean).slice(0, 24);
  if (Array.isArray(o.ticker)) out.ticker = o.ticker.map((s) => str(s, 80)).filter(Boolean).slice(0, 12);
  if (o.accent) out.accent = str(o.accent, 20);
  return out;
}

export function sanitizeSection(body: unknown) {
  const o = (body ?? {}) as Record<string, unknown>;
  const type = String(o.type) as SectionType;
  if (!SECTION_TYPES.includes(type)) return null;
  return {
    type,
    title: str(o.title, 120),
    subtitle: str(o.subtitle, 200),
    isActive: o.isActive !== false,
    startsAt: date(o.startsAt),
    endsAt: date(o.endsAt),
    tiles: Array.isArray(o.tiles) ? o.tiles.map(sanitizeTile).filter((t): t is Tile => !!t).slice(0, 40) : [],
    settings: sanitizeSettings(o.settings),
  };
}

export function sanitizeStorefront(body: unknown): Storefront {
  const o = (body ?? {}) as Record<string, unknown>;
  const list = <T,>(v: unknown, map: (x: Record<string, unknown>) => T | null, max: number) =>
    Array.isArray(v) ? v.map((x) => map((x ?? {}) as Record<string, unknown>)).filter((x): x is T => !!x).slice(0, max) : [];
  const c = (o.contact ?? {}) as Record<string, unknown>;
  const so = (o.socials ?? {}) as Record<string, unknown>;
  return {
    navPills: list(o.navPills, (p) => (str(p.label) ? { label: str(p.label, 40), link: str(p.link, 500) || '/', color: str(p.color, 20) || '#A41B15' } : null), 16),
    trustBadges: list(o.trustBadges, (b) => (str(b.title) ? { icon: str(b.icon, 20) || 'shield', title: str(b.title, 60), text: str(b.text, 120) } : null), 8),
    contact: { phone: str(c.phone, 40), email: str(c.email, 120), address: str(c.address, 300), whatsapp: str(c.whatsapp, 40) },
    socials: { facebook: str(so.facebook), instagram: str(so.instagram), youtube: str(so.youtube), tiktok: str(so.tiktok) },
    footerAbout: str(o.footerAbout, 400) || DEFAULT_STOREFRONT.footerAbout,
    searchPlaceholders: Array.isArray(o.searchPlaceholders)
      ? o.searchPlaceholders.map((s) => str(s, 60)).filter(Boolean).slice(0, 20)
      : DEFAULT_STOREFRONT.searchPlaceholders,
  };
}
