import { MemoryStorageProvider } from './memory-storage-provider'

describe('MemoryProvider', () => {
  it('should set and get an item', async () => {
    const memoryProvider = new MemoryStorageProvider()

    await memoryProvider.setItem('jean-luc', 'is the best')
    const result = await memoryProvider.getItem('jean-luc')

    expect(result).toBe('is the best')
  })

  it('should clear all items', async () => {
    const memoryProvider = new MemoryStorageProvider()

    await memoryProvider.setItem('jean-luc', 'is the best')
    await memoryProvider.setItem('kirk', 'is second best')
    await memoryProvider.clear()
    const result1 = await memoryProvider.getItem('jean-luc')
    const result2 = await memoryProvider.getItem('kirk')

    expect(result1).toBe(undefined)
    expect(result2).toBe(undefined)
  })
})
