---
name: Reconocimiento de Patrones UI (Unificación de Opciones)
description: Habilidad para identificar listas desplegables similares o repetidas en la UI y sincronizarlas automáticamente.
---

# Contexto y Propósito
En aplicaciones complejas de React (como constructores visuales, tablas de datos, configuradores), es muy común tener múltiples componentes `<select>` o enumeraciones (Dropdowns, ComboBoxes, Selects) que comparten la misma naturaleza funcional pero están distribuidos en diferentes partes del código para distintos tipos de configuración de un mismo elemento. 

Esta habilidad te enseña a **identificar proactivamente estas discrepancias** y solucionarlas incluso si el usuario no las señala explícitamente en el prompt.

# Instrucciones

Cuando te pidan agregar una nueva variable, de datos o cualquier opción predefinida en un componente de Formulario o Selector (`<select>`), sigue obligatoriamente este checklist mental:

1. **Búsqueda de Componentes Hermanos:**
   Analiza el archivo o el árbol de componentes. ¿Existe algún otro `<select>`, RadioGroup o Lista UI que maneje estructuralmente los mismos datos (ej. Variables de Texto vs Variables Individuales Numéricas)?
   
2. **Comparación de Paridad:**
   Verifica que todas las opciones (`<option>`) del selector A estén representadas en el selector B, **siempre que el contexto de negocio lo permita**. No dejes opciones de la base de datos "huérfanas" en un tipo de selector si en el otro sí existen (ejemplo: si en el modo 'dinámico' existe `code`, en el modo de interpolación de 'texto libre' también debe poder inyectarse `{code}`).

3. **Acción Proactiva:**
   Si notas que falta un campo en una de las listas análogas (y el usuario no ha prohibido explícitamente agregarlo), modifícalo junto con el requrimiento original. Considera estas opciones unificadas como una entidad de datos sólida.

## Ejemplo de Detección

**Patrón Detectado (Incorrecto - Desincronizado):**
```tsx
// Lista A: Cajas Dinámicas individuales
<select title="VariableIndividual">
   <option value="nombre">Nombre</option>
   <option value="precio">Precio</option>
   <option value="sku">SKU</option> 
</select>

// Lista B: Cajas de Texto enriquecido que soportan variables
<select title="InsertadorTextoLibre">
   <option value="nombre">Nombre</option>
   <option value="precio">Precio</option>
   // (El desarrollador olvidó poner la opción del SKU aquí)
</select>
```

**Acción Correctiva Oculta (Autónoma):**
Inserta automáticamente la opción respetando el modelo existente (`<option value="sku">SKU</option>`) en el componente desactualizado.
