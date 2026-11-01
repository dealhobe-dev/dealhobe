'use client';

import { useState } from 'react';
import { FiX, FiArrowUp, FiArrowDown, FiTrash2, FiAlertTriangle, FiImage, FiEye, FiEyeOff } from 'react-icons/fi';
import MediaUpload from '@/components/admin/MediaUpload';
import { RATIO_PRESETS } from '@/lib/homepage/defaults';
import { SECTION_LABELS, isVideo, ratioCss, type HomeSection, type Ratio, type SectionSettings, type Tile } from '@/lib/homepage/types';

export type LinkOption = { label: string; value: string };
export type OfferOption = { _id: string; title: string };

/** Tiles carry a client-only key so late upload callbacks update the right tile even after edits or reordering. */
type EditTile = Tile & { _key: string };
let keySeq = 0;
const withKey = (t: Tile): EditTile => ({ ...t, _key: t._id ?? `new-${++keySeq}` });

const toLocalInput = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

/** Ratio picker: presets with their recommended upload size, plus a custom width:height. */
function RatioField({ label, value, onChange }: { label: string; value?: Ratio; onChange: (r: Ratio) => void }) {
  const r = value ?? { w: 1, h: 1 };
  const preset = RATIO_PRESETS.findIndex((p) => p.ratio.w === r.w && p.ratio.h === r.h);
  const [custom, setCustom] = useState(preset < 0);
  return (
    <div className="admin-field">
      <label className="admin-label">{label}</label>
      <select
        className="admin-input"
        value={custom ? 'custom' : String(preset)}
        onChange={(e) => {
          if (e.target.value === 'custom') return setCustom(true);
          setCustom(false);
          onChange(RATIO_PRESETS[Number(e.target.value)].ratio);
        }}
      >
        {RATIO_PRESETS.map((p, i) => <option key={p.label} value={i}>{p.label} — upload {p.size}</option>)}
        <option value="custom">Custom ratio…</option>
      </select>
      {custom && (
        <div className="hb-inline">
          <input className="admin-input" type="number" min={1} max={100} value={r.w} onChange={(e) => onChange({ ...r, w: Number(e.target.value) || 1 })} aria-label="Ratio width" />
          <span>:</span>
          <input className="admin-input" type="number" min={1} max={100} value={r.h} onChange={(e) => onChange({ ...r, h: Number(e.target.value) || 1 })} aria-label="Ratio height" />
        </div>
      )}
    </div>
  );
}

/** Thumbnail in the section's exact shape; warns when the file's own shape differs (it will be cropped to fit, never stretched). */
function TilePreview({ src, ratio, label }: { src?: string; ratio?: Ratio; label: string }) {
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const expected = ratio ? ratio.w / ratio.h : 1;
  const actual = natural ? natural.w / natural.h : expected;
  const off = Math.abs(actual - expected) / expected > 0.04;
  return (
    <figure className="hb-preview">
      <div className="hb-preview-box" style={{ aspectRatio: ratioCss(ratio) }}>
        {!src ? (
          <span className="hb-preview-empty"><FiImage size={20} /></span>
        ) : isVideo(src) ? (
          <video src={src} muted loop autoPlay playsInline onLoadedMetadata={(e) => setNatural({ w: e.currentTarget.videoWidth, h: e.currentTarget.videoHeight })} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- raw preview of the uploaded file, incl. animated GIFs
          <img src={src} alt="" onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })} />
        )}
      </div>
      <figcaption>
        {label}
        {natural && <span className="hb-muted"> · {natural.w}×{natural.h}</span>}
        {natural && off && (
          <span className="hb-warn"><FiAlertTriangle size={12} /> Different shape — edges will be cropped to fit</span>
        )}
      </figcaption>
    </figure>
  );
}

