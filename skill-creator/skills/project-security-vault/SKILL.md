---
name: project-security-vault
description: Mantiene un registro centralizado de comandos de terminal seguros para el proyecto y actualiza la política de seguridad en el AI_README.md.
---

# 🤖 Habilidad: project-security-vault

Esta habilidad permite a los agentes de IA gestionar, proponer y documentar qué comandos de terminal son seguros para ser ejecutados de forma automática (`SafeToAutoRun: true`) en el repositorio **Firplak DocGen**.

## 🛡️ Propósito
1.  **Seguridad**: Evitar que el agente ejecute comandos destructivos sin supervisión humana (ej: `git push --force`, `DELETE FROM tables`, `rm -rf`).
2.  **Eficiencia**: Identificar comandos informativos o de inicio (`git status`, `npm run dev`) que el usuario puede añadir a su **Allow List** para una experiencia fluida sin confirmaciones constantes ("turbo mode").
3.  **Transparencia**: Mantener una sección en `AI_README.md` llamada "Terminal Safety Policy" que documente los comandos aprobados por la organización.

## 🛠️ Herramientas y Scripts
-   **`scripts/register_safe_command.py`**: Script de Python para registrar un patrón de comando nuevo y actualizar el `AI_README.md`.

## 📜 Reglas de Clasificación

### ✅ Seguro (`SafeToAutoRun: true`)
-   Comandos de **lectura**: `git status`, `git log`, `git diff`, `dir`, `ls`, `type`.
-   Comandos de **versión**: `node --version`, `npm --version`, `git --version`.
-   Comandos de **chequeo de sistema**: `Get-NetTCPConnection`, `Get-Process`.
-   Ejecución de **scripts informativos** locales: `python scripts/update_ai_readme.py`.

### ⚠️ Requiere Supervisión (`Always Ask`)
-   Escritura en **GitHub**: `git push`, `git merge`.
-   Modificación de **Base de Datos**: Cualquier `sql` con `INSERT`, `UPDATE`, `DELETE`.
-   Modificación de **Entorno**: Edición de `.env`, `npm install`, `npm build`.
-   Acciones **Destructivas**: `git clean`, `Remove-Item`.

## 🚀 Cómo usar
1.  **Identificar**: Cuando un comando se repite frecuentemente y es informativo, propón añadirlo a la "Terminal Safety Policy".
2.  **Registrar**: Llama al script `python scripts/register_safe_command.py --command "patrón" --rationale "razón"`.
3.  **Informar**: Notifica al usuario para que se sienta cómodo agregando ese patrón a su **Allow List Terminal Commands** en la configuración de su entorno.
