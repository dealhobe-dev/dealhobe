'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import {
  FiLayout, FiPlus, FiEdit2, FiTrash2, FiEye, FiEyeOff, FiExternalLink, FiClock, FiImage, FiShoppingBag, FiStar, FiAward, FiTag, FiMinus, FiGrid,
} from 'react-icons/fi';
import type { IconType } from 'react-icons';
import { SortableList, useSortableItem } from '@/components/admin/SortableList';
import DragHandle from '@/components/admin/DragHandle';
import { renumbered, saveOrder } from '@/components/admin/reorderUtils';
import { defaultSections } from '@/lib/homepage/defaults';
import { SECTION_LABELS, SECTION_TYPES, isSectionLive, type HomeSection, type SectionType } from '@/lib/homepage/types';
import SectionEditor, { type LinkOption, type OfferOption } from './SectionEditor';
import StorefrontEditor from './StorefrontEditor';
import './builder.css';

const API = '/api/admin/homepage/sections';

const ICONS: Record<SectionType, IconType> = {
  hero: FiImage, strip: FiMinus, 'image-grid': FiGrid, 'product-rail': FiShoppingBag,
  'brand-marquee': FiTag, reviews: FiStar, 'trust-badges': FiAward,
};

/** Starting point for a newly added section of each type. */
const NEW_SECTION: Record<SectionType, Pick<HomeSection, 'title' | 'settings'>> = {
  hero: { title: 'Hero', settings: { ratio: { w: 16, h: 5 }, mobileRatio: { w: 1, h: 1 }, autoplayMs: 6000 } },
  strip: { title: 'Strip banner', settings: { ratio: { w: 10, h: 1 }, mobileRatio: { w: 4, h: 1 } } },
  'image-grid': { title: 'New grid', settings: { ratio: { w: 1, h: 1 }, cols: { mobile: 2, tablet: 3, desktop: 4 }, mobileLayout: 'grid' } },
  'product-rail': { title: 'Trending now', settings: { source: 'trending', limit: 12, viewAllLink: '/products' } },
  'brand-marquee': { title: 'Brands we love', settings: {} },
  reviews: { title: 'Loved by our customers', settings: {} },
  'trust-badges': { title: 'Why DealHobe', settings: {} },
};

function describe(s: HomeSection): string {
  const parts: string[] = [];
  if (s.type === 'hero' || s.type === 'strip' || s.type === 'image-grid') {
    const hidden = s.tiles.filter((t) => t.hidden).length;
    parts.push(`${s.tiles.length} tile${s.tiles.length === 1 ? '' : 's'}${hidden ? ` (${hidden} hidden)` : ''}`);
  }
  if (s.settings.ratio) parts.push(`${s.settings.ratio.w}:${s.settings.ratio.h}`);
  if (s.type === 'image-grid' && s.settings.cols) parts.push(`${s.settings.cols.mobile}/${s.settings.cols.tablet}/${s.settings.cols.desktop} cols`);
  if (s.type === 'product-rail') parts.push(`${s.settings.source ?? 'trending'} · ${s.settings.limit ?? 12} products`);
  return parts.join(' · ');
}

function scheduleLabel(s: HomeSection): string | null {
  const fmt = (d: string) => new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  if (s.startsAt && new Date(s.startsAt) > new Date()) return `Starts ${fmt(s.startsAt)}`;
  if (s.endsAt) return new Date(s.endsAt) < new Date() ? 'Ended' : `Until ${fmt(s.endsAt)}`;
  return null;
}

