'use client';

import { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import Image from 'next/image';
import ImageUpload from '@/components/admin/ImageUpload';
import { getProductCoverImage } from '@/lib/product-images';
import { withLowestVariantPrice } from '@/lib/pricing';
import { FiGift, FiEdit2, FiTrash2, FiPlus, FiX } from 'react-icons/fi';

interface Offer {
  _id: string;
  title: string;
  slug: string;
  discountType: 'percentage' | 'flat';
  discountAmount: number;
  details: string;
  thumbnailUrl: string;
  thumbnailPublicId: string;
  productSelection: 'all' | 'selected';
  selectedProducts: string[];
  isActive: boolean;
  endingDate?: string | null;
}

const PRODUCTS_PER_PAGE = 10;

const emptyForm = {
    title: '', slug: '', discountType: 'percentage', discountAmount: 0, details: '',
    thumbnailUrl: '', thumbnailPublicId: '', productSelection: 'all', selectedProducts: [], isActive: true,
    endingDate: ''
};

export default function OffersPage() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [products, setProducts] = useState([] as any[]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Offer | null>(null);
  const [form, setForm] = useState<any>({ ...emptyForm });
  const [saving, setSaving] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [brands, setBrands] = useState<{ _id: string; name: string }[]>([]);
  const [brandFilter, setBrandFilter] = useState(''); // '' = all brands, else brand _id
  const [productPage, setProductPage] = useState(1);
  // The form is two steps: 1 = offer details, 2 = product selection.
  const [step, setStep] = useState<1 | 2>(1);

  const load = async () => {
    setLoading(true);
    const [oRes, pRes, bRes] = await Promise.all([
        fetch('/api/admin/offers'),
        fetch('/api/admin/products'),
        fetch('/api/admin/brands')
    ]);
    setOffers(await oRes.json());
    setProducts(await pRes.json());
    setBrands(bRes.ok ? await bRes.json() : []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => {
      setEditing(null);
      setForm({ ...emptyForm });
      setSearchQuery('');
      setBrandFilter('');
      setProductPage(1);
      setStep(1);
      setModal(true);
  };

  const openEdit = (o: Offer) => {
    setEditing(o);
    setForm({ ...o, endingDate: o.endingDate ? o.endingDate.slice(0, 10) : '' });
    setSearchQuery('');
    setBrandFilter('');
    setProductPage(1);
    setStep(1);
    setModal(true);
  };

  const detailsValid = () => {
    if (!form.title || !form.slug || form.discountAmount <= 0 || !form.thumbnailUrl) {
      toast.error('Please fill all required fields including thumbnail and discount amount.');
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!detailsValid()) { setStep(1); return; }
    if (form.productSelection === 'selected' && form.selectedProducts.length === 0) {
      toast.error('Please select at least one product.');
      return;
    }

    const payload = {
      ...form,
      endingDate: form.endingDate ? new Date(form.endingDate).toISOString() : null,
    };

    setSaving(true);
    try {
        const res = await fetch('/api/admin/offers', {
            method: editing ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing ? { id: editing._id, ...payload } : payload)
        });
        const data = await res.json();
        if(!res.ok) throw new Error(data.error || 'Failed to save');
        setSaving(false);
        setModal(false);
        toast.success(editing ? 'Offer updated' : 'Offer created');
        load();
    } catch(err: any) {
        setSaving(false);
        toast.error(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this offer?')) return;
    await fetch('/api/admin/offers', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    toast.success('Offer deleted');
    load();
  };

  const handleTitleChange = (e: any) => {
      const title = e.target.value;
      const r = Math.floor(100000 + Math.random() * 900000);
      setForm((f: any) => ({
          ...f,
          title,
          slug: !editing ? `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '')}-${r}` : f.slug
      }));
  };

  const toggleProduct = (productId: string) => {
      setForm((f:any) => {
          const sel = new Set(f.selectedProducts);
          if(sel.has(productId)) sel.delete(productId);
          else sel.add(productId);
          return { ...f, selectedProducts: Array.from(sel) };
      });
  };

  // `brand` holds a Brand id, or (older products) the brand name itself.
  const selectedBrand = brands.find(b => b._id === brandFilter);
  const brandProducts = selectedBrand
    ? products.filter(p => p.brand === selectedBrand._id || p.brand === selectedBrand.name)
    : products;
  const filteredProducts = brandProducts.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()));
  const allBrandSelected = brandProducts.length > 0 && brandProducts.every(p => form.selectedProducts.includes(p._id));
  const totalProductPages = Math.max(1, Math.ceil(filteredProducts.length / PRODUCTS_PER_PAGE));
  const currentProductPage = Math.min(productPage, totalProductPages);
  const productPageStart = (currentProductPage - 1) * PRODUCTS_PER_PAGE;
  const pagedProducts = filteredProducts.slice(productPageStart, productPageStart + PRODUCTS_PER_PAGE);

  // 1 … 4 5 [6] 7 8 … 20
  const pageButtons: (number | 'gap-left' | 'gap-right')[] = [];
  for (let n = 1; n <= totalProductPages; n++) {
    if (n === 1 || n === totalProductPages || Math.abs(n - currentProductPage) <= 2) pageButtons.push(n);
    else if (n < currentProductPage && pageButtons[pageButtons.length - 1] !== 'gap-left') pageButtons.push('gap-left');
    else if (n > currentProductPage && pageButtons[pageButtons.length - 1] !== 'gap-right') pageButtons.push('gap-right');
  }

  /** Add every product of the chosen brand to the offer, or take them all out again. */
  const toggleBrandProducts = () => {
      const ids = brandProducts.map(p => p._id);
      setForm((f: any) => {
          const sel = new Set<string>(f.selectedProducts);
          ids.forEach(id => (allBrandSelected ? sel.delete(id) : sel.add(id)));
          return { ...f, selectedProducts: Array.from(sel) };
      });
  };

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title"><span className="page-icon"><FiGift size={20} /></span> Offer Management</h1>
          <p className="admin-page-subtitle">Create discount offers and assign products to them.</p>
        </div>
        <button className="btn-admin-primary" onClick={openAdd}>+ Create New Offer</button>
      </div>

      {loading ? (
        <div className="admin-empty"><div className="spinner" style={{ margin: '0 auto 1rem' }} /><p>Loading…</p></div>
      ) : offers.length === 0 ? (
        <div className="admin-empty">
          <div className="empty-icon"><FiGift size={40} /></div>
          <h3>No Offers Yet</h3>
          <p>Click &quot;Create New Offer&quot; to start your first campaign.</p>
        </div>
      ) : (
        <div className="admin-grid admin-grid--wide">
            {offers.map(o => {
            const endingDate = o.endingDate ? new Date(o.endingDate) : null;
            const isClosed = !o.isActive || (endingDate && endingDate < new Date());
            return (
              <div key={o._id} className="admin-item-card">
                  <div className="admin-item-image admin-item-image--wide">
                      <Image src={o.thumbnailUrl} alt={o.title} fill sizes="(max-width: 640px) 100vw, 400px" style={{ objectFit: 'cover' }} />
                      <span className={`admin-media-badge top-right ${isClosed ? '' : 'is-gold'}`}>
                        {isClosed ? 'Inactive' : 'Active'}
                      </span>
                  </div>
                  <div className="admin-item-body">
                      <div className="admin-item-title">{o.title}</div>
                      <div className="admin-item-meta">{o.details}</div>
                      <div className="admin-item-meta" style={{ marginTop: '0.25rem', fontWeight: 'bold' }}>
                          Discount: {o.discountType === 'percentage' ? `${o.discountAmount}%` : `৳${o.discountAmount}`}
                      </div>
                        {o.endingDate && (
                          <div className="admin-item-meta" style={{ marginTop: '0.25rem' }}>
                            Ends: {new Date(o.endingDate).toLocaleDateString()}
                          </div>
                        )}
                      <div className="admin-item-actions" style={{ paddingTop: '0.5rem' }}>
                          <button className="btn-admin-edit btn-sm" onClick={() => openEdit(o)}><FiEdit2 size={13} /> Edit</button>
                          <button className="btn-admin-danger btn-sm" onClick={() => handleDelete(o._id)}><FiTrash2 size={13} /> Delete</button>
                      </div>
                  </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div className="modal-overlay">
          <div className="modal-box modal-lg" role="dialog" aria-modal="true" aria-label={editing ? 'Edit Offer' : 'Create New Offer'}>
            <div className="modal-header">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                {editing ? <FiEdit2 size={16} /> : <FiPlus size={16} />} {editing ? 'Edit Offer' : 'Create New Offer'}
                <span className="admin-hint" style={{ fontWeight: 400 }}>
                  · Step {step} of 2: {step === 1 ? 'Offer details' : 'Product selection'}
                </span>
              </span>
              <button className="modal-close" aria-label="Close" onClick={() => setModal(false)}><FiX size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="admin-form">
                {step === 1 && (<>
                <div className="admin-form-row">
                    <div className="admin-field">
                        <label className="admin-label">Offer Title</label>
                        <input className="admin-input" value={form.title} onChange={handleTitleChange} placeholder="e.g. Eid Mega Sale" />
                    </div>
                    <div className="admin-field">
                        <label className="admin-label">URL Slug</label>
                        <input className="admin-input" value={form.slug} onChange={e => setForm((f:any) => ({...f, slug: e.target.value}))} />
                    </div>
                </div>

                <div className="admin-field">
                    <label className="admin-label">Discount Type</label>
                    <div className="admin-radio-group">
                       <label>
                           <input type="radio" value="percentage" checked={form.discountType === 'percentage'} onChange={e => setForm((f:any) => ({...f, discountType: e.target.value}))} /> Percentage
                       </label>
                       <label>
                           <input type="radio" value="flat" checked={form.discountType === 'flat'} onChange={e => setForm((f:any) => ({...f, discountType: e.target.value}))} /> Flat Amount
                       </label>
                    </div>
                </div>

                <div className="admin-field">
                    <label className="admin-label">Discount Amount {form.discountType === 'percentage' ? '(%)' : '(৳)'}</label>
                    <input type="number" className="admin-input" value={form.discountAmount} onChange={e => setForm((f:any) => ({...f, discountAmount: +e.target.value}))} />
                </div>

                <div className="admin-field">
                  <label className="admin-label">Ending Date</label>
                  <input type="date" className="admin-input" value={form.endingDate || ''} onChange={e => setForm((f:any) => ({...f, endingDate: e.target.value}))} />
                </div>

                <div className="admin-field">
                  <label className="admin-label">Offer Details</label>
                  <textarea className="admin-textarea" value={form.details} onChange={e => setForm((f:any) => ({...f, details: e.target.value}))} rows={2} placeholder="e.g. Get 20% off on premium skincare" />
                </div>

                 <ImageUpload
                   label="Offer Thumbnail"
                   value={form.thumbnailUrl}
                   folder="dealhobe/offers"
                   onChange={(url, pid) => setForm((f:any) => ({...f, thumbnailUrl: url, thumbnailPublicId: pid}))}
                 />

                <div className="admin-field">
                    <label className="admin-checkbox-row">
                      <input type="checkbox" className="admin-checkbox" checked={form.isActive} onChange={e => setForm((f:any) => ({ ...f, isActive: e.target.checked }))} />
                      <span className="admin-label">Active</span>
                    </label>
                </div>
                </>)}

                {step === 2 && (<>
                 <div className="admin-field">
                    <label className="admin-label">Product Selection</label>
                    <div className="admin-radio-group">
                       <label>
                           <input type="radio" value="all" checked={form.productSelection === 'all'} onChange={e => setForm((f:any) => ({...f, productSelection: e.target.value, selectedProducts: []}))} /> All Products
                       </label>
                       <label>
                           <input type="radio" value="selected" checked={form.productSelection === 'selected'} onChange={e => setForm((f:any) => ({...f, productSelection: e.target.value}))} /> Selected Products Only
                       </label>
                    </div>
                </div>

                {form.productSelection === 'selected' && (
                    <div className="admin-field admin-subpanel">
                         <label className="admin-label">Select Products</label>
                         <div className="admin-input-group" style={{marginBottom: '0.5rem'}}>
                             <input className="admin-input" type="search" placeholder="Search products..." value={searchQuery} onChange={e => { setSearchQuery(e.target.value); setProductPage(1); }} />
                             <select className="admin-select" style={{width: 'auto'}} value={brandFilter} onChange={e => { setBrandFilter(e.target.value); setProductPage(1); }} aria-label="Filter by brand">
                                 <option value="">All brands</option>
                                 {brands.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
                             </select>
                         </div>
                         {selectedBrand && brandProducts.length > 0 && (
                             <button type="button" className="btn-admin-secondary btn-sm" style={{marginBottom: '0.5rem'}} onClick={toggleBrandProducts}>
                                 {allBrandSelected
                                     ? `Remove all ${brandProducts.length} ${selectedBrand.name} products`
                                     : `Add all ${brandProducts.length} ${selectedBrand.name} products to this offer`}
                             </button>
                         )}
                         <div className="check-list">
                             {pagedProducts.map(p => (
                                 <label key={p._id} className={`check-list-row ${form.selectedProducts.includes(p._id) ? 'is-checked' : ''}`}>
                                     <div>
                                         {getProductCoverImage(p) && (
                                           <span className="admin-thumb">
                                             <Image src={getProductCoverImage(p) as string} alt="" fill sizes="34px" style={{objectFit:'cover'}}/>
                                           </span>
                                         )}
                                         <span>{p.name} - {p.hasVariants ? 'from ' : ''}৳{withLowestVariantPrice(p).price}</span>
                                     </div>
                                     <input type="checkbox" className="admin-checkbox" checked={form.selectedProducts.includes(p._id)} onChange={() => toggleProduct(p._id)} />
                                 </label>
                             ))}
                             {filteredProducts.length === 0 && <div className="picker-state">No products found</div>}
                         </div>
                         {totalProductPages > 1 && (
                           <nav className="admin-pagination" style={{ marginTop: '0.75rem' }} aria-label="Product pages">
                             <div className="admin-pagination-pages">
                               <button type="button" className="btn-admin-secondary btn-sm" disabled={currentProductPage === 1} onClick={() => setProductPage(currentProductPage - 1)}>
                                 ‹ Prev
                               </button>
                               {pageButtons.map((n, i) =>
                                 typeof n === 'number' ? (
                                   <button
                                     key={n}
                                     type="button"
                                     className={`${n === currentProductPage ? 'btn-admin-primary' : 'btn-admin-secondary'} btn-sm`}
                                     aria-current={n === currentProductPage ? 'page' : undefined}
                                     onClick={() => setProductPage(n)}
                                   >
                                     {n}
                                   </button>
                                 ) : (
                                   <span key={`${n}-${i}`} className="admin-pagination-gap">…</span>
                                 )
                               )}
                               <button type="button" className="btn-admin-secondary btn-sm" disabled={currentProductPage === totalProductPages} onClick={() => setProductPage(currentProductPage + 1)}>
                                 Next ›
                               </button>
                             </div>
                             <span className="admin-pagination-meta">
                               Showing {productPageStart + 1}–{Math.min(productPageStart + PRODUCTS_PER_PAGE, filteredProducts.length)} of {filteredProducts.length}
                             </span>
                           </nav>
                         )}
                         <div className="admin-hint" style={{marginTop:'0.5rem'}}>{form.selectedProducts.length} product(s) selected</div>
                    </div>
                )}
                </>)}
              </div>
            </div>
            <div className="modal-footer">
              {step === 1 ? (
                <>
                  <button className="btn-admin-secondary" onClick={() => setModal(false)}>Cancel</button>
                  <button className="btn-admin-primary" onClick={() => { if (detailsValid()) setStep(2); }}>Next: Select Products ›</button>
                </>
              ) : (
                <>
                  <button className="btn-admin-secondary" onClick={() => setStep(1)} disabled={saving}>‹ Back</button>
                  <button className="btn-admin-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : editing ? 'Update Offer' : 'Create Offer'}</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
