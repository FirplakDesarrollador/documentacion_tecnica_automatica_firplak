const fs = require('fs');
const path = require('path');

// Configuración de rutas
const PROJECT_ROOT = 'c:\\Users\\oswaldo.rivera\\Desktop\\Proyecto IA - Documentacion tecnica automatica';
const MCP_CONFIG_PATH = 'C:\\Users\\oswaldo.rivera\\.gemini\\antigravity\\mcp_config.json';
const ENV_PATH = path.join(PROJECT_ROOT, '.env');

function loadEnv(filePath) {
    const envVars = {};
    if (!fs.existsSync(filePath)) return envVars;
    
    const content = fs.readFileSync(filePath, 'utf-8');
    content.split('\n').forEach(line => {
        line = line.trim();
        if (!line || line.startsWith('#')) return;
        const [key, ...valueParts] = line.split('=');
        if (key && valueParts.length > 0) {
            let value = valueParts.join('=').trim();
            // Limpiar comillas
            value = value.replace(/^['"]|['"]$/g, '');
            envVars[key.trim()] = value;
        }
    });
    return envVars;
}

function syncMcpConfig() {
    if (!fs.existsSync(MCP_CONFIG_PATH)) {
        console.error(`Error: No se encontró el archivo de configuración en ${MCP_CONFIG_PATH}`);
        return;
    }

    const envVars = loadEnv(ENV_PATH);
    const supabaseToken = envVars['SUPABASE_ACCESS_TOKEN'];
    const githubToken = envVars['GITHUB_TOKEN'];

    if (!supabaseToken || !githubToken) {
        console.warn('Advertencia: No se encontraron todos los tokens en el archivo .env');
    }

    let config;
    try {
        config = JSON.parse(fs.readFileSync(MCP_CONFIG_PATH, 'utf-8'));
    } catch (e) {
        console.error('Error al leer MCP config:', e);
        return;
    }

    let changed = false;

    // 1. Refactorizar Supabase MCP Server
    if (config.mcpServers && config.mcpServers['supabase-mcp-server']) {
        const srv = config.mcpServers['supabase-mcp-server'];
        
        // Mover token de args a env si existe en .env
        if (supabaseToken) {
            if (srv.args && srv.args.includes('--access-token')) {
                const newArgs = [];
                let skipNext = false;
                for (const arg of srv.args) {
                    if (skipNext) {
                        skipNext = false;
                        continue;
                    }
                    if (arg === '--access-token') {
                        skipNext = true;
                        continue;
                    }
                    newArgs.push(arg);
                }
                srv.args = newArgs;
                changed = true;
            }
            
            if (!srv.env) srv.env = {};
            if (srv.env.SUPABASE_ACCESS_TOKEN !== supabaseToken) {
                srv.env.SUPABASE_ACCESS_TOKEN = supabaseToken;
                changed = true;
                console.log('✅ Supabase MCP Server actualizado con token de .env');
            }
        }
    }

    // 2. Refactorizar GitHub MCP Server
    if (config.mcpServers && config.mcpServers['github-mcp-server']) {
        const srv = config.mcpServers['github-mcp-server'];
        if (githubToken) {
            if (!srv.env) srv.env = {};
            if (srv.env.GITHUB_PERSONAL_ACCESS_TOKEN !== githubToken) {
                srv.env.GITHUB_PERSONAL_ACCESS_TOKEN = githubToken;
                changed = true;
                console.log('✅ GitHub MCP Server actualizado con token de .env');
            }
        }
    }

    if (changed) {
        fs.writeFileSync(MCP_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
        console.log(`Configuración guardada en ${MCP_CONFIG_PATH}`);
    } else {
        console.log('La configuración ya está sincronizada.');
    }
}

syncMcpConfig();