function SectionRow({ section, onEdit, onToggle, onDelete }: {
  section: HomeSection; onEdit: () => void; onToggle: () => void; onDelete: () => void;
}) {
  const { setNodeRef, style, handle, isDragging } = useSortableItem(section._id);
  const Icon = ICONS[section.type];
  const live = isSectionLive(section);
  const schedule = scheduleLabel(section);
  const thumb = section.tiles[0]?.image;
  return (
    <li ref={setNodeRef} style={style} className={`hb-section${isDragging ? ' is-dragging' : ''}${live ? '' : ' is-off'}`}>
      <DragHandle handle={handle} />
      <span className="hb-section-thumb">
        {/* eslint-disable-next-line @next/next/no-img-element -- tiny raw preview, may be an animated GIF */}
        {thumb && !/\.(mp4|webm)/i.test(thumb) ? <img src={thumb} alt="" /> : <Icon size={18} />}
      </span>
      <button type="button" className="hb-section-main" onClick={onEdit}>
        <span className="hb-section-title">{section.title || SECTION_LABELS[section.type]}</span>
        <span className="hb-section-meta">
          <span className="hb-chip">{SECTION_LABELS[section.type]}</span>
          {describe(section)}
          {schedule && <span className="hb-chip hb-chip-time"><FiClock size={11} /> {schedule}</span>}
        </span>
      </button>
      <div className="hb-section-actions">
        <button type="button" className="hb-icon-btn" onClick={onToggle} aria-label={section.isActive ? 'Hide section' : 'Show section'} title={section.isActive ? 'Visible — click to hide' : 'Hidden — click to show'}>
          {section.isActive ? <FiEye size={16} /> : <FiEyeOff size={16} />}
        </button>
        <button type="button" className="hb-icon-btn" onClick={onEdit} aria-label="Edit section"><FiEdit2 size={16} /></button>
        <button type="button" className="hb-icon-btn hb-danger" onClick={onDelete} aria-label="Delete section"><FiTrash2 size={16} /></button>
      </div>
    </li>
  );
}

