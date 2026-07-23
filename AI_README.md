# README - AI Agent Context (SamiGen)

> [!IMPORTANT]
> **Si eres una Inteligencia Artificial trabajando en este repositorio, lee este archivo primero.** Este documento contiene el contexto estrategico y operativo necesario para navegar y construir eficientemente en este proyecto.

## Vision General
**Sincronización BOM SAP y RBAC V2 (Versión Actual)**: Implementación de la sincronización de listas de materiales (BOM) y hojas de ruta entre SAP Service Layer y Supabase; creación de migraciones de bases de datos para soporte de RBAC V2, roles, parámetros de escritura SAP y auditorías; optimización del módulo de impresión para procesar múltiples órdenes de fabricación simultáneamente y relacionamiento estable de instructivos en PDF con códigos QR vinculados al subdominio `doc.firplak.com`.
**Depuracion de Deuda Tecnica (V6 Final)**: Se ha completado la eliminacion fisica de la tabla `cabinet_products` y la columna obsoleta `product_type` en `product_references`. El sistema opera ahora bajo un esquema relacional normalizado y optimizado.  
**Estandarizacion Global ({product_name})**: Se unifico la identidad de los productos reemplazando `cabinet_name` por `product_name` en toda la UI, logica de negocio y motores de validacion, garantizando consistencia en el Catalogo Maestro.  
**Gobernanza de Secretos (MCP Security)**: Implementacion de sincronizacion automatica de credenciales para el servidor MCP, eliminando tokens hardcoded and priorizando el uso de variables de entorno seguras.  
**Evolucion Operativa (AI Agent Skills)**: Integracion de un sistema de habilidades autonomas (`skills/`) y workflows refinados para la gestion del ciclo de vida del desarrollo (release, audit, archive).  
**Soporte de Variable `version_label`**: Integracion de la variable `version_label` (de la tabla `product_versions`) en el constructor de reglas de nomenclatura en espanol, ingles y en el motor de traduccion y parseo de codigo SKU SAP.  
**Alta Individual V6 (`/new`)**: `version_label` esta disponible en el formulario, se autocompleta desde `sap_description` contra etiquetas existentes con matching normalizado, y se persiste in `product_versions.version_label`. Medidas y peso aceptan coma o punto decimal, normalizando a punto; `MUEBLES/MUEBLE` defaulta `canto_puertas = CANTO 2MM` si esta vacio o `NA`.  
**Nomenclatura ES/EN Unificada**: La construccion de nombres base/completos/SAP recomendado vive en `public.naming_components`; `public.rules` y `public.naming_config_en` fueron eliminadas fisicamente en Supabase I+D.  
**Alias UI de Nombre Core Firplak**: En `/generate` y `/print`, `final_name_es` es el valor visible "Nombre / Descripcion" y debe mapear a `product_skus.final_complete_name_es`; `final_base_name_es` queda como dato base de version.  
**Datasets Genericos para Plantillas**: Las plantillas con `data_source='custom_datasets'` se vinculan a datasets mediante `public.template_dataset_links`; el mapping de variables se gobierna desde `/datasets` con keys canonicas en `schema_json.columns[].key`, y `/generate`/`/print` solo operan datasets asociados y sincronizados. CEFI se trata hoy como dataset externo por capacidad actual, pero es CEMA + FIRPLAK para productos al exterior y podria migrar a una integracion interna propia.  
**Etiquetas por Cajas**: La cantidad de cajas vive en `product_references.ref_attrs.q_package`; para `2+ CAJAS`, `product_references.weight_kg` usa JSONB `{ weights_kg, peso_total }` y las etiquetas se expanden temporalmente con `partes_texto` (`Caja 1/2`) sin duplicar registros.  
**Filtro de Busqueda Persistente en Generar**: Implementacion de un filtro de texto por nombre/color en `/generate` con persistencia al cambiar familia o referencia y limite dinamico de consulta.  
**RBAC V2 y Administración de Usuarios**: Supabase Auth mantiene la autenticación. `public.user_profiles` asigna el rol de cada usuario y `public.app_roles` define etiqueta, estado y módulos permitidos; sidebar, proxy, guards, server actions y APIs resuelven acceso desde esa misma configuración. `/configuration/users` es solo para admin y permite administrar roles, usuarios, invitaciones, recuperación y eliminación protegida. No existe registro público.
**Informacion Productiva de Productos BOM V2**: La BOM base vive por referencia en `product_references.product_bom_structure` con `schema_version: 2`, lineas `fixed` y `material_group`; los componentes no `V` viven en `component_items`. `/product-design/bom` analiza SAP de forma transitoria, resuelve colores/perfiles por SKU y permite matrices unicolor/Dual de cantos y tableros con overrides semanticos por SKU y condiciones de perfil efectivas. Las hojas de ruta siguen fuera de este alcance y viven en `product_route_documents`; `hojas_de_ruta` queda como legado/referencia. Ver KI `bom_v2_reference_import_and_color_matrix`.

