import express, { Response } from 'express';
import { db } from '../db/database';
import { requireAuth, optionalAuth, AuthenticatedRequest } from './auth';
import { triggerN8nAutomation } from './n8nService';
import { findTopMatches, getFacilityById, resolveCoordinates } from '../matching/matchingEngine';
import { calculateImpact } from '../matching/impactCalculator';
import type { ListingRecord, ContaminationLevel, AvailabilityStatus } from '../types';

export const listingRouter = express.Router();

/**
 * GET /api/listings
 * Fetch listings with optional filters (category, search, myListings)
 */
listingRouter.get('/', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { category, search, myListings } = req.query as Record<string, string>;
    const filter: { category?: string; search?: string; userId?: string } = {};

    if (category) filter.category = category;
    if (search) filter.search = search;

    if (myListings === 'true' || myListings === '1') {
      if (!req.user) {
        return res.status(401).json({ ok: false, error: 'Authentication required to view personal listings.', code: 'UNAUTHORIZED' });
      }
      filter.userId = req.user.id;
    }

    const listings = await db.getListings(filter);
    return res.json({
      ok: true,
      count: listings.length,
      data: listings
    });
  } catch (err: any) {
    console.error('[GET /api/listings] error:', err);
    return res.status(500).json({ ok: false, error: 'Failed to retrieve listings', code: 'SERVER_ERROR' });
  }
});

/**
 * GET /api/listings/:id
 * Retrieve single listing with live facility matches
 */
listingRouter.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const listing = await db.getListingById(id);

    if (!listing) {
      return res.status(404).json({ ok: false, error: 'Listing not found', code: 'NOT_FOUND' });
    }

    // Generate matches for this specific listing
    const coords = resolveCoordinates(listing.location);
    const contaminationPct =
      listing.contamination === 'None' ? 0 :
      listing.contamination === 'Medium' ? 12 :
      listing.contamination === 'High' ? 25 : 5;

    const matches = findTopMatches({
      wasteType: listing.materialName,
      quantityTonnes: listing.quantityTonnes,
      latitude: coords.lat,
      longitude: coords.lon,
      contaminationPercentage: contaminationPct,
      budgetOrExpectedPrice: listing.expectedPricePerUnit
    }, 4);

    return res.json({
      ok: true,
      data: {
        listing,
        matches
      }
    });
  } catch (err: any) {
    console.error('[GET /api/listings/:id] error:', err);
    return res.status(500).json({ ok: false, error: 'Failed to retrieve listing', code: 'SERVER_ERROR' });
  }
});

/**
 * POST /api/listings
 * Create new waste listing (authenticated)
 */
listingRouter.post('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const body = req.body || {};

    const {
      materialName,
      materialCategory,
      quantityTonnes,
      unit = 'tonnes',
      expectedPricePerUnit = 0,
      location,
      availability = 'Available now',
      composition = '',
      contamination = 'Low',
      additionalNotes = '',
      imageUrl = '',
      aiIdentifiedConfidence,
      potentialUses = []
    } = body;

    // Strict validation
    if (!materialName || typeof materialName !== 'string' || materialName.trim().length < 2) {
      return res.status(400).json({ ok: false, error: 'Valid material name is required (at least 2 characters).', code: 'INVALID_MATERIAL_NAME' });
    }

    const qty = Number(quantityTonnes);
    if (isNaN(qty) || qty <= 0 || qty > 100000) {
      return res.status(400).json({ ok: false, error: 'Quantity must be a positive number up to 100,000 tonnes.', code: 'INVALID_QUANTITY' });
    }

    const price = Number(expectedPricePerUnit);
    if (isNaN(price) || price < 0) {
      return res.status(400).json({ ok: false, error: 'Expected price must be non-negative.', code: 'INVALID_PRICE' });
    }

    const loc = typeof location === 'string' && location.trim().length > 0 ? location.trim() : user.location;

    const validContamination: ContaminationLevel[] = ['None', 'Low', 'Medium', 'High'];
    const validAvailability: AvailabilityStatus[] = ['Available now', 'Within 7 days', 'Recurring monthly', 'Custom schedule'];

    const newListingData: Omit<ListingRecord, 'id' | 'createdAt' | 'updatedAt'> = {
      userId: user.id,
      userEmail: user.email,
      companyName: user.companyName,
      materialName: materialName.trim(),
      materialCategory: (materialCategory || 'Industrial Byproduct').trim(),
      quantityTonnes: qty,
      unit: unit || 'tonnes',
      expectedPricePerUnit: price,
      location: loc,
      availability: validAvailability.includes(availability) ? availability : 'Available now',
      composition: typeof composition === 'string' ? composition.trim() : '',
      contamination: validContamination.includes(contamination) ? contamination : 'Low',
      additionalNotes: typeof additionalNotes === 'string' ? additionalNotes.trim() : '',
      imageUrl: typeof imageUrl === 'string' ? imageUrl.trim() : '',
      aiIdentifiedConfidence: typeof aiIdentifiedConfidence === 'number' ? aiIdentifiedConfidence : undefined,
      potentialUses: Array.isArray(potentialUses) ? potentialUses : [],
      status: 'active',
      automationStatus: 'pending'
    };

    const savedListing = await db.createListing(newListingData);

    // Asynchronously dispatch n8n automation in background (never blocks client response)
    triggerN8nAutomation(savedListing).catch((err) => {
      console.warn('[n8n] Background automation dispatch warning:', err?.message || err);
    });

    return res.status(201).json({
      ok: true,
      message: 'Listing created successfully',
      data: savedListing
    });
  } catch (err: any) {
    console.error('[POST /api/listings] error:', err);
    return res.status(500).json({ ok: false, error: 'Failed to create listing', code: 'SERVER_ERROR' });
  }
});

