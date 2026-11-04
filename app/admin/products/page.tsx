'use client';

import { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { FiEdit2, FiTrash2, FiRefreshCw, FiPackage, FiPlus, FiX } from 'react-icons/fi';
import MultiImageUpload from '@/components/admin/MultiImageUpload';
import { getProductCoverImage } from '@/lib/product-images';
import VariantsEditor, { VariantOption, Variant } from '@/components/admin/VariantsEditor';
import { withLowestVariantPrice } from '@/lib/pricing';

const RichTextEditor = dynamic(() => import('@/components/admin/RichTextEditor'), { ssr: false });

interface Product {
  _id: string;
  sku: string;
  name: string;
  slug: string;
  price: number;
  costPrice?: number;
  quantity: number;
  shortDescription: string;
  brand: string;
  category: string;
  subCategory: string;
  description: string;
  images: string[];
  imagePublicIds: string[];
  isFeatured: boolean;
  isTrending: boolean;
  isNewArrival: boolean;
  isTopSeller: boolean;
  hasVariants?: boolean;
  variantOptions?: VariantOption[];
  variants?: Variant[];
}

/* Homepage placement tags — independently toggleable, both from the form and
   as quick-toggle buttons on each product row. */
const TAGS: { key: 'isTrending' | 'isNewArrival' | 'isFeatured' | 'isTopSeller'; label: string }[] = [
  { key: 'isTrending',  label: 'Trending' },
  { key: 'isNewArrival', label: 'New' },
  { key: 'isFeatured',  label: 'Featured' },
  { key: 'isTopSeller', label: 'Top Seller' },
];

const randomDigits = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');
const generateSku = () => 'DH-' + randomDigits(8);
const slugify = (name: string) => name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
const generateSlug = (name: string) => {
  const base = slugify(name);
  return (base ? `${base}-` : '') + randomDigits(7);
};

const PAGE_SIZE = 20;

const emptyForm = {
    sku: '', name: '', slug: '', price: 0, costPrice: 0, quantity: 0, shortDescription: '',
    brand: '', category: '', subCategory: '', description: '',
    images: [] as string[], imagePublicIds: [] as string[],
    isFeatured: false, isTrending: false, isNewArrival: false, isTopSeller: false,
    hasVariants: false, variantOptions: [] as VariantOption[], variants: [] as Variant[],
};

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<any>({ ...emptyForm });
  const [saving, setSaving] = useState(false);

  // Listing filters + pagination
  const [search, setSearch] = useState('');
  const [brandFilter, setBrandFilter] = useState(''); // '' = all, 'none' = products without a brand, else brand _id
  const [page, setPage] = useState(1);

  // Reference data
  const [brands, setBrands] = useState([] as any[]);
  const [categories, setCategories] = useState([] as any[]);
  const [subCategories, setSubCategories] = useState([] as any[]);

  const load = async () => {
    setLoading(true);
    const [pRes, bRes, cRes, sRes] = await Promise.all([
        fetch('/api/admin/products'),
        fetch('/api/admin/brands'),
        fetch('/api/admin/categories'),
        fetch('/api/admin/subcategories'),
    ]);
    setProducts(await pRes.json());
    setBrands(await bRes.json());
    setCategories(await cRes.json());
    setSubCategories(await sRes.json());
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => {
      setEditing(null);
      setForm({
          ...emptyForm,
          sku: generateSku(),
          category: categories.length > 0 ? categories[0]._id : ''
      });
      setModal(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({ ...emptyForm, ...p, variantOptions: p.variantOptions || [], variants: p.variants || [] });
    setModal(true);
  };

  const handleSave = async () => {
    const withVariants = !!form.hasVariants;
    if (!form.name || !form.slug || !form.category || (!withVariants && form.price <= 0)) {
      toast.error('Please fill all required fields');
      return;
    }
    if (withVariants) {
      if (form.variants.length === 0) { toast.error('Add at least one variant option with values'); return; }
      if (form.variants.some((v: Variant) => !(v.price > 0))) { toast.error('Every variant needs a price'); return; }
      const skus = form.variants.map((v: Variant) => (v.sku || '').trim()).filter(Boolean);
      const dupSku = skus.find((s: string, i: number) => skus.indexOf(s) !== i);
      if (dupSku) { toast.error(`SKU "${dupSku}" is used by more than one variant`); return; }
      if (form.variants.some((v: Variant) => !v.useMainImage && !v.image)) { toast.error('Upload an image or tick "Use main image" for every variant'); return; }
    }
    // Product-level price/stock mirror the variants so listings & stock badges keep working.
    const payload = withVariants
      ? {
          ...form,
          price: Math.min(...form.variants.map((v: Variant) => v.price)),
          quantity: form.variants.reduce((n: number, v: Variant) => n + (v.quantity || 0), 0),
        }
      : { ...form, variantOptions: [], variants: [] };
    setSaving(true);
    try {
        const res = await fetch('/api/admin/products', {
            method: editing ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(editing ? { id: editing._id, ...payload } : payload)
        });
        const data = await res.json();
        if(!res.ok) throw new Error(data.error || 'Failed to save');
        setSaving(false);
        setModal(false);
        toast.success(editing ? 'Product updated' : 'Product created');
        load();
    } catch(err: any) {
        setSaving(false);
        toast.error(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this product?')) return;
    await fetch('/api/admin/products', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    toast.success('Product deleted');
    load();
  };

  const toggleTag = async (p: Product, key: string) => {
    await fetch('/api/admin/products', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p._id, [key]: !(p as any)[key] }) });
    load();
  };

  const handleNameChange = (e: any) => {
      const name = e.target.value;
      setForm((f: any) => ({
          ...f,
          name,
          slug: !editing ? generateSlug(name) : f.slug
      }));
  };

  const categorySubCategories = subCategories.filter((s) => s.category === form.category);

  // A product matches when every word typed appears somewhere in its name (so one word is enough).
  const searchWords = search.toLowerCase().split(/\s+/).filter(Boolean);
  const filteredProducts = products.filter((p) => {
    const name = (p.name || '').toLowerCase();
    if (!searchWords.every((w) => name.includes(w))) return false;
    if (brandFilter === 'none') return !p.brand;
    if (brandFilter) return p.brand === brandFilter;
    return true;
  });
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pagedProducts = filteredProducts.slice(pageStart, pageStart + PAGE_SIZE);

  // 1 … 4 5 [6] 7 8 … 20
  const pageButtons: (number | 'gap-left' | 'gap-right')[] = [];
  for (let n = 1; n <= totalPages; n++) {
    if (n === 1 || n === totalPages || Math.abs(n - currentPage) <= 2) pageButtons.push(n);
    else if (n < currentPage && pageButtons[pageButtons.length - 1] !== 'gap-left') pageButtons.push('gap-left');
    else if (n > currentPage && pageButtons[pageButtons.length - 1] !== 'gap-right') pageButtons.push('gap-right');
  }

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title"><span className="page-icon"><FiPackage size={20} /></span> Product Listing</h1>
          <p className="admin-page-subtitle">Manage inventory, prices, categorisation, and homepage placement.</p>
        </div>
        <button className="btn-admin-primary" onClick={openAdd}>+ Add New Product</button>
      </div>

      {loading ? (
        <div className="admin-empty"><div className="spinner" style={{ margin: '0 auto 1rem' }} /><p>Loading…</p></div>
      ) : products.length === 0 ? (
        <div className="admin-empty">
          <div className="empty-icon"><FiPackage size={40} /></div>
          <h3>No Products Yet</h3>
          <p>Click &quot;Add New Product&quot; to populate your store inventory.</p>
        </div>
      ) : (
        <>
        <div className="admin-toolbar">
          <input
            className="admin-input"
            type="search"
            placeholder="Search products by name…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
          />
          <select
            className="admin-select"
            value={brandFilter}
            onChange={e => { setBrandFilter(e.target.value); setPage(1); }}
            aria-label="Filter by brand"
          >
            <option value="">All brands</option>
            {brands.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
            <option value="none">No brand</option>
          </select>
          {(search || brandFilter) && (
            <button type="button" className="btn-admin-secondary" onClick={() => { setSearch(''); setBrandFilter(''); setPage(1); }}>
              Clear
            </button>
          )}
          <span className="admin-toolbar-meta">
            {filteredProducts.length === products.length
              ? `${products.length} products`
              : `${filteredProducts.length} of ${products.length} products`}
          </span>
        </div>
        {filteredProducts.length === 0 ? (
          <div className="admin-empty">
            <div className="empty-icon"><FiPackage size={40} /></div>
            <h3>No matching products</h3>
            <p>Try a different word or brand.</p>
          </div>
        ) : (
        <div className="admin-table-wrap admin-table-wrap--stack">
          <table className="admin-table admin-table--stack">
            <thead>
              <tr>
                <th>Product</th>
                <th>Price</th>
                <th>Stock</th>
                <th>Category</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pagedProducts.map(p => {
                  const shown = withLowestVariantPrice(p);
                  const cat = categories.find(c => c._id === p.category)?.name || 'Unknown';
                  const subCat = subCategories.find(s => s._id === p.subCategory)?.name;
                  return (
                      <tr key={p._id}>
                        <td className="cell-head">
                          <div className="cell-product">
                            <div className="admin-thumb">
                              {getProductCoverImage(p) ? (
                                <Image src={getProductCoverImage(p) as string} alt={p.name} fill sizes="44px" style={{ objectFit: 'cover' }} />
                              ) : (
                                <FiPackage size={18} />
                              )}
                            </div>
                            <div>
                                <div className="cell-title">{p.name}</div>
                                <div className="cell-sub">{p.slug}</div>
                                {p.sku && <div className="cell-mono">{p.sku}</div>}
                            </div>
                          </div>
                        </td>
                        <td data-label="Price" className="nowrap"><span>{p.hasVariants && <span style={{fontSize:'0.75em', color:'var(--text-muted)'}}>From </span>}<strong style={{ fontWeight: 600 }}>৳{shown.price}</strong></span></td>
                        <td data-label="Stock">
                          <div>
                            {p.quantity === 0 ? <span className="badge badge-red">Out of Stock</span> :
                             p.quantity < 10 ? <span className="badge badge-yellow">Low: {p.quantity}</span> :
                             <span className="badge badge-green">In Stock: {p.quantity}</span>}
                            {p.hasVariants && (() => {
                                const vs = p.variants || [];
                                const out = vs.filter(v => v.quantity === 0).length;
                                const low = vs.filter(v => v.quantity > 0 && v.quantity < 10).length;
                                return (
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>
                                        {vs.length} variants
                                        {out > 0 && <span style={{ color: '#dc2626' }}> · {out} out</span>}
                                        {low > 0 && <span style={{ color: '#b45309' }}> · {low} low</span>}
                                    </div>
                                );
                            })()}
                          </div>
                        </td>
                        <td data-label="Category">
                          <div>
                            <div>{cat}</div>
                            {subCat && <div className="cell-sub">{subCat}</div>}
                          </div>
                        </td>
                        <td className="cell-actions-td">
                          <div>
                            <div className="cell-actions">
                                <button className="btn-admin-edit btn-sm" aria-label="Edit product" onClick={() => openEdit(p)}>
                                    <FiEdit2 size={14} /> Edit
                                </button>
                                <button className="btn-admin-danger btn-sm btn-icon" aria-label="Delete product" onClick={() => handleDelete(p._id)}>
                                    <FiTrash2 size={14} />
                                </button>
                            </div>
                            <div className="cell-tags" role="group" aria-label="Homepage placement">
                                {TAGS.map(tag => (
                                    <button
                                        key={tag.key}
                                        type="button"
                                        className={`tag-toggle ${p[tag.key] ? 'is-on' : ''}`}
                                        aria-pressed={!!p[tag.key]}
                                        onClick={() => toggleTag(p, tag.key)}
                                        title={`Toggle ${tag.label} on homepage`}
                                    >
                                        {tag.label}
                                    </button>
                                ))}
                            </div>
                          </div>
                        </td>
                      </tr>
                  );
              })}
            </tbody>
          </table>
        </div>
        )}
        {totalPages > 1 && (
          <nav className="admin-pagination" aria-label="Product pages">
            <div className="admin-pagination-pages">
              <button type="button" className="btn-admin-secondary" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>
                ‹ Prev
              </button>
              {pageButtons.map((n, i) =>
                typeof n === 'number' ? (
                  <button
                    key={n}
                    type="button"
                    className={n === currentPage ? 'btn-admin-primary' : 'btn-admin-secondary'}
                    aria-current={n === currentPage ? 'page' : undefined}
                    onClick={() => setPage(n)}
                  >
                    {n}
                  </button>
                ) : (
                  <span key={`${n}-${i}`} className="admin-pagination-gap">…</span>
                )
              )}
              <button type="button" className="btn-admin-secondary" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}>
                Next ›
              </button>
            </div>
            <span className="admin-pagination-meta">
              Showing {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, filteredProducts.length)} of {filteredProducts.length}
            </span>
          </nav>
        )}
        </>
      )}

      {/* Modal */}
      {modal && (
        <div className="modal-overlay">
          <div className="modal-box modal-xl" role="dialog" aria-modal="true" aria-label={editing ? 'Edit Product' : 'Add New Product'}>
            <div className="modal-header">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                {editing ? <FiEdit2 size={16} /> : <FiPlus size={16} />} {editing ? 'Edit Product' : 'Add New Product'}
              </span>
              <button className="modal-close" aria-label="Close" onClick={() => setModal(false)}><FiX size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="admin-form">
                <div className="admin-form-row">
                    <div className="admin-field">
                        <label className="admin-label">Product Name</label>
                        <input className="admin-input" value={form.name} onChange={handleNameChange} placeholder="e.g. Matte Lipstick" />
                    </div>
                    <div className="admin-field">
                        <label className="admin-label">URL Slug</label>
                        <div className="admin-input-group">
                            <input className="admin-input" value={form.slug} onChange={e => setForm((f:any) => ({...f, slug: e.target.value}))} style={{fontFamily:'monospace'}} />
                            <button type="button" className="btn-admin-secondary btn-icon" title="Regenerate slug" aria-label="Regenerate slug" onClick={() => setForm((f:any) => ({...f, slug: generateSlug(f.name)}))}>
                                <FiRefreshCw size={14} />
                            </button>
                        </div>
                    </div>
                </div>

                <div className="admin-form-row">
                    <div className="admin-field">
                        <label className="admin-label">SKU</label>
                        <div className="admin-input-group">
                            <input
                                className="admin-input"
                                value={form.sku}
                                onChange={e => setForm((f:any) => ({...f, sku: e.target.value.toUpperCase()}))}
                                placeholder="Auto-generated if left empty"
                                style={{fontFamily:'monospace'}}
                            />
                            <button type="button" className="btn-admin-secondary" onClick={() => setForm((f:any) => ({...f, sku: generateSku()}))}>Generate</button>
                        </div>
                    </div>
                    <div className="admin-field" />
                </div>

                <div className="admin-form-row">
                    <div className="admin-field">
                        <label className="admin-label">Price (৳){form.hasVariants ? ' - default for new variants' : ''}</label>
                        <input type="number" className="admin-input" value={form.price} onChange={e => setForm((f:any) => ({...f, price: +e.target.value}))} />
                    </div>
                    <div className="admin-field">
                        <label className="admin-label">Cost Price (৳ - admin only, used for profit{form.hasVariants ? '; default cost for new variants' : ''})</label>
                        <input type="number" min={0} className="admin-input" value={form.costPrice ?? 0} onChange={e => setForm((f:any) => ({...f, costPrice: +e.target.value}))} />
                    </div>
                </div>

                <div className="admin-form-row">
                    {form.hasVariants ? (
                        <div className="admin-field">
                            <label className="admin-label">Total Stock</label>
                            <input className="admin-input" disabled value={form.variants.reduce((n: number, v: Variant) => n + (v.quantity || 0), 0) + ' (sum of variants)'} />
                        </div>
                    ) : (
                    <div className="admin-field">
                        <label className="admin-label">Quantity in Stock</label>
                        <input type="number" className="admin-input" value={form.quantity} onChange={e => setForm((f:any) => ({...f, quantity: +e.target.value}))} />
                    </div>
                    )}
                    <div className="admin-field">
                        <label className="admin-label">Brand (Optional)</label>
                        <select className="admin-select" value={form.brand} onChange={e => setForm((f:any) => ({...f, brand: e.target.value}))}>
                            <option value="">No Brand</option>
                            {brands.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
                        </select>
                    </div>
                </div>

                <div className="admin-form-row">
                    <div className="admin-field">
                        <label className="admin-label">Category</label>
                        <select
                            className="admin-select"
                            value={form.category}
                            onChange={e => setForm((f:any) => ({...f, category: e.target.value, subCategory: ''}))}
                        >
                            <option value="">Select Category...</option>
                            {categories.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
                        </select>
                    </div>
                    <div className="admin-field">
                        <label className="admin-label">Sub-category (Optional)</label>
                        <select
                            className="admin-select"
                            value={form.subCategory}
                            onChange={e => setForm((f:any) => ({...f, subCategory: e.target.value}))}
                            disabled={!form.category || categorySubCategories.length === 0}
                        >
                            <option value="">
                                {form.category
                                    ? (categorySubCategories.length === 0 ? 'No sub-categories yet' : 'None')
                                    : 'Select a category first'}
                            </option>
                            {categorySubCategories.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
                        </select>
                    </div>
                </div>

                <div className="admin-field">
                  <label className="admin-label">Short Description</label>
                  <textarea className="admin-textarea" value={form.shortDescription} onChange={e => setForm((f:any) => ({...f, shortDescription: e.target.value}))} rows={2} />
                </div>

                <div className="admin-field">
                  <label className="admin-label">Product Description (Rich Text)</label>
                  <RichTextEditor value={form.description} onChange={html => setForm((f:any) => ({ ...f, description: html }))} />
                </div>

                <MultiImageUpload
                   images={form.images.map((url:string, i:number) => ({ url, publicId: form.imagePublicIds[i] }))}
                   onChange={imgs => setForm((f:any) => ({ ...f, images: imgs.map(i=>i.url), imagePublicIds: imgs.map(i=>i.publicId) }))}
                   folder="dealhobe/products"
                   label="Product Images"
                />

                <div className="admin-field">
                    <label className="admin-checkbox-row">
                        <input
                            type="checkbox"
                            className="admin-checkbox"
                            checked={!!form.hasVariants}
                            onChange={e => setForm((f:any) => ({ ...f, hasVariants: e.target.checked }))}
                        />
                        <span className="admin-label">This product has variants</span>
                    </label>
                </div>

                {form.hasVariants && (
                    <VariantsEditor
                        options={form.variantOptions}
                        variants={form.variants}
                        defaults={{ price: form.price, costPrice: form.costPrice, sku: form.sku }}
                        mainImage={form.images[0]}
                        onChange={(variantOptions, variants) => setForm((f:any) => ({ ...f, variantOptions, variants }))}
                    />
                )}

                <div className="admin-field">
                    <label className="admin-label">Homepage Placement</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem 1.25rem' }}>
                        {TAGS.map(tag => (
                            <label key={tag.key} className="admin-checkbox-row">
                                <input
                                    type="checkbox"
                                    className="admin-checkbox"
                                    checked={!!form[tag.key]}
                                    onChange={e => setForm((f:any) => ({ ...f, [tag.key]: e.target.checked }))}
                                />
                                <span className="admin-label">{tag.label}</span>
                            </label>
                        ))}
                    </div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-admin-secondary" onClick={() => setModal(false)}>Cancel</button>
              <button className="btn-admin-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : editing ? 'Update Product' : 'Add Product'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
