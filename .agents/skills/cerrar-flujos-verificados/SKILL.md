---
name: cerrar-flujos-verificados
description: Cierra mutaciones de la aplicación con evidencia real. Usar al crear, guardar, aplicar, confirmar, sincronizar, inactivar o sobrescribir reglas, colores, BOM, casos Dual u overrides; también al revisar un flujo existente que muestra éxito sin probar su efecto tras recargar.
---

# Cerrar flujos verificados

No declarar una mutación como aplicada solo porque un `UPDATE` devolvió una fila o la UI cambió estado local. Cerrar cada flujo con lectura posterior, efecto de negocio comprobable y una interfaz final que sobreviva la recarga.

## Secuencia obligatoria

1. Delimitar el cambio: entidad, claves exactas, campos que pueden modificarse y sistemas que quedan fuera de alcance.
2. Validar entradas y pedir la confirmación proporcional al riesgo antes de escribir.
3. Ejecutar únicamente la escritura autorizada.
4. Releer los mismos registros afectados inmediatamente. No repetir una exploración SAP amplia si ya existe evidencia reciente y acotada.
5. Comprobar el efecto funcional:
   - Regla global o condicional: resolver una muestra representativa de cada perfil o condición.
   - Caso Dual: resolver cada SKU incluido y comprobar los roles, colores y perfiles guardados.
   - Override por SKU, color, referencia o versión: releer el override y resolver el SKU concreto con la precedencia completa.
   - Sincronización de estado: confirmar el estado final en el sistema destino.
6. Actualizar la UI desde la lectura confirmada, no desde un booleano transitorio. Reemplazar el formulario por un panel final verde que indique qué se guardó, dónde, los identificadores afectados y el resultado efectivo. Mantener el error junto a la acción que falló.
7. Ejecutar pruebas de éxito, error, recarga e idempotencia. Una recarga debe mostrar el mismo estado útil o explicar claramente que la evidencia es transitoria y ofrecer la revalidación acotada.

## Reglas de interfaz

- No ocultar una decisión guardada solo porque deja de ser una excepción; mostrarla como configuración vigente y permitir su revalidación.
- No presentar campos base como si reflejaran un caso Dual u override por SKU. Mostrar su ámbito y los SKU afectados explícitamente.
- Deshabilitar o convertir la acción ya terminada en un resultado final; no dejar el usuario frente al mismo formulario ambiguo.
- Usar mensajes de éxito solo si la acción retorna la lectura posterior y la comprobación funcional. Si falta alguna, mostrar "guardado pendiente de verificar", no "aplicado".
- Reutilizar los patrones ya validados de la matriz de cantos antes de crear una interacción nueva para tableros.

## Contratos y pruebas

Las acciones mutantes deben devolver datos tipados de lectura posterior, no solo `{ success, message }`. Las pruebas deben comprobar al menos:

- la persistencia exacta de los campos autorizados;
- que un error no produce un estado verde;
- la resolución efectiva de los SKU o reglas afectadas;
- que una segunda aplicación reemplaza o conserva correctamente el caso, sin duplicados;
- que la vista reconstruida tras recargar conserva una representación útil.

No crear tablas, migraciones, RPCs ni escrituras SAP para satisfacer esta skill sin autorización explícita.
