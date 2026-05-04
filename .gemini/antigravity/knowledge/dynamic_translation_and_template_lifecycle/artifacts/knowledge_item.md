# Traducción Dinámica de Zonas y Ciclo de Vida de Plantillas
Last accessed: 2026-05-04T10:31:00-05:00

## 🎯 Objetivo de la Sesión
Eliminar la dependencia de traducciones estáticas (bugs de "Bathroom" forzado) mediante un motor dinámico basado en glosario y mejorar la flexibilidad operativa del diseñador de plantillas permitiendo duplicación con redimensionamiento y edición de metadatos.

## 🛠️ Logros Técnicos

### 1. Motor de Traducción Dinámica (Glosario-First)
- **Resolución On-Demand**: Implementación de `resolveZoneHomeEnAction` en `actions.ts`. Este patrón permite que los componentes de cliente obtengan traducciones técnicas del glosario de Supabase sin persistir datos redundantes en la tabla de productos.
- **Inyección en Pipeline de Hidratación**: Se integró la lógica en `hydrateTemplateElements` (`exportUtils.ts`). Ahora, cualquier documento (Preview, Bulk Export, Post-Save) inyecta `zone_home_en` automáticamente antes de pasar al motor de renderizado.
- **Estado de `technical_description`**: Se identificó que este campo aún tiene una dependencia fuerte del código fuente (`productUtils.ts`). Actualmente se trabaja en desacoplarlo para que sea 100% configurable desde el glosario o reglas de negocio, mejorando la coherencia técnica entre idiomas.

### 2. Flexibilidad en Gestión de Plantillas
- **Duplicación Inteligente**: El proceso de clonado ahora permite sobrescribir `width_mm` y `height_mm` en el momento de la creación. La orientación (horizontal/vertical) se recalcula automáticamente en el servidor.
- **Edición de Metadatos Post-Creación**: Implementación de `EditTemplateDialog`. Permite renombrar y redimensionar plantillas existentes desde la tabla principal sin entrar al editor visual.
- **Protección de Datos**: Se refactorizó `updateTemplate` para que el campo `elements_json` sea opcional. Esto evita que cambios accidentales en el nombre o medidas borren el diseño gráfico de la plantilla.

## 📝 Aprendizajes de Negocio (Firplak)
- **Estandarización Estética**: La zona técnica en inglés debe presentarse siempre en minúsculas (ej: "Zone: bathroom") para mantener la armonía visual de las etiquetas de exportación.
- **Gobernanza de Nomenclatura**: Se refuerza el uso del glosario como única fuente de verdad técnica. El sistema ahora genera alertas de "Missing Terms" para obligar a la alimentación manual de nuevas zonas técnicas, evitando fallbacks genéricos.

## 🚀 Próximos Pasos
- **Configurabilidad de Technical Description**: Mover la lógica de construcción de este string desde `productUtils.ts` hacia el motor de reglas o una configuración de plantilla para que el usuario defina su estructura.
- **Optimización de Caché de Glosario**: Evaluar el impacto en exportaciones de más de 500 registros para asegurar que las llamadas concurrentes a `resolveZoneHomeEnAction` no afecten el rendimiento.
