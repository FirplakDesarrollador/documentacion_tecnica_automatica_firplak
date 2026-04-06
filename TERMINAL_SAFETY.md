# 🛡️ Regla: Seguridad y Automatización de Terminal

Esta regla es obligatoria para el Agente de IA en este espacio de trabajo.

## 📌 Protocolo de Identificación de Comandos Safe
El Agente debe monitorear constantemente los comandos ejecutados. Si un comando es informativo (lectura) y recurrente (ej: `git status`, `dir`, `Get-NetTCPConnection`), el Agente debe:

1.  **Registrarlo proactivamente** en la habilidad `project-security-vault`.
2.  **Añadirlo a la tabla de seguridad** en `AI_README.md`.
3.  **Sugerir al usuario** añadirlo a su "Allow List Terminal Commands" para habilitar el modo turbo.

## ⚠️ Restricciones de Seguridad
- **NUNCA** ejecutar comandos destructivos (`git push --force`, `DELETE`, `Remove-Item`) con `SafeToAutoRun: true`.
- **SIEMPRE** pedir confirmación para acciones que alteren el repositorio remoto o la base de datos de producción.

## 🚀 Modo Turbo
El Agente tiene permiso para usar `SafeToAutoRun: true` únicamente en los comandos base listados como "✅ Seguro" en el `AI_README.md`.