## Arquitectura de 3 Capas
Este repositorio sigue estrictamente el modelo definido en `AGENTS.md`:
1. **Layer 1: Directives (`directives/`)**: SOPs en Markdown que definen que hacer.
2. **Layer 2: Orchestration**: Toma de decisiones y flujo logico.
3. **Layer 3: Execution (`execution/`)**: Scripts en Python deterministas.

## Knowledge Items (KIs) - Memoria Tecnica
- Los KIs del proyecto viven en `.gemini/antigravity/knowledge/` y estan organizados por tema.
- Antes de leer KIs, revisar primero `.gemini/antigravity/knowledge/INDEX.md`.
- KIs especialmente relevantes para el estado actual del repo:
  - `.gemini/antigravity/knowledge/private-label_version-attrs_sentinels/KI.md`
  - `.gemini/antigravity/knowledge/effective_overrides_and_visibility_status/artifacts/knowledge_item.md`
  - `.gemini/antigravity/knowledge/mass_import_v6_products/artifacts/knowledge_item.md`
  - `.gemini/antigravity/knowledge/mass_reference_editor_and_jsonb_mutations/artifacts/knowledge_item.md`
  - `.gemini/antigravity/knowledge/naming_components_single_source_of_truth/KI.md`
  - `.gemini/antigravity/knowledge/core_template_variable_catalog_and_naming_sync/KI.md`
  - `.gemini/antigravity/knowledge/dynamic_translation_and_template_lifecycle/artifacts/knowledge_item.md`
  - `.gemini/antigravity/knowledge/external_dataset_templates_and_export_validation/KI.md`
  - `.gemini/antigravity/knowledge/template_barcode_elements/KI.md`
  - `.gemini/antigravity/knowledge/product_public_document_links_and_qr/KI.md`
  - `.gemini/antigravity/knowledge/bom_v2_reference_import_and_color_matrix/KI.md`
  - `.gemini/antigravity/knowledge/template_builder_panel_modes_and_global_settings/KI.md`
  - `.gemini/antigravity/knowledge/thermal_label_printing_and_agent_metadata/KI.md`
  - `.gemini/antigravity/knowledge/reference_package_labels_and_box_weights/KI.md`
  - `.gemini/antigravity/knowledge/sap_service_layer_item_master_and_bom/KI.md`
  - `.gemini/antigravity/knowledge/product_production_information_bom_and_routes/KI.md`
  - `.gemini/antigravity/knowledge/agent_governance_and_v6_stabilization/artifacts/knowledge_item.md`
  - `.gemini/antigravity/knowledge/supabase_auth_and_proxy_architecture/artifacts/knowledge_item.md`

