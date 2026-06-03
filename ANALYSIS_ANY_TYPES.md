# Wave 3: TypeScript ny Type Analysis Report

## Executive Summary

This report provides a comprehensive analysis of all ny type occurrences across the codebase, categorized by risk level and type of usage.

**Total files with ny usage:** 65 files
**Total ny occurrences:** 624+ instances

---

## Part 1: Count by File (Top 30)

| File | Count | Category |
|------|-------|----------|
| src/app/products/actions.ts | 49 | Server Actions / Database |
| src/app/api/mass-import/execute/route.ts | 43 | API Route / Data Processing |
| src/lib/engine/codeParser.ts | 36 | Database Queries / Type Casting |
| src/app/families/MassEditClient.tsx | 30 | React Component / Server Actions |
| src/components/rules/NamingRulesManager.tsx | 29 | React Component |
| src/lib/massImport/template.ts | 27 | Data Processing / Type Casting |
| src/app/rules/actions.ts | 23 | Server Actions / Database |
| src/generated/prisma/internal/prismaNamespace.ts | 22 | GENERATED CODE (exclude) |
| src/app/families/actions.ts | 22 | Server Actions / Database |
| src/components/products/PostSaveExportModal.tsx | 21 | React Component / Export Logic |
| src/components/templates/TemplateCanvas.tsx | 20 | React Component / DOM Manipulation |
| src/app/datasets/actions.ts | 20 | Server Actions / Database |
| src/components/generate/BulkExportPanel.tsx | 19 | React Component |
| src/lib/engine/validationActions.ts | 19 | Database / Engine Logic |
| src/app/products/version-editor/MassEditClient.tsx | 18 | React Component |
| src/app/assets/smart-association-actions.ts | 18 | Server Actions |
| src/app/assets/actions.ts | 18 | Server Actions / Database |
| src/app/products/version-editor/actions.ts | 17 | Server Actions / Database |
| src/app/products/sku-editor/MassEditClient.tsx | 16 | React Component |
| src/lib/massImport/io.ts | 16 | File I/O / Data Processing |
| src/lib/engine/effectiveProduct.ts | 14 | Engine Logic / Type Casting |
| src/app/products/mass-import/IsometricsImportClient.tsx | 13 | React Component |
| src/app/api/mass-import/preview/route.ts | 13 | API Route |
| src/app/templates/actions.ts | 12 | Server Actions / Database |
| src/app/products/sku-editor/actions.ts | 12 | Server Actions / Database |
| src/components/datasets/DatasetConfigurator.tsx | 12 | React Component |
| src/app/generate/page.tsx | 9 | Next.js Page / Database |
| src/app/products/reference-editor/actions.ts | 8 | Server Actions / Database |
| src/app/configuration/clients/ClientsClient.tsx | 6 | React Component / Client Actions |
| src/lib/engine/namingProcessor.ts | 6 | Engine Logic / Database |

---

## Part 2: Categories and Risk Assessment

### Category 1: Database/Prisma Query Results (HIGH RISK)

**Count:** ~120 instances
**Reason:** Breaking risk - database schema changes will cause runtime errors
**Examples:**
- \const rows: any[] = await dbQuery(...)\
- \const result = await supabaseServer.rpc(...) as any\
- \(verRows as any[])\

**Files:**
- src/lib/engine/codeParser.ts (15 instances)
- src/app/products/actions.ts (12 instances)
- src/lib/engine/validationActions.ts (10 instances)
- src/app/rules/actions.ts (8 instances)
- src/app/families/actions.ts (8 instances)
- src/app/api/mass-import/execute/route.ts (8 instances)
- src/app/datasets/actions.ts (7 instances)
- src/app/templates/actions.ts (6 instances)
- src/app/products/sku-editor/actions.ts (5 instances)

**Pattern:**
\\\	ypescript
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rows: any[] = await dbQuery(...) as any[];
\\\

**Action:** MEDIUM-HIGH priority. Need to:
1. Create database query return types in \src/types/queries.ts\
2. Replace with explicit types matching Supabase schema
3. Risk: SQL schema changes break types

---

### Category 2: Function Parameters (MEDIUM RISK)

**Count:** ~95 instances
**Reason:** Reduces type safety, but localized scope
**Examples:**
- \unction normalize(val: any)\
- \(product: any, namingType: string)\
- \export async function upsertRuleAction(data: any)\

**Files:**
- src/app/products/actions.ts (14 instances)
- src/app/api/mass-import/execute/route.ts (11 instances)
- src/app/families/MassEditClient.tsx (10 instances)
- src/components/rules/NamingRulesManager.tsx (9 instances)
- src/lib/massImport/template.ts (8 instances)
- src/app/rules/actions.ts (8 instances)

