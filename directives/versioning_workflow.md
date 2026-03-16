# Directiva: Flujo de Versionamiento

## Objetivo
Definir el proceso estándar para versionar y publicar cambios al repositorio de GitHub desde la rama `Oswaldo`.

## Convención de Versionamiento (Semver)
`MAJOR.MINOR.PATCH` — Ejemplo: `1.0.0`

| Tipo de cambio | Qué sube | Cuándo usarlo |
|---|---|---|
| `patch` | `1.0.0` → `1.0.1` | Corrección de bugs, ajustes menores |
| `minor` | `1.0.0` → `1.1.0` | Nueva funcionalidad, sin romper nada existente |
| `major` | `1.0.0` → `2.0.0` | Cambios que rompen la compatibilidad |

## Flujo de Trabajo Estándar

### Opción A: Usando VS Code (Recomendado para el día a día)
1. Hacer los cambios en el código.
2. En el panel de **Source Control** (ícono de la rama en la barra lateral izquierda):
   - Escribir un mensaje de commit descriptivo (ej: `feat: nueva función de exportar PDF`).
   - Hacer clic en el botón de **commit** (✓).
3. Hacer clic en **"Sync Changes"** o **"Push"** para subir a GitHub.
4. Para actualizar la versión, ejecutar desde la carpeta `web`:
   ```bash
   npm run release
   ```

### Opción B: Script de Release Automático (Sube versión PATCH)
```bash
cd web
npm run release
```
Este comando ejecuta:
1. `npm version patch` → Actualiza `package.json` de `1.0.0` → `1.0.1`.
2. `git push origin Oswaldo` → Sube la rama con el nuevo commit de versión.

## Política de Ramas
| Rama | Uso |
|---|---|
| `main` | Producción estable — **Solo merge desde `Oswaldo` cuando esté validado** |
| `Oswaldo` | Desarrollo activo — Aquí se trabaja y se sube cada versión |

## Notas
- La versión actual se muestra automáticamente en la parte inferior izquierda del aplicativo (leída desde `web/package.json`).
- No subir archivos `.env`, `dev.db` ni `node_modules` al repositorio (ya están en `.gitignore`).
