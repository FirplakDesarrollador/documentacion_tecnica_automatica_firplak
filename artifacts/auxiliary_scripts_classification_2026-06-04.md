# Clasificacion de Scripts Auxiliares - 2026-06-04

## Que significa "tipar"

Tipar = declarar con claridad que forma de datos espera o devuelve un script.

Ejemplos:

- Evitar `any`
- Definir interfaces para filas, payloads y resultados
- Reemplazar imports rotos o ambiguos por imports reales
- Hacer que TypeScript avise antes de que un cambio rompa algo

En la practica, "mantener y tipar" significa:

1. El archivo sigue siendo util para el proyecto.
2. Vale la pena corregirle `any`, imports, rutas y chequeos.

## Criterio usado

- `Mantener y tipar`: archivo con uso operativo actual, referencia viva en docs/workflows o valor claro como herramienta reusable.
- `Legacy`: archivo historico o de soporte puntual. No deberia bloquear el repo ni el flujo normal. Conservar solo mientras se decide si se archiva o se rehace.
- `Candidato de eliminacion`: archivo temporal, duplicado, de prueba puntual, con señales fuertes de obsolescencia o acoplado a logica ya retirada.

## No incluidos como candidatos de borrado directo

- `print-agent/node_modules/`
  Motivo: hoy parece ser parte funcional del agente local; el repo raiz no declara esas dependencias.
- `prisma/data/`
  Motivo: son insumos historicos de carga y no simple codigo auxiliar.

## Mantener y tipar

### Infraestructura activa del print agent

- `print-agent/server.js`
- `print-agent/usbService.js`
- `print-agent/printService.js`
- `print-agent/install-service.js`
- `print-agent/start-agent.bat`
- `print-agent/package.json`
- `print-agent/README.md`

Motivo:

- `npm run dev` y `npm run start:local` arrancan `node print-agent/server.js`.
- `AI_README.md` documenta `server.js`, `usbService.js` y `printService.js` como parte activa del sistema local de impresion.

### Prisma activo

- `prisma/schema.prisma`
- `prisma/seed.ts`

Motivo:

- `schema.prisma` es parte estructural del proyecto.
- `seed.ts` es la version fuente; si se va a seguir usando semilla local, esta es la que conviene conservar y tipar.

### Herramientas de ejecucion realmente vivas o reutilizables

- `execution/version_bump.py`
- `execution/github_operations.py`
- `execution/sync_mcp_config.js`
- `execution/bulk_associate_isometrics.ts`
- `execution/search_product_references.ts`
- `execution/inspect_product_reference.ts`
- `execution/inspect_product_version.ts`
- `execution/normalize_line_endings.mjs`
- `scripts/check_quality_diff.mjs`

Motivo:

- `execution/version_bump.py` esta referenciado por `.agents/workflows/release.md`.
- `execution/github_operations.py` esta referenciado por `directives/github_integration.md`.
- `execution/sync_mcp_config.js` esta referenciado por `AI_README.md`.
- `execution/bulk_associate_isometrics.ts` esta referenciado por `directives/bulk_isometrics_import.md`.
- `search_product_references.ts`, `inspect_product_reference.ts` e `inspect_product_version.ts` tienen interfaz CLI clara y sirven como herramientas de inspeccion reusable, no como experimento puntual.
- `scripts/check_quality_diff.mjs` ya quedo como guardrail del repo.

## Legacy

### Ejecucion historica o administrativa de Supabase / migraciones

- `execution/apply_migration.ts`
- `execution/apply_migration_mass_import_v6.ts`
- `execution/apply_migrations_product_references_drop_product_type.ts`
- `execution/deploy_rpc.ts`
- `execution/migrate_schemas.ts`
- `execution/check_columns.ts`
- `execution/check_constraints.ts`
- `execution/check_schema.ts`
- `execution/check_schema_temp.ts`
- `execution/check_sku_base.ts`
- `execution/list_columns_v2.ts`
- `execution/get_view.ts`
- `execution/analyze_full_keys.ts`
- `execution/analyze_full_schema.ts`
- `execution/inspect_json_keys.ts`

Motivo:

- Pueden servir como referencia historica o rescate tecnico.
- No aparecen como parte del flujo normal actual.
- Varias se pisan con MCP de Supabase o con diagnosticos mas modernos.

### Ejecucion historica de importaciones y auditorias V6

- `execution/compare_missing.ts`
- `execution/delete_product_complete.ts`
- `execution/diagnose_mass_import_p2.ts`
- `execution/fix_isometric_urls_and_names_from_orphans_excel.js`
- `execution/full_audit.ts`
- `execution/generate_final_xlsx.ts`
- `execution/generate_full_template.ts`
- `execution/generate_simplified_xlsx.ts`
- `execution/mass_import_smoke_test_v6.ts`
- `execution/test_mass_update.ts`
- `execution/test_rpcs.ts`
- `execution/README.md`
- `execution/requirements.txt`

