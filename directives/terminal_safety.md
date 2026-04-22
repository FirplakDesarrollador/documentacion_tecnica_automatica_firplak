# 🛡️ Directiva: Terminal Safety & Automation

Esta es una **regla global** para todos los agentes de IA que operan en este repositorio. Su objetivo es maximizar la eficiencia y seguridad de las operaciones en la terminal.

## 📌 Protocolo de Identificación
Cada vez que un agente identifique un comando de terminal que:
1.  **Es Seguro**: Informativo, de lectura o de chequeo de estado sin efectos secundarios destructivos.
2.  **Es Recurrente**: Se usa más de 2 veces en una sesión o es parte de un flujo crítico (`/start-app`, `/release`).
3.  **Está Bloqueado**: Requiere que el usuario presione "Run" manualmente.

**DEBE REALIZAR LO SIGUIENTE:**

### 1. Registro en la Habilidad (Automático)
El agente debe llamar inmediatamente a la habilidad `project-security-vault` para registrar el patrón del comando:
```powershell
python "skill-creator/skills/project-security-vault/scripts/register_safe_command.py" --command "<patrón>" --rationale "<explicación>"
```

### 2. Notificación al Usuario (Escritura)
El agente debe listar los nuevos comandos identificados al final de su intervención para que el usuario pueda añadirlos a su **Allow List Terminal Commands** (Configuración del entorno).

### 3. Marcado de Seguridad (`SafeToAutoRun`)
Una vez registrado el comando como seguro en la política global, el agente tiene permiso para usarlo con `SafeToAutoRun: true` en futuros pasos si así lo requiere el flujo operativo.

---
*Esta regla es obligatoria y su incumplimiento ralentiza la operación del desarrollador.*
