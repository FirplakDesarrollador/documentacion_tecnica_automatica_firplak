# PRD: SamiGen - Sistema Automático de Generación de Etiquetas Técnicas

**Versión:** 1.0  
**Fecha:** 2026-05-28  
**Estado:** Borrador  

---

## 1. Resumen Ejecutivo

SamiGen es una plataforma web para la gestión de un catálogo maestro de productos industriales (fabricación de muebles y cocinas) y la generación automatizada de documentación técnica (etiquetas, fichas técnicas, documentos de exportación). El sistema reemplaza procesos manuales propensos a errores con un motor de naming inteligente, reglas configurables y generación masiva de documentos vía Puppeteer.

---

## 2. Objetivos del Producto

| Objetivo | Descripción |
|---|---|
| Centralizar catálogo de productos | Unificar SKU, versiones, referencias, familias y colores en una sola fuente de verdad |
| Automatizar generación de nombres | Motor de reglas + traducción bilingüe (ES/EN) para generar nombres de producto consistentes |
| Generar documentación técnica | Exportación masiva de etiquetas y documentos técnicos en PDF/JPG |
| Soportar etiquetado privado | Gestión de productos con marca blanca para clientes externos |
| Proveer herramientas de importación masiva | Pipelines para carga de productos e isométricos vía Excel/CSV |

---

## 3. Usuarios y Roles

| Rol | Descripción | Necesidades principales |
|---|---|---|
| Administrador de catálogo | Gestiona productos, familias, colores, clientes | CRUD completo, edición masiva, importación |
| Diseñador de plantillas | Crea y mantiene plantillas de documentos | Editor visual drag-and-drop, variables dinámicas |
| Operador de generación | Genera documentación técnica masiva | Filtros de búsqueda, selección de plantillas, validación previa |
| Ingeniero de reglas | Configura reglas de nombrado y traducción | Editor de reglas, prioridades, pruebas |
| Superadmin | Configuración global del sistema | Versiones, reglas de color, importación masiva, datasets |

---

## 4. Funcionalidades (Épicas)

### Épica 1: Gestión de Catálogo Maestro

| Funcionalidad | Prioridad | Descripción |
|---|---|---|
| CRUD de Productos (SKU) | P0 | Crear, editar, ver y eliminar productos con todos sus atributos técnicos |
| Editor de SKU Masivo | P1 | Editar atributos a nivel de SKU en lote |
| Editor de Versiones | P1 | Editar atributos a nivel de versión de producto |
| Editor de Referencias | P1 | Edición masiva de referencias con mutaciones JSONB |
| Gestión de Familias | P0 | CRUD de familias con atributos por defecto (RH, assembled, etc.) |
| Gestión de Colores | P0 | Catálogo de colores con códigos SAP |
| Gestión de Clientes | P1 | Clientes de marca privada con logo |

**Criterios de aceptación:**
- El usuario puede crear un producto completo desde una interfaz web
- El parsing de código SAP extrae automáticamente familia, referencia, versión y color
- Las ediciones masivas vía reference-editor persisten en producción usando mutaciones JSONB atómicas

### Épica 2: Motor de Naming Inteligente

| Funcionalidad | Prioridad | Descripción |
|---|---|---|
| Reglas de nombrado (ES) | P0 | Sistema de reglas con condiciones booleanas para generar `final_name_es` |
| Traducción adaptativa (EN) | P1 | Motor de 700+ líneas que genera `final_name_en` vía glosario bilingüe |
| Editor de reglas | P1 | UI para crear/editar reglas con prioridad, condiciones y acciones |
| Validador de productos | P1 | Verifica que un producto cumple los requisitos para generar documentación |

**Criterios de aceptación:**
- Las reglas se evalúan en orden de prioridad; la primera regla que cumple las condiciones se aplica
- El motor de traducción soporta 3 comportamientos: `translate_and_emit`, `classify_and_resolve`, `conditional_emit`
- El validador reporta estados: `incomplete`, `ready`, campos faltantes, isométricos faltantes

