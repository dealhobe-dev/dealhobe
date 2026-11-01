import TileLink from "./TileLink";
import SectionHeading from "./SectionHeading";
import HeroCarousel from "./HeroCarousel";
import ProductRail from "./ProductRail";
import Countdown from "./Countdown";
import TrustBadges from "./TrustBadges";
import Ticker from "./Ticker";
import ScrollRow from "@/components/ui/ScrollRow";
import BrandMarquee from "./BrandMarquee";
import CustomerReviewsSection from "@/components/sections/CustomerReviewsSection";
import type { GridProduct } from "@/components/sections/ProductCard";
import type { PlainBrand, PlainReview } from "@/lib/data";
import type { HomeSection, Storefront } from "@/lib/homepage/types";

export type SectionData = {
  products: Record<string, GridProduct[]>; // keyed by section _id
  brands: PlainBrand[];
  reviews: PlainReview[];
  storefront: Storefront;
};

/** Tile `sizes` hint from the grid's column counts (container caps at 1320px). */
const gridSizes = (c = { mobile: 2, tablet: 3, desktop: 4 }) =>
  `(min-width: 1320px) ${Math.ceil(1320 / c.desktop)}px, (min-width: 1024px) ${Math.ceil(100 / c.desktop)}vw, (min-width: 768px) ${Math.ceil(100 / c.tablet)}vw, ${Math.ceil(100 / c.mobile)}vw`;

export default function SectionRenderer({ section, data, first }: { section: HomeSection; data: SectionData; first: boolean }) {
  const { settings: st } = section;
  const tiles = section.tiles.filter((t) => !t.hidden);

  switch (section.type) {
    case "hero":
      if (!tiles.length) return null;
      return (
        <section className="shell pt-3 md:pt-5" aria-label={section.title || "Featured"}>
          <HeroCarousel count={tiles.length} autoplayMs={st.autoplayMs}>
            {tiles.map((t, i) => (
              <div key={t._id ?? i} className="w-full shrink-0 snap-center">
                <TileLink tile={t} ratio={st.ratio} mobileRatio={st.mobileRatio} sizes="(min-width: 1320px) 1320px, 100vw" priority={first && i === 0} late={!(first && i === 0)} className="rounded-none! shadow-none!" />
              </div>
            ))}
          </HeroCarousel>
        </section>
      );

    case "strip":
      // Scrolling text takes precedence: native animation, crisp, smooth at any refresh rate.
      if (st.ticker?.length) {
        return (
          <section className="shell pt-4 md:pt-6" aria-label={section.title || "Promotions"}>
            <Ticker items={st.ticker} link={st.viewAllLink || undefined} label={st.ticker.join(". ")} />
          </section>
        );
      }
      if (!tiles.length) return null;
      return (
        <section className="shell pt-4 md:pt-6" aria-label={section.title || "Promotion"}>
          <TileLink tile={tiles[0]} ratio={st.ratio} mobileRatio={st.mobileRatio} sizes="(min-width: 1320px) 1320px, 100vw" late />
        </section>
      );

    case "image-grid":
      if (!tiles.length) return null;
      return (
        <section className="shell pt-8 md:pt-12">
          <SectionHeading title={section.title} subtitle={section.subtitle} accent={st.accent} />
          {/* A grid from tablet up; on phones "scroll" sections become a swipe row (arrows/wheel for mice). */}
          <ScrollRow
            label={section.title || "banners"}
            trackClassName="tile-grid"
            data-mobile={st.mobileLayout ?? "grid"}
            trackStyle={{ "--cols-m": st.cols?.mobile ?? 2, "--cols-t": st.cols?.tablet ?? 3, "--cols-d": st.cols?.desktop ?? 4 } as React.CSSProperties}
          >
            {tiles.map((t, i) => (
              <TileLink key={t._id ?? i} tile={t} ratio={st.ratio} sizes={gridSizes(st.cols)} priority={first && i < 4} late={!first} />
            ))}
          </ScrollRow>
        </section>
      );

    case "product-rail": {
      const products = data.products[section._id] ?? [];
      if (!products.length) return null;
      return (
        <section className="shell pt-8 md:pt-12">
          <SectionHeading title={section.title} subtitle={section.subtitle} accent={st.accent} viewAll={st.viewAllLink}>
            {st.countdownTo && <Countdown to={st.countdownTo} />}
          </SectionHeading>
          <ProductRail products={products} label={section.title || "products"} />
        </section>
      );
    }

    case "brand-marquee":
      if (!data.brands.length) return null;
      return (
        <section className="shell pt-8 md:pt-12">
          <SectionHeading title={section.title} subtitle={section.subtitle} accent={st.accent} viewAll="/products" />
          <BrandMarquee brands={data.brands} />
        </section>
      );

    case "reviews":
      return data.reviews.length ? <CustomerReviewsSection reviews={data.reviews} title={section.title || undefined} /> : null;

    case "trust-badges":
      return (
        <section className="shell pt-8 md:pt-12" aria-label={section.title || "Why shop with us"}>
          <TrustBadges badges={data.storefront.trustBadges} />
        </section>
      );
  }
}
