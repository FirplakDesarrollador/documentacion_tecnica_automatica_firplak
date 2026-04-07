import json
import os

PACKAGE_PATH = r"c:\Users\oswaldo.rivera\Desktop\Proyecto IA - Documentacion tecnica automatica\web\package.json"

def bump_version():
    if not os.path.exists(PACKAGE_PATH):
        print(f"Error: No se encontró {PACKAGE_PATH}")
        return

    with open(PACKAGE_PATH, 'r', encoding='utf-8') as f:
        data = json.load(f)

    current_version = data.get("version", "1.0.0")
    major, minor, patch = map(int, current_version.split('.'))

    # Nueva lógica: Ciclo de 10
    # Si patch >= 9, subimos minor y reseteamos patch a 0
    # Caso especial: Si estamos en 1.0.13 (tu caso actual), saltamos a 1.1.0 directamente
    if patch >= 9:
        minor += 1
        patch = 0
    else:
        patch += 1

    new_version = f"{major}.{minor}.{patch}"
    data["version"] = new_version

    with open(PACKAGE_PATH, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)
    
    print(new_version)

if __name__ == "__main__":
    bump_version()
