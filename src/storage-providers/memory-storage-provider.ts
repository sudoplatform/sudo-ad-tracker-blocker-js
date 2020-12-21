import { StorageProvider } from '../storage-provider'

/**
 * Provides in memory storage and is used as the
 * default StorageProvider.
 */
export class MemoryStorageProvider implements StorageProvider {
  private storage: Record<string, string>

  constructor() {
    this.storage = {}
  }

  async getItem(key: string): Promise<string> {
    return this.storage[key]
  }

  async setItem(key: string, value: string): Promise<void> {
    this.storage[key] = value
  }

  async clearItem(key: string): Promise<void> {
    delete this.storage[key]
  }

  async keys(): Promise<string[]> {
    return Object.keys(this.storage)
  }

  async clear(): Promise<void> {
    this.storage = {}
  }
}
