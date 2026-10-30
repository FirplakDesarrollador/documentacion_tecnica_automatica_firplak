# SamiGen - Agente de Impresi&oacute;n Local

Agente HTTP local que recibe etiquetas desde SamiGen en Vercel y las env&iacute;a
directamente a la impresora USB **3nStar LTT334 / 4BARCODE 4B-2054TG**.

## Requisitos

- **Windows** 10 u 11
- **Node.js** 18+ instalado
- Impresora 3nStar LTT334 conectada por **USB** y con driver instalado

## Actualizaci&oacute;n para usuarios finales no t&eacute;cnicos

Cuando SamiGen publique una nueva versi&oacute;n del agente, el usuario no debe
eliminar impresoras, colas ni puertos USB. La actualizaci&oacute;n reemplaza los
archivos del agente y conserva los registros de diagn&oacute;stico.

1. Termine cualquier impresi&oacute;n pendiente en 4BarCode y cierre 4BarCode.
2. En SamiGen &rarr; **Impresi&oacute;n**, descargue el instalador que aparece en el
   aviso **Actualizar agente local**.
3. Abra el archivo descargado y confirme la instalaci&oacute;n de Windows. No cambie
   la carpeta de destino ni desinstale la impresora.
4. Espere a que aparezca **Agente instalado correctamente**.
5. Verifique que la impresora est&eacute; encendida y conectada por USB.
6. Regrese a SamiGen, actualice la p&aacute;gina y pulse **Probar**.
7. Si aparece **Impresora detectada con varias colas**, no borre puertos ni
   colas: cierre 4BarCode antes de imprimir desde SamiGen y use **Probar de
   nuevo**.

La actualizaci&oacute;n detiene solamente el agente anterior, reemplaza sus archivos
en `%LOCALAPPDATA%\SamiGenPrintAgent` y vuelve a iniciarlo. No modifica la
configuraci&oacute;n de la impresora ni los trabajos de 4BarCode.

Si Windows bloquea el instalador, el usuario debe enviarlo a TI; no debe
desactivar el antivirus ni ejecutar comandos de PowerShell por su cuenta.

## Instalaci&oacute;n productiva para usuarios finales

El usuario final no necesita clonar este repositorio ni instalar Node.js. Debe
descargar desde SamiGen el instalador:

```text
/downloads/samigen-print-agent-setup.exe
```

El instalador copia el agente a `%LOCALAPPDATA%\SamiGenPrintAgent`, crea la tarea
programada `SamiGenPrintAgent`, inicia el agente y registra un desinstalador en
Windows.

Para generar el instalador desde el repositorio:

```powershell
npm run build:print-agent-installer
```

El comando publica:

- `public/downloads/samigen-print-agent-setup.exe`
- `public/downloads/samigen-print-agent-setup-<version>.exe`

Si existen variables `PRINT_AGENT_SIGN_CERT`, `PRINT_AGENT_SIGN_PASSWORD` y
opcionalmente `PRINT_AGENT_TIMESTAMP_URL`, el build intenta firmar el instalador
con `signtool`.

## Instalaci&oacute;n manual de desarrollo

```powershell
# 1. Abre PowerShell como Administrador y navega a esta carpeta
cd print-agent

# 2. Instala las dependencias
npm install

# 3. Inicia el agente
npm start
```

## Uso

1. Ejecuta `npm start` en esta carpeta
2. El agente queda escuchando en `http://127.0.0.1:3344`
3. En SamiGen, ve a **Impresi&oacute;n** y selecciona el m&eacute;todo **"Agente local"**
4. El app enviar&aacute; los documentos al agente y &eacute;ste los imprimir&aacute; autom&aacute;ticamente

## Endpoints

| M&eacute;todo | Ruta | Descripci&oacute;n |
|---|---|---|
| GET | `/health` | Estado del agente |
| GET | `/scan-usb` | Fuerza una nueva detecci&oacute;n USB y muestra las colas encontradas |
| GET | `/debug-usb` | Diagn&oacute;stico detallado para soporte |
| POST | `/print` | Env&iacute;a un archivo a imprimir |

### POST /print

Formato: `multipart/form-data`

| Campo | Tipo | Descripci&oacute;n |
|---|---|---|
| `file` | Archivo | JPG, PNG o PDF a imprimir |
| `printer` | Texto | Nombre exacto de la impresora (default: `3nStar LTT334`) |
| `copies` | N&uacute;mero | Cantidad de copias (default: 1) |

## Mantenerlo siempre activo

Para que el agente arranque autom&aacute;ticamente al iniciar Windows:

### Opci&oacute;n A: Acceso directo en Startup

```powershell
# Crea un acceso directo a npm-start.bat en la carpeta de inicio
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\SamiGen-Print-Agent.lnk")
$Shortcut.TargetPath = "powershell.exe"
$Shortcut.Arguments = "-NoProfile -Command `"cd '$(Get-Location)'; npm start`""
$Shortcut.WindowStyle = 7
$Shortcut.Save()
```

### Opci&oacute;n B: Script de PowerShell

Crea un archivo `start-agent.ps1`:
```powershell
while ($true) {
    try {
        node server.js
    } catch {
        Start-Sleep -Seconds 5
    }
}
```

## Soluci&oacute;n de problemas

**"No se encuentra la impresora"**
- Verifique que est&eacute; encendida y conectada por USB
- Cierre 4BarCode y pulse **Probar** en SamiGen
- No elimine puertos ni colas si Windows indica que est&aacute;n en uso
- Si contin&uacute;a el problema, env&iacute;e a soporte el resultado de `/health`,
  `/debug-usb` y el archivo `logs\agent.log`

**"Error de conexi&oacute;n o impresora ocupada"**
- Termine la impresi&oacute;n activa en 4BarCode y cierre el programa
- Espere unos segundos y vuelva a intentar una sola vez
- Si falla de nuevo, desconecte y conecte el cable USB y pulse **Probar**
- En SamiGen, la URL debe ser `http://127.0.0.1:3344`

**La impresora no imprime o imprime texto basura**
- Prueba directamente con PowerShell:
  ```powershell
  Get-Content -Path "imagen.jpg" -Encoding Byte | Out-Printer -Name "3nStar LTT334"
  ```
- Si imprime texto basura, la impresora no acepta JPG directamente.
  Se necesita convertir la imagen al formato nativo de la impresora (ZPL/TSPL).
