/**
 * An interface describing a pluggable storage implementation that
 * can be provided to {@link SudoAdTrackerBlockerClient} as a way
 * to persistently store cache data and user preferences.
 */
export interface StorageProvider {
  /**
   * Gets an item from storage.
   */
  getItem(key: string): Promise<string | undefined>

  /**
   * Sets an item in storage.
   */
  setItem(key: string, value: string): Promise<void>

  /**
   * Removes an item from storage.
   */
  clearItem(key: string): Promise<void>

  /**
   * Returns keys of all items currently in storage.
   */
  keys(): Promise<string[]>

  /**
   * Clears all stored items.
   */
  clear(): Promise<void>
}