### Épica 3: Diseñador de Plantillas

| Funcionalidad | Prioridad | Descripción |
|---|---|---|
| Editor visual de plantillas | P0 | Lienzo drag-and-drop con elementos de documento |
| Elementos dinámicos | P0 | Texto, códigos de barras (EAN/UPC/CODE128), imágenes, isométricos, iconos |
| Variables de datos | P0 | Vinculación de campos de producto a elementos de plantilla |
| CRUD de plantillas | P0 | Crear, duplicar, editar, eliminar plantillas |

**Criterios de aceptación:**
- El usuario puede arrastrar elementos al lienzo y posicionarlos libremente
- Las variables de plantilla se resuelven con datos reales del producto en vista previa
- Soporta múltiples formatos de exportación por plantilla

### Épica 4: Generación y Exportación de Documentos

| Funcionalidad | Prioridad | Descripción |
|---|---|---|
| Búsqueda de productos con filtros | P0 | Búsqueda híbrida cliente/servidor por nombre, color, familia |
| Panel de exportación masiva | P0 | Selección múltiple de productos × plantillas para generar documentos |
| Validación previa a exportación | P1 | Advertencias sobre productos incompletos antes de generar |
| Exportación PDF | P0 | Generación de PDF vía Puppeteer (local o serverless Vercel) |
| Exportación JPG | P1 | Generación de imágenes JPG |
| Vista previa | P1 | Previsualización del documento antes de exportar |

**Criterios de aceptación:**
- El usuario puede seleccionar 200+ productos y generar documentos en lote
- Los PDFs generados son visualmente idénticos a la vista previa
- Puppeteer funciona tanto en desarrollo local (Chrome) como en Vercel (`@sparticuz/chromium`)

### Épica 5: Gestión de Isométricos

| Funcionalidad | Prioridad | Descripción |
|---|---|---|
| Biblioteca de isométricos | P1 | Galería de imágenes técnicas 3D con búsqueda |
| Asociación inteligente | P1 | Sugerencias automáticas de emparejamiento isométrico → producto |
| Importación masiva | P1 | Pipeline completo: previsualización, preparación, carga, resolución de conflictos |
| Detección de huérfanos | P2 | Identificar productos sin isométrico asignado |

### Épica 6: Importación Masiva de Datos

| Funcionalidad | Prioridad | Descripción |
|---|---|---|
| Importación de productos (V6) | P0 | Pipeline Excel/CSV con previsualización, validación y ejecución |
| Importación de isométricos | P1 | Pipeline para imágenes isométricas en lote |
| Descarga de plantilla | P0 | Generación de archivo Excel/CSV con formato correcto |
| Datasets personalizados | P2 | Importación de datos arbitrarios para usar en plantillas |

### Épica 7: Administración y Configuración

| Funcionalidad | Prioridad | Descripción |
|---|---|---|
| Glosario bilingüe | P1 | Diccionario ES→EN para el motor de traducción |
| Reglas de color | P1 | Configuración de reglas específicas para colores |
| Reglas de versión | P1 | Configuración de reglas específicas para versiones |
| Configuración de importación masiva | P2 | Ajustes del pipeline de importación |

---

## 5. Requerimientos No Funcionales

| Categoría | Requerimiento |
|---|---|
| Performance | La generación de documentos para 200+ productos debe completarse en < 5 minutos |
| Escalabilidad | Soporte para catálogo de 50,000+ SKUs |
| Disponibilidad | 99.5% uptime (Vercel SLA) |
| Seguridad | Autenticación vía Supabase Auth; sin hardcodeo de secretos |
| SEO | No aplica (B2B, requiere autenticación) |
| Accesibilidad | Navegación por teclado, contraste suficiente, etiquetas ARIA |
| Compatibilidad | Chrome, Firefox, Edge, Safari (últimas 2 versiones) |
| Mobile | Navegación responsive con menú hamburguesa (Sheet) |
| Idioma | UI en español (México); datos bilingües (ES/EN) |

