// Shared by the server homepage, the API and the admin builder — must not be a "use client" module.

export const SECTION_TYPES = [
  'hero',
  'strip',
  'image-grid',
  'product-rail',
  'brand-marquee',
  'reviews',
  'trust-badges',
] as const;
export type SectionType = (typeof SECTION_TYPES)[number];

/** Width:height of a banner. Tiles are always rendered in a box of this shape, so images never stretch. */
export type Ratio = { w: number; h: number };

export type Tile = {
  _id?: string;
  image: string;          // desktop (or only) image — GIF, WebP, PNG, JPG or MP4
  imagePublicId?: string;
  poster?: string;        // still frame shown first for a video (derived automatically for Cloudinary videos)
  mobilePoster?: string;
  mobileImage?: string;   // optional phone-only image (hero, strip)
  mobileImagePublicId?: string;
  link: string;
  alt: string;
  badge?: string;         // small corner label, e.g. "-30%"
  hidden?: boolean;       // kept in the builder but not shown on the storefront
};

export type ProductSource = 'trending' | 'new' | 'featured' | 'top' | 'offer' | 'picks';

export type SectionSettings = {
  ratio?: Ratio;              // tile / desktop banner shape
  mobileRatio?: Ratio;        // hero + strip only: phone banner shape
  cols?: { mobile: number; tablet: number; desktop: number };
  mobileLayout?: 'grid' | 'scroll';
  autoplayMs?: number;
  source?: ProductSource;
  offerId?: string;
  productSlugs?: string[];    // source 'picks': hand-picked products, in this order
  limit?: number;
  countdownTo?: string | null; // ISO date — shows a flash-sale timer
  viewAllLink?: string;
  ticker?: string[];          // strip sections: scrolling text lines (shown instead of / without a banner image)
  accent?: string;            // heading accent colour
};

export type HomeSection = {
  _id: string;
  type: SectionType;
  title: string;
  subtitle?: string;
  isActive: boolean;
  order: number;
  startsAt?: string | null;
  endsAt?: string | null;
  tiles: Tile[];
  settings: SectionSettings;
};

export type NavPill = { label: string; link: string; color: string };
export type TrustBadge = { icon: string; title: string; text: string };

export type Storefront = {
  navPills: NavPill[];
  trustBadges: TrustBadge[];
  contact: { phone: string; email: string; address: string; whatsapp: string };
  socials: { facebook: string; instagram: string; youtube: string; tiktok: string };
  footerAbout: string;
  searchPlaceholders: string[]; // rotating terms in the search bar placeholder
};

export const SECTION_LABELS: Record<SectionType, string> = {
  hero: 'Hero carousel',
  strip: 'Strip banner',
  'image-grid': 'Image grid',
  'product-rail': 'Product rail',
  'brand-marquee': 'Brand marquee',
  reviews: 'Customer reviews',
  'trust-badges': 'Trust badges',
};

/** Which section types carry admin-managed image tiles. */
export const TILE_SECTION_TYPES: SectionType[] = ['hero', 'strip', 'image-grid'];

export const ratioCss = (r?: Ratio) => (r && r.w > 0 && r.h > 0 ? `${r.w} / ${r.h}` : '1 / 1');

/** A section is live when active and inside its optional schedule window. */
export function isSectionLive(s: Pick<HomeSection, 'isActive' | 'startsAt' | 'endsAt'>, now = Date.now()): boolean {
  if (!s.isActive) return false;
  if (s.startsAt && new Date(s.startsAt).getTime() > now) return false;
  if (s.endsAt && new Date(s.endsAt).getTime() < now) return false;
  return true;
}

export const isVideo = (src: string) => /\.(mp4|webm)(\?|$)/i.test(src) || /\/video\/upload\//.test(src);
