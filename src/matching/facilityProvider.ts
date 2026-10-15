import verifiedFacilitiesData from '../../data/facilities_directory.json';
import sampleFacilitiesData from '../../data/facilities_sample.json';
import type { Facility } from './types';

export interface EnrichedFacility extends Facility {
  is_verified_real?: boolean;
  regulatory_registration?: string;
  operating_status?: string;
  source_dataset: 'VERIFIED_REAL_DIRECTORY' | 'SAMPLE_DEMO_FIXTURE' | 'EXTERNAL_LIVE_API';
  verification_badge: string;
}

export interface FacilityProviderStatus {
  isLiveApiConfigured: boolean;
  activeProvider: string;
  verifiedFacilitiesCount: number;
  sampleFacilitiesCount: number;
  requiredCredentials: string[];
}

export class FacilityProvider {
  private static instance: FacilityProvider;

  private verifiedFacilities: EnrichedFacility[];
  private sampleFacilities: EnrichedFacility[];

  private constructor() {
    this.verifiedFacilities = (verifiedFacilitiesData.facilities as any[]).map(f => ({
      ...f,
      is_verified_real: true,
      source_dataset: 'VERIFIED_REAL_DIRECTORY' as const,
      verification_badge: 'VERIFIED INDUSTRIAL RECYCLER'
    }));

    this.sampleFacilities = (sampleFacilitiesData.facilities as any[]).map(f => ({
      ...f,
      is_verified_real: false,
      regulatory_registration: 'DEMO-FIXTURE-NOT-REAL',
      operating_status: 'Prototype Fixture',
      source_dataset: 'SAMPLE_DEMO_FIXTURE' as const,
      verification_badge: 'DEMO PROTOTYPE (Sample Data Only)'
    }));
  }

  public static getInstance(): FacilityProvider {
    if (!FacilityProvider.instance) {
      FacilityProvider.instance = new FacilityProvider();
    }
    return FacilityProvider.instance;
  }

  public isLiveApiConfigured(): boolean {
    return Boolean(process.env.FACILITY_DATA_API_URL?.trim());
  }

  public getProviderStatus(): FacilityProviderStatus {
    const isLive = this.isLiveApiConfigured();
    return {
      isLiveApiConfigured: isLive,
      activeProvider: isLive ? 'External Real-time Industrial Registry API' : 'State Pollution Control Board & Public Industrial Registry Directory',
      verifiedFacilitiesCount: this.verifiedFacilities.length,
      sampleFacilitiesCount: this.sampleFacilities.length,
      requiredCredentials: ['FACILITY_DATA_API_URL', 'FACILITY_DATA_API_KEY']
    };
  }

  /**
   * Return facilities for matching.
   * By default, returns REAL VERIFIED facilities.
   * If includeSample is true, includes sample fixtures but with clear unverified labeling.
   */
  public async getFacilities(options?: { includeSample?: boolean; verifiedOnly?: boolean }): Promise<EnrichedFacility[]> {
    // 1. If external live facility API is configured, query it first
    const apiUrl = process.env.FACILITY_DATA_API_URL?.trim();
    const apiKey = process.env.FACILITY_DATA_API_KEY?.trim();

    if (apiUrl) {
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

        const res = await fetch(apiUrl, { headers });
        if (res.ok) {
          const json = await res.json();
          if (Array.isArray(json.facilities)) {
            return json.facilities.map((f: any) => ({
              ...f,
              is_verified_real: true,
              source_dataset: 'EXTERNAL_LIVE_API',
              verification_badge: 'LIVE VERIFIED FACILITY'
            }));
          }
        }
      } catch (err) {
        console.warn('[FacilityProvider] External API query failed, falling back to verified local directory:', err);
      }
    }

    // 2. Default: Return verified real facilities from official directory
    if (options?.verifiedOnly !== false && !options?.includeSample) {
      return [...this.verifiedFacilities];
    }

    // Combined catalog (with sample fixtures clearly labeled)
    return [...this.verifiedFacilities, ...this.sampleFacilities];
  }

  public getFacilityById(id: string): EnrichedFacility | undefined {
    return this.verifiedFacilities.find(f => f.facility_id === id) ||
           this.sampleFacilities.find(f => f.facility_id === id);
  }
}

export const facilityProvider = FacilityProvider.getInstance();