export default function HomepageBuilderPage() {
  const [tab, setTab] = useState<'sections' | 'storefront'>('sections');
  const [sections, setSections] = useState<HomeSection[] | null>(null);
  const [editing, setEditing] = useState<HomeSection | null>(null);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState<SectionType>('image-grid');
  const [links, setLinks] = useState<LinkOption[]>([]);
  const [offers, setOffers] = useState<OfferOption[]>([]);

  const load = useCallback(async () => {
    const res = await fetch(API);
    setSections(res.ok ? await res.json() : []);
  }, []);

  useEffect(() => {
    void load();
    // Link suggestions for tile and "View all" fields.
    Promise.all([
      fetch('/api/admin/categories').then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetch('/api/admin/brands').then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetch('/api/admin/offers').then((r) => (r.ok ? r.json() : [])).catch(() => []),
    ]).then(([cats, brands, offs]: [{ name: string }[], { _id: string; name: string }[], { _id: string; title: string; slug: string }[]]) => {
      setOffers(offs.map((o) => ({ _id: o._id, title: o.title })));
      setLinks([
        { label: 'All products', value: '/products' },
        { label: 'All offers', value: '/offers' },
        { label: 'Blogs', value: '/blogs' },
        ...cats.map((c) => ({ label: `Category · ${c.name}`, value: `/products?category=${encodeURIComponent(c.name)}` })),
        ...brands.map((b) => ({ label: `Brand · ${b.name}`, value: `/products?brand=${b._id}` })),
        ...offs.map((o) => ({ label: `Offer · ${o.title}`, value: `/products/${o.slug}` })),
      ]);
    });
  }, [load]);

  const seedDefaults = async () => {
    const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'seed-defaults' }) });
    if (!res.ok) return toast.error('Could not load the starter layout');
    setSections(await res.json());
    toast.success('Starter layout loaded — replace the placeholders with your banners');
  };

  const addSection = async () => {
    const res = await fetch(API, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: adding, ...NEW_SECTION[adding], tiles: [], isActive: true }),
    });
    if (!res.ok) return toast.error('Could not add the section');
    const created: HomeSection = await res.json();
    setSections((prev) => [...(prev ?? []), created]);
    setEditing(created);
  };

  const saveSection = async (s: HomeSection) => {
    setSaving(true);
    try {
      const res = await fetch(API, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not save');
      const updated: HomeSection = await res.json();
      setSections((prev) => prev?.map((x) => (x._id === updated._id ? updated : x)) ?? null);
      setEditing(null);
      toast.success('Section saved — the homepage is updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const toggle = (s: HomeSection) => saveSection({ ...s, isActive: !s.isActive });

  const remove = async (s: HomeSection) => {
    if (!confirm(`Delete “${s.title || SECTION_LABELS[s.type]}”? Its uploaded banners are deleted too.`)) return;
    const res = await fetch(API, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: s._id }) });
    if (!res.ok) return toast.error('Could not delete');
    setSections((prev) => prev?.filter((x) => x._id !== s._id) ?? null);
    toast.success('Section deleted');
  };

  const reorder = (next: HomeSection[]) => {
    const numbered = renumbered(next);
    const before = sections;
    setSections(numbered);
    saveOrder(API, numbered).catch(() => { setSections(before); toast.error('Could not save the new order'); });
  };

  const empty = sections !== null && sections.length === 0;

  return (
    <div className="hb">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title"><span className="page-icon"><FiLayout size={20} /></span> Homepage Builder</h1>
          <p className="admin-page-subtitle">Arrange the homepage, upload animated banners and edit the storefront chrome. Changes go live on save.</p>
        </div>
        <a className="btn-admin-secondary" href="/" target="_blank" rel="noopener noreferrer"><FiExternalLink size={14} /> View site</a>
      </div>

      <div className="hb-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'sections'} className={tab === 'sections' ? 'active' : ''} onClick={() => setTab('sections')}>Sections</button>
        <button role="tab" aria-selected={tab === 'storefront'} className={tab === 'storefront' ? 'active' : ''} onClick={() => setTab('storefront')}>Storefront</button>
      </div>

      {tab === 'storefront' ? <StorefrontEditor /> : sections === null ? (
        <div className="admin-empty"><div className="spinner" style={{ margin: '0 auto 1rem' }} /><p>Loading…</p></div>
      ) : empty ? (
        <div className="admin-card hb-card hb-starter">
          <h2 className="hb-card-title">Your homepage is showing the starter layout</h2>
          <p className="hb-hint">These {defaultSections().length} sections are live with placeholder banners. Load them into the builder to reorder them, swap in your own GIFs and change links.</p>
          <ol className="hb-starter-list">
            {defaultSections().map((s) => <li key={s._id}><span className="hb-chip">{SECTION_LABELS[s.type]}</span> {s.title}</li>)}
          </ol>
          <button className="btn-admin-primary" onClick={seedDefaults}><FiPlus size={14} /> Start customising</button>
        </div>
      ) : (
        <>
          <div className="hb-toolbar">
            <p className="hb-hint">Drag <span aria-hidden>⠿</span> to reorder. Sections appear on the homepage top to bottom.</p>
            <div className="hb-inline">
              <select className="admin-input" value={adding} onChange={(e) => setAdding(e.target.value as SectionType)} aria-label="Section type">
                {SECTION_TYPES.map((t) => <option key={t} value={t}>{SECTION_LABELS[t]}</option>)}
              </select>
              <button className="btn-admin-primary" onClick={addSection}><FiPlus size={14} /> Add section</button>
            </div>
          </div>
          <SortableList items={sections} onReorder={reorder} as="ol" className="hb-sections">
            {sections.map((s) => (
              <SectionRow key={s._id} section={s} onEdit={() => setEditing(s)} onToggle={() => toggle(s)} onDelete={() => remove(s)} />
            ))}
          </SortableList>
        </>
      )}

      {editing && (
        <SectionEditor
          key={editing._id}
          initial={editing}
          links={links}
          offers={offers}
          saving={saving}
          onSave={saveSection}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
