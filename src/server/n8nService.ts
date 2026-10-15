import crypto from 'crypto';
import express, { Request, Response } from 'express';
import { db } from '../db/database';
import type { ListingRecord } from '../types';

export interface AutomationEventPayload {
  eventId: string;
  eventType: 'listing.created' | 'listing.updated';
  timestamp: string;
  source: 'wastematch-ai';
  listing: {
    id: string;
    materialName: string;
    materialCategory: string;
    quantityTonnes: number;
    unit: string;
    location: string;
    expectedPricePerUnit: number;
    contamination: string;
    composition?: string;
  };
}

export async function triggerN8nAutomation(listing: ListingRecord): Promise<{
  eventId: string;
  status: 'success' | 'failed' | 'skipped';
  message: string;
}> {
  const eventId = `evt_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const webhookUrl = process.env.N8N_WEBHOOK_URL?.trim();
  const webhookSecret = process.env.N8N_WEBHOOK_SECRET?.trim();

  const eventPayload: AutomationEventPayload = {
    eventId,
    eventType: 'listing.created',
    timestamp: new Date().toISOString(),
    source: 'wastematch-ai',
    listing: {
      id: listing.id,
      materialName: listing.materialName,
      materialCategory: listing.materialCategory,
      quantityTonnes: listing.quantityTonnes,
      unit: listing.unit,
      location: listing.location,
      expectedPricePerUnit: listing.expectedPricePerUnit,
      contamination: listing.contamination,
      composition: listing.composition
    }
  };

  // If n8n is not configured, record as skipped and return smoothly
  if (!webhookUrl) {
    await db.logAutomationEvent({
      listingId: listing.id,
      eventType: 'listing.created',
      status: 'skipped',
      attempts: 0,
      lastError: 'N8N_WEBHOOK_URL not configured',
      payload: eventPayload
    });

    await db.updateListing(listing.id, {
      automationStatus: 'skipped',
      automationEventId: eventId
    });

    return {
      eventId,
      status: 'skipped',
      message: 'n8n webhook URL not configured in environment (skipped)'
    };
  }

  // Log initial pending event
  await db.logAutomationEvent({
    listingId: listing.id,
    eventType: 'listing.created',
    status: 'pending',
    attempts: 1,
    webhookUrl,
    payload: eventPayload
  });

  await db.updateListing(listing.id, {
    automationStatus: 'pending',
    automationEventId: eventId
  });

  // Attempt dispatch with timeout and bounded single retry
  const maxAttempts = 2;
  let currentAttempt = 1;
  let lastErrorMsg = '';

  while (currentAttempt <= maxAttempts) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'WasteMatch-AI-Automation/1.0',
        'X-Event-ID': eventId
      };

      if (webhookSecret) {
        headers['Authorization'] = `Bearer ${webhookSecret}`;
        headers['X-Webhook-Secret'] = webhookSecret;
      }

      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(eventPayload),
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (res.ok) {
        let responseJson: any = null;
        try {
          responseJson = await res.json();
        } catch {
          responseJson = { statusText: res.statusText };
        }

        await db.updateListing(listing.id, {
          automationStatus: 'success',
          automationEventId: eventId
        });

        await db.logAutomationEvent({
          listingId: listing.id,
          eventType: 'listing.created',
          status: 'success',
          attempts: currentAttempt,
          webhookUrl,
          payload: eventPayload,
          response: responseJson
        });

        return {
          eventId,
          status: 'success',
          message: 'n8n webhook successfully dispatched'
        };
      } else {
        lastErrorMsg = `n8n responded with HTTP status ${res.status} ${res.statusText}`;
      }
    } catch (err: any) {
      clearTimeout(timeout);
      lastErrorMsg = err?.name === 'AbortError' ? 'n8n webhook dispatch timed out (4000ms)' : (err?.message || 'Network error');
    }

    currentAttempt++;
    if (currentAttempt <= maxAttempts) {
      await new Promise(r => setTimeout(r, 500)); // short backoff
    }
  }

  // If reached here, n8n failed. But listing remains safely persisted!
  await db.updateListing(listing.id, {
    automationStatus: 'failed',
    automationEventId: eventId
  });

  await db.logAutomationEvent({
    listingId: listing.id,
    eventType: 'listing.created',
    status: 'failed',
    attempts: maxAttempts,
    lastError: lastErrorMsg,
    webhookUrl,
    payload: eventPayload
  });

  return {
    eventId,
    status: 'failed',
    message: `n8n webhook failed: ${lastErrorMsg}`
  };
}

export const n8nRouter = express.Router();

/**
 * POST /api/automation/callback
 * Allows n8n workflow to send back enriched matching results or verification status.
 */
n8nRouter.post('/callback', async (req: Request, res: Response) => {
  const webhookSecret = process.env.N8N_WEBHOOK_SECRET?.trim();
  const authHeader = req.headers.authorization || req.headers['x-webhook-secret'];

  if (webhookSecret) {
    const provided = typeof authHeader === 'string' ? authHeader.replace('Bearer ', '').trim() : '';
    if (provided !== webhookSecret) {
      return res.status(401).json({ ok: false, error: 'Unauthorized callback. Invalid secret token.', code: 'UNAUTHORIZED_CALLBACK' });
    }
  }

  const { eventId, listingId, status, matches, notes } = req.body || {};

  if (!listingId) {
    return res.status(400).json({ ok: false, error: 'Missing listingId in callback payload', code: 'INVALID_PAYLOAD' });
  }

  const listing = await db.getListingById(listingId);
  if (!listing) {
    return res.status(404).json({ ok: false, error: 'Listing not found', code: 'NOT_FOUND' });
  }

  await db.updateListing(listingId, {
    automationStatus: status === 'success' ? 'success' : 'failed',
    additionalNotes: notes ? `${listing.additionalNotes}\n[n8n Enrichment]: ${notes}` : listing.additionalNotes
  });

  return res.json({
    ok: true,
    message: 'Automation callback processed successfully',
    listingId,
    receivedMatches: Array.isArray(matches) ? matches.length : 0
  });
});

/**
 * GET /api/automation/status/:eventId
 * Retrieve status of a given automation event
 */
n8nRouter.get('/status/:eventId', async (req: Request, res: Response) => {
  const { eventId } = req.params;
  const event = await db.getAutomationEvent(eventId);
  if (!event) {
    return res.status(404).json({ ok: false, error: 'Automation event not found', code: 'NOT_FOUND' });
  }
  return res.json({ ok: true, event });
});
