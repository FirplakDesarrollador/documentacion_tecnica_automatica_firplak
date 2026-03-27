---
name: supabase-bulk-rpc
description: Guía maestra para implementar CUALQUIER operación masiva (bulk) en Supabase para el proyecto Firplak. Establece el patrón genérico para actualizar múltiples variables (status, rh, zona, etc.) o ejecutar lógica compleja (nombres, traducciones) en batches de alto rendimiento. Elimina errores 429 y bypass de RLS mediante SECURITY DEFINER.
---

# Supabase Bulk RPC: El Estándar de Alto Rendimiento 🚀

Este skill define el patrón oficial para cualquier actualización masiva en Firplak. Se debe usar para evitar errores de red y límites de API cuando se procesan muchos productos simultáneamente.

## ¿Cuándo usar este patrón?

Usa este patrón para cualquier cambio que afecte a **más de 10 productos**:
- **Cambios Simples**: Cambiar `status` de 100 productos a "INACTIVO".
- **Cambios Múltiples**: Cambiar `rh`, `canto` y `zona` de 50 productos a la vez.
- **Lógica Compleja**: Recalcular nombres (`final_name_es`/`en`) basados en reglas de negocio.

---

## 1. El Patrón Genérico (Multi-Atributo)

Para actualizaciones simples de variables (ej: lo que hace la pantalla de "Edición Masiva"), usa una función que reciba un JSON de cambios.

### SQL Template: `bulk_update_products_json`

```sql
CREATE OR REPLACE FUNCTION public.bulk_update_products_json(
    product_ids uuid[],
    updates jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    prod_id uuid;
    processed_count int := 0;
    updated_count   int := 0;
    attr_name       text;
    attr_value      text;
    allowed_columns text[] := ARRAY['status', 'zone_home', 'designation', 'rh', 'canto_puertas', 'assembled_flag', 'validation_status', 'special_label'];
BEGIN
    -- 1. Validaciones
    IF product_ids IS NULL OR updates IS NULL THEN RETURN jsonb_build_object('error', 'Missing inputs'); END IF;

    -- 2. Iterar productos
    FOREACH prod_id IN ARRAY product_ids LOOP
        -- Construir el UPDATE dinámico solo con columnas permitidas
        FOR attr_name, attr_value IN SELECT * FROM jsonb_each_text(updates) LOOP
            IF attr_name = ANY(allowed_columns) THEN
                EXECUTE format(
                    'UPDATE public.cabinet_products SET %I = $1, updated_at = now() WHERE id = $2',
                    attr_name
                ) USING attr_value, prod_id;
                
                IF FOUND THEN updated_count := updated_count + 1; END IF;
            END IF;
        END LOOP;
        processed_count := processed_count + 1;
    END LOOP;

    RETURN jsonb_build_object('processed', processed_count, 'updated_', updated_count);
END;
$$;
```

---

## 2. El Patrón de Inteligencia (Lógica de Negocio)

Para cambios que requieren "pensar" (como el nombrado o la traducción), la lógica debe vivir dentro del loop de la función SQL para maximizar la velocidad.

### Ejemplo: Traducción Masiva (Nombres en Inglés)

```sql
-- Dentro del loop de la función RPC:
-- 1. Obtener nombre en español
-- 2. Buscar en la tabla de glosario las traducciones
-- 3. Reemplazar términos
-- 4. Guardar en final_name_en
```

---

## 3. Implementación en el Código (Server Action)

Cada operación masiva debe tener su propia Server Action en `src/app/products/bulk-actions.ts`:

```typescript
export async function applyBulkChangesAction(ids: string[], updates: any) {
    // 1. Validar sesión/permisos (próximamente)
    // 2. Ejecutar RPC en batches de 100
    const { data, error } = await supabase.rpc('bulk_update_products_json', {
        product_ids: ids,
        updates: updates
    });
    // 3. Retornar resultados para el UI (barra de progreso)
}
```

---

## Reglas de Oro para el Agente

1. **Eficiencia**: Si el cambio se puede hacer con una sola sentencia SQL (ej: `UPDATE ... WHERE id = ANY(...)`), hazlo así en lugar de un loop `FOREACH`. Solo usa el loop si hay lógica compleja por cada producto.
2. **Seguridad**: Nunca permitas nombres de columna dinámicos sin una `allowed_columns` (lista blanca).
3. **Feedback**: El RPC siempre debe devolver un objeto JSON con el conteo de éxitos y fallos.
4. **UI**: Siempre informa al usuario sobre el progreso real mediante el patrón de batches.

---

## Estado Actual del Sistema

- **Nombres (ES)**: Ya migrado a RPC (`bulk_update_product_names`).
- **Edición Masiva Variables**: Pendiente de migrar (usa loop lento en TS). -> **Implementar con `bulk_update_products_json`**.
- **Traducción (EN)**: Pendiente de migrar. -> **Implementar con `bulk_update_translations_rpc`**.
