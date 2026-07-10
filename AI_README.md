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
**Datasets Genericos para Plantillas**: Las plantillas con `data_source='custom_datasets'` se vinculan a datasets mediante `public.template_dataset_links`; el mapping de variables se gobierna desde `/datasets` con keys canonicas en `schema_json.columns[].key`, y `/generate` solo lista datasets asociados y sincronizados.  
**Etiquetas por Cajas**: La cantidad de cajas vive en `product_references.ref_attrs.q_package`; para `2+ CAJAS`, `product_references.weight_kg` usa JSONB `{ weights_kg, peso_total }` y las etiquetas se expanden temporalmente con `partes_texto` (`Caja 1/2`) sin duplicar registros.  
**Filtro de Busqueda Persistente en Generar**: Implementacion de un filtro de texto por nombre/color en `/generate` con persistencia al cambiar familia o referencia y limite dinamico de consulta.  
**RBAC v1 y Seguridad Supabase**: Supabase Auth sigue como autenticacion; la autorizacion vive en `public.user_profiles`, guards server-side y RLS. `admin` conserva acceso total; `production` accede a `/print` y `/productive-modules`; `designer` accede a `/product-design`; `pending` e `engineering` quedan sin modulos activos.
**Informacion Productiva de Productos V1**: Se inicio el frente universal de LDM/BOM SAP + documentos productivos. La LDM base vive en `product_references.product_bom_structure`, componentes no `V` en `component_items`, overrides en `global_version_rules.bom_overrides`/`product_versions.bom_overrides`, y la resolucion por SKU/color en `resolved_bom_for_sku`. Las hojas de ruta nuevas usan `product_route_documents`; `hojas_de_ruta` queda como legado/referencia.

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
- **RBAC v1**: roles `admin`, `production`, `pending`, `designer`, `engineering` desde `public.user_profiles`. `admin` todo; `production` accede a `/print` y `/productive-modules`; `designer` accede a `/product-design`; `pending` e `engineering` redirigen a `/access-pending` mientras no tengan modulos activos.
- **Base de Datos**: Prisma ORM con SQLite (local) y Supabase (Cloud).
- **Prisma Client (REGLA)**: el cliente se genera en `src/generated/prisma`; en `src/`, importar tipos desde `@/generated/prisma/client` y acceso DB desde `@/lib/prisma`. `@prisma/client` queda bloqueado por `npm run check:diff` para evitar fallos en Vercel clean install.
- **IA externa (estado actual)**: no hay integraciones activas de IA generativa por API en runtime; no asumir Gemini u otro proveedor salvo que reaparezca implementacion real en `src/` o rutas del app.
- **SAP Service Layer Runtime**: `/consulta-sap` y `/api/sap/**` consultan SAP B1 Service Layer server-side via `src/lib/sap/serviceLayer.ts` (`Items` y `ProductTrees`). Usar Node/HTTPS para diagnostico; `Invoke-WebRequest` puede dar falsos `400`. Escrituras SAP se activan/inactivan desde `/configuration` con `app_settings.sap_writes_enabled` y mantienen dry-run/confirmacion humana. `ProductTrees.ProductTreeLines[].IssueMethod` define emision Manual (`M`) o Backflush/bajo notificacion (`B`); para MPs centrales, manual sin consumo oportuno puede ocultar necesidades reales a abastecimiento. Ver KI `sap_service_layer_item_master_and_bom`.
- **Supabase Source of Truth (REGLA)**: El proyecto Supabase operativo de este repo es siempre **I+D** (`nbifmxggfusipomspoly`, `https://nbifmxggfusipomspoly.supabase.co`). Toda migracion, RPC, SQL check, schema inspection o mutacion por MCP debe apuntar por defecto a ese proyecto.
- **Confirmacion de Migraciones Supabase (REGLA)**: Si una tarea requiere DDL/RPC/triggers/views/indices/RLS/backfills, el agente debe explicar migraciones, impacto, riesgos, plan y verificacion, y pedir confirmacion explicita antes de aplicar; excepcion solo si el usuario pide ejecutarlas directamente en el mismo mensaje.
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
- **Plantillas con datasets externos**: `/print`, igual que `/generate`, debe respetar `plantillas_doc_tec.data_source`; datasets externos consultan `custom_dataset_rows`/`template_dataset_links`, mientras `core_firplak` usa `v_ui_generate_list` con `brand_scope`.
- **Variables runtime de impresion**: las plantillas pueden usar `{print_datetime}` y `{of_number}`; la OF se captura en `/print` solo cuando la plantilla la usa, exige exactamente 4 digitos y permite multiples OF por registro, cada una con copias propias, sin duplicar datos en BD.
- **Sidebar honesto**: no mantener indicadores de "Estado de Servicios" si no estan conectados a mediciones reales; `I. Artificial` y `Archivos` fueron retirados por ser placeholders sin telemetria efectiva.
- **Gobernanza de calidad en `src/`**: no usar suppressions como salida facil. Si aparecen deudas de lint/TS en flujos sensibles (`/generate`, `/templates/builder`, `/new`, `/assets`), resolver con tipado, helpers y estado derivado, manteniendo cambios de superficie minima.
- **Busquedas admin sobre catalogo**: en editores que consultan `v_ui_generate_list`, empujar filtros selectivos/keyword al SQL antes de mapear o filtrar en memoria. Timeouts `57014` pueden venir de calcular la vista completa, no de demasiados resultados finales. Ver KI `admin_catalog_search_performance`.
- **Pendientes (`/pending`)**: el KPI de Home y la pantalla de pendientes usan RPC estructural paginado en Supabase; no volver al barrido TypeScript inicial. El escaneo real de conflictos de traduccion queda bajo boton/modal para evitar timeouts. Ver KI `pending_structural_rpc_and_translation_scan`.
- **Gobernanza de Contexto (REGLA)**: El agente debe avisar proactivamente al usuario de archivar la sesion (`/archive-session`) tras hitos importantes.

## Proximos Pasos (Sugerencia)
1. **Piloto BOM SAP**: Importar manualmente los 3 SKUs piloto (`VBAN12-0081-000-0437`, `VROP03-0001-000-0100`, `VCOC01-0066-000-0437`) y comparar `resolved_bom_for_sku` contra SAP.
2. **Hojas de ruta productivas**: Probar edicion en `/product-design/route-sheets/furniture` y vista/impresion carta en `/productive-modules/route-sheets/furniture`.
3. **Escrituras SAP controladas**: Validar desde `/configuration` que `sap_writes_enabled` active/inactive PATCH/POST reales y que el flujo conserve dry-run + confirmacion humana.
4. **Overrides BOM reales**: Probar `replace_line`, `add_line`, `remove_line` con casos vigentes de manija/riel/bisagra antes de ampliar a creacion de codigos.
5. **Subestructuras profundas**: Completar expansion recursiva de `item_bom_structure` para subproducidos, kits y estructuras inventariables/no inventariables.
6. **Impresion USB en produccion**: Probar impresion real con una etiqueta SamiGen desde `/print`.
7. **Mostrar estado USB en PrintClient**: Agregar indicador visual en la UI cuando el agente este online.
8. **Migracion de base de datos**: Mover los modelos de Prisma de SQLite a PostgreSQL (Supabase).
9. **Mantenimiento de secretos MCP**: Usar `node execution/sync_mcp_config.js` para mantener las claves de Antigravity sincronizadas con el `.env`.

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