Motivo:

- Parecen herramientas de campana, auditoria o soporte de una etapa concreta del proyecto.
- Varias siguen siendo entendibles, pero no estan conectadas a un SOP vigente.

### Scripts historicos que conviene archivar antes de borrar

- `scripts/add_color_code.ts`
- `scripts/analyze_orphans.ts`
- `scripts/apply_historical_patches.ts`
- `scripts/apply_phase1b_fixes.ts`
- `scripts/apply_private_label_db_patch.ts`
- `scripts/apply_sql_batches.ts`
- `scripts/cleanup_test_data.ts`
- `scripts/controlled_update.ts`
- `scripts/create_color_fk.ts`
- `scripts/diag_redundancy.ts`
- `scripts/diagnose_color_fk.ts`
- `scripts/execute_mass_sql.ts`
- `scripts/execute_sql.ts`
- `scripts/fetch_rules_p40.ts`
- `scripts/mass_update_logic.ts`
- `scripts/migrate_assets_to_supabase.ts`
- `scripts/migrate_labels.ts`
- `scripts/migrate_stacking_max.ts`
- `scripts/rename_complete_name.ts`
- `scripts/rename_version_rules.ts`
- `scripts/repair_rules.ts`
- `scripts/run_sync.ts`
- `scripts/sap_pattern_audit.ts`
- `scripts/sap_pattern_audit_v2.ts`
- `scripts/suppress_remaining_anys.ts`
- `scripts/update_colors.ts`
- `scripts/update_definitions.ts`
- `scripts/update_families_data.ts`
- `scripts/update_rules_payload.ts`
- `scripts/update_trigger_labels.ts`
- `scripts/validate_private_label_view.ts`
- `scripts/verify_refinement.ts`

Motivo:

- Tienen valor historico o de mantenimiento puntual.
- Pero no deberian seguir mezcladas con el camino principal del repo.
- Varias necesitan confirmar si aun aplican al esquema actual antes de decidir si se reescriben o se eliminan.

## Candidatos de eliminacion

### Temporales, compilados o duplicados

- `prisma/seed.js`
- `execution/sync_mcp_config.py`
- `execution/write_skill_archive_session_ki_manager.ps1`
- `print-agent/.tmp-test.jpg`
- `print-agent/.tmp-writer-1780410781174.ps1`
- `print-agent/.tmp-zpl-1780410781174.zpl`
- `print-agent/.tmp-zpl-1780411057187.zpl`
- `print-agent/.tmp-zpl-1780412700303.zpl`

Motivo:

- `seed.js` parece artefacto compilado de `seed.ts`.
- `sync_mcp_config.py` duplica al JS que si esta documentado.
- Los `.tmp*` del print agent son residuos de prueba.
- El `.ps1` de `write_skill_archive_session_ki_manager` apunta a una skill global fuera del repo y no al flujo actual del proyecto.

### Pruebas, chequeos y experimentos de una sola vez

- `scripts/_check_cols.ts`
- `scripts/_check_performance.ts`
- `scripts/_check_skus_cols.ts`
- `scripts/_check_tables.ts`
- `scripts/_check_trigger.ts`
- `scripts/_create_composition_view.ts`
- `scripts/_create_product_rpc.ts`
- `scripts/_diag_shaker_rules.ts`
- `scripts/_fetch_affected_skus.ts`
- `scripts/_fetch_rules.ts`
- `scripts/_fix_rfe.ts`
- `scripts/_get_trigger_src.ts`
- `scripts/_replace_view.ts`
- `scripts/_verify_before_fix.ts`
- `scripts/audit_filters_differences.ts`
- `scripts/audit_final_5.ts`
- `scripts/audit_naming_rules.ts`
- `scripts/audit_naming_rules_v2.ts`
- `scripts/audit_private_label_versions.ts`
- `scripts/audit_v6_deep.ts`
- `scripts/audit_v6_global.ts`
- `scripts/audit_v6_quality.ts`
- `scripts/audit_v_families.ts`
- `scripts/check_attrs.ts`
- `scripts/check_colors.ts`
- `scripts/check_cols.ts`
- `scripts/check_columns.ts`
- `scripts/check_legacy_processes.ts`
- `scripts/check_old_cols.ts`
- `scripts/check_old_labels.ts`
- `scripts/check_skus_cols.ts`
- `scripts/check_trigger.ts`
- `scripts/check_view.ts`
- `scripts/check_view_v2.ts`
- `scripts/debug_db_errors.ts`
- `scripts/debug_product.ts`
- `scripts/find_extra.ts`
- `scripts/find_invalid_versions.ts`
- `scripts/find_missing_skus.ts`
- `scripts/final_cleanup_count.ts`
- `scripts/final_closure.ts`
- `scripts/final_mass_update.ts`
- `scripts/generate_global_report.ts`
- `scripts/generate_reports.ts`
- `scripts/get_trigger_code.ts`
- `scripts/inspect_anomalies.ts`
- `scripts/inspect_colors.ts`
- `scripts/inspect_cols.ts`
- `scripts/inspect_legacy.ts`
- `scripts/inspect_refs.ts`
- `scripts/pre_phase2_check.ts`
- `scripts/temp_check_storage.js`
- `scripts/test_code_parser.ts`
- `scripts/test_distinct.ts`
- `scripts/test_filters_migration.ts`
- `scripts/test_form.ts`
- `scripts/test_naming_engine.ts`
- `scripts/test_naming_engine_v2.ts`
- `scripts/test_parsing.ts`
- `scripts/test_sb.ts`
- `scripts/test_translator.ts`

