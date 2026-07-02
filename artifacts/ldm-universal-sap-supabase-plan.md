# Plan: LdM universal SAP -> Supabase -> aplicativo

Fecha: 2026-07-01

## Objetivo

Definir una estructura minima, relacional y escalable para gestionar listas de materiales
(LdM/BOM) desde SAP hacia Supabase y el aplicativo, sin crear modelos separados por
familia o tipo de producto.

La idea central es que el modelo sea ciego al tipo de producto: mueble, marmol sintetico,
fibra de vidrio, quartzstone u otros procesos deben representarse con la misma estructura:

- item padre
- item hijo
- cantidad
- unidad
- almacen/proceso
- metodo de emision
- nivel/ruta del arbol
- snapshots/auditoria de SAP

## Correccion conceptual importante

El modelo no debe copiar la repeticion de SAP como modelo inteligente final.

Hay que separar dos capas:

1. Capa espejo/cache de SAP:
   - Sirve para leer SAP fielmente.
   - Sirve para comparar, auditar y aprender.
   - Puede tener una LdM por cada codigo SAP porque SAP funciona asi.
   - No es la fuente inteligente de edicion futura.

2. Capa inteligente del aplicativo:
   - Es la fuente futura para crear/editar productos y luego enviar a SAP.
   - Debe vivir por referencia, version y SKU, como el catalogo actual.
   - Evita repetir toda la LdM cuando solo cambia color, tablero, canto u otro detalle.
   - Usa selectores/roles de material y overrides puntuales para resolver el item SAP
     concreto que corresponde a cada SKU.

Ejemplo:

- La referencia define que lleva un tablero principal, un canto 0.45 mm, un canto 2 mm,
  herrajes, empaques y sub-estructuras.
- La version cambia detalles tecnicos si aplica.
- El SKU/color resuelve el tablero y cantos concretos de SAP segun color y reglas.
- SAP recibira una LdM concreta por codigo `V*`, pero el aplicativo no tiene que guardar
  esa misma LdM repetida como fuente maestra.

## Correccion 2: no duplicar las tablas maestras existentes

El dueño del modelo inteligente ya existe:

```text
product_references -> product_versions -> product_skus
```

Por lo tanto:

- No crear una tabla nueva para representar otra vez la referencia.
- No crear una tabla nueva para representar otra vez la version.
- No crear una tabla nueva para representar otra vez el SKU.

Las columnas nuevas de estado, configuracion, cache o snapshot deben vivir en esas tablas
cuando pertenecen a ese nivel.

Tablas nuevas solo tienen sentido cuando representen algo que las tablas actuales no pueden
representar naturalmente:

- muchas lineas por una referencia/version/SKU
- jerarquia padre/hijo
- items SAP que no son productos vendibles del aplicativo
- auditoria/sincronizaciones
- historico o comparaciones

En otras palabras:

```text
product_references = dueño de la LdM base
product_versions = dueño de cambios de version
product_skus = dueño de resolucion final por color/codigo SAP vendible
tabla de lineas = detalle repetible de componentes
tabla de items SAP no vendibles = componentes, MP, sub-estructuras
```

## Cantidades en sub-estructuras

La cantidad efectiva de un item hijo se calcula multiplicando toda la ruta del arbol.

Ejemplo:

```text
Producto V = 1
  Sub-estructura PEMP = 2
    Lamina carton = 3
```

Consumo por producto:

```text
2 * 3 = 6 laminas de carton
```

Si la orden es por 20 productos:

```text
20 * 2 * 3 = 120 laminas de carton
```

Por eso las lineas deben conservar:

- cantidad por padre
- padre
- hijo
- nivel/ruta

Y una vista o funcion debe calcular:

- cantidad por producto terminado
- cantidad por orden/pedido

## Evidencia consultada

Se consultaron en SAP, en modo lectura, codigos `V*` tomados de los Excels compartidos:

- `VBAN12-0081-000-0437`: mueble Macao.
- `VBAN01-0012-000-0103`: lavamanos marmol sintetico.
- `VHEM05-0007-000-0100`: hidromasaje fibra de vidrio.
- `VQUA02-0018-000-1359`: meson quartzstone.

Hallazgos principales:

- Las cuatro familias caben en un mismo arbol de LdM SAP.
- Los productos vendibles son codigos `V*`, pero la LdM incluye subestructuras internas
  y componentes con prefijos como `PINP`, `PEST`, `PEMP`, `PMPD`, `CMPD`, `CEMP`,
  `PZCO`, `PGEL`, `CQUA`, entre otros.
- Las subestructuras no siempre se comportan igual: algunas son inventariables, otras no;
  algunas son comprables/vendibles, otras solo internas.
- Un mismo componente puede aparecer varias veces en distintas ramas del mismo arbol.
  Por eso las lineas de LdM no pueden deduplicarse solamente por codigo de item.
- El almacen de la linea (`MP-04`, `MP-05`, `MP-03`, `MP-10`, `MP-01`, etc.) contiene
  informacion real de flujo productivo.
- El metodo de emision (`im_Manual`, `im_Backflush`) es informacion operativa de la linea,
  no solo del item.
- De los cuatro codigos de prueba, solo `VBAN12-0081-000-0437` existe hoy en
  `public.product_skus`. Los otros estan en SAP/Excel pero no en el catalogo del app.

## Decisiones de nombre

No usar estos nombres:

- `manufacturing_specs`: demasiado abstracto.
- `manufacturing_spec_nodes`: confuso.
- `manufacturing_material_rules`: demasiado pesado para el MVP.
- `manufacturing_spec_assets`: no necesario inicialmente.

Nombres recomendados para la capa espejo/cache de SAP:

- `sap_component_item_cache`: cache de items SAP que no viven ya como `product_skus`.
- `sap_bom_line_cache`: lineas jerarquicas leidas desde SAP para comparar/auditar.
- `sap_sync_jobs`: auditoria y estado de sincronizaciones, similar conceptualmente a
  `naming_recompute_jobs`.

Nombres recomendados para la capa inteligente del aplicativo:

- columnas nuevas en `product_references` para metadata/estado de LdM base.
- columnas nuevas en `product_versions` para metadata/overrides de version.
- columnas nuevas en `product_skus` para snapshot SAP y cache resuelto por SKU.
- `product_bom_lines`: lineas/componentes de LdM base, porque son muchas por referencia.
- `product_bom_line_overrides`: solo si los overrides necesitan apuntar a lineas
  especificas; si son simples, pueden vivir como JSONB en `product_versions` o
  `product_skus`.

## Relacion con el catalogo actual

El catalogo actual debe seguir siendo:

```text
product_references -> product_versions -> product_skus
```

Ancla principal:

- `product_skus.sku_complete` es el item SAP vendible `V*`.
- Los datos SAP del item vendible no deben duplicarse en una tabla de items separada;
  pueden vivir como snapshot/cache en `product_skus`.

Relaciones sugeridas:

- `product_skus.sap_item_snapshot jsonb`: payload resumido/normalizado de SAP para el
  codigo `V*`.
- `product_skus.sap_bom_snapshot jsonb`: encabezado/resumen de LdM SAP si se necesita
  cachear la comparacion.
- `sap_component_item_cache.item_code`: items SAP no vendibles o no representados en
  `product_skus`.
- `product_bom_lines.reference_id`: lineas base de la referencia.
- `product_bom_line_overrides.version_id`: cambios puntuales de version si no caben en
  `product_versions.bom_overrides`.
- `product_bom_line_overrides.sku_id`: cambios puntuales de SKU/color si no caben en
  `product_skus.bom_resolution_overrides`.

Relacion inteligente:

```text
product_references
  -> product_bom_lines (base de referencia)
  -> product_versions
      -> bom_overrides jsonb o product_bom_line_overrides
      -> product_skus
          -> bom_resolved_cache jsonb o resolved lines calculadas
          -> SAP ProductTrees cuando se publique a SAP
```

Si un mueble cambia solo por color:

- No se duplica la plantilla completa.
- La plantilla mantiene lineas variables como `tablero_principal`, `canto_2mm`,
  `canto_045mm`.
- El SKU resuelve esos roles a codigos SAP concretos segun `color_code`, proceso,
  familia, tipo de material y overrides.

## Tablas propuestas

### Columnas sugeridas en tablas existentes

#### `product_references`

Responsabilidad adicional: ser dueño de la LdM base inteligente.

Columnas candidatas:

- `bom_status text null`
- `bom_base_attrs jsonb not null default '{}'::jsonb`
- `bom_validation_status text null`
- `bom_last_reviewed_at timestamptz null`

La lista de componentes no debe guardarse como columnas fijas aqui porque una referencia
puede tener muchas lineas, sub-estructuras y jerarquias. Para eso existe `product_bom_lines`.

#### `product_versions`

Responsabilidad adicional: guardar cambios de version sobre la LdM base.

Columnas candidatas:

- `bom_overrides jsonb not null default '{}'::jsonb`
- `bom_validation_status text null`

Si el override debe apuntar a una linea especifica, usar `product_bom_line_overrides`.

#### `product_skus`

Responsabilidad adicional: guardar resolucion final por color/SKU y snapshot SAP del
codigo vendible.

Columnas candidatas:

- `sap_item_snapshot jsonb not null default '{}'::jsonb`
- `sap_bom_snapshot jsonb not null default '{}'::jsonb`
- `bom_resolved_cache jsonb not null default '{}'::jsonb`
- `bom_resolved_at timestamptz null`
- `sap_synced_at timestamptz null`
- `sap_sync_status text null`

### `sap_component_item_cache`

Responsabilidad: almacenar maestro SAP de items que no viven en `product_skus`.

Ejemplos:

- materias primas
- herrajes
- empaques
- sub-estructuras internas
- costos/procesos

No debe duplicar los `V*` que ya existen como `product_skus`.

Columnas base:

- `item_code text primary key`
- `item_name text`
- `foreign_name text null`
- `items_group_code integer null`
- `inventory_item boolean null`
- `sales_item boolean null`
- `purchase_item boolean null`
- `valid boolean null`
- `frozen boolean null`
- `u_inventariable text null`
- `u_area text null`
- `u_prefijo text null`
- `u_version text null`
- `u_color text null`
- `u_linea text null`
- `u_familia text null`
- `u_type_oc text null`
- `u_grupo text null`
- `u_articulo_toc text null`
- `source_payload jsonb not null default '{}'::jsonb`
- `last_synced_at timestamptz not null default now()`

Notas:

- Esta tabla reemplaza conceptualmente a `Piezas_Muebles` para el futuro.
- `Piezas_Muebles` puede quedar como tabla legacy/importada, pero no como fuente
  estrategica final.
- No reemplaza ni duplica `product_skus`.

### `sap_bom_line_cache`

Responsabilidad: guardar lineas `ProductTreeLines` reales de SAP para comparacion,
auditoria y aprendizaje.

En SAP, una LdM se consulta como:

```text
ProductTrees('VBAN12-0081-000-0437')
```

Ese objeto tiene campos de encabezado como `TreeCode`, `ProductDescription`, `TreeType`,
`Quantity` y una lista de `ProductTreeLines`.

Cada linea representa algo como:

```text
Padre: VBAN12-0081-000-0437
Hijo: CMPD06-0005-000-0437
Cantidad: 4.06
Almacen: MP-04
Metodo emision: im_Manual
```

Si el hijo tambien tiene LdM, se convierte en sub-estructura y sus hijos quedan en otro
nivel del arbol.

Columnas base:

- `id uuid primary key default gen_random_uuid()`
- `root_item_code text not null`
- `parent_item_code text not null`
- `child_item_code text not null`
- `level integer not null`
- `child_num integer null`
- `path text not null`
- `quantity numeric not null`
- `inventory_uom text null`
- `warehouse text null`
- `issue_method text null`
- `price numeric null`
- `currency text null`
- `comment text null`
- `line_payload jsonb not null default '{}'::jsonb`
- `sync_job_id uuid null references sap_sync_jobs(id)`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Indices recomendados:

- `(root_item_code)`
- `(parent_item_code)`
- `(child_item_code)`
- `(warehouse)`
- `(issue_method)`

Importante:

- No usar `unique(child_item_code)` porque el mismo item puede repetirse en varias ramas.
- Si se quiere prevenir duplicados exactos de sync: usar unique compuesto por
  `(root_item_code, parent_item_code, child_item_code, level, child_num, path)`.

### `sap_sync_jobs`

Responsabilidad: auditar cada sincronizacion.

Columnas base:

- `id uuid primary key default gen_random_uuid()`
- `sync_type text not null`
- `status text not null`
- `started_at timestamptz not null default now()`
- `finished_at timestamptz null`
- `requested_by text null`
- `root_item_codes text[] null`
- `items_read integer not null default 0`
- `bom_headers_read integer not null default 0`
- `bom_lines_read integer not null default 0`
- `error_message text null`
- `metadata jsonb not null default '{}'::jsonb`

### `product_bom_lines`

Responsabilidad: lineas base no repetidas.

Una linea puede apuntar a:

- un item SAP fijo
- una sub-estructura
- un rol/selector de material que se resuelve despues por color/proceso/familia

Columnas base:

- `id uuid primary key default gen_random_uuid()`
- `reference_id uuid not null references product_references(id) on delete cascade`
- `parent_line_id uuid null references product_bom_lines(id)`
- `line_order integer not null default 0`
- `component_kind text not null`
- `sap_item_code text null`
- `component_role text null`
- `quantity numeric not null`
- `uom text null`
- `warehouse text null`
- `issue_method text null`
- `selector jsonb not null default '{}'::jsonb`
- `attrs jsonb not null default '{}'::jsonb`

Ejemplos de `component_kind`:

- `fixed_item`
- `material_selector`
- `substructure`
- `process_cost`

Ejemplos de `component_role`:

- `main_board`
- `back_panel`
- `edge_2mm`
- `edge_045mm`
- `hardware_kit`
- `packaging_box`

### `product_bom_line_overrides`

Responsabilidad: manejar excepciones por version/SKU/color sin repetir la plantilla completa.

Columnas base:

- `id uuid primary key default gen_random_uuid()`
- `bom_line_id uuid not null references product_bom_lines(id) on delete cascade`
- `version_id uuid null references product_versions(id)`
- `sku_id uuid null references product_skus(id)`
- `color_code text null references colors(code_4dig)`
- `override_kind text not null`
- `override_payload jsonb not null`
- `reason text null`
- `active boolean not null default true`
- `created_at timestamptz not null default now()`

Ejemplos:

- cambiar item SAP resuelto para un color historico mal creado
- cambiar cantidad en una version especial
- quitar/agregar una linea para marca propia

Si los overrides son simples y no necesitan apuntar linea por linea, preferir
`product_versions.bom_overrides` o `product_skus.bom_resolution_overrides`.

## Assets y hojas de ruta

Usar `product_asset_links` para documentos, SVG, instructivos e imagenes relacionadas
con producto, referencia, version, SKU, familia o proceso.

No crear `manufacturing_asset_links` en el MVP.

Para hojas de ruta de muebles:

- No usar `public.hojas_de_ruta` como fuente final.
- Tratar la hoja de ruta como documento/producto de proceso de muebles.
- Relacionarla via `product_asset_links` si es archivo/render/SVG/PDF.
- Si luego se extrae estructura interna de la hoja de ruta, crear tablas especificas
  de rutas de produccion, no mezclarla con `sap_bom_line_cache`.

