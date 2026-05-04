---
description: Analiza los comandos ejecutados recientemente, clasifica cuáles son seguros de automatizar y actualiza la política de seguridad.
---

// turbo-all

1. **Análisis de historial**: Analiza las últimas 10-15 interacciones en busca de herramientas `run_command` que hayan requerido aprobación manual del usuario.

2. **Clasificación Inteligente**:
   - **✅ Seguros**: Comandos de lectura (`git status`, `dir`), chequeo de estado (`Get-NetTCPConnection`) y versiones.
   - **❌ Supervisados**: Comandos que modifican archivos (`git commit`, `npm version`), envían datos (`git push`) o alteran la base de datos.

3. **Reporte al Usuario**: Genera un informe con:
   - Lista de comandos recomendados para el "Allow List".
   - Lista de comandos que DEBEN seguir pidiendo permiso, con la explicación de seguridad (ej: "Riesgo de pérdida de datos" o "Cambio irreversible en el repositorio").

4. **Sincronización Automática**:
   - Para cada comando identificado como **Seguro**, ejecuta automáticamente:
     ```powershell
     python "skill-creator/skills/project-security-vault/scripts/register_safe_command.py" --command "<comando>" --rationale "<explicación>"
     ```

5. **Finalización**: Muestra el mensaje final con una **lista literal de comandos seguros** para que el usuario pueda copiarlos y pegarlos directamente en su configuración de "Allow List" (modo turbo).
