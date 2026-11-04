'use client';

import { uploadImageFile } from '@/lib/upload-image-client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { FiPlus, FiTrash2, FiX } from 'react-icons/fi';
import toast from 'react-hot-toast';

export interface VariantOption { name: string; values: string[] }
export interface Variant {
  key: string;
  options: { name: string; value: string }[];
  price: number;
  costPrice?: number;
  sku: string;
  quantity: number;
  useMainImage: boolean;
  image?: string;
  imagePublicId?: string;
}

/** Product-level values that every newly generated variant starts from. */
export interface VariantDefaults {
  price: number;
  costPrice?: number;
  sku?: string;
}

export const DEFAULT_VARIANT_STOCK = 100;

interface Props {
  options: VariantOption[];
  variants: Variant[];
  defaults: VariantDefaults;
  mainImage?: string;
  onChange: (options: VariantOption[], variants: Variant[]) => void;
}

const SUGGESTIONS = ['Shade', 'Color', 'Size', 'Volume', 'Pack Size', 'Fragrance'];

/** Cartesian product of all option values → one variant per combination. */
export function buildVariants(options: VariantOption[], existing: Variant[], defaults: VariantDefaults): Variant[] {
  const usable = options.filter(o => o.name.trim() && o.values.length > 0);
  if (usable.length === 0) return [];
  let combos: { name: string; value: string }[][] = [[]];
  for (const o of usable) {
    combos = combos.flatMap(c => o.values.map(v => [...c, { name: o.name.trim(), value: v }]));
  }
  const byKey = new Map(existing.map(v => [v.key, v]));
  // Variant SKUs are always "<product SKU>-<n>", numbered 1..N in table order. A SKU the admin typed
  // by hand (one that doesn't end in "-<number>") is left alone; blank or "...-<n>" ones follow the product SKU.
  const baseSku = (defaults.sku || '').trim();
  const skuFor = (current: string | undefined, position: number) => {
    if (!baseSku) return current || '';
    const isAuto = !current || /-\d+$/.test(current) || current.startsWith('DHV-');
    return isAuto ? `${baseSku}-${position + 1}` : current!;
  };
  type Opt = { name: string; value: string };
  const hasAll = (haystack: Opt[], needles: Opt[]) =>
    needles.length > 0 && needles.every(n => haystack.some(h => h.name === n.name && h.value === n.value));
  const keyOf = (opts: Opt[]) => opts.map(o => o.value).join('|');

  // Pass 1: a combination whose key already exists keeps that variant untouched.
  const matched: (Variant | undefined)[] = combos.map(opts => byKey.get(keyOf(opts)));
  const claimed = new Set(matched.filter((v): v is Variant => !!v));

  // Pass 2: adding/removing an option changes every key ("Red" -> "Red|M"). Hand each
  // leftover variant to the first free combination that contains (or is contained in) its options,
  // so it keeps its own price, stock, SKU and image instead of resetting to the defaults.
  existing.forEach(prev => {
    if (claimed.has(prev)) return;
    const idx = combos.findIndex((opts, i) => !matched[i] && (hasAll(opts, prev.options) || hasAll(prev.options, opts)));
    if (idx !== -1) { matched[idx] = prev; claimed.add(prev); }
  });

  // Combinations that are still new (e.g. "Red|L" next to an existing "Red|M") copy the pricing of
  // the closest existing variant rather than the product-level defaults.
  const pricingTemplate = (opts: Opt[]): Variant | undefined => {
    let best: Variant | undefined;
    let bestScore = 0;
    for (const prev of existing) {
      const shared = prev.options.filter(p => opts.some(o => o.name === p.name && o.value === p.value)).length;
      if (shared > bestScore) { best = prev; bestScore = shared; }
    }
    return best;
  };

  return combos.map((opts, i) => {
    const key = keyOf(opts);
    const prev = matched[i];
    if (prev) return { ...prev, key, options: opts, sku: skuFor(prev.sku, i) };
    const tpl = pricingTemplate(opts);
    return {
      key,
      options: opts,
      price: tpl ? tpl.price : defaults.price,
      costPrice: tpl ? tpl.costPrice ?? 0 : defaults.costPrice ?? 0,
      sku: skuFor('', i),
      quantity: DEFAULT_VARIANT_STOCK,
      useMainImage: true,
    };
  });
}