## Tecnologias Clave
- **Frontend/Backend**: Next.js 16+ (App Router), React 19.
- **Autenticacion**: Supabase Auth con patron **Proxy (ex-Middleware)**.
- **RBAC V2**: `public.user_profiles.role` referencia `public.app_roles`; los módulos permitidos y el estado activo del rol se resuelven dinámicamente. `admin` es el superusuario fijo. Usuarios sin rol válido, inactivo o sin módulos van a `/access-pending`. La gestión vive en `/configuration/users` y exige admin.
- **Correo Auth**: recuperación de contraseña usa PKCE mediante `/auth/callback` y `/auth/update-password`; invitaciones de Supabase usan sesión implícita y pasan por `/auth/accept-invite` antes de crear la contraseña. Mantener el `Site URL` en el dominio base y permitir `/auth/**` en Redirect URLs. No hay signup público.
- **Base de Datos**: Prisma ORM con SQLite (local) y Supabase (Cloud).
- **Prisma Client (REGLA)**: el cliente se genera en `src/generated/prisma`; en `src/`, importar tipos desde `@/generated/prisma/client` y acceso DB desde `@/lib/prisma`. `@prisma/client` queda bloqueado por `npm run check:diff` para evitar fallos en Vercel clean install.
- **IA externa (estado actual)**: no hay integraciones activas de IA generativa por API en runtime; no asumir Gemini u otro proveedor salvo que reaparezca implementacion real en `src/` o rutas del app.
- **SAP Service Layer Runtime**: `/consulta-sap` y `/api/sap/**` consultan SAP B1 Service Layer server-side via `src/lib/sap/serviceLayer.ts` (`Items` y `ProductTrees`). Usar Node/HTTPS para diagnostico; `Invoke-WebRequest` puede dar falsos `400`. Escrituras SAP se activan/inactivan desde `/configuration` con `app_settings.sap_writes_enabled` y mantienen dry-run/confirmacion humana. `ProductTrees.ProductTreeLines[].IssueMethod` define emision Manual (`M`) o Backflush/bajo notificacion (`B`); para MPs centrales, manual sin consumo oportuno puede ocultar necesidades reales a abastecimiento. Incidente operativo confirmado: desde el sábado al final de la tarde hasta el lunes temprano no hubo acceso general a SAP/Service Layer; el primer error fue `Firplak_SA` con `LOG_BACKUP` y luego el login agotó 60 s. No asumir cambio de contraseña sin evidencia. Si ocurre de nuevo, confirmar health de solo lectura y escalar a SAP Basis/DBA antes de modificar el flujo de la app. Ver KI `sap_service_layer_item_master_and_bom`.
- **Confirmacion UI de acciones sensibles (REGLA PERMANENTE)**: nunca pedir al usuario que escriba o copie una frase para autorizar una mutacion. Las acciones destructivas, inactivaciones, sobrescrituras y sincronizaciones deben usar un checkbox de confirmacion explicita, deshabilitar el boton hasta marcarlo, ejecutar dry-run cuando aplique y releer/verificar el efecto despues de escribir. `confirmationText` solo puede existir para datos de negocio que se estan editando, nunca como mecanismo de autorizacion humana. Antes de crear un flujo nuevo, reutilizar este patron y revisar los flujos existentes; no volver a introducir confirmaciones textuales por conveniencia.
- **Auditoría transitoria de color SAP**: `/product-design/color-audit` compara `U_Color` con el cuarto bloque de todos los SKU `V`, agota la paginación, conserva evidencia temporal en IndexedDB, separa kits y ofrece cambio masivo por lotes con dry-run, confirmación exacta y relectura antes/después. Ver KI `sap_color_audit_and_mass_update`.
- **Consulta SAP por criterios combinados**: `/consulta-sap` permite buscar simultáneamente por número, descripción y color; muestra resultados paginados antes del detalle, bloquea los filtros mientras se consulta el artículo y restaura los criterios originales al volver a la lista. Implementado en el commit `9b326ff`; ver KI `sap_service_layer_item_master_and_bom`.
- **Supabase Source of Truth (REGLA)**: El proyecto Supabase operativo de este repo es siempre **I+D** (`nbifmxggfusipomspoly`, `https://nbifmxggfusipomspoly.supabase.co`). Toda migracion, RPC, SQL check, schema inspection o mutacion por MCP debe apuntar por defecto a ese proyecto.
- **Confirmacion de Migraciones Supabase (REGLA)**: Si una tarea requiere DDL/RPC/triggers/views/indices/RLS/backfills, el agente debe explicar migraciones, impacto, riesgos, plan y verificacion, y pedir confirmacion explicita antes de aplicar. La solicitud expresa de funcionalidad no autoriza por sí sola a inventar estructura de base de datos.
- **Nuevas tablas solo por necesidad extrema (REGLA)**: La creación de tablas nuevas en Supabase debe evitarse en lo posible y solo puede proponerse cuando sea supremamente necesaria para la funcionalidad solicitada. Antes de proponerla, el agente debe inspeccionar el esquema y evaluar si el caso puede resolverse reutilizando tablas existentes, columnas/JSONB, relaciones, vistas, RPCs o lógica de aplicación. No se deben crear tablas ni funciones sin sentido, por conveniencia o sin una estructura coherente.
- **Justificación y autorización de tablas (REGLA)**: Si no existe una alternativa razonable, el agente debe solicitar autorización explícita antes de ejecutar cualquier DDL. La solicitud debe argumentar el problema que resuelve, la insuficiencia de las estructuras existentes, el alcance mínimo, impacto, riesgos, plan de migración/reversión y verificación. También debe incluir la definición completa de la tabla y justificar cada campo: nombre, tipo, propósito, nulabilidad, default, restricciones, relaciones, índices, RLS y ciclo de vida cuando correspondan. Sin autorización explícita, se puede analizar o preparar una propuesta, pero no crear la tabla ni aplicar la migración.
- **Gobernanza de Supabase MCP**: Se prioriza la logica DB-First: usar Triggers, Funciones RPC y Views.
- **Hardening Supabase RBAC**: no abrir grants a `anon` para depurar. `v_ui_generate_list` debe quedar `security_invoker=true`; RPCs administrativas y `exec_sql` solo deben ejecutarse desde servidor/MCP con `service_role`.
- **Patron JSONB Quirurgico**: Uso de operadores `||` y `-` en RPCs para mutaciones atomicas en `ref_attrs`.
- **Nomenclatura Supabase**: `public.naming_components` es la fuente unica ES/EN; la recomputacion usa cola `naming_recompute_jobs` + flags stale y se procesa desde sidebar/API, no inline. El glosario puntual v1 usa coincidencia exacta y reduce filas, pero no es EN-only real. Ver KI `naming_components_single_source_of_truth`.
- **Schema `ref_attrs` y nombres**: modificar solo `families.ref_attrs_schema.*.allowed_values` cambia opciones/validacion, no valores efectivos; el trigger de familia ignora esos cambios para no encolar nomenclatura. Agregar/quitar atributos del schema sigue siendo cambio estructural.

