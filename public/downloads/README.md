# Descargas SamiGen

Este directorio publica artefactos descargables desde Vercel.

El instalador productivo del agente local de impresion debe generarse con:

```powershell
npm run build:print-agent-installer
```

El comando crea:

- `public/downloads/samigen-print-agent-setup.exe`
- `public/downloads/samigen-print-agent-setup-<version>.exe`

Si se configuran `PRINT_AGENT_SIGN_CERT`, `PRINT_AGENT_SIGN_PASSWORD` y opcionalmente
`PRINT_AGENT_TIMESTAMP_URL`, el script intenta firmar ambos ejecutables con `signtool`.
