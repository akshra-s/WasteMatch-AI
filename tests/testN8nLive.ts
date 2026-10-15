import dotenv from 'dotenv';
dotenv.config({ override: true });
import { triggerN8nAutomation } from '../src/server/n8nService';
import type { ListingRecord } from '../src/types';

async function testLiveN8n() {
  const dummyListing: ListingRecord = {
    id: `lst_test_${Date.now()}`,
    userId: 'usr_test',
    userEmail: 'operations@ecocement.in',
    companyName: 'EcoCement Industries',
    materialName: 'Clean Polypropylene Woven Sacks',
    materialCategory: 'Post-Industrial Polymers',
    quantityTonnes: 12,
    unit: 'tonnes',
    expectedPricePerUnit: 15000,
    location: 'Bengaluru, Karnataka',
    availability: 'Available now',
    composition: 'PP 98%, Pigment 2%',
    contamination: 'Low',
    additionalNotes: 'Baled clean sacks ready for circular processing.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'active'
  };

  console.log('Sending live test submission to configured n8n endpoint...');
  const res = await triggerN8nAutomation(dummyListing);
  console.log('n8n response result:', res);
  if (res.status === 'success') {
    console.log('✅ LIVE N8N EXECUTION CONFIRMED (HTTP 200 OK)');
  } else {
    console.log(`❌ n8n dispatch status: ${res.status} (${res.message})`);
  }
}

testLiveN8n().catch(console.error);