/**
 * PUT /api/listings/:id
 * Update an existing listing (authenticated, owner only)
 */
listingRouter.put('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const { id } = req.params;
    const existing = await db.getListingById(id);

    if (!existing) {
      return res.status(404).json({ ok: false, error: 'Listing not found', code: 'NOT_FOUND' });
    }

    // Ownership check: Only owner or admin can edit
    if (existing.userId !== user.id && user.role !== 'admin') {
      return res.status(403).json({
        ok: false,
        error: 'Forbidden. You do not have permission to modify this listing.',
        code: 'FORBIDDEN_OWNERSHIP'
      });
    }

    const {
      materialName,
      materialCategory,
      quantityTonnes,
      expectedPricePerUnit,
      location,
      availability,
      composition,
      contamination,
      additionalNotes,
      status
    } = req.body || {};

    const updates: Partial<ListingRecord> = {};

    if (materialName && typeof materialName === 'string') updates.materialName = materialName.trim();
    if (materialCategory && typeof materialCategory === 'string') updates.materialCategory = materialCategory.trim();
    if (quantityTonnes !== undefined) {
      const q = Number(quantityTonnes);
      if (isNaN(q) || q <= 0) return res.status(400).json({ ok: false, error: 'Invalid quantity', code: 'INVALID_QUANTITY' });
      updates.quantityTonnes = q;
    }
    if (expectedPricePerUnit !== undefined) {
      const p = Number(expectedPricePerUnit);
      if (isNaN(p) || p < 0) return res.status(400).json({ ok: false, error: 'Invalid price', code: 'INVALID_PRICE' });
      updates.expectedPricePerUnit = p;
    }
    if (location && typeof location === 'string') updates.location = location.trim();
    if (availability) updates.availability = availability;
    if (composition !== undefined) updates.composition = composition;
    if (contamination) updates.contamination = contamination;
    if (additionalNotes !== undefined) updates.additionalNotes = additionalNotes;
    if (status && ['active', 'matched', 'archived'].includes(status)) updates.status = status;

    const updated = await db.updateListing(id, updates);

    return res.json({
      ok: true,
      message: 'Listing updated successfully',
      data: updated
    });
  } catch (err: any) {
    console.error('[PUT /api/listings/:id] error:', err);
    return res.status(500).json({ ok: false, error: 'Failed to update listing', code: 'SERVER_ERROR' });
  }
});

/**
 * DELETE /api/listings/:id
 * Delete a listing (authenticated, owner only)
 */
listingRouter.delete('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const { id } = req.params;
    const existing = await db.getListingById(id);

    if (!existing) {
      return res.status(404).json({ ok: false, error: 'Listing not found', code: 'NOT_FOUND' });
    }

    // Ownership check: Only owner or admin can delete
    if (existing.userId !== user.id && user.role !== 'admin') {
      return res.status(403).json({
        ok: false,
        error: 'Forbidden. You do not have permission to delete this listing.',
        code: 'FORBIDDEN_OWNERSHIP'
      });
    }

    await db.deleteListing(id);

    return res.json({
      ok: true,
      message: 'Listing deleted successfully',
      id
    });
  } catch (err: any) {
    console.error('[DELETE /api/listings/:id] error:', err);
    return res.status(500).json({ ok: false, error: 'Failed to delete listing', code: 'SERVER_ERROR' });
  }
});
