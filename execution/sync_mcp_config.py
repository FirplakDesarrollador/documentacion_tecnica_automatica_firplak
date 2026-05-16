import json
import os
import re
from pathlib import Path

# Configuración de rutas
PROJECT_ROOT = Path(r"c:\Users\oswaldo.rivera\Desktop\Proyecto IA - Documentacion tecnica automatica")
MCP_CONFIG_PATH = Path(r"C:\Users\oswaldo.rivera\.gemini\antigravity\mcp_config.json")
ENV_PATH = PROJECT_ROOT / ".env"

def load_env(path):
    env_vars = {}
    if not path.exists():
        return env_vars
    
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                key, value = line.split("=", 1)
                # Limpiar comillas
                value = value.strip().strip('"').strip("'")
                env_vars[key.strip()] = value
    return env_vars

def sync_mcp_config():
    if not MCP_CONFIG_PATH.exists():
        print(f"Error: No se encontró el archivo de configuración en {MCP_CONFIG_PATH}")
        return

    env_vars = load_env(ENV_PATH)
    supabase_token = env_vars.get("SUPABASE_ACCESS_TOKEN")
    github_token = env_vars.get("GITHUB_TOKEN")

    if not supabase_token or not github_token:
        print("Advertencia: No se encontraron todos los tokens en el archivo .env")

    with open(MCP_CONFIG_PATH, "r", encoding="utf-8") as f:
        config = json.load(f)

    # 1. Refactorizar Supabase MCP Server
    if "supabase-mcp-server" in config["mcpServers"]:
        srv = config["mcpServers"]["supabase-mcp-server"]
        # Mover token de args a env si existe en .env
        if supabase_token:
            # Limpiar args de --access-token y su valor
            new_args = []
            skip_next = False
            for arg in srv.get("args", []):
                if skip_next:
                    skip_next = False
                    continue
                if arg == "--access-token":
                    skip_next = True
                    continue
                new_args.append(arg)
            srv["args"] = new_args
            
            # Asegurar que esté en env
            if "env" not in srv:
                srv["env"] = {}
            srv["env"]["SUPABASE_ACCESS_TOKEN"] = supabase_token
            print("Supabase MCP Server actualizado con token de .env")

    # 2. Refactorizar GitHub MCP Server
    if "github-mcp-server" in config["mcpServers"]:
        srv = config["mcpServers"]["github-mcp-server"]
        if github_token:
            if "env" not in srv:
                srv["env"] = {}
            srv["env"]["GITHUB_PERSONAL_ACCESS_TOKEN"] = github_token
            print("GitHub MCP Server actualizado con token de .env")

    # Guardar cambios
    with open(MCP_CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2)
    
    print(f"Configuración guardada en {MCP_CONFIG_PATH}")

if __name__ == "__main__":
    sync_mcp_config()