## Agente de Impresion Local (Print Agent)
- **Puerto**: `3344`. Endpoints: `POST /print`, `GET /health`, `GET /scan-usb`.
- **Comunicacion USB**: PowerShell + Win32 `CreateFile`/`WriteFile` sobre el device path del Monitor USB de Windows.
- **Deteccion**: Lee el registro `HKLM\SYSTEM\CurrentControlSet\Control\Print\Monitors\USB Monitor\Ports`.
- **Impresora conocida**: `4BARCODE 4B-2054TG` (3nStar LTT334) - `VID_2D84:PID_4CFB`.
- **Pipeline vigente 3nStar**: JPG/PNG -> Sharp o Canvas -> TSPL (`SIZE`, `GAP`, `BITMAP`, `PRINT`) -> envia raw al device path USB o WebUSB.
- **Metadata de etiqueta**: las plantillas 3nStar usan `print_target='agent_3nstar'` y medio fisico `media_width_mm`, `media_length_mm`, `media_gap_mm`; la rotacion se deriva en `src/lib/printLayout.ts`, no se persiste.
- **Capacidades del agente**: `/health` debe anunciar `jobMetadata`; la UI bloquea agentes viejos que no acepten metadata de trabajo.
- **Diagnostico UI**: `/print` debe separar causa de bloqueo: agente no disponible, impresora USB no detectada o agente viejo. No usar mensajes combinados que pidan instalar agente y conectar impresora cuando solo falla una condicion.
- **Distribucion Windows**: el agente productivo debe instalarse en `%LOCALAPPDATA%\SamiGenPrintAgent`, incluir Node/dependencias y autoarrancar sin ventana. Si Task Scheduler falla por politica local, usar fallback por usuario en `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`.
- **Scripts**: `npm run dev` corre Next.js + agente simultaneamente; `npm run start:local` para produccion local.
- `print-agent/usbService.js` - deteccion y escritura USB via PowerShell.
- `print-agent/printService.js` - conversion JPG/PNG -> TSPL con Sharp y metadata explicita de medio fisico.
- `src/lib/print/tspl.ts` - empaquetado TSPL compartido.
- `src/lib/print/browserTspl.ts` - conversion a TSPL en navegador para WebUSB.
- `print-agent/server.js` - Express server.
- **Limite termico**: 832 dots de ancho (104 mm a 8 dots/mm). La imagen rota solo cuando `resolveThermalPrintLayout(...)` detecta que el diseno y el medio fisico estan invertidos.