function TileRow({ tile, index, count, settings, withMobile, links, onChange, onMove, onRemove }: {
  tile: Tile; index: number; count: number; settings: SectionSettings; withMobile: boolean; links: LinkOption[];
  onChange: (patch: Partial<Tile>) => void; onMove: (dir: -1 | 1) => void; onRemove: () => void;
}) {
  const set = onChange;
  return (
    <div className={`hb-tile${tile.hidden ? ' is-off' : ''}`}>
      <div className="hb-tile-media">
        <div>
          <TilePreview src={tile.image} ratio={settings.ratio} label={withMobile ? 'Desktop' : 'Image'} />
          <MediaUpload compact label={tile.image ? 'Replace' : 'Upload'} onUploaded={(m) => set({ image: m.url, imagePublicId: m.publicId, poster: '' })} />
        </div>
        {withMobile && (
          <div>
            <TilePreview src={tile.mobileImage || tile.image} ratio={settings.mobileRatio ?? settings.ratio} label={tile.mobileImage ? 'Mobile' : 'Mobile (uses desktop)'} />
            <div className="hb-inline">
              <MediaUpload compact label={tile.mobileImage ? 'Replace' : 'Upload'} onUploaded={(m) => set({ mobileImage: m.url, mobileImagePublicId: m.publicId, mobilePoster: '' })} />
              {tile.mobileImage && (
                <button type="button" className="btn-admin-secondary hb-upload-compact" onClick={() => set({ mobileImage: '', mobileImagePublicId: '', mobilePoster: '' })}>Clear</button>
              )}
            </div>
          </div>
        )}
      </div>
      <div className="hb-tile-fields">
        <div className="admin-field">
          <label className="admin-label">Link</label>
          <input className="admin-input" list="hb-links" value={tile.link} onChange={(e) => set({ link: e.target.value })} placeholder="/products?category=Makeup" />
        </div>
        <div className="admin-form-row">
          <div className="admin-field">
            <label className="admin-label">Alt text</label>
            <input className="admin-input" value={tile.alt} onChange={(e) => set({ alt: e.target.value })} placeholder="Describe the banner" />
          </div>
          <div className="admin-field">
            <label className="admin-label">Badge (optional)</label>
            <input className="admin-input" value={tile.badge ?? ''} onChange={(e) => set({ badge: e.target.value })} placeholder="-30%" maxLength={30} />
          </div>
        </div>
        {links.length > 0 && index === 0 && (
          <datalist id="hb-links">{links.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}</datalist>
        )}
        <div className="hb-tile-actions">
          <span className="hb-muted">Tile {index + 1} of {count}{tile.hidden ? ' · Hidden on the storefront' : ''}</span>
          <button type="button" className="hb-icon-btn" onClick={() => set({ hidden: !tile.hidden })} aria-pressed={!!tile.hidden}
            aria-label={tile.hidden ? 'Show tile on the storefront' : 'Hide tile from the storefront'}
            title={tile.hidden ? 'Hidden — click to show' : 'Visible — click to hide'}>
            {tile.hidden ? <FiEyeOff size={15} /> : <FiEye size={15} />}
          </button>
          <button type="button" className="hb-icon-btn" onClick={() => onMove(-1)} disabled={index === 0} aria-label="Move tile up"><FiArrowUp size={15} /></button>
          <button type="button" className="hb-icon-btn" onClick={() => onMove(1)} disabled={index === count - 1} aria-label="Move tile down"><FiArrowDown size={15} /></button>
          <button type="button" className="hb-icon-btn hb-danger" onClick={onRemove} aria-label="Remove tile"><FiTrash2 size={15} /></button>
        </div>
      </div>
    </div>
  );
}

