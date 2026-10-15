/**
 * Express Routes — AI Engine
 * --------------------------
 * Owner: Person 3 (AI)  — hand this to Person 2 (Backend)
 *
 * Person 2 just mounts this router on their Express app:
 *
 *   import express from 'express';
 *   import { aiRouter } from './src/server/aiRoutes';
 *
 *   const app = express();
 *   app.use(express.json({ limit: '15mb' })); // images arrive as base64
 *   app.use('/api', aiRouter);
 *   app.listen(4000);
 *
 * That gives them:
 *   POST /api/analyze-waste     → main AI classification endpoint
 *   GET  /api/ai/health         → simple health probe for the demo
 */

import express, { Request, Response, Router } from 'express';
import { analyzeWaste } from '../ai/analyzeWaste';
import { getApiKey } from '../ai/geminiClient';
import { findTopMatches, getFacilityById, resolveCoordinates, geocodeLocation } from '../matching/matchingEngine';
import { calculateImpact } from '../matching/impactCalculator';
import { facilityProvider } from '../matching/facilityProvider';
import facilitiesData from '../../data/facilities_sample.json';

export const aiRouter: Router = express.Router();

import { aiRateLimiter } from './rateLimiter';

/**
 * POST /analyze-waste
 * Body: {
 *   image: "data:image/jpeg;base64,....",   // required
 *   userProvided: {                          // optional context
 *     wasteName?, quantity?, unit?, location?,
 *     materialComposition?, chemicals?, contaminationLevel?
 *   }
 * }
 */
aiRouter.post('/analyze-waste', aiRateLimiter, async (req: Request, res: Response) => {
  try {
    const { image, userProvided } = req.body || {};

    if (!image || typeof image !== 'string' || image.trim().length === 0) {
      return res.status(400).json({
        ok: false,
        error: 'Missing `image` (base64 data URL or https URL) in request body.',
        code: 'NO_IMAGE',
      });
    }

    const result = await analyzeWaste({ image, userProvided }, { allowMockFallback: false });

    return res.json({
      ok: true,
      success: true,
      message: 'Image analyzed successfully with Gemini Vision',
      data: {
        ...result,
        wasteType: result.material,
        composition: [result.composition],
        confidenceScore: result.confidence / 100
      },
    });
  } catch (err: any) {
    const errMsg = err?.message || '';
    const isUnavailable = errMsg.includes('503') || errMsg.includes('UNAVAILABLE') || err?.code === 503;
    const isRateLimited = errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED');
    const isMissingKey = errMsg.includes('API_KEY_MISSING') || err?.code === 'API_KEY_MISSING';
    const isBadImage = errMsg.includes('BAD_IMAGE') || err?.code === 'BAD_IMAGE';

    console.warn('[POST /analyze-waste] Gemini analysis failed:', errMsg);

    const statusCode = isBadImage ? 400 : isMissingKey ? 503 : isUnavailable ? 503 : isRateLimited ? 429 : 500;
    const userMessage = isBadImage
      ? 'The uploaded image format could not be processed. Please upload a clear JPG or PNG image.'
      : isMissingKey
      ? 'Gemini API key is not configured on the server. Please check GEMINI_API_KEY environment secret.'
      : isUnavailable
      ? 'Google Gemini Vision service is currently experiencing high demand. Please try again shortly or enter waste specifications manually.'
      : isRateLimited
      ? 'Gemini API quota rate limit reached. Please wait a moment before trying again.'
      : `AI Vision analysis failed: ${errMsg}`;

    return res.status(statusCode).json({
      ok: false,
      error: userMessage,
      code: isBadImage ? 'BAD_IMAGE' : isMissingKey ? 'API_KEY_MISSING' : isUnavailable ? 'GEMINI_UNAVAILABLE' : isRateLimited ? 'RATE_LIMIT' : 'AI_ERROR',
      details: errMsg
    });
  }
});

/**
 * POST /match-waste
 * Body: { composition?, wasteType?, quantityTonnes?, location?, includeSample? }
 */
