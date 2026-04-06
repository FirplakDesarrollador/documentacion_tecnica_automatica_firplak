import argparse
import os
import re

# Ruta del AI_README.md
README_PATH = r"c:\Users\oswaldo.rivera\Desktop\Proyecto IA - Documentacion tecnica automatica\AI_README.md"
SECTION_TITLE = "## 🛡️ Terminal Safety Policy\n"

def main():
    parser = argparse.ArgumentParser(description="Registrar comando seguro en la Terminal Safety Policy.")
    parser.add_argument("--command", required=True, help="El patrón del comando seguro (ej: git status)")
    parser.add_argument("--rationale", required=True, help="Razón por la cual se considera seguro")
    args = parser.parse_args()

    # Si el archivo no existe, lo inicializamos
    if not os.path.exists(README_PATH):
        print(f"Error: No se encontró {README_PATH}")
        return

    with open(README_PATH, 'r', encoding='utf-8') as f:
        content = f.read()

    # Asegurar que la sección de política de seguridad exista
    if SECTION_TITLE not in content:
        content += f"\n{SECTION_TITLE}Los siguientes comandos base han sido evaluados y son recomendados para ser añadidos al **Allow List Terminal Commands** por ser informativos o de operación rutinaria (modo turbo):\n\n| Comando | Razón / Riesgo | Clasificación |\n|---------|----------------|---------------|\n"

    # Preparar la nueva entrada en la tabla
    new_row = f"| `{args.command}` | {args.rationale} | ✅ Seguro |\n"

    # Verificar si el comando ya está en el README (evitar duplicados)
    if f"`{args.command}`" in content:
        print(f"Aviso: El comando `{args.command}` ya está registrado.")
    else:
        # Añadir la nueva fila al final del contenido (o de la tabla si existiera)
        content += new_row
        with open(README_PATH, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"✅ Comando `{args.command}` añadido exitosamente a la Safety Policy.")

if __name__ == "__main__":
    main()
