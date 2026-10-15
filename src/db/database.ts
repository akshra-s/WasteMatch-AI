import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { ListingRecord } from '../types';

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  salt: string;
  companyName: string;
  location: string;
  role: 'seller' | 'buyer' | 'admin';
  createdAt: string;
  updatedAt: string;
}

export interface AutomationLogRecord {
  id: string;
  listingId: string;
  eventType: string;
  status: 'pending' | 'success' | 'failed' | 'skipped';
  attempts: number;
  lastError?: string;
  webhookUrl?: string;
  createdAt: string;
  updatedAt: string;
  payload: any;
  response?: any;
}

interface DatabaseSchema {
  version: number;
  users: UserRecord[];
  listings: ListingRecord[];
  automationLogs: AutomationLogRecord[];
}

const DB_DIR = path.join(process.cwd(), 'data', 'db');
const DB_FILE = path.join(DB_DIR, 'wastematch.json');

// Initial default state
const INITIAL_DB: DatabaseSchema = {
  version: 1,
  users: [],
  listings: [],
  automationLogs: []
};

class Database {
  private data: DatabaseSchema = { ...INITIAL_DB };
  private initialized = false;
  private writeLock = Promise.resolve();

  constructor() {
    this.ensureInitialized();
  }

  private ensureInitialized() {
    if (this.initialized) return;

    try {
      if (!fs.existsSync(DB_DIR)) {
        fs.mkdirSync(DB_DIR, { recursive: true });
      }

      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        try {
          const parsed = JSON.parse(raw);
          this.data = {
            version: parsed.version || 1,
            users: Array.isArray(parsed.users) ? parsed.users : [],
            listings: Array.isArray(parsed.listings) ? parsed.listings : [],
            automationLogs: Array.isArray(parsed.automationLogs) ? parsed.automationLogs : []
          };
        } catch (parseErr) {
          console.error('[DB] Failed to parse database file, initializing clean database:', parseErr);
          this.data = { ...INITIAL_DB };
          this.persistSync();
        }
      } else {
        // Seed default initial user for immediate testing & demo
        this.seedInitialData();
        this.persistSync();
      }
      this.initialized = true;
    } catch (err) {
      console.error('[DB] Database initialization error:', err);
      this.initialized = true;
    }
  }

  private seedInitialData() {
    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = crypto.pbkdf2Sync('password123', salt, 10000, 64, 'sha512').toString('hex');

    const defaultUser: UserRecord = {
      id: 'usr_demo_ecocement',
      email: 'operations@ecocement.in',
      passwordHash,
      salt,
      companyName: 'EcoCement Industries',
      location: 'Gurgaon, Haryana',
      role: 'seller',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const initialListing: ListingRecord = {
      id: 'lst_seed_pet_01',
      userId: defaultUser.id,
      userEmail: defaultUser.email,
      companyName: defaultUser.companyName,
      materialName: 'Clean Industrial PET Flakes',
      materialCategory: 'Post-Industrial Polymers',
      quantityTonnes: 15,
      unit: 'tonnes',
      expectedPricePerUnit: 28500,
      location: 'Pune, Maharashtra',
      availability: 'Available now',
      composition: 'PET 98.5%, Trace adhesive 1.5%',
      contamination: 'Low',
      additionalNotes: 'Post-industrial washed bottle flakes, clear, baled and ready for logistics pickup.',
      imageUrl: 'https://images.unsplash.com/photo-1530587191325-3db32d826c18?auto=format&fit=crop&w=800&q=80',
      aiIdentifiedConfidence: 94,
      potentialUses: ['rPET Pellets', 'Polyester Filament Yarn', 'Packaging Straps'],
      createdAt: new Date(Date.now() - 86400000).toISOString(),
      updatedAt: new Date(Date.now() - 86400000).toISOString(),
      status: 'active',
      automationStatus: 'skipped'
    };

    this.data.users.push(defaultUser);
    this.data.listings.push(initialListing);
  }

  private persistSync() {
    try {
      if (!fs.existsSync(DB_DIR)) {
        fs.mkdirSync(DB_DIR, { recursive: true });
      }
      const tmpFile = `${DB_FILE}.tmp.${Date.now()}`;
      fs.writeFileSync(tmpFile, JSON.stringify(this.data, null, 2), 'utf-8');
      fs.renameSync(tmpFile, DB_FILE);
    } catch (err) {
      console.error('[DB] Error persisting database sync:', err);
    }
  }

  private async persist(): Promise<void> {
    this.writeLock = this.writeLock.then(async () => {
      try {
        if (!fs.existsSync(DB_DIR)) {
          await fs.promises.mkdir(DB_DIR, { recursive: true });
        }
        const tmpFile = `${DB_FILE}.tmp.${Date.now()}`;
        await fs.promises.writeFile(tmpFile, JSON.stringify(this.data, null, 2), 'utf-8');
        await fs.promises.rename(tmpFile, DB_FILE);
      } catch (err) {
        console.error('[DB] Error persisting database async:', err);
      }
    });
    return this.writeLock;
  }

  // --- USER METHODS ---
  public async findUserByEmail(email: string): Promise<UserRecord | undefined> {
    this.ensureInitialized();
    const normalized = email.trim().toLowerCase();
    return this.data.users.find(u => u.email.toLowerCase() === normalized);
  }

  public async findUserById(id: string): Promise<UserRecord | undefined> {
    this.ensureInitialized();
    return this.data.users.find(u => u.id === id);
  }

  public async createUser(userData: {
    email: string;
    passwordHash: string;
    salt: string;
    companyName: string;
    location: string;
    role?: 'seller' | 'buyer' | 'admin';
  }): Promise<UserRecord> {
    this.ensureInitialized();
    const newUser: UserRecord = {
      id: `usr_${crypto.randomUUID()}`,
      email: userData.email.trim().toLowerCase(),
      passwordHash: userData.passwordHash,
      salt: userData.salt,
      companyName: userData.companyName.trim(),
      location: userData.location.trim(),
      role: userData.role || 'seller',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.data.users.push(newUser);
    await this.persist();
    return newUser;
  }

  // --- LISTING METHODS ---
  public async getListings(filter?: {
    userId?: string;
    status?: string;
    category?: string;
    search?: string;
  }): Promise<ListingRecord[]> {
    this.ensureInitialized();
    let results = [...this.data.listings];

    if (filter?.userId) {
      results = results.filter(l => l.userId === filter.userId);
    }
    if (filter?.status) {
      results = results.filter(l => l.status === filter.status);
    }
    if (filter?.category) {
      const catLower = filter.category.toLowerCase();
      results = results.filter(l => l.materialCategory.toLowerCase().includes(catLower));
    }
    if (filter?.search) {
      const q = filter.search.toLowerCase();
      results = results.filter(l => 
        l.materialName.toLowerCase().includes(q) ||
        l.materialCategory.toLowerCase().includes(q) ||
        l.location.toLowerCase().includes(q)
      );
    }

    // Sort newest first
    return results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public async getListingById(id: string): Promise<ListingRecord | undefined> {
    this.ensureInitialized();
    return this.data.listings.find(l => l.id === id);
  }

  public async createListing(listingData: Omit<ListingRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<ListingRecord> {
    this.ensureInitialized();
    const now = new Date().toISOString();
    const newListing: ListingRecord = {
      ...listingData,
      id: `lst_${crypto.randomUUID()}`,
      createdAt: now,
      updatedAt: now,
      status: listingData.status || 'active'
    };

    this.data.listings.push(newListing);
    await this.persist();
    return newListing;
  }

  public async updateListing(id: string, updates: Partial<ListingRecord>): Promise<ListingRecord | null> {
    this.ensureInitialized();
    const idx = this.data.listings.findIndex(l => l.id === id);
    if (idx === -1) return null;

    const existing = this.data.listings[idx];
    const updated: ListingRecord = {
      ...existing,
      ...updates,
      id: existing.id, // prevent changing ID
      userId: existing.userId, // prevent transferring ownership
      userEmail: existing.userEmail,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString()
    };

    this.data.listings[idx] = updated;
    await this.persist();
    return updated;
  }

  public async deleteListing(id: string): Promise<boolean> {
    this.ensureInitialized();
    const initialLen = this.data.listings.length;
    this.data.listings = this.data.listings.filter(l => l.id !== id);
    if (this.data.listings.length !== initialLen) {
      await this.persist();
      return true;
    }
    return false;
  }

  // --- AUTOMATION AUDIT LOGS ---
  public async logAutomationEvent(event: Omit<AutomationLogRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<AutomationLogRecord> {
    this.ensureInitialized();
    const now = new Date().toISOString();
    const log: AutomationLogRecord = {
      ...event,
      id: `evt_${crypto.randomUUID()}`,
      createdAt: now,
      updatedAt: now
    };
    this.data.automationLogs.push(log);
    await this.persist();
    return log;
  }

  public async updateAutomationEvent(id: string, updates: Partial<AutomationLogRecord>): Promise<void> {
    this.ensureInitialized();
    const item = this.data.automationLogs.find(l => l.id === id);
    if (item) {
      Object.assign(item, updates, { updatedAt: new Date().toISOString() });
      await this.persist();
    }
  }

  public async getAutomationEvent(id: string): Promise<AutomationLogRecord | undefined> {
    this.ensureInitialized();
    return this.data.automationLogs.find(l => l.id === id);
  }

  // For testing
  public clearAll() {
    this.data = { ...INITIAL_DB };
    this.persistSync();
  }
}

export const db = new Database();
