# Detailed Line-by-Line Analysis: Top 5 Files with 'any' Types

---

## File 1: src/app/products/actions.ts (49 instances)

### Summary
**Type:** Server Actions / Database
**Instances:** 49
**Risk:** MEDIUM-HIGH
**Estimated Effort:** 8 hours

### Breakdown by Category

#### Database Queries (12 instances) - HIGH RISK
\\\
Line 17:   function normalizeCanto(val: any) {
           → FUNCTION PARAM - Replace with string | number | null
           Risk: LOW
           Fix: function normalizeCanto(val: string | number | null): string {

Line 26:   function normalizeCarb2(val: any) {
           → FUNCTION PARAM - Replace with string | number | null
           Risk: LOW
           Fix: function normalizeCarb2(val: string | number | null): string {

Line 41:   async function computeProductNameByNamingType(product: any, namingType: string) {
           → FUNCTION PARAM - High-level business logic
           Risk: MEDIUM
           Fix: product: ComposedProduct
           
Line 56:   export async function translateAction(nameEs: string, ctx?: any, force: boolean = false) {
           → FUNCTION PARAM (optional)
           Risk: MEDIUM-HIGH
           Fix: ctx?: Partial<ComposedProduct>

Line 115:  export async function upsertFamilyAction(data: any) {
           → ACTION PAYLOAD - Critical
           Risk: MEDIUM-HIGH
           Fix: data: UpsertFamilyPayload (interface needed)

Line 176:  function buildCreateProductV6Payload(data: any, parsed: any, isPrivate: boolean, ...)
           → FUNCTION PARAM (data + parsed)
           Risk: MEDIUM-HIGH
           Fix: 
           - data: CreateProductFormData
           - parsed: ParsedCodeResult

Line 280:  export async function createProductAction(data: any) {
           → ACTION PAYLOAD
           Risk: MEDIUM-HIGH
           Fix: data: CreateProductPayload

Line 362:  let existingRefAttrs: Record<string, any> = {};
           → OBJECT TYPE - Database result
           Risk: MEDIUM
           Fix: existingRefAttrs: RefAttributes = {}

Line 372:  existingRefAttrs = typeof raw === 'string' ? JSON.parse(raw) : (raw || {});
           → TYPE NARROWING - JSON parse result
           Risk: MEDIUM-HIGH
           Fix: Need to validate parsed JSON against RefAttributes schema

Line 409:  const { data: result, error } = await (supabaseServer as any).rpc(...)
           → RPC CALL CASTING
           Risk: HIGH
           Fix: supabaseServer.rpc<CreateProductV6Response>(...) 
           Need interface: CreateProductV6Response

Line 433:  export async function updateFamilyAction(code: string, data: any) {
           → ACTION PAYLOAD
           Risk: MEDIUM-HIGH
           Fix: data: UpdateFamilyPayload

Line 470:  const allProducts = rows.map((row: any) => mapRowToComposedProduct(row))
           → MAP CALLBACK TYPE
           Risk: MEDIUM
           Fix: rows.map((row: DatabaseProductRow) => ...)
\\\

#### Type Casting (8 instances) - MEDIUM RISK
\\\
Line 42:   const result = await computeNameWithNamingComponents(product as any, ...)
           → PRODUCT CASTING (needed for overload)
           Risk: MEDIUM
           Context: Product is working copy, not ComposedProduct yet
           Fix: Create overload: computeNameWithNamingComponents(product: ComposedProduct | WorkingProduct, ...)

Line 58:   ... { ...ctx, final_name_es: nameEs } as any, 'final_complete_name', force)
           → OBJECT SPREAD CASTING
           Risk: MEDIUM
           Fix: Type the spread result explicitly or create helper

Line 186:  existingRefAttrs: Record<string, any> = {}
           → OBJECT INITIALIZATION
           Risk: MEDIUM
           Fix: existingRefAttrs: RefAttributes = {}

Line 269:  componentsToTranslatorConfig(components) as any
           → OUTPUT CASTING
           Risk: MEDIUM-HIGH
           Fix: Return type of componentsToTranslatorConfig is any - needs fixing at source

Line 272:  const resultEs = evaluateProductRules(p as any, rulesForEval as any)
           → DOUBLE CASTING
           Risk: MEDIUM-HIGH
           Fix: Product type already known, rulesForEval should be typed

Line 274:  const resultEn = await translateProductToEnglish(p as any, ...)
           → PRODUCT CASTING
           Risk: MEDIUM
           Fix: Type p explicitly or function overload

Line 321:  const glossaryTermsForStale: { termEs: string; category?: string | null }[] = []
           → NOT ANY - but nearby operations use ny

Line 471:  const allProducts = rows.map((row: any) => ...)
           → MAP PARAMETER
           Risk: MEDIUM
           Fix: row: ComposedProductRow
\\\

#### Variable Declarations (4 instances) - LOW-MEDIUM RISK
\\\
Line 193:  const refAttrs: Record<string, any> = { ... }
           → OBJECT PROPERTY TYPES
           Risk: MEDIUM
           Fix: refAttrs: RefAttributes

Line 207:  const versionAttrs: Record<string, any> = {};
           → OBJECT PROPERTY TYPES
           Risk: MEDIUM
           Fix: versionAttrs: VersionAttributes

Line 215:  const payload: any = { ... }
           → PAYLOAD OBJECT
           Risk: MEDIUM-HIGH
           Fix: payload: CreateProductTransactionPayload

Line 362:  let existingRefAttrs: Record<string, any> = {};
           → REPEATED - see above
\\\

---

## File 2: src/app/api/mass-import/execute/route.ts (43 instances)

### Summary
**Type:** API Route / Data Processing
**Instances:** 43
**Risk:** MEDIUM-HIGH
**Estimated Effort:** 6 hours

### Key Patterns

#### Data Structure Casting (11 instances) - MEDIUM RISK
\\\
Line 22:   const byKey = new Map<string, any>();
           → MAP VALUE TYPE
           Risk: MEDIUM
           Fix: new Map<string, boolean | number | string>()

Line 59:   return j as any;
           → JSON PARSE RESULT
           Risk: MEDIUM-HIGH
           Fix: Validate against interface before cast

Line 65:   function normalizeBool(val: any): boolean | null {
           → FUNCTION PARAM
           Risk: LOW
           Fix: val: string | number | boolean | null

Line 73:   function toNumberOrNull(val: any): number | null {
           → FUNCTION PARAM
           Risk: LOW
           Fix: val: string | number | null

Line 103:  function normalizeOptionalText(val: any): string | null {
           → FUNCTION PARAM
           Risk: LOW
           Fix: val: string | number | null

Line 121:  const ref_attrs: Record<string, any> = {};
           → OBJECT PROPERTIES
           Risk: MEDIUM
           Fix: ref_attrs: ReferenceAttributes

Line 132:  const version_attrs: Record<string, any> = {};
           → OBJECT PROPERTIES
           Risk: MEDIUM
           Fix: version_attrs: VersionAttributes

Line 142:  const sku_attrs: Record<string, any> = {};
           → OBJECT PROPERTIES
           Risk: MEDIUM
           Fix: sku_attrs: SkuAttributes

Line 165:  .filter(Boolean) as any[];
           → FILTER RESULT CASTING
           Risk: MEDIUM
           Fix: .filter((x): x is typeof x => x !== null) as ProductCreateRow[]

Line 218:  const payload: any = { ... }
           → PAYLOAD OBJECT
           Risk: MEDIUM-HIGH
           Fix: payload: BulkImportPayload

Line 239:  let safeNewFamilyCodes = payload.families.map((f: any) => ...
           → MAP CALLBACK PARAMETER
           Risk: MEDIUM
           Fix: f: FamilyRow
\\\

#### Database Query Results (8 instances) - HIGH RISK
\\\
Line 246:  const { data, error } = await supabaseServer.from('families').select(...).in(...);
           ... (data || []).map((r: any) => String(r.family_code))
           → ROW TYPE INFERENCE
           Risk: HIGH
           Fix: FamilyRow interface from schema
           
Line 248:  const existing = (data || []).map((r: any) => String(r.family_code))
           → ROW MAPPING
           Risk: HIGH
           Fix: existing: FamilyCode[]

Line 260:  const existing = (data || []).map((r: any) => String(r.code_4dig))
           → COLOR ROW
           Risk: HIGH
           Fix: ColorRow interface

Line 271:  const existing = (data || []).map((r: any) => String(r.version_code))
           → VERSION ROW
           Risk: HIGH
           Fix: VersionRow interface

Line 281:  const { data: importRes, error: importErr } = await (supabaseServer as any).rpc(...)
           → RPC RESULT CASTING
           Risk: HIGH
           Fix: supabaseServer.rpc<ImportResult>('bulk_import_products_v3', ...)

Line 289:  const createdSkuIds = rows.map((r: any) => r?.created_ids?.sku_id)
           → RESPONSE STRUCTURE
           Risk: HIGH
           Fix: rows: ImportRow[] with proper nested types

Line 289:  .filter((v: any) => !!v)
           → FILTER PARAMETER
           Risk: MEDIUM
           Fix: .filter((v: string): v is string => !!v)

Line 312:  const updates: any[] = [];
           → ARRAY INITIALIZATION
           Risk: MEDIUM
           Fix: const updates: NameUpdatePayload[] = [];
\\\

#### Error Handling (2 instances) - LOW RISK
\\\
Line 432:  catch (e: any) {
           → CATCH CLAUSE
           Risk: LOW
           Fix: catch (e: Error)
\\\

---

## File 3: src/lib/engine/codeParser.ts (36 instances)

### Summary
**Type:** Database Query Processing / Type Casting
**Instances:** 36
**Risk:** HIGH
**Estimated Effort:** 5 hours

### Key Patterns

#### Database Query Results (15 instances) - HIGH RISK
\\\
Line 113:  function setInheritance(field: string, value: any, source: string) {
           → FUNCTION PARAM
           Risk: MEDIUM
           Fix: value: string | number | boolean | null

Line 149-152: const rows = await dbQuery(...) as any[];
             → DATABASE QUERY
             Risk: HIGH
             Fix: const rows: FamilyRow[] = await dbQuery(...)
             Need: interface FamilyRow { family_code: string; product_type: string; ... }

Line 182:  const verRows = await dbQuery(...) as any[];
           → DATABASE QUERY
           Risk: HIGH
           Fix: const verRows: VersionRuleRow[] = await dbQuery(...)

Line 195:  (result as any)[field] = rules[field];
           → DYNAMIC PROPERTY ASSIGNMENT
           Risk: MEDIUM-HIGH
           Fix: Use type-safe version control (refactor to switch)

Line 208:  let foundData: any = null;
           → VARIABLE INIT
           Risk: MEDIUM
           Fix: let foundData: ReferenceData | null = null;

Line 239:  ;(result as any).color_name = ...
           → PROPERTY MUTATION
           Risk: MEDIUM-HIGH
           Fix: Typed object mutation

Line 264:  const skuBaseRows: any[] = await dbQuery(...)
           → DATABASE QUERY
           Risk: HIGH
           Fix: const skuBaseRows: SkuBaseRow[] = await dbQuery(...)

Line 288:  const famRefRows: any[] = await dbQuery(...)
           → DATABASE QUERY
           Risk: HIGH
           Fix: const famRefRows: FamilyReferenceRow[] = await dbQuery(...)

Line 358:  function setField(field: string, value: any) {
           → FUNCTION PARAM
           Risk: MEDIUM
           Fix: value: string | number | boolean | null

Line 359:  const prev = (result as any)[field];
           → DYNAMIC PROPERTY ACCESS
           Risk: MEDIUM-HIGH
           Fix: Type-safe field access

Line 361:  (result as any)[field] = value || prev;
           → DYNAMIC PROPERTY MUTATION
           Risk: MEDIUM-HIGH
           Fix: Same as above

Line 365:  setInheritance(field, (result as any)[field], fieldSource(contributing));
           → PARAMETER CASTING
           Risk: MEDIUM
           Fix: Typed field access

Line 407:  ;(result as any).color_name = ...
           → PROPERTY MUTATION
           Risk: MEDIUM
           Fix: Typed mutation

Line 409:  ;(result as any)._source = source;
           → PROPERTY MUTATION
           Risk: MEDIUM
           Fix: Add _source: string to result type

Line 423:  if (result.color_code && !(result as any).color_name) {
           → OPTIONAL PROPERTY ACCESS
           Risk: MEDIUM
           Fix: Use proper type guard
\\\

#### Type Assertions (12 instances) - MEDIUM RISK
\\\
Line 427:  const colorRows: any[] = await dbQuery(...)
           → DATABASE QUERY
           Risk: HIGH
           Fix: const colorRows: ColorRow[] = await dbQuery(...)

Line 429:  (result as any).color_name = colorRows[0].name_color_sap;
           → PROPERTY MUTATION
           Risk: MEDIUM
           Fix: result.color_name = colorRows[0].name_color_sap;

Line 445:  const setSap = (field: string, value: any) => { ... }
           → FUNCTION PARAM
           Risk: MEDIUM
           Fix: value: string | number | boolean | null

Line 475:  const [nameRows, desigRows, ...]: any = await Promise.all([...])
           → DESTRUCTURED PROMISE RESULT
           Risk: HIGH
           Fix: Create tuple type: [NameRow[], DesignationRow[], ...]

Line 485:  const names = nameRows.map((r: any) => r.product_name);
           → MAP CALLBACK PARAMETER
           Risk: MEDIUM
           Fix: (r: NameRow) => r.product_name

Line 490:  const desigs = desigRows.map((r: any) => r.designation);
           → MAP CALLBACK PARAMETER
           Risk: MEDIUM
           Fix: (r: DesignationRow) => r.designation
\\\

---

## File 4: src/app/families/MassEditClient.tsx (30 instances)

### Summary
**Type:** React Component / Server Actions
**Instances:** 30
**Risk:** MEDIUM
**Estimated Effort:** 4 hours

### Key Patterns

#### React Props and State (12 instances) - MEDIUM RISK
\\\
Lines throughout: Various \ny\ types in component state and callbacks
→ COMPONENT TYPE SAFETY
Risk: MEDIUM
Fix: Create component prop/state interfaces

interface MassEditClientProps {
  families: Family[];
  onSave: (updated: Family[]) => Promise<void>;
}

interface FamilyFormState {
  name: string;
  productType: string;
  zoneHome: string;
  // ... etc
}
\\\

#### Function Callbacks (8 instances) - MEDIUM RISK
\\\
→ Event handlers with any parameters
Risk: MEDIUM
Fix: Use proper React event types and callback signatures
\\\

#### Data Transformations (10 instances) - MEDIUM-LOW RISK
\\\
→ Map/filter operations with untyped callbacks
Risk: LOW-MEDIUM
Fix: Type callback parameters explicitly
\\\

---

## File 5: src/components/rules/NamingRulesManager.tsx (29 instances)

### Summary
**Type:** React Component
**Instances:** 29
**Risk:** MEDIUM
**Estimated Effort:** 4 hours

### Key Patterns

#### Array Types (10 instances) - MEDIUM RISK
\\\
rules: any[] → NamingRule[]
config: any[] → RuleConfig[]
\\\

#### State Setters (8 instances) - MEDIUM RISK
\\\
setRules((prev: any) => ...) → setRules((prev: NamingRule[]) => ...)
\\\

#### Event Handlers (11 instances) - MEDIUM RISK
\\\
onClick={(item: any) => ...} → onClick={(item: NamingRule) => ...}
onUpdate={(config: any) => ...} → onUpdate={(config: RuleConfig) => ...}
\\\

---

## Summary Table by File

| File | Total | Database | Params | Casting | Variables | Arrays | Props | Other |
|------|-------|----------|--------|---------|-----------|--------|-------|-------|
| products/actions.ts | 49 | 12 | 14 | 8 | 4 | 2 | 6 | 3 |
| api/mass-import/execute | 43 | 8 | 11 | 2 | 8 | 6 | 4 | 4 |
| lib/engine/codeParser.ts | 36 | 15 | 3 | 12 | 2 | - | - | 4 |
| families/MassEditClient.tsx | 30 | - | 8 | 2 | 4 | 4 | 12 | - |
| components/rules/NamingRulesManager | 29 | - | 5 | 1 | 3 | 10 | 8 | 2 |

---

## Implementation Roadmap

### Week 1 (Phase 1 & 2):
1. Create \src/types/database.ts\ with row types
2. Create \src/types/domain.ts\ with business types
3. Update products/actions.ts and mass-import/execute
4. Update codeParser.ts database queries

### Week 2 (Phase 2 & 3):
5. Update component files (MassEditClient, NamingRulesManager)
6. Fix all type casting
7. Add proper return types

### Validation:
\
pm run build\ - Should have zero type errors
\
pm run lint\ - Should pass all ESLint rules

---

*Generated: 06/02/2026 15:54:33*
*Analysis includes line-by-line categorization and specific fix recommendations*