**Action:** HIGH priority. Need to:
1. Create interface types for action payloads
2. Replace \data: any\ with specific interfaces
3. Types should match form schemas

---

### Category 3: Catch Clauses (LOW RISK)

**Count:** ~25 instances
**Reason:** Safe to replace - error handling scope is limited
**Examples:**
- \catch (error: any)\
- \catch (err: any)\
- \} catch (e: any) {\

**Files:**
- src/app/rules/actions.ts (3 instances)
- src/components/generate/BulkExportPanel.tsx (3 instances)
- src/app/api/mass-import/execute/route.ts (2 instances)

**Action:** LOW priority (easy fix). Replace with:
\\\	ypescript
catch (error: Error)
catch (error: unknown)
\\\

---

### Category 4: Type Casting (MEDIUM RISK)

**Count:** ~85 instances
**Reason:** Indicates incomplete type inference, breaks safety at runtime
**Examples:**
- \(product as any)\
- \(data as any)\
- \enriched as any\
- \(el.style as any)[prop]\

**Files:**
- src/components/templates/TemplateCanvas.tsx (10 instances - DOM manipulation)
- src/lib/engine/product_composer.ts (8 instances)
- src/components/products/PostSaveExportModal.tsx (8 instances)
- src/lib/massImport/template.ts (7 instances)
- src/app/products/actions.ts (6 instances)

**Action:** HIGH priority. Specific to context:
- **DOM manipulation:** Replace with proper CSS type definitions
- **Product objects:** Use composed product interface
- **Data transforms:** Use specific interfaces

---

### Category 5: Array Element Types (LOW-MEDIUM RISK)

**Count:** ~40 instances
**Reason:** Reduces array element type safety, limited scope
**Examples:**
- \pendingRules: any[]\
- \ules: any[]\
- \const enConfig?: any[]\

**Files:**
- src/app/rules/actions.ts (6 instances)
- src/components/rules/NamingRulesManager.tsx (5 instances)
- src/app/families/MassEditClient.tsx (4 instances)
- src/lib/massImport/template.ts (4 instances)

**Action:** HIGH priority. Create types:
- \Rule[]\ instead of \ny[]\
- \NamingConfig[]\ instead of \ny[]\
- \EnglishConfig[]\ instead of \ny[]\

---

### Category 6: React Component Props (MEDIUM RISK)

**Count:** ~35 instances
**Reason:** Component interface contracts become unsafe
**Examples:**
- \product: any\
- \	emplate: any\
- \originalProduct: any\

**Files:**
- src/components/products/PostSaveExportModal.tsx (5 instances)
- src/components/generate/BulkExportPanel.tsx (4 instances)
- src/components/templates/TemplateCanvas.tsx (3 instances)
- src/app/families/MassEditClient.tsx (3 instances)

**Action:** HIGH priority. Create component prop interfaces:
\\\	ypescript
interface PostSaveExportModalProps {
  product: ComposedProduct;
  template: Template;
  isOpen: boolean;
  onComplete: (products: ComposedProduct[]) => void;
}
\\\

---

### Category 7: Return Types (MEDIUM RISK)

**Count:** ~30 instances
**Reason:** Caller cannot rely on type inference
**Examples:**
- \eturn {...} as any\
- \eturn rows as any[] || []\

**Files:**
- src/lib/engine/namingProcessor.ts (4 instances)
- src/lib/supabase.ts (3 instances)
- src/app/api/mass-import/execute/route.ts (2 instances)

**Action:** HIGH priority for public APIs, MEDIUM for internal.

---

### Category 8: Variable Declarations (LOW RISK)

**Count:** ~35 instances
**Reason:** Indirect type casting, but scope-limited
**Examples:**
- \let cols: any[] = []\
- \let foundData: any = null\

**Files:**
- src/components/templates/TemplateCanvas.tsx (6 instances)
- src/lib/engine/codeParser.ts (4 instances)
- src/app/products/mass-import/IsometricsImportClient.tsx (3 instances)

**Action:** MEDIUM priority. Declare proper types on initialization.

---

### Category 9: Object Property Types (MEDIUM-HIGH RISK)

**Count:** ~25 instances
**Reason:** Dynamic object access, can hide errors
**Examples:**
- \Record<string, any>\
- \existingRefAttrs: Record<string, any> = {}\
- \ersion_attrs: Record<string, any> = {}\

**Files:**
- src/app/products/actions.ts (8 instances)
- src/app/api/mass-import/execute/route.ts (6 instances)
- src/lib/engine/effectiveProduct.ts (3 instances)

**Action:** HIGH priority. Use discriminated unions or specific schemas.

---

### Category 10: Unclassified/Mixed Context (VARIES)

**Count:** ~80 instances
**Reason:** Pattern-based fixes needed per context
**Examples:**
- Comments with "any" (excluded from logic)
- Type casting in complex expressions

---

## Part 3: Risk Matrix

\\\
RISK LEVEL    | COUNT | PRIORITY | ACTION
--------------+-------+----------+-------
LOW           |  65   | ★★☆☆☆   | Easy wins: catch clauses, basic variables
MEDIUM        | 180   | ★★★★☆   | Moderate effort: function params, props
MEDIUM-HIGH   |  95   | ★★★★☆   | More complex: type casting, object types
HIGH          | 184   | ★★★★★   | Critical: database queries, return types
--------------+-------+----------+-------
TOTAL         | 524   | N/A      | Estimated: 40-60 person-hours
\\\

---

## Part 4: Priority Implementation Order (Wave 3)

### Phase 1: Foundation (Week 1)
**Time: 8-12 hours**

1. **Create base type definitions**
   - \src/types/database.ts\ - Database row types
   - \src/types/domain.ts\ - Product, Family, Rule types
   - \src/types/actions.ts\ - Server action payload types

2. **Fix catch clauses** (25 instances, ~1 hour)
   - Global find-replace: \catch (error: any)\ → \catch (error: Error)\
   - Verify no type narrowing breaks

3. **Replace simple variable declarations** (35 instances, ~2 hours)
   - Initialize with proper types instead of \ny\

### Phase 2: Core Abstractions (Week 2)
**Time: 16-20 hours**

1. **Database query types** (120 instances, ~6 hours)
   - Create return types for each query pattern
   - Use discriminated unions for RPC responses

2. **Function parameter types** (95 instances, ~8 hours)
   - Action payload interfaces
   - Naming rule types
   - Import template structure types

3. **React component props** (35 instances, ~4 hours)
   - Modal component interfaces
   - Panel component interfaces
   - Utility component interfaces

### Phase 3: Type Casting Refactor (Week 3)
**Time: 12-16 hours**

1. **DOM manipulation** (10 instances in TemplateCanvas, ~3 hours)
   - Use proper CSS property types
   - Create CSS type helper

2. **Product object casting** (20 instances, ~4 hours)
   - Use ComposedProduct type consistently
   - Remove gratuitous casting

3. **Data transformation casting** (55 instances, ~8 hours)
   - Extract types from data structures
   - Use generic utilities for transforms

### Phase 4: Array and Object Types (Week 4)
**Time: 10-14 hours**

1. **Array element types** (40 instances, ~4 hours)
   - Rule[], Config[], etc.

2. **Object property types** (25 instances, ~3 hours)
   - Replace Record<string, any> with discriminated unions

3. **Testing & validation** (~5 hours)
   - Run full type check: \
pm run build\
   - Integration tests

---

## Part 5: Quick Reference by File

### Highest Priority Files (>20 instances)

1. **src/app/products/actions.ts** (49 instances)
   - Categories: Database, Function params, Type casting, Objects
   - Effort: HIGH (8 hours)
   - Creates database payload types

2. **src/app/api/mass-import/execute/route.ts** (43 instances)
   - Categories: Database, Function params, Objects
   - Effort: HIGH (6 hours)
   - Creates import pipeline types

3. **src/lib/engine/codeParser.ts** (36 instances)
   - Categories: Database, Type casting
   - Effort: MEDIUM (5 hours)
   - Most are database query casts

4. **src/app/families/MassEditClient.tsx** (30 instances)
   - Categories: React props, Function params
   - Effort: MEDIUM (4 hours)
   - Needs component interface

5. **src/components/rules/NamingRulesManager.tsx** (29 instances)
   - Categories: Array types, React props
   - Effort: MEDIUM (4 hours)
   - Needs Rule and Config types

---

## Part 6: Excluded Files

**Generated Prisma Types** (auto-generated, don't fix)
- \src/generated/prisma/internal/*.ts\
- \src/generated/prisma/models/*.ts\

**Reason:** Auto-generated by Prisma CLI; changes will be overwritten

---

## Next Steps

1. **Now:** Review this report and identify team capacity
2. **Tomorrow:** Create \src/types/\ structure (foundation phase)
3. **Week 1:** Implement Phase 1 (catch clauses, vars)
4. **Week 2:** Complete database and param types
5. **Week 3:** Handle type casting
6. **Week 4:** Final object/array types and validation

---

*Report generated: 06/02/2026 15:53:55*
*Codebase: Next.js 16 + React 19 + TypeScript*
*Build tool: Next.js (npm run build)*