aiRouter.post('/match-waste', async (req: Request, res: Response) => {
  const { composition, wasteType, quantityTonnes, location, contaminationPercentage, budgetOrExpectedPrice, isHazardous, topN = 5, includeSample = false } = req.body || {};
  const queryWaste = wasteType || (Array.isArray(composition) ? composition.join(' ') : 'PET Plastic');
  const qty = Number(quantityTonnes) || 15;
  
  // Real live geocoding via OpenStreetMap Nominatim
  const geoResult = await geocodeLocation(String(location || 'Pune, Maharashtra'));
  const coords = { lat: geoResult.lat, lon: geoResult.lon };

  const matches = findTopMatches({
    wasteType: queryWaste,
    quantityTonnes: qty,
    latitude: coords.lat,
    longitude: coords.lon,
    contaminationPercentage: typeof contaminationPercentage === 'number' ? contaminationPercentage : 5,
    budgetOrExpectedPrice: typeof budgetOrExpectedPrice === 'number' ? budgetOrExpectedPrice : undefined,
    isHazardous: Boolean(isHazardous)
  }, Number(topN) || 5, { includeSample: Boolean(includeSample) });

  const formattedMatches = matches.map((m, idx) => ({
    id: idx + 1,
    facilityId: m.facilityId,
    reuser: m.facilityName,
    facilityName: m.facilityName,
    location: m.location,
    distanceKm: m.distanceKm,
    distanceType: 'straight-line (Haversine formula from verified coordinates)',
    matchScore: m.matchScore,
    method: `${m.capacityPerDay} T/day processing capacity for circular reuse`,
    demandLevel: m.matchScore > 85 ? 'High' : 'Medium',
    breakdown: m.breakdown,
    whyMatched: m.whyMatched,
    processingType: m.processingType,
    estimatedAvoidedCo2Tonnes: m.estimatedAvoidedCo2Tonnes,
    estimatedEconomicBenefitInr: m.estimatedEconomicBenefitInr,
    datasetSource: m.sourceDataset,
    isVerifiedReal: m.isVerifiedReal,
    regulatoryRegistration: m.regulatoryRegistration
  }));

  return res.json({
    ok: true,
    success: true,
    message: matches.length > 0 ? 'Matches found' : 'No compatible facilities found for this waste stream and constraints',
    count: matches.length,
    geocodedLocation: geoResult.displayName,
    data: formattedMatches
  });
});

/**
 * GET /facilities
 * Return verified industrial facilities directory with provider status
 */
aiRouter.get('/facilities', async (req: Request, res: Response) => {
  const includeSample = req.query.includeSample === 'true';
  const facilities = await facilityProvider.getFacilities({ includeSample });
  const status = facilityProvider.getProviderStatus();

  return res.json({
    ok: true,
    providerStatus: status,
    count: facilities.length,
    data: facilities
  });
});

/**
 * GET /facilities/provider-status
 * Inspect active facility provider and configuration requirements
 */
aiRouter.get('/facilities/provider-status', (_req: Request, res: Response) => {
  return res.json({
    ok: true,
    status: facilityProvider.getProviderStatus()
  });
});

/**
 * POST /geocode
 * Live geocode an industrial location or address using OpenStreetMap Nominatim
 */
aiRouter.post('/geocode', async (req: Request, res: Response) => {
  const { query } = req.body || {};
  const result = await geocodeLocation(String(query || ''));
  return res.json({
    ok: true,
    data: result
  });
});

/**
 * POST /calculate-impact
 * Body: { matchId?, wasteVolume?, quantityTonnes?, distanceKm?, facilityId? }
 */
aiRouter.post('/calculate-impact', (req: Request, res: Response) => {
  const { matchId, wasteVolume, quantityTonnes, distanceKm, facilityId } = req.body || {};
  const qty = Number(wasteVolume || quantityTonnes || 10);
  const dist = Number(distanceKm || 25);
  
  const facility = facilityId ? getFacilityById(facilityId) : null;
  const impact = facility 
    ? calculateImpact({ quantityTonnes: qty, distanceKm: dist, facility })
    : {
        wasteDivertedTonnes: qty,
        estimatedCo2AvoidedTonnes: qty * 0.42,
        estimatedEconomicBenefit: qty * 6500,
        energySavedKwh: qty * 85
      };

  return res.json({
    ok: true,
    success: true,
    message: 'Impact calculated',
    data: {
      ...impact,
      co2SavedKg: Math.round(impact.estimatedCo2AvoidedTonnes * 1000),
      waterSavedLiters: Math.round(qty * 120),
      landfillSpaceSavedCubicMeters: Math.round(qty * 0.75 * 10) / 10
    }
  });
});

/** GET /ai/health — quick check for the demo dashboard */
aiRouter.get('/ai/health', (_req: Request, res: Response) => {
  const hasKey = Boolean(getApiKey());
  res.json({
    ok: true,
    aiEngine: 'waste-match-ai',
    model: 'gemini-3.8-flash',
    geminiConfigured: hasKey,
    mode: hasKey ? 'live' : 'mock-fallback',
    timestamp: new Date().toISOString(),
  });
});