## Atributos derivados

Hoy existen datos manuales en `ref_attrs`, por ejemplo:

- `accessory_text`
- `bisagras`
- `canto_puertas`
- `rh`
- `carb2`
- `door_color_text`

Estrategia:

- No borrar estos campos en el MVP.
- Crear una capa de derivacion que lea `product_bom_lines`, `sap_bom_line_cache`,
  `sap_component_item_cache` y snapshots SAP de `product_skus`.
- Comparar derivado vs manual.
- Cuando la derivacion sea confiable, esos campos pasan a ser cache/override, no fuente
  principal.

Ejemplos:

- `cierre_lento`: derivado por presencia de ciertos rieles/bisagras en la LdM.
- `rfe`: derivado por componentes/prefijos de herrajes.
- `canto_puertas`: derivado por componentes `CANTO PVC ... 2MM`, `0,45MM`, etc.
- `rh`/`carb2`: derivado por tableros/fondos presentes.
- `q_package`: derivado por empaques/cajas en LdM o por regla de empaque.

## Vistas sugeridas

### `v_sap_bom_tree_flat`

Vista plana para consultar LdM completa por root:

- root item
- parent item
- child item
- level
- path
- quantity
- warehouse
- issue method
- descripciones y campos U_* de padre/hijo

### `v_product_sap_bom_status`

Vista de control:

- SKU existe en app
- item existe en SAP
- LdM existe en SAP
- LdM sincronizada
- fecha ultima sync
- diferencias basicas de nombre/color/version

### `v_product_derived_attrs`

Vista o tabla materializada de atributos calculados:

- `sku_complete`
- `derived_attrs jsonb`
- `confidence jsonb`
- `source_summary jsonb`
- `computed_at`

Esta vista luego puede alimentar `v_ui_generate_list` o `buildEffectiveProductContext`.

## Flujo MVP recomendado

1. Crear tablas SAP read-only en Supabase.
2. Implementar sync recursivo desde SAP Service Layer:
   - leer `Items`
   - leer `ProductTrees`
   - recorrer subestructuras
   - guardar headers/lines
   - auditar en `sap_sync_runs`
3. Sincronizar primero los 4 codigos de prueba.
4. Construir vista plana `v_sap_bom_tree_flat`.
5. Construir comparador contra:
   - `product_skus`
   - `product_references.ref_attrs`
   - `product_versions.version_attrs`
   - `product_skus.sku_attrs`
6. Proponer derivadores iniciales solo para muebles:
   - RFE/cierre lento
   - bisagras
   - canto
   - tablero/fondo/RH/CARB2
7. Ampliar derivadores a marmol/fibra/quartzstone sin cambiar tablas base.

## Lo que no se debe hacer al inicio

- No guardar LdM completa dentro de `ref_attrs`.
- No crear tablas por familia como `bom_muebles`, `bom_fibra`, `bom_marmol`.
- No hacer SAP writes en el MVP.
- No confiar en Excel como verdad jerarquica cuando SAP ProductTrees contradice la lectura.
- No borrar `ref_attrs` ni nomenclatura actual hasta tener comparador y cobertura.

## Preguntas abiertas

1. Debe Supabase almacenar solo LdM activas o tambien historico de revisiones SAP?
2. Cuando SAP no tenga un codigo en el aplicativo, el sync debe crear un registro pendiente
   de producto o solo reportarlo?
3. Quien aprueba que un atributo derivado reemplace el manual: Diseno, Ingenieria,
   Calidad o Administrador del aplicativo?
4. Para creacion futura de codigos SAP, se necesitara una etapa previa tipo
   `engineering_bom_drafts` antes de escribir en SAP?
5. Las hojas de ruta de muebles deben modelarse como datos editables o conservarse
   primero como render/documento versionado?