## Informacion de Dominio (Firplak)
- **Gobernanza de Esquema**: La familia (`families`) es la fuente de verdad tecnica para los atributos de sus referencias.
- **Informacion productiva de productos**: La LDM/BOM y documentos productivos deben modelarse de forma universal, no por tablas especificas de muebles/fibra/marmol/quartzstone. La referencia es la base productiva, la version modifica y el SKU/color resuelve componentes concretos. Ver KI `product_production_information_bom_and_routes`.
- **Excepcion `use_destination`**: `families.use_destination` sigue siendo el default tecnico, pero una referencia puede sobrescribirlo con `product_references.ref_attrs.use_destination`; version, SKU y reglas globales no deben pisar este campo efectivo.
- **Documentos publicos y QR**: Los documentos publicables usan `product_asset_links` como fuente relacional. `public_slug` incluye prefijo (`ins/...`, `gar/...`, `cui/...`) y debe ser humano/estable, sin codigos internos tipo `BAN24-0001` salvo excepciones temporales antes de publicar. El dominio productivo canonico es `https://doc.firplak.com/{prefijo}/{slug}`; QRs productivos no deben codificar localhost ni el dominio `.vercel.app`. `src/lib/documentLinks.ts` centraliza la resolucion con `NEXT_PUBLIC_DOCS_BASE_URL` y fallback a `https://doc.firplak.com`; prefijos y abreviaturas viven en `/configuration/nomenclature`.
- **Patron de Limpieza Profunda**: Al borrar un asset, se realiza una desconexion automatica en JSONB y eliminacion fisica del Storage.
- **BARCODE en plantillas**: El recurso `BARCODE` renderiza SVG real compartido entre builder, preview y export. Su formato/orientacion/dimension X/quiet zone viven en cada elemento de `elements_json`; la orientacion manual del elemento no debe mezclarse con la rotacion derivada de impresion termica.
- **Variables core en plantillas**: `/templates/builder` debe reutilizar el catalogo de variables de nomenclatura para texto libre, elementos dinamicos y nombre de exportacion; nuevas variables deben preferir nombres canonicos como `final_base_name_es`, dejando aliases legacy solo por compatibilidad.
- **Transformaciones de texto en plantillas**: `capitalize`/`sentence` deben resolverse como transformaciones semanticas post-hidratacion (helper compartido), preservando acronimos tecnicos y dejando unidades `mm/cm/in` en minuscula; no depender solo de CSS `text-transform`.
- **Panel de propiedades en plantillas**: `/templates/builder` separa configuracion global de plantilla y propiedades de elemento mediante modos explicitos `Elemento` / `Plantilla`; sin seleccion abre `Plantilla`, con seleccion simple abre `Elemento`.
- **Tipografia global de plantilla**: la familia efectiva vive en `plantillas_doc_tec.template_font_family`, se aplica a preview y render final, y el catalogo frontend debe mantenerse sincronizado con el `CHECK` de base de datos para evitar errores `23514`. `Mozaic Geos` se modela como una sola familia global con pesos reales via `fontWeight`.
- **Vista del lienzo en builder**: zoom, ajuste a vista y guias de impresion son estado local del editor, no datos persistidos de plantilla; en formatos grandes como carta, anclar el canvas arriba con padding visible y corregir coordenadas de drag/resize segun el zoom.
- **Plantillas con datasets externos**: `/print`, igual que `/generate`, debe respetar `plantillas_doc_tec.data_source`; datasets externos consultan `custom_dataset_rows`/`template_dataset_links`, mientras `core_firplak` usa `v_ui_generate_list` con `brand_scope`. `POST /api/print` recibe `templateId` y revalida plantilla activa + pertenencia del registro al dataset vinculado/UUID legacy; filas externas no pasan por reglas, traduccion ni QRs Firplak.
- **Variables runtime de impresion**: las plantillas pueden usar `{print_datetime}` y `{of_number}`; la OF se captura en `/print` solo cuando la plantilla la usa, exige exactamente 4 digitos y permite multiples OF por registro, cada una con copias propias, sin duplicar datos en BD.
- **Sidebar honesto**: no mantener indicadores de "Estado de Servicios" si no estan conectados a mediciones reales; `I. Artificial` y `Archivos` fueron retirados por ser placeholders sin telemetria efectiva.
- **Gobernanza de calidad en `src/`**: no usar suppressions como salida facil. Si aparecen deudas de lint/TS en flujos sensibles (`/generate`, `/templates/builder`, `/new`, `/assets`), resolver con tipado, helpers y estado derivado, manteniendo cambios de superficie minima.
- **Busquedas admin sobre catalogo**: en editores que consultan `v_ui_generate_list`, empujar filtros selectivos/keyword al SQL antes de mapear o filtrar en memoria. Timeouts `57014` pueden venir de calcular la vista completa, no de demasiados resultados finales. Ver KI `admin_catalog_search_performance`.
- **Pendientes (`/pending`)**: el KPI de Home y la pantalla de pendientes usan RPC estructural paginado en Supabase; no volver al barrido TypeScript inicial. El escaneo real de conflictos de traduccion queda bajo boton/modal para evitar timeouts. Ver KI `pending_structural_rpc_and_translation_scan`.
- **Gobernanza de Contexto (REGLA)**: El agente debe avisar proactivamente al usuario de archivar la sesion (`/archive-session`) tras hitos importantes.