export default function SectionEditor({ initial, links, offers, saving, onSave, onClose }: {
  initial: HomeSection; links: LinkOption[]; offers: OfferOption[]; saving: boolean;
  onSave: (s: HomeSection) => void; onClose: () => void;
}) {
  const [s, setS] = useState<Omit<HomeSection, 'tiles'> & { tiles: EditTile[] }>(() => ({ ...initial, tiles: initial.tiles.map(withKey) }));
  const st = s.settings;
  const setSettings = (patch: Partial<SectionSettings>) => setS((p) => ({ ...p, settings: { ...p.settings, ...patch } }));
  // Functional updates keyed by _key: an upload that finishes late never overwrites newer edits.
  const editTiles = (fn: (tiles: EditTile[]) => EditTile[]) => setS((p) => ({ ...p, tiles: fn(p.tiles) }));
  const updateTile = (key: string, patch: Partial<Tile>) => editTiles((ts) => ts.map((x) => (x._key === key ? { ...x, ...patch } : x)));
  const hasTiles = s.type === 'hero' || s.type === 'strip' || s.type === 'image-grid';
  const withMobile = s.type === 'hero' || s.type === 'strip';
  const cols = st.cols ?? { mobile: 2, tablet: 3, desktop: 4 };

  const moveTile = (key: string, dir: -1 | 1) => editTiles((ts) => {
    const i = ts.findIndex((x) => x._key === key);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ts.length) return ts;
    const next = [...ts];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- strip the client-only key
  const save = () => onSave({ ...s, tiles: s.tiles.filter((t) => t.image).map(({ _key, ...t }) => t) });

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label={`Edit ${SECTION_LABELS[s.type]}`}>
      <div className="modal-box modal-lg hb-modal">
        <div className="modal-header">
          <span>{SECTION_LABELS[s.type]}</span>
          <button className="modal-close" onClick={onClose} aria-label="Close"><FiX size={16} /></button>
        </div>

        <div className="modal-body">
          <div className="admin-form">
            <div className="admin-form-row">
              <div className="admin-field">
                <label className="admin-label">Heading</label>
                <input className="admin-input" value={s.title} onChange={(e) => setS({ ...s, title: e.target.value })} placeholder="Deals you cannot miss" />
              </div>
              <div className="admin-field">
                <label className="admin-label">Subheading (optional)</label>
                <input className="admin-input" value={s.subtitle ?? ''} onChange={(e) => setS({ ...s, subtitle: e.target.value })} />
              </div>
            </div>

            <div className="admin-form-row">
              <div className="admin-field">
                <label className="admin-label">Show from (optional)</label>
                <input className="admin-input" type="datetime-local" value={toLocalInput(s.startsAt)} onChange={(e) => setS({ ...s, startsAt: fromLocalInput(e.target.value) })} />
              </div>
              <div className="admin-field">
                <label className="admin-label">Hide after (optional)</label>
                <input className="admin-input" type="datetime-local" value={toLocalInput(s.endsAt)} onChange={(e) => setS({ ...s, endsAt: fromLocalInput(e.target.value) })} />
              </div>
            </div>

            <div className="admin-form-row">
              <label className="hb-check">
                <input type="checkbox" checked={s.isActive} onChange={(e) => setS({ ...s, isActive: e.target.checked })} />
                Visible on the homepage
              </label>
              {s.type !== 'hero' && s.type !== 'strip' && (
                <div className="admin-field">
                  <label className="admin-label">Heading accent colour</label>
                  <input className="admin-input hb-color" type="color" value={st.accent || '#A41B15'} onChange={(e) => setSettings({ accent: e.target.value })} />
                </div>
              )}
            </div>

            {hasTiles && (
              <fieldset className="hb-fieldset">
                <legend>Layout</legend>
                <div className="admin-form-row">
                  <RatioField label={withMobile ? 'Desktop banner shape' : 'Tile shape'} value={st.ratio} onChange={(ratio) => setSettings({ ratio })} />
                  {withMobile && <RatioField label="Mobile banner shape" value={st.mobileRatio ?? st.ratio} onChange={(mobileRatio) => setSettings({ mobileRatio })} />}
                  {s.type === 'hero' && (
                    <div className="admin-field">
                      <label className="admin-label">Autoplay (seconds, 0 = off)</label>
                      <input className="admin-input" type="number" min={0} max={30} value={Math.round((st.autoplayMs ?? 6000) / 1000)} onChange={(e) => setSettings({ autoplayMs: Number(e.target.value) * 1000 })} />
                    </div>
                  )}
                </div>
                {s.type === 'image-grid' && (
                  <div className="admin-form-row hb-cols">
                    {(['mobile', 'tablet', 'desktop'] as const).map((k) => (
                      <div className="admin-field" key={k}>
                        <label className="admin-label">Columns on {k}</label>
                        <input className="admin-input" type="number" min={1} max={k === 'mobile' ? 4 : 8} value={cols[k]} onChange={(e) => setSettings({ cols: { ...cols, [k]: Number(e.target.value) || 1 } })} />
                      </div>
                    ))}
                    <div className="admin-field">
                      <label className="admin-label">On phones</label>
                      <select className="admin-input" value={st.mobileLayout ?? 'grid'} onChange={(e) => setSettings({ mobileLayout: e.target.value as 'grid' | 'scroll' })}>
                        <option value="grid">Grid</option>
                        <option value="scroll">Swipe row</option>
                      </select>
                    </div>
                  </div>
                )}
                <p className="hb-hint">Every tile keeps this shape on all screens. Upload files in the same shape so nothing gets cropped. Animated GIFs are converted to lighter animated WebP automatically.</p>
              </fieldset>
            )}

            {s.type === 'strip' && (
              <fieldset className="hb-fieldset">
                <legend>Scrolling text</legend>
                <div className="admin-field">
                  <label className="admin-label">One line per message (leave empty to show the banner image below instead)</label>
                  <textarea
                    className="admin-textarea"
                    rows={5}
                    value={(st.ticker ?? []).join('\n')}
                    onChange={(e) => setSettings({ ticker: e.target.value.split('\n') })}
                    placeholder={'Best price in Bangladesh, guaranteed\n100% authentic\nCash on delivery'}
                  />
                </div>
                <div className="admin-field">
                  <label className="admin-label">Link when clicked (optional)</label>
                  <input className="admin-input" list="hb-links" value={st.viewAllLink ?? ''} onChange={(e) => setSettings({ viewAllLink: e.target.value })} placeholder="/products" />
                  <datalist id="hb-links">{links.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}</datalist>
                </div>
                <p className="hb-hint">Text moves with a native animation: smooth at any screen refresh rate and sharp at any size.</p>
              </fieldset>
            )}

            {s.type === 'product-rail' && (
              <fieldset className="hb-fieldset">
                <legend>Products</legend>
                <div className="admin-form-row">
                  <div className="admin-field">
                    <label className="admin-label">Show</label>
                    <select className="admin-input" value={st.source ?? 'trending'} onChange={(e) => setSettings({ source: e.target.value as SectionSettings['source'] })}>
                      <option value="trending">Trending products</option>
                      <option value="new">New arrivals</option>
                      <option value="featured">Featured products</option>
                      <option value="top">Top sellers</option>
                      <option value="offer">Products in an offer</option>
                      <option value="picks">Hand-picked products</option>
                    </select>
                  </div>
                  {st.source === 'picks' && (
                    <div className="admin-field" style={{ flexBasis: '100%' }}>
                      <label className="admin-label">Product slugs, one per line (the last part of a product&apos;s page address), shown in this order</label>
                      <textarea className="admin-textarea" rows={4} value={(st.productSlugs ?? []).join('\n')} onChange={(e) => setSettings({ productSlugs: e.target.value.split('\n').map((x) => x.trim()) })} />
                    </div>
                  )}
                  {st.source === 'offer' && (
                    <div className="admin-field">
                      <label className="admin-label">Offer</label>
                      <select className="admin-input" value={st.offerId ?? ''} onChange={(e) => setSettings({ offerId: e.target.value })}>
                        <option value="">Choose an offer</option>
                        {offers.map((o) => <option key={o._id} value={o._id}>{o.title}</option>)}
                      </select>
                    </div>
                  )}
                  <div className="admin-field">
                    <label className="admin-label">How many</label>
                    <input className="admin-input" type="number" min={2} max={24} value={st.limit ?? 12} onChange={(e) => setSettings({ limit: Number(e.target.value) })} />
                  </div>
                </div>
                <div className="admin-form-row">
                  <div className="admin-field">
                    <label className="admin-label">Countdown to (optional)</label>
                    <input className="admin-input" type="datetime-local" value={toLocalInput(st.countdownTo)} onChange={(e) => setSettings({ countdownTo: fromLocalInput(e.target.value) })} />
                  </div>
                  <div className="admin-field">
                    <label className="admin-label">“View all” link</label>
                    <input className="admin-input" list="hb-links" value={st.viewAllLink ?? ''} onChange={(e) => setSettings({ viewAllLink: e.target.value })} placeholder="/offers" />
                    <datalist id="hb-links">{links.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}</datalist>
                  </div>
                </div>
              </fieldset>
            )}

            {(s.type === 'brand-marquee' || s.type === 'reviews' || s.type === 'trust-badges') && (
              <p className="hb-hint">
                {s.type === 'brand-marquee' && 'Shows the logos from Brand Management.'}
                {s.type === 'reviews' && 'Shows the reviews marked as featured in Customer Reviews.'}
                {s.type === 'trust-badges' && 'Edit the badges in the Storefront tab.'}
              </p>
            )}

            {hasTiles && (
              <fieldset className="hb-fieldset">
                <legend>Tiles ({s.tiles.length})</legend>
                {s.tiles.map((t, i) => (
                  <TileRow
                    key={t._key}
                    tile={t} index={i} count={s.tiles.length} settings={st} withMobile={withMobile} links={links}
                    onChange={(patch) => updateTile(t._key, patch)}
                    onMove={(dir) => moveTile(t._key, dir)}
                    onRemove={() => editTiles((ts) => ts.filter((x) => x._key !== t._key))}
                  />
                ))}
                {(s.type !== 'strip' || s.tiles.length === 0) && (
                  <div className="hb-add-tile">
                    <MediaUpload label="Upload a new tile" onUploaded={(m) => editTiles((ts) => [...ts, withKey({ image: m.url, imagePublicId: m.publicId, link: '', alt: '' })])} />
                  </div>
                )}
              </fieldset>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-admin-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-admin-primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save section'}
          </button>
        </div>
      </div>
    </div>
  );
}
