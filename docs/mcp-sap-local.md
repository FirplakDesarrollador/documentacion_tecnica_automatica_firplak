# MCP local para SAP Business One

Este MCP usa el protocolo `stdio` y consulta SAP Business One Service Layer en modo lectura. No ejecuta POST, PATCH ni DELETE contra SAP.

## Variables requeridas

El proceso MCP debe recibir estas variables de entorno:

- `SAP_API_URL`: URL completa del endpoint de login, normalmente termina en `/b1s/v1/Login`.
- `SAP_COMPANY_DB`: nombre de la base de datos de compania en SAP.
- `SAP_USERNAME`: usuario de Service Layer.
- `SAP_PASSWORD`: contrasena de Service Layer.

Opcionales:

- `SAP_REJECT_UNAUTHORIZED`: `false` para certificados internos no confiables; usar `true` cuando el certificado sea valido.
- `SAP_TIMEOUT_MS`: timeout HTTP, por defecto `60000`.

No se deben pegar estos valores en el chat ni versionarlos en el repositorio. El MCP solo lee `process.env`.

## Herramientas

- `sap_config_status`: confirma presencia de variables sin mostrar valores.
- `sap_health`: prueba login y devuelve version y timeout de sesion.
- `sap_get_item`: consulta un `ItemCode`.
- `sap_get_product_tree`: consulta un `TreeCode` con sus lineas.
- `sap_search_product_trees`: consulta varios prefijos de `TreeCode`, con paginacion y opcion de incluir lineas.
- `sap_search_items_by_prefix`: consulta Items por prefijo.

## Registro en Codex

Agregar este bloque a `C:\Users\oswaldo.rivera\.codex\config.toml`:

```toml
[mcp_servers.sap]
command = "node"
args = ["C:\\Users\\oswaldo.rivera\\Desktop\\Proyecto IA - Documentacion tecnica automatica\\scripts\\mcp-sap-server.mjs"]
env_vars = ["SAP_API_URL", "SAP_COMPANY_DB", "SAP_USERNAME", "SAP_PASSWORD", "SAP_REJECT_UNAUTHORIZED", "SAP_TIMEOUT_MS"]
startup_timeout_sec = 30
```

`env_vars` indica a Codex que debe pasar esas variables al proceso MCP. Los valores deben existir en el entorno del proceso que inicia Codex; no se escriben en este archivo ni en el repositorio.

Despues de guardar la configuracion, reinicia Codex para que registre el servidor. Primero usa `sap_config_status`; despues `sap_health`.