## Proximos Pasos (Sugerencia)
1. **Piloto BOM SAP**: Importar manualmente los 3 SKUs piloto (`VBAN12-0081-000-0437`, `VROP03-0001-000-0100`, `VCOC01-0066-000-0437`) y comparar `resolved_bom_for_sku` contra SAP.
2. **Matriz de tableros y consumos**: Continuar la validacion humana por color de las reglas unicolor por perfil, Dual y overrides por SKU. Mantener separadas contradicciones reales y variaciones validas; no bloquear publicar por consumos Dual/balance pendientes.
3. **Hojas de ruta productivas**: Probar edicion en `/product-design/route-sheets/furniture` y vista/impresion carta en `/productive-modules/route-sheets/furniture`.
4. **Escrituras SAP controladas**: Validar desde `/configuration` que `sap_writes_enabled` active/inactive PATCH/POST reales y que el flujo conserve dry-run + confirmacion humana.
5. **Overrides BOM reales**: Probar `replace_line`, `add_line`, `remove_line` con casos vigentes de manija/riel/bisagra antes de ampliar a creacion de codigos.
6. **Subestructuras profundas**: Completar expansion recursiva de `item_bom_structure` para subproducidos, kits y estructuras inventariables/no inventariables.
7. **Impresion USB en produccion**: Probar impresion real con una etiqueta SamiGen desde `/print`.
8. **Mostrar estado USB en PrintClient**: Agregar indicador visual en la UI cuando el agente este online.
9. **Migracion de base de datos**: Mover los modelos de Prisma de SQLite a PostgreSQL (Supabase).
10. **Mantenimiento de secretos MCP**: Usar `node execution/sync_mcp_config.js` para mantener las claves de Antigravity sincronizadas con el `.env`.

## Entorno de Desarrollo (Windows)
- **Ruta NPM Global**: `C:\Users\oswaldo.rivera\AppData\Roaming\npm`
- **PowerShell Policy**: `RemoteSigned`

## Clientes Marca Propia
- `/configuration/clients` administra `public.clients`, detecta faltantes desde `v_ui_generate_list.private_label_client_name` y usa `public.rpc_rename_client(...)` para propagar renombres a versiones, SKUs, reglas globales y plantillas.
- La regla vigente es: private label se define solo por `private_label_client_name`; ausencia real (`null`/vacio) significa "no aplica".
- No usar `private_label_flag`, `private_label_client_id` ni persistir `"NA"` como valor semantico de marca propia.
- El cierre end-to-end ya quedo aplicado en formularios, parser, payloads, export/render y editores masivos.
- El preview de plantillas debe respetar ese mismo scope: si la plantilla es de un cliente marca propia, mostrar solo datos de ese cliente; si es Firplak sin cliente, mostrar solo datos core Firplak.
- Ver KIs relacionados: `.gemini/antigravity/knowledge/private-label_version-attrs_sentinels/KI.md`, `.gemini/antigravity/knowledge/mass_import_v6_products/artifacts/knowledge_item.md`, `.gemini/antigravity/knowledge/navigation_information_architecture_2026_05/artifacts/knowledge_item.md`.

## Terminal Safety Policy
*(Ver archivo original)*

---
*Este archivo es mantenido autonomamente por los agentes de IA que colaboran en el proyecto.*

## Session Anchored Summary (2026-07-23)

### Objective
Complete all remaining Fases (3–7) for the cabinet route-sheets module: roles, profiles, edge types, decision history, productive snapshot, and SAP dry-run.

