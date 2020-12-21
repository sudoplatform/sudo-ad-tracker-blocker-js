/**
 * Pluggable storage
 */
export interface StorageProvider {
  /**
   * Gets an item from storage.
   */
  getItem(key: string): Promise<string | undefined>

  /**
   * Sets and item into storage.
   */
  setItem(key: string, value: string): Promise<void>

  /**
   * Removes a particular item from storage.
   */
  clearItem(key: string): Promise<void>

  /**
   * Returns keys of all items in storage.
   */
  keys(): Promise<string[]>

  /**
   * Clears all stored items.
   */
  clear(): Promise<void>
}
