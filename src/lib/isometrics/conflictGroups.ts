export type ConflictTargetKey = string

export function assignConflictGroupCodes(args: {
  planTargets: Array<{ targetKeys: ConflictTargetKey[] }>
}): {
  conflictingTargetKeys: Set<ConflictTargetKey>
  planIndexToGroupCode: Map<number, string>
} {
  const { planTargets } = args

  const targetToPlans = new Map<ConflictTargetKey, number[]>()
  for (let i = 0; i < planTargets.length; i++) {
    for (const key of planTargets[i].targetKeys) {
      const arr = targetToPlans.get(key) || []
      arr.push(i)
      targetToPlans.set(key, arr)
    }
  }

  const conflictingTargetKeys = new Set<ConflictTargetKey>()
  for (const [targetKey, idxs] of targetToPlans.entries()) {
    const unique = Array.from(new Set(idxs))
    if (unique.length > 1) conflictingTargetKeys.add(targetKey)
  }

  class UnionFind {
    parent = new Map<number, number>()
    find(x: number): number {
      const p = this.parent.get(x)
      if (p === undefined) {
        this.parent.set(x, x)
        return x
      }
      if (p === x) return x
      const r = this.find(p)
      this.parent.set(x, r)
      return r
    }
    union(a: number, b: number) {
      const ra = this.find(a)
      const rb = this.find(b)
      if (ra !== rb) this.parent.set(rb, ra)
    }
  }

  const uf = new UnionFind()
  for (const key of conflictingTargetKeys) {
    const idxs = Array.from(new Set(targetToPlans.get(key) || []))
    if (idxs.length <= 1) continue
    const head = idxs[0]
    for (let j = 1; j < idxs.length; j++) uf.union(head, idxs[j])
  }

  const rootToCode = new Map<number, string>()
  const planIndexToGroupCode = new Map<number, string>()
  let counter = 0
  for (let i = 0; i < planTargets.length; i++) {
    const hasConflict = planTargets[i].targetKeys.some(k => conflictingTargetKeys.has(k))
    if (!hasConflict) continue
    const root = uf.find(i)
    let code = rootToCode.get(root)
    if (!code) {
      counter++
      code = `A${counter}`
      rootToCode.set(root, code)
    }
    planIndexToGroupCode.set(i, code)
  }

  return { conflictingTargetKeys, planIndexToGroupCode }
}

