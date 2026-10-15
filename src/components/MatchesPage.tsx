import React, { useState, useEffect } from 'react';
import { Sparkles, MapPin, ArrowRight, Plus, Trash2, Edit3, CheckCircle2, AlertTriangle, Layers, Clock } from 'lucide-react';
import { MatchHistoryEntry, MatchItem, ListingRecord } from '../types';

interface MatchesPageProps {
  matches: MatchHistoryEntry[];
  onViewDetails: (item: MatchItem) => void;
  onNewSearch: () => void;
}

export const MatchesPage: React.FC<MatchesPageProps> = ({
  matches,
  onViewDetails,
  onNewSearch
}) => {
  const [activeTab, setActiveTab] = useState<'matches' | 'listings'>('matches');
  const [myListings, setMyListings] = useState<ListingRecord[]>([]);
  const [loadingListings, setLoadingListings] = useState(false);
  const [editingListing, setEditingListing] = useState<ListingRecord | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [crudMessage, setCrudMessage] = useState<string | null>(null);

  const fetchListings = async () => {
    setLoadingListings(true);
    try {
      const token = localStorage.getItem('wastematch_token');
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/listings', { headers });
      const json = await res.json();
      if (json.ok && Array.isArray(json.data)) {
        setMyListings(json.data);
      }
    } catch (err) {
      console.warn('Failed to load listings:', err);
    } finally {
      setLoadingListings(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'listings') {
      fetchListings();
    }
  }, [activeTab]);

  const handleDeleteListing = async (id: string) => {
    try {
      const token = localStorage.getItem('wastematch_token');
      const res = await fetch(`/api/listings/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': token ? `Bearer ${token}` : ''
        }
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setCrudMessage('Listing successfully removed from persistent database.');
        setMyListings(prev => prev.filter(l => l.id !== id));
      } else {
        setCrudMessage(`Error: ${data.error || 'Failed to delete listing'}`);
      }
    } catch (err: any) {
      setCrudMessage(`Error: ${err?.message || 'Delete request failed'}`);
    } finally {
      setDeleteConfirmId(null);
      setTimeout(() => setCrudMessage(null), 4000);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingListing) return;

    try {
      const token = localStorage.getItem('wastematch_token');
      const res = await fetch(`/api/listings/${editingListing.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify({
          materialName: editingListing.materialName,
          quantityTonnes: editingListing.quantityTonnes,
          expectedPricePerUnit: editingListing.expectedPricePerUnit,
          location: editingListing.location,
          additionalNotes: editingListing.additionalNotes
        })
      });

      const data = await res.json();
      if (res.ok && data.ok) {
        setCrudMessage('Listing successfully updated in persistent storage.');
        setMyListings(prev => prev.map(l => l.id === editingListing.id ? data.data : l));
        setEditingListing(null);
      } else {
        setCrudMessage(`Error: ${data.error || 'Failed to update listing'}`);
      }
    } catch (err: any) {
      setCrudMessage(`Error: ${err?.message || 'Update request failed'}`);
    } finally {
      setTimeout(() => setCrudMessage(null), 4000);
    }
  };

  return (
    <div className="w-full min-h-[calc(100vh-80px)] bg-[#F8FBF9] py-10 px-4 sm:px-6 lg:px-8" id="matches-page-root">
      <div className="max-w-5xl mx-auto">
        
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <span className="text-[11px] font-extrabold uppercase tracking-widest text-[#238B5A] block mb-1">
              Industrial Workspace & Persistence
            </span>
            <h1 className="font-heading font-extrabold text-3xl sm:text-4xl text-[#10231A] tracking-tight">
              TRADE DASHBOARD
            </h1>
            <p className="text-sm text-[#60756A] mt-1">
              Manage verified matches and persistent waste listings across your supply chain.
            </p>
          </div>

          <button
            onClick={onNewSearch}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[#0B3D2E] hover:bg-[#146B4A] text-white font-heading font-bold text-xs shadow-md transition-all cursor-pointer self-start sm:self-center"
            id="new-match-search-btn"
          >
            <Plus className="w-4 h-4 text-[#35A66F]" />
            <span>Create New Listing / Search</span>
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-3 p-1.5 bg-[#EFF9F2] rounded-2xl border border-[#D9F2E3] mb-8 w-fit">
          <button
            onClick={() => setActiveTab('matches')}
            className={`px-5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'matches'
                ? 'bg-[#0B3D2E] text-white shadow-xs'
                : 'text-[#4A6054] hover:text-[#0B3D2E]'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-[#35A66F]" />
            <span>Facility Matches ({matches.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('listings')}
            className={`px-5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'listings'
                ? 'bg-[#0B3D2E] text-white shadow-xs'
                : 'text-[#4A6054] hover:text-[#0B3D2E]'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-[#35A66F]" />
            <span>Persistent Waste Listings</span>
          </button>
        </div>

        {/* Feedback Alert Banner */}
        {crudMessage && (
          <div className="mb-6 p-4 rounded-2xl bg-[#EBF7F0] border border-[#238B5A]/30 text-[#0B3D2E] text-xs font-semibold flex items-center gap-3 shadow-xs">
            <CheckCircle2 className="w-4 h-4 text-[#238B5A] shrink-0" />
            <span>{crudMessage}</span>
          </div>
        )}

        {/* TAB 1: FACILITY MATCHES */}
        {activeTab === 'matches' && (
          matches.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 border border-[#D9F2E3] text-center shadow-xs">
              <div className="w-16 h-16 rounded-2xl bg-[#EFF9F2] text-[#238B5A] mx-auto flex items-center justify-center mb-4">
                <Sparkles className="w-8 h-8" />
              </div>
              <h3 className="font-heading font-bold text-xl text-[#10231A] mb-2">
                No Active Matches Yet
              </h3>
              <p className="text-sm text-[#60756A] max-w-sm mx-auto mb-6">
                Start by creating a waste listing or searching for secondary materials to discover verified industrial matches.
              </p>
              <button
                onClick={onNewSearch}
                className="px-6 py-3 rounded-xl bg-[#238B5A] text-white font-heading font-bold text-sm shadow-md"
              >
                Start Matching Now
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5" id="matches-grid">
              {matches.map((entry) => {
                const item = entry.matchItem;
                return (
                  <div
                    key={entry.id}
                    onClick={() => onViewDetails(item)}
                    className="bg-white rounded-3xl p-6 border border-[#D9F2E3] shadow-md shadow-[#0B3D2E]/5 hover:shadow-xl hover:border-[#238B5A]/40 transition-all group cursor-pointer flex flex-col justify-between"
                    id={`match-entry-${entry.id}`}
                  >
                    <div>
                      {/* Top Row: Match score & status */}
                      <div className="flex items-center justify-between mb-4">
                        <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#EFF9F2] border border-[#238B5A]/30 text-[#0B3D2E] font-heading font-extrabold text-xs">
                          <Sparkles className="w-3.5 h-3.5 text-[#238B5A]" />
                          <span>{item.matchScore}% MATCH</span>
                        </div>

                        <span className="px-2.5 py-0.5 rounded-full bg-[#D9F2E3] text-[#0B3D2E] text-[11px] font-bold">
                          {entry.status}
                        </span>
                      </div>

                      {/* Image & Company Info */}
                      <div className="flex items-start gap-3.5 mb-4">
                        <div className="w-14 h-14 rounded-2xl overflow-hidden bg-[#EFF9F2] border border-[#D9F2E3] shrink-0">
                          <img
                            src={item.imageUrl}
                            alt={item.companyName}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            referrerPolicy="no-referrer"
                          />
                        </div>

                        <div>
                          <h3 className="font-heading font-bold text-lg text-[#10231A] group-hover:text-[#238B5A] transition-colors leading-tight">
                            {item.companyName}
                          </h3>
                          <p className="text-xs text-[#60756A] flex items-center gap-1 mt-1">
                            <MapPin className="w-3.5 h-3.5 text-[#238B5A]" />
                            <span>{item.location}</span>
                            <span>•</span>
                            <span className="text-[#238B5A] font-semibold">{item.distanceKm} km away</span>
                          </p>
                        </div>
                      </div>

                      {/* Material & Offer Specs */}
                      <div className="grid grid-cols-2 gap-2 text-xs bg-[#F8FBF9] p-3 rounded-2xl border border-[#EFF9F2] mb-4">
                        <div>
                          <span className="text-[#60756A] text-[10px] uppercase block">Material</span>
                          <span className="font-bold text-[#10231A] truncate block">{item.materialName}</span>
                        </div>
                        <div>
                          <span className="text-[#60756A] text-[10px] uppercase block">Volume / Rate</span>
                          <span className="font-heading font-bold text-[#146B4A]">{item.offerPriceStr}</span>
                        </div>
                      </div>
                    </div>

                    {/* Bottom Action */}
                    <div className="pt-3 border-t border-[#EFF9F2] flex items-center justify-between text-xs font-heading font-bold text-[#0B3D2E]">
                      <span className="text-[#60756A] font-normal text-[11px]">Matched {entry.matchedAt}</span>
                      <div className="flex items-center gap-1 text-[#238B5A] group-hover:translate-x-1 transition-transform">
                        <span>View Specifications</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}

        {/* TAB 2: PERSISTENT DATABASE LISTINGS (CRUD) */}
        {activeTab === 'listings' && (
          <div>
            {loadingListings ? (
              <div className="p-12 text-center text-sm font-bold text-[#146B4A]">
                Loading persistent listings from database...
              </div>
            ) : myListings.length === 0 ? (
              <div className="bg-white rounded-3xl p-12 border border-[#D9F2E3] text-center shadow-xs">
                <div className="w-16 h-16 rounded-2xl bg-[#EFF9F2] text-[#238B5A] mx-auto flex items-center justify-center mb-4">
                  <Layers className="w-8 h-8" />
                </div>
                <h3 className="font-heading font-bold text-xl text-[#10231A] mb-2">
                  No Database Listings Found
                </h3>
                <p className="text-sm text-[#60756A] max-w-sm mx-auto mb-6">
                  Listings created via the Sell flow are stored securely in the persistent database.
                </p>
                <button
                  onClick={onNewSearch}
                  className="px-6 py-3 rounded-xl bg-[#238B5A] text-white font-heading font-bold text-sm shadow-md"
                >
                  Create Your First Listing
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {myListings.map((listing) => (
                  <div
                    key={listing.id}
                    className="bg-white rounded-3xl p-6 border border-[#D9F2E3] shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-6 hover:border-[#238B5A]/40 transition-all"
                  >
                    <div className="flex items-start gap-4">
                      {listing.imageUrl ? (
                        <div className="w-16 h-16 rounded-2xl overflow-hidden bg-[#EFF9F2] border border-[#D9F2E3] shrink-0">
                          <img
                            src={listing.imageUrl}
                            alt={listing.materialName}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ) : (
                        <div className="w-16 h-16 rounded-2xl bg-[#EFF9F2] text-[#238B5A] flex items-center justify-center shrink-0">
                          <Layers className="w-7 h-7" />
                        </div>
                      )}

                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-heading font-bold text-lg text-[#10231A]">
                            {listing.materialName}
                          </h3>
                          <span className="px-2.5 py-0.5 rounded-full bg-[#EFF9F2] text-[#0B3D2E] text-[10px] font-bold border border-[#D9F2E3]">
                            {listing.materialCategory}
                          </span>
                        </div>

                        <p className="text-xs text-[#60756A] flex flex-wrap items-center gap-3">
                          <span className="font-bold text-[#146B4A]">
                            {listing.quantityTonnes} {listing.unit}
                          </span>
                          <span>•</span>
                          <span>₹{listing.expectedPricePerUnit.toLocaleString('en-IN')}/{listing.unit}</span>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-[#238B5A]" />
                            {listing.location}
                          </span>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-[#60756A]" />
                            {new Date(listing.createdAt).toLocaleDateString()}
                          </span>
                        </p>

                        {/* Automation badge */}
                        <div className="mt-2 flex items-center gap-2">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                            listing.automationStatus === 'success' ? 'bg-emerald-100 text-emerald-800' :
                            listing.automationStatus === 'failed' ? 'bg-amber-100 text-amber-800' :
                            listing.automationStatus === 'pending' ? 'bg-blue-100 text-blue-800' :
                            'bg-gray-100 text-gray-700'
                          }`}>
                            n8n Automation: {listing.automationStatus || 'skipped'}
                          </span>
                          <span className="text-[10px] text-[#60756A]">ID: {listing.id}</span>
                        </div>
                      </div>
                    </div>

                    {/* Action buttons (Edit & Delete) */}
                    <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                      <button
                        onClick={() => setEditingListing({ ...listing })}
                        className="p-2.5 rounded-xl border border-[#D9F2E3] hover:bg-[#EFF9F2] text-[#0B3D2E] text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                        title="Edit listing in persistent database"
                      >
                        <Edit3 className="w-4 h-4 text-[#238B5A]" />
                        <span>Edit</span>
                      </button>

                      {deleteConfirmId === listing.id ? (
                        <div className="flex items-center gap-1.5 bg-red-50 p-1.5 rounded-xl border border-red-200">
                          <button
                            onClick={() => handleDeleteListing(listing.id)}
                            className="px-2.5 py-1 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700 cursor-pointer"
                          >
                            Confirm Delete
                          </button>
                          <button
                            onClick={() => setDeleteConfirmId(null)}
                            className="px-2 py-1 text-xs text-gray-600 hover:text-black cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirmId(listing.id)}
                          className="p-2.5 rounded-xl border border-red-200 hover:bg-red-50 text-red-600 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                          title="Delete listing from persistent database"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span>Delete</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* EDIT MODAL */}
        {editingListing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
            <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full border border-[#D9F2E3] shadow-2xl">
              <h3 className="font-heading font-extrabold text-2xl text-[#0B3D2E] mb-1">
                Edit Listing (Database Sync)
              </h3>
              <p className="text-xs text-[#60756A] mb-6">
                Update parameters for {editingListing.id}. Changes persist to database.
              </p>

              <form onSubmit={handleSaveEdit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-[#0B3D2E] mb-1">
                    Material Name
                  </label>
                  <input
                    type="text"
                    value={editingListing.materialName}
                    onChange={(e) => setEditingListing({ ...editingListing, materialName: e.target.value })}
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#D9F2E3] text-sm"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold uppercase text-[#0B3D2E] mb-1">
                      Quantity ({editingListing.unit})
                    </label>
                    <input
                      type="number"
                      value={editingListing.quantityTonnes}
                      onChange={(e) => setEditingListing({ ...editingListing, quantityTonnes: Number(e.target.value) })}
                      required
                      min={1}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#D9F2E3] text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase text-[#0B3D2E] mb-1">
                      Expected Price (₹/T)
                    </label>
                    <input
                      type="number"
                      value={editingListing.expectedPricePerUnit}
                      onChange={(e) => setEditingListing({ ...editingListing, expectedPricePerUnit: Number(e.target.value) })}
                      required
                      min={0}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#D9F2E3] text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-[#0B3D2E] mb-1">
                    Industrial Facility Location
                  </label>
                  <input
                    type="text"
                    value={editingListing.location}
                    onChange={(e) => setEditingListing({ ...editingListing, location: e.target.value })}
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#D9F2E3] text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-[#0B3D2E] mb-1">
                    Notes / Specification
                  </label>
                  <textarea
                    rows={2}
                    value={editingListing.additionalNotes}
                    onChange={(e) => setEditingListing({ ...editingListing, additionalNotes: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#D9F2E3] text-sm"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#EFF9F2]">
                  <button
                    type="button"
                    onClick={() => setEditingListing(null)}
                    className="px-4 py-2.5 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl bg-[#0B3D2E] hover:bg-[#146B4A] text-white text-xs font-bold shadow-xs"
                  >
                    Save Changes to DB
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