export default function VariantsEditor({ options, variants, defaults, mainImage, onChange }: Props) {
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [uploadingKeys, setUploadingKeys] = useState<Set<string>>(new Set());
  const [dragKey, setDragKey] = useState<string | null>(null);
  // Uploads finish after the render that started them; keep the latest values for their callbacks.
  const latest = useRef({ options, variants, onChange });
  useEffect(() => { latest.current = { options, variants, onChange }; }, [options, variants, onChange]);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadTarget = useRef<string>('');

  const update = (next: VariantOption[], existing: Variant[] = variants) =>
    onChange(next, buildVariants(next, existing, defaults));
  // When the product SKU itself changes, bring the auto-numbered variant SKUs along with it.
  useEffect(() => {
    if (variants.length === 0) return;
    const next = buildVariants(options, variants, defaults);
    if (next.length === variants.length && next.some((v, i) => v.sku !== variants[i].sku)) onChange(options, next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaults.sku]);
  const [bulk, setBulk] = useState({ price: '', costPrice: '', quantity: '' });
  const [editing, setEditing] = useState<{ i: number; value: string; text: string } | null>(null);

  /** Rename a value in place, carrying over each affected variant's price/SKU/stock/image. */
  const renameValue = (i: number, oldValue: string, rawNew: string) => {
    const newValue = rawNew.trim();
    setEditing(null);
    if (!newValue || newValue === oldValue || options[i].values.includes(newValue)) return;
    const next = options.map((o, idx) =>
      idx === i ? { ...o, values: o.values.map((v) => (v === oldValue ? newValue : v)) } : o,
    );
    const rekeyed = variants.map((v) => {
      if (!v.options.some((o) => o.name === options[i].name && o.value === oldValue)) return v;
      const opts = v.options.map((o) => (o.name === options[i].name && o.value === oldValue ? { ...o, value: newValue } : o));
      return { ...v, options: opts, key: opts.map((o) => o.value).join('|') };
    });
    update(next, rekeyed);
  };

  const applyToAll = () => {
    const num = (s: string) => (s.trim() === '' ? undefined : Math.max(0, +s));
    const patch: Partial<Variant> = {};
    if (num(bulk.price) !== undefined) patch.price = num(bulk.price)!;
    if (num(bulk.costPrice) !== undefined) patch.costPrice = num(bulk.costPrice)!;
    if (num(bulk.quantity) !== undefined) patch.quantity = num(bulk.quantity)!;
    if (Object.keys(patch).length === 0) return;
    onChange(options, variants.map((v) => ({ ...v, ...patch })));
    setBulk({ price: '', costPrice: '', quantity: '' });
  };
  const patchVariant = (key: string, patch: Partial<Variant>) =>
    onChange(options, variants.map(v => (v.key === key ? { ...v, ...patch } : v)));

  const addOption = (name = '') => update([...options, { name, values: [] }]);
  const removeOption = (i: number) => update(options.filter((_, idx) => idx !== i));
  const renameOption = (i: number, name: string) =>
    update(options.map((o, idx) => (idx === i ? { ...o, name } : o)));

  const addValues = (i: number) => {
    const raw = (drafts[i] || '').split(',').map(s => s.trim()).filter(Boolean);
    if (raw.length === 0) return;
    const merged = Array.from(new Set([...options[i].values, ...raw]));
    setDrafts(d => ({ ...d, [i]: '' }));
    update(options.map((o, idx) => (idx === i ? { ...o, values: merged } : o)));
  };
  const removeValue = (i: number, value: string) =>
    update(options.map((o, idx) => (idx === i ? { ...o, values: o.values.filter(v => v !== value) } : o)));

  /** Upload one image for a variant (from the file picker or a drop) and switch it to its own photo. */
  const uploadVariantImage = async (key: string, file: File) => {
    if (!file.type.startsWith('image/')) { toast.error('Only image files can be uploaded'); return; }
    setUploadingKeys(prev => new Set(prev).add(key));
    try {
      const data = await uploadImageFile(file, 'dealhobe/products');
      const cur = latest.current;
      const next = cur.variants.map(v => (v.key === key ? { ...v, image: data.url, imagePublicId: data.publicId, useMainImage: false } : v));
      latest.current = { ...cur, variants: next }; // several drops can finish before the next render
      cur.onChange(cur.options, next);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadingKeys(prev => { const n = new Set(prev); n.delete(key); return n; });
    }
  };

  const dropHandlers = (key: string) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!Array.from(e.dataTransfer.types).includes('Files')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      if (dragKey !== key) setDragKey(key);
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragKey(k => (k === key ? null : k));
    },
    onDrop: (e: React.DragEvent) => {
      if (!Array.from(e.dataTransfer.types).includes('Files')) return;
      e.preventDefault();
      setDragKey(null);
      const file = Array.from(e.dataTransfer.files).find(f => f.type.startsWith('image/'));
      if (file) uploadVariantImage(key, file);
      else toast.error('Only image files can be uploaded');
    },
  });

  const unused = SUGGESTIONS.filter(s => !options.some(o => o.name.toLowerCase() === s.toLowerCase()));

  return (
    <div className="variants-editor">
      <div style={{ display: 'grid', gap: '0.75rem' }}>
        {options.map((opt, i) => (
          <div key={i} className="variants-option">
            <div className="admin-input-group">
              <input
                className="admin-input"
                value={opt.name}
                onChange={e => renameOption(i, e.target.value)}
                placeholder="Option name (e.g. Shade)"
                list="variant-option-suggestions"
              />
              <button type="button" className="btn-admin-danger btn-icon" aria-label="Remove option" title="Remove option" onClick={() => removeOption(i)}>
                <FiTrash2 size={14} />
              </button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
              {opt.values.map(v => (
                <span key={v} className="badge badge-green" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  {editing && editing.i === i && editing.value === v ? (
                    <input
                      autoFocus
                      value={editing.text}
                      onChange={e => setEditing({ ...editing, text: e.target.value })}
                      onBlur={() => renameValue(i, v, editing.text)}
                      onKeyDown={e => { if (e.key === 'Enter') renameValue(i, v, editing.text); if (e.key === 'Escape') setEditing(null); }}
                      style={{ width: Math.max(60, editing.text.length * 9), font: 'inherit', border: '1px solid #ccc', borderRadius: 4, padding: '0 4px' }}
                    />
                  ) : (
                    <span style={{ cursor: 'text' }} title="Click to rename" onClick={() => setEditing({ i, value: v, text: v })}>{v}</span>
                  )}
                  <button type="button" aria-label={`Remove ${v}`} onClick={() => removeValue(i, v)}
                    style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4, margin: -4, display: 'inline-flex', color: 'inherit' }}>
                    <FiX size={12} />
                  </button>
                </span>
              ))}
            </div>
            <div className="admin-input-group">
              <input
                className="admin-input"
                value={drafts[i] || ''}
                onChange={e => setDrafts(d => ({ ...d, [i]: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addValues(i); } }}
                placeholder="Add values — comma separated, press Enter"
              />
              <button type="button" className="btn-admin-secondary" onClick={() => addValues(i)}>Add</button>
            </div>
          </div>
        ))}
        <datalist id="variant-option-suggestions">{SUGGESTIONS.map(s => <option key={s} value={s} />)}</datalist>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center' }}>
          <button type="button" className="btn-admin-secondary" onClick={() => addOption()}>
            <FiPlus size={14} /> Add option
          </button>
          {unused.map(s => (
            <button key={s} type="button" className="btn-admin-secondary btn-sm"
              onClick={() => addOption(s)}>
              + {s}
            </button>
          ))}
        </div>
      </div>

      {variants.length > 0 && (
        <div className="variants-bulk">
          <span className="admin-label" style={{ flexBasis: '100%' }}>Apply to all variants</span>
          {([['price', 'Price'], ['costPrice', 'Cost'], ['quantity', 'Stock']] as const).map(([k, label]) => (
            <input key={k} type="number" min={0} className="admin-input" placeholder={label} aria-label={`${label} for all variants`}
              value={bulk[k]} onChange={e => setBulk(b => ({ ...b, [k]: e.target.value }))} />
          ))}
          <button type="button" className="btn-admin-secondary" onClick={applyToAll}>Apply</button>
        </div>
      )}

      {variants.length > 0 && (
        <div className="admin-table-wrap">
          <table className="admin-table admin-table--sticky variants-table">
            <thead>
              <tr><th className="sticky-col">Variant</th><th>Price (৳)</th><th>Cost (৳)</th><th>SKU</th><th>Stock</th><th>Image</th></tr>
            </thead>
            <tbody>
              {variants.map(v => {
                const img = v.useMainImage ? mainImage : v.image;
                return (
                  <tr key={v.key}>
                    <td className="sticky-col" style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{v.options.map(o => o.value).join(' / ')}</td>
                    <td><input type="number" min={0} className="admin-input" style={{ width: 90 }} value={v.price}
                      onChange={e => patchVariant(v.key, { price: +e.target.value })} /></td>
                    <td><input type="number" min={0} className="admin-input" style={{ width: 90 }} value={v.costPrice ?? 0}
                      onChange={e => patchVariant(v.key, { costPrice: +e.target.value })} /></td>
                    <td><input className="admin-input" style={{ width: 130, fontFamily: 'monospace' }} value={v.sku}
                      onChange={e => patchVariant(v.key, { sku: e.target.value.toUpperCase() })} /></td>
                    <td><input type="number" min={0} className="admin-input" style={{ width: 80 }} value={v.quantity}
                      onChange={e => patchVariant(v.key, { quantity: Math.max(0, +e.target.value) })} /></td>
                    <td>
                      <div
                        {...dropHandlers(v.key)}
                        title="Drop an image here to upload it for this variant"
                        className={`variant-image-cell ${dragKey === v.key ? 'is-drag' : ''}`}
                      >
                        <div
                          onClick={() => { if (!v.useMainImage) { uploadTarget.current = v.key; fileRef.current?.click(); } }}
                          className="variant-image-box"
                          style={{ cursor: v.useMainImage ? 'default' : 'pointer' }}
                          title={v.useMainImage ? 'Using main image' : 'Click to upload'}
                        >
                          {uploadingKeys.has(v.key) ? <div className="spinner" style={{ width: 14, height: 14 }} />
                            : img ? <Image src={img} alt="" fill sizes="44px" style={{ objectFit: 'cover' }} /> : '+'}
                        </div>
                        <label className="admin-checkbox-row" style={{ whiteSpace: 'nowrap' }}>
                          <input type="checkbox" className="admin-checkbox" checked={v.useMainImage}
                            onChange={e => patchVariant(v.key, { useMainImage: e.target.checked })} />
                          <span style={{ fontSize: '0.75rem' }}>Use main image</span>
                        </label>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {options.length > 0 && variants.length === 0 && (
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
          Name an option and add at least one value to generate variants.
        </p>
      )}

      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) uploadVariantImage(uploadTarget.current, f); e.target.value = ''; }} />
    </div>
  );
}
