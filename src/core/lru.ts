export class LruCache<K, V> {
  private readonly values = new Map<K, V>()

  constructor(private readonly limit = 50) {}

  get(key: K): V | undefined {
    if (!this.values.has(key)) return undefined
    const value = this.values.get(key) as V
    this.values.delete(key)
    this.values.set(key, value)
    return value
  }

  set(key: K, value: V): void {
    if (this.values.has(key)) this.values.delete(key)
    this.values.set(key, value)
    while (this.values.size > this.limit) {
      const oldest = this.values.keys().next().value as K | undefined
      if (oldest === undefined) break
      this.values.delete(oldest)
    }
  }

  clear(): void {
    this.values.clear()
  }
}