---

## 6. Stack Tecnológico

| Capa | Tecnología |
|---|---|
| Framework | Next.js 16, React 19, TypeScript 5 |
| UI | Tailwind CSS v4, shadcn/ui, Radix UI, Base UI |
| Base de datos | Prisma ORM + SQLite (local) / Supabase PostgreSQL (producción) |
| Autenticación | Supabase Auth con Proxy Pattern |
| IA | Google Gemini (`@google/genai`) |
| Exportación | Puppeteer, jsbarcode, @sparticuz/chromium |
| Archivos | Excel/CSV via exceljs, papaparse |
| Despliegue | Vercel (serverless) |

---

## 7. Métricas de Éxito (KPIs)

| KPI | Objetivo | Cómo se mide |
|---|---|---|
| Tiempo de generación de documentos | < 5 min para 200 productos | Logs de exportación |
| Precisión de nombres generados | 100% (reglas correctas) | Auditorías periódicas |
| Productos con documentación completa | > 90% del catálogo | Dashboard de pendientes |
| Tiempo de onboarding de nuevo SKU | < 2 min desde creación hasta documento listo | Time-to-document tracking |
| Reducción de errores de naming | 0 errores por reglas mal configuradas | Validación previa a exportación |

---

## 8. Dependencias y Restricciones

- **Dependencias externas:** Supabase (DB + Auth), Google Gemini (traducción), Chrome/Chromium (Puppeteer), Vercel (hosting)
- **Restricciones técnicas:** Serverless functions tienen límite de tiempo de ejecución (10s en plan Hobby, 60s en Pro); la generación de documentos debe ser asíncrona o dividida en chunks
- **Datos legacy:** No usar tabla `cabinet_products` para lógica de negocio; usar tablas del catálogo maestro (`product_skus`, `product_versions`, `product_references`, `families`)

---

## 9. Hitos y Roadmap

| Hito | Fecha estimada | Entregable |
|---|---|---|
| V6 Final (estado actual) | Completado | Catálogo maestro, motor de naming, diseño de plantillas, exportación PDF básica |
| V6.1 - Mejoras de estabilidad | Q2 2026 | Robustez en importación, validación mejorada, caché |
| V6.2 - Datasets y reglas avanzadas | Q3 2026 | Datasets personalizados, reglas de versiones, dashboard de métricas |
| V7.0 - API pública y webhooks | Q4 2026 | API REST para integraciones externas, webhooks de eventos |

---

## 10. Riesgos y Mitigaciones

| Riesgo | Impacto | Probabilidad | Mitigación |
|---|---|---|---|
| Breaking changes en Next.js 16 | Alto | Media | Pruebas exhaustivas en staging antes de actualizar |
| Límites de serverless (tiempo/memoria) | Alto | Alta | Exportación asíncrona con colas de jobs |
| Datos inconsistentes entre SQLite y Supabase | Medio | Media | Pruebas con ambos motores de base de datos |
| Dependencia de Gemini AI para traducción | Medio | Baja | Fallback a reglas básicas si la API no responde |
| Rotación de secretos (API keys) | Alto | Baja | MCP config sync automatizado, sin hardcodeo |

---

## 11. Glosario

| Término | Definición |
|---|---|
| SKU | Stock Keeping Unit; código único de producto |
| Isométrico | Dibujo técnico 3D del producto |
| RH/LH | Right Hand / Left Hand; configuraciones de apertura |
| CARB2 | Regulación de emisiones de formaldehído |
| Marca privada | Productos fabricados para ser vendidos bajo la marca del cliente |
| Naming Engine | Motor que genera nombres de producto basado en reglas |
| ComposedProduct | Modelo unificado que combina datos de SKU, versión, referencia y familia |
