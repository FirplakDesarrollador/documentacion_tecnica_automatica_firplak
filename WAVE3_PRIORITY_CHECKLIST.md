# Wave 3: TypeScript `any` Elimination - Priority Checklist

## Quick Stats
- **Total instances to fix:** 624+
- **Files to update:** 65
- **Estimated duration:** 40-60 person-hours
- **Build impact:** No breaking changes expected
- **Deployment risk:** LOW (types only, no runtime changes)

---

## Phase 1: Foundation (Week 1, ~8-10 hours)

### Step 1.1: Create Type Definitions Infrastructure
**Effort:** 2 hours
**Files to create:** 4

- [ ] Create `src/types/index.ts` (main export)
- [ ] Create `src/types/database.ts` (database row types)
- [ ] Create `src/types/domain.ts` (business domain types)
- [ ] Create `src/types/actions.ts` (server action payloads)

### Step 1.2: Fix Catch Clauses
**Effort:** 1 hour
**Files:** 8
**Instances:** 25

Search and Replace:
- Pattern: `catch (error: any)` → `catch (error: Error)`
- Affected: 8 files with 25 instances

### Step 1.3: Fix Simple Variable Declarations
**Effort:** 2 hours
**Files:** 12
**Instances:** 35

Replace simple variable declarations with proper types.

### Step 1.4: Basic Type Validation
**Effort:** 2-3 hours

- [ ] Run `npm run build`
- [ ] Check for new type errors
- [ ] Fix import/export issues

---

## Phase 2: Core Abstractions (Week 2, ~16-20 hours)

### Step 2.1: Database Query Types
**Effort:** 6 hours
**Files:** 20
**Instances:** 120
**Risk:** HIGH - Most critical

Create database row types and update all dbQuery calls.

**Files to update:**
- src/lib/engine/codeParser.ts (8 queries)
- src/app/products/actions.ts (6 queries)
- src/app/rules/actions.ts (5 queries)
- src/app/families/actions.ts (4 queries)
- src/app/datasets/actions.ts (4 queries)
- src/app/templates/actions.ts (3 queries)
- src/lib/engine/validationActions.ts (4 queries)
- src/lib/engine/namingProcessor.ts (3 queries)
- And 12 more files...

### Step 2.2: Function Parameter Types (Action Payloads)
**Effort:** 8 hours
**Files:** 18
**Instances:** 95

Create payload interfaces for each action:
- CreateProductPayload
- UpdateProductPayload
- UpsertFamilyPayload
- BulkImportPayload
- etc.

### Step 2.3: RPC/API Return Types
**Effort:** 4 hours
**Files:** 8
**Instances:** 25

Create RPC response types:
- CreateProductV6Response
- BulkImportResponse
- BulkApplyNamesResponse
- BulkCleanupResponse

### Step 2.4: Array Element Types
**Effort:** 4 hours
**Files:** 12
**Instances:** 40

Replace `any[]` with proper types:
- `pendingRules: any[]` → `pendingRules: NamingRule[]`
- `rules: any[]` → `rules: NamingRule[]`
- `enConfig?: any[]` → `enConfig?: EnglishConfig[]`

---

## Phase 3: Type Casting Refactor (Week 3, ~12-16 hours)

### Step 3.1: Product Object Casting
**Effort:** 4 hours
**Files:** 8
**Instances:** 20

Replace gratuitous casts:
- `(product as any)` → use proper type annotations
- `p as any` → typed parameters

### Step 3.2: DOM Manipulation Types
**Effort:** 3 hours
**File:** 1 (TemplateCanvas.tsx)
**Instances:** 10

Create CSS property type helpers for DOM manipulation.

### Step 3.3: Data Transformation Casting
**Effort:** 5-8 hours
**Files:** 12
**Instances:** 55

- JSON parsing with validation
- Map/Filter operations with typed callbacks
- Dynamic property access patterns

---

## Phase 4: React Components (Week 4, ~10-14 hours)

### Step 4.1: Component Props
**Effort:** 4 hours
**Files:** 15
**Instances:** 35

Create component prop interfaces:
- PostSaveExportModalProps
- BulkExportPanelProps
- TemplateCanvasProps
- etc.

### Step 4.2: Event Handlers and Callbacks
**Effort:** 3 hours
**Files:** 10
**Instances:** 25

Replace untyped handlers with proper React event types.

### Step 4.3: State Type Annotations
**Effort:** 3 hours
**Files:** 12
**Instances:** 20

Properly type useState and component state.

---

## Phase 5: Final Integration & Testing (Week 4, ~8-10 hours)

### Step 5.1: Generate Check
**Effort:** 1 hour

- [ ] Run `npm run build` - Zero type errors
- [ ] All imports resolve
- [ ] No circular dependencies

### Step 5.2: Lint Check
**Effort:** 1 hour

- [ ] Run `npm run lint` - All rules pass
- [ ] Remove @typescript-eslint/no-explicit-any exemptions

### Step 5.3: Manual Testing
**Effort:** 4-6 hours

Test critical workflows:
- Product creation
- Mass import execution
- Naming rules evaluation
- Export rendering

### Step 5.4: Documentation
**Effort:** 2 hours

- Update AGENTS.md with type requirements
- Create TYPE_GUIDELINES.md
- Document new type definitions

---

## Timeline Summary

| Phase | Duration | Status |
|-------|----------|--------|
| Foundation | 8-10h | - [ ] |
| Abstractions | 16-20h | - [ ] |
| Casting | 12-16h | - [ ] |
| Components | 10-14h | - [ ] |
| Integration | 8-10h | - [ ] |
| **TOTAL** | **40-60h** | - [ ] |

---

## Success Criteria

### Green Light for Production
- [ ] `npm run build` exits with status 0
- [ ] `npm run lint` passes all checks
- [ ] Zero type errors in `npm run dev`
- [ ] All manual tests pass

### Metric Targets
- [ ] Reduce `any` count from 624 to < 50
- [ ] Remove all @typescript-eslint/no-explicit-any comments
- [ ] Increase type coverage from ~40% to ~85%

---