Motivo:

- Por nombre y contenido parecen pruebas locales, exploraciones o diagnosticos de una etapa puntual.
- Muchas muestran imports rotos como `./src/...`, lo que indica que ni siquiera estan listas para el layout actual.
- No aparecen conectadas al flujo normal del repo.

### Fuertemente acoplados a logica legacy retirada

- `execution/mass_import_acceptance_v6.ts`
- `scripts/check_cabinet_deps.ts`
- `scripts/check_cabinet_triggers.ts`
- `scripts/clean_dirty_lines.ts`
- `scripts/composer_certification.ts`
- `scripts/deep_cleanup.ts`
- `scripts/drop_cabinet_products.ts`
- `scripts/intelligent_sap_audit.ts`
- `scripts/phase0_ddl.ts`
- `scripts/phase0_diagnosis.ts`
- `scripts/phase0_etl.ts`
- `scripts/phase0_evidence.ts`
- `scripts/phase0_final_evidence.ts`
- `scripts/phase0_migration.ts`
- `scripts/phase0_schema_refinement.ts`
- `scripts/phase0_validate.ts`
- `scripts/phase1_finalize_regen.ts`
- `scripts/refactor_cabinet_name.ts`
- `scripts/remediation_v6.ts`
- `scripts/update_mueble_rules.ts`

Motivo:

- Contienen muchas señales de nombres o flujos ya migrados (`cabinet_*`, `product_type`, rutas viejas o refactors ya cerrados).
- En vez de mantenerlos "por si acaso", parece mejor borrarlos o, si de verdad se necesitan como memoria tecnica, moverlos a un archivo historico fuera del camino normal.

## Recomendacion de limpieza segura

### Paso 1 - borrar casi sin riesgo

- `prisma/seed.js`
- `execution/sync_mcp_config.py`
- `execution/write_skill_archive_session_ki_manager.ps1`
- `print-agent/.tmp*`

### Paso 2 - sacar del camino principal sin perder historia

- Mover todo lo de la seccion `Legacy` a una carpeta tipo `legacy-scripts/` o `artifacts/legacy-scripts/`.
- Dejar una nota corta con fecha y motivo.

### Paso 3 - eliminar por lotes los candidatos mas obvios

- Lote A: `scripts/_*.ts`, `scripts/test_*.ts`, `scripts/debug_*.ts`, `scripts/temp_*.js`
- Lote B: `scripts/check_*.ts`, `scripts/inspect_*.ts`, `scripts/find_*.ts`, `scripts/final_*.ts`
- Lote C: `scripts/phase0_*.ts`, `scripts/phase1_finalize_regen.ts`, `scripts/pre_phase2_check.ts`
- Lote D: archivos con `cabinet_*` o equivalentes legacy

### Paso 4 - tipar lo que sobreviva

Orden sugerido:

1. `execution/bulk_associate_isometrics.ts`
2. `execution/search_product_references.ts`
3. `execution/inspect_product_reference.ts`
4. `execution/inspect_product_version.ts`
5. `print-agent/server.js`
6. `print-agent/usbService.js`
7. `print-agent/printService.js`
8. `prisma/seed.ts`

## Resumen corto

- `execution/` contiene varias herramientas que aun valen la pena.
- `scripts/` esta mayormente saturado de historicos, pruebas y restos de migraciones.
- Si quieres limpiar en serio, lo mas eficiente es tratar `scripts/` como backlog de depuracion, no como parte estable del producto.
