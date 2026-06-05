# SamiGen - Agente de Impresi&oacute;n Local

Agente HTTP local que recibe etiquetas desde SamiGen en Vercel y las env&iacute;a
directamente a la impresora USB **3nStar LTT334 / 4BARCODE 4B-2054TG**.

## Requisitos

- **Windows** 10 u 11
- **Node.js** 18+ instalado
- Impresora 3nStar LTT334 conectada por **USB** y con driver instalado

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
| GET | `/printers` | Lista impresoras disponibles |
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
- Abre "Dispositivos e Impresoras" en Windows y verifica el nombre exacto
- Usa `GET /printers` para listar las impresoras detectadas
- Ajusta el nombre en la configuraci&oacute;n de SamiGen (Impresi&oacute;n &rarr; Configuraci&oacute;n de impresora)

**"Error de conexi&oacute;n"**
- Verifica que el agente est&eacute; corriendo (debes ver el mensaje "Activo" en la terminal)
- Confirma que el puerto 3344 no est&eacute; bloqueado por un firewall
- En SamiGen, la URL debe ser `http://127.0.0.1:3344`

**La impresora no imprime o imprime texto basura**
- Prueba directamente con PowerShell:
  ```powershell
  Get-Content -Path "imagen.jpg" -Encoding Byte | Out-Printer -Name "3nStar LTT334"
  ```
- Si imprime texto basura, la impresora no acepta JPG directamente.
  Se necesita convertir la imagen al formato nativo de la impresora (ZPL/TSPL).