### Important Details
- Phase 3: group pieces by `material_role`, add per-role profile selectors (ST/RH/CARB2/CARB2 RH) with fallback to Structure, calculate area m² per role, clean CMPD09 display (no match badges/decision buttons)
- Phase 4: add `decision_history` to `CabinetRouteData` with `applyCabinetMatchDecision` logging, show match badges on pieces when Excel imported, lock editing when status `approved`
- Phase 5: add `edge_types` per role (2mm/0.45mm/1mm/3mm) extracted from CMPD06 BOM lines via `extractCabinetEdgeTypesFromBom`, auto-apply to new piece rows via `derivePieceRowsFromCandidates`
- Phase 6: resolve `color_code` → `color_name` via `JOIN public.colors` in productive-modules query, add `color_name` to `ProductiveRouteSheet` type, set `snapshot_taken_at` on save with `approved` status, show profiles/edge types in productive view
- `nameMap` hoisted in `getCabinetRouteWorkspaceByRefAction` so available for edge type name inference
- Commit made on `Oswaldo_cambios` for Phase 3 only; Phase 4–6 not yet committed
- PILOT_SKUS removed from route-sheets module (Phase 2), still in types.ts for productive-modules

### Work State
**Completed:**
- Phase 1 (parser, BOM reader, 51 + 11 tests)
- Phase 2 (reference selector, workspace, candidate derivation, item names from component_items)
- Phase 3: `CabinetProfilesByRole`, profiles in `CabinetRouteSourceState`, `extractCabinetProfilesFromBom`, `calculateAreaByRole`, `calculateEdgeByRole`, `resolveProfileForRole`, `PiecesByRoleEditor` component, profile selectors in UI, area/edge per role, clean piece display
- Phase 4: `CabinetDecisionEntry` type, `decision_history` in `CabinetRouteData`, logging in `applyCabinetMatchDecision`, `normalizeDecisionEntry`, piece match badges when `hasSheet=true`, inline decision buttons (SAP/Hoja/Ign), read-only guard when `status===approved`, `DecisionHistoryPanel`
- Phase 5: `edge_types` in `CabinetRouteSourceState`, `extractCabinetEdgeTypesFromBom` (reads CMPD06 lines, infers thickness from item name), `resolveEdgeTypeForRole`, `derivePieceRowsFromCandidates` accepts and applies edge types by role, edge type selectors in UI
- Phase 6: `color_name` added to `ProductiveRouteSheet` type, SQL query JOINs `public.colors`, `snapshot_taken_at` field in `CabinetRouteSourceState`, set on save with `approved` status, productive view shows color_name, snapshot timestamp, profiles and edge types per role

**Active:**
- Phase 7: SAP dry-run proposals without mutations — not started

**Blocked:** (none)

### Next Move
1. Implement Phase 7 (SAP dry-run proposals without mutations)
2. Commit Phase 4–7 changes on `Oswaldo_cambios`

### Relevant Files
- `src/lib/routeSheets/cabinets.ts`: all domain types (`CabinetProfilesByRole`, `CabinetDecisionEntry`, `CabinetRouteData`), functions (`extractCabinetProfilesFromBom`, `extractCabinetEdgeTypesFromBom`, `calculateAreaByRole`, `applyCabinetMatchDecision`, `derivePieceRowsFromCandidates`), normalize/empty helpers
- `src/app/product-design/actions.ts`: `getCabinetRouteWorkspaceByRefAction` (profiles, edgeTypes, nameMap extraction), `saveRouteDocumentAction` (snapshot_taken_at on approved)
- `src/app/product-design/route-sheets/cabinets/CabinetsRouteDesignClient.tsx`: `PiecesByRoleEditor`, `DecisionHistoryPanel`, profile/edge type selectors, match badges, read-only guard
- `src/app/product-design/route-sheets/cabinets/page.tsx`: calls `listCabinetBomReferencesAction`
- `src/app/productive-modules/actions.ts`: `getProductiveRouteSheetAction` (color JOIN), `ProductiveRouteSheet` type with `color_name`
- `src/app/productive-modules/route-sheets/cabinets/CabinetsRouteViewClient.tsx`: productive read-only UI showing color_name, snapshot, profiles, edge types per role
- `src/lib/bom/types.ts`: `PILOT_SKUS` (kept for productive-modules)
