/**
 * 失败冷却（简化版熔断）：某个翻译方案 / 单词源请求失败后，
 * 在冷却期内跳过它、不再向它发请求，避免对已知故障的上游持续打点。
 *
 * 例外（由 withoutCoolingDown 承担）：候选不足 2 个、或过滤后为空（全部在冷却）时
 * 不做跳过，回退到原候选列表按原逻辑依次尝试，避免因冷却导致「无候选可用」。
 */

/** 失败后的冷却时长：10 分钟。 */
const FAILURE_COOLDOWN_MS = 10 * 60 * 1000

export function createCooldownTracker() {
  const until = new Map<string, number>()
  return {
    /** 记录一次失败，该项进入冷却。 */
    fail(id: string): void {
      until.set(id, Date.now() + FAILURE_COOLDOWN_MS)
    },
    /** 成功后清除该项的冷却记录。 */
    succeed(id: string): void {
      until.delete(id)
    },
    /** 该项当前是否处于冷却期。 */
    isCooling(id: string): boolean {
      const deadline = until.get(id)
      return deadline !== undefined && deadline > Date.now()
    },
    /** 清空全部冷却记录（重置 / 测试用）。 */
    reset(): void {
      until.clear()
    },
  }
}

/**
 * 冷却过滤（跳过与回退的统一入口）：
 * - 候选不足 2 个（只有一个方案 / 一个源）：不跳过，原样返回（保证单个候选不会被冷却掉）。
 * - 过滤掉冷却中的候选项后仍有剩余：返回剩余项（跳过冷却项）。
 * - 过滤后为空（全部在冷却）：回退到原候选列表，按原逻辑正常调用。
 */
export function withoutCoolingDown<T>(
  candidates: readonly T[],
  idOf: (item: T) => string,
  tracker: ReturnType<typeof createCooldownTracker>,
): T[] {
  if (candidates.length < 2) return [...candidates]
  const fresh = candidates.filter((item) => !tracker.isCooling(idOf(item)))
  return fresh.length ? fresh : [...candidates]
}
