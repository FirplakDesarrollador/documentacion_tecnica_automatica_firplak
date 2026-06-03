# Wave 3 `any` Types: Quick Reference Card

## By the Numbers
- Total `any` occurrences: 624
- Files affected: 65
- Estimated effort: 40-60 hours
- Build risk: NONE (type-only changes)
- Deployment risk: NONE (improves safety only)

## Top Instances by File
```
49  src/app/products/actions.ts
43  src/app/api/mass-import/execute/route.ts
36  src/lib/engine/codeParser.ts
30  src/app/families/MassEditClient.tsx
29  src/components/rules/NamingRulesManager.tsx
27  src/lib/massImport/template.ts
23  src/app/rules/actions.ts
22  src/app/families/actions.ts
21  src/components/products/PostSaveExportModal.tsx
20  src/components/templates/TemplateCanvas.tsx
```

## Risk Level Matrix
```
LOW risk (easy, low impact):
- Catch clauses (25 instances, 1 hour)
- Simple variable declarations (35 instances, 2 hours)

MEDIUM risk (moderate effort, important):
- Function parameters (95 instances, 8 hours)
- Array element types (40 instances, 4 hours)
- React component props (35 instances, 4 hours)
- Type casting (85 instances, 8 hours)

HIGH risk (critical, must get right):
- Database queries (120 instances, 6 hours)
- RPC response types (25 instances, 4 hours)
- Object property types (25 instances, 3 hours)
```

## Phases at a Glance

### Phase 1: Foundation (8-10h)
- Create src/types/ structure
- Fix catch clauses
- Fix simple variables
- Run npm run build

### Phase 2: Core (16-20h)
- Database query types
- Function parameter interfaces
- RPC response types
- Array element types

### Phase 3: Casting (12-16h)
- Product object typing
- DOM manipulation helpers
- Data transformation patterns

### Phase 4: Components (10-14h)
- React prop interfaces
- Event handler types
- State annotations

### Phase 5: Integration (8-10h)
- Full build validation
- Lint checks
- Manual testing
- Documentation

## One-Line Fixes

### Catch Clauses
```typescript
catch (error: any)           → catch (error: Error)
```

### Simple Variables
```typescript
let cols: any[] = []         → let cols: ColumnSchema[] = []
let data: any = null         → let data: DataType | null = null
```

### Function Parameters
```typescript
function foo(val: any)       → function foo(val: string | null)
async function bar(data: any) → async function bar(data: PayloadType)
```

### Array Types
```typescript
rules: any[]                 → rules: NamingRule[]
items: any[]                 → items: ItemType[]
config?: any[]               → config?: ConfigType[]
```

### Type Casting
```typescript
product as any               → (use proper type annotation)
(result as any).field        → (use typed access)
(el as any).style            → (use CSS type helpers)
```

## Files to Skip (Auto-Generated)
❌ src/generated/prisma/internal/*.ts
❌ src/generated/prisma/models/*.ts

## Key Type Files to Create
✅ src/types/index.ts
✅ src/types/database.ts
✅ src/types/domain.ts
✅ src/types/actions.ts
✅ src/types/components.ts

## Validation Checklist
After each phase:
- [ ] npm run build (0 errors)
- [ ] npm run lint (all pass)
- [ ] npm run dev (type check)

After Phase 5:
- [ ] `any` count < 50
- [ ] Zero @typescript-eslint/no-explicit-any
- [ ] Type coverage > 85%

## Category Reference

### Database Queries (HIGH)
```typescript
// Before
const rows = await dbQuery(...) as any[];

// After
const rows: FamilyRow[] = await dbQuery(...);
```
**Impact:** Catches schema changes, enables refactoring

### Function Params (MEDIUM)
```typescript
// Before
export async function create(data: any) { }

// After
export async function create(data: CreatePayload) { }
```
**Impact:** IDE autocompletion, caller validation

### React Props (MEDIUM)
```typescript
// Before
interface Props { data: any }

// After
interface Props { data: ComposedProduct }
```
**Impact:** Component contracts, compile-time errors

### Type Casting (MEDIUM-HIGH)
```typescript
// Before
const p = product as any;

// After
const p: ComposedProduct = product;
// (or fix the source to return proper type)
```
**Impact:** Reduces silent errors

### Catch Clauses (LOW)
```typescript
// Before
catch (error: any) { }

// After
catch (error: Error) { }
```
**Impact:** Type safety in error paths

## Performance Impact
✅ Build time: Same (no runtime changes)
✅ Runtime performance: Same (type-erasure at compile)
✅ Bundle size: Same (types don't ship to browser)

## Rollback Strategy
Each phase is independently deployable:
- Phase 1 alone = safe
- Phases 1+2 = safe
- etc.

If issues arise:
1. Revert last phase (git reset --soft HEAD~n)
2. Run npm run build to verify
3. Fix specific issue
4. Recommit

## Team Coordination
### For 1 Developer
- Week 1: Phase 1 + 2.1
- Week 2: Phase 2.2 + 2.3
- Week 3: Phase 3 + 4.1
- Week 4: Phase 4.2 + 5

### For 2 Developers
**Dev A (Backend):**
- Phase 1 (all)
- Phase 2.1 (database)
- Phase 3.1 (product)
- Phase 5 (validation)

**Dev B (Frontend):**
- Phase 2.2 (params)
- Phase 2.3 (RPC)
- Phase 3.2 (DOM)
- Phase 4 (components)

### For 3+ Developers
Parallelize all phases (with daily sync).

## Common Patterns to Watch For

### Pattern 1: Database Row Casting
```typescript
rows.map((r: any) => r.id)  
→ rows.map((r: RowType) => r.id)
```

### Pattern 2: Dynamic Object Access
```typescript
(obj as any)[field]         
→ Use discriminated union or switch statement
```

### Pattern 3: JSON Parse Results
```typescript
JSON.parse(str) as any      
→ Use runtime validation (zod/valibot) with type
```

### Pattern 4: Promise.all Results
```typescript
const [a, b]: any = await Promise.all([...])
→ const [a, b]: [TypeA, TypeB] = await Promise.all([...])
```

### Pattern 5: Map/Filter Callbacks
```typescript
.map((item: any) => ...)    
→ .map((item: ItemType) => ...)
```

## Common Mistakes to Avoid
❌ Don't add `any` types to Prisma generated files
❌ Don't skip validation after each phase
❌ Don't try to fix all 624 instances at once
❌ Don't deploy without `npm run build` passing
❌ Don't import types circularly (src/types should be leaf)
❌ Don't make runtime changes (only types!)

## Success Indicators
✅ Build completes without type errors
✅ VSCode shows no red squiggles in src/
✅ Lint check passes (0 violations)
✅ Existing functionality unchanged
✅ Fewer async bugs from schema mismatches
✅ IDE autocompletion works in all files
✅ Team velocity on new features increases

---

*Keep this card handy during Wave 3 implementation*
*Reference: ANALYSIS_ANY_TYPES.md for details*
*Checklist: WAVE3_PRIORITY_CHECKLIST.md for steps*
