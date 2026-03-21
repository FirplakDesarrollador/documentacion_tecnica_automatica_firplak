import argparse
import os
import re

README_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", "AI_README.md"))

def read_readme():
    if not os.path.exists(README_PATH):
        return ""
    with open(README_PATH, "r", encoding="utf-8") as f:
        return f.read()

def write_readme(content):
    with open(README_PATH, "w", encoding="utf-8") as f:
        f.write(content)

def add_section(title, content):
    readme = read_readme()
    new_section = f"\n## {title}\n{content}\n"
    write_readme(readme + new_section)
    print(f"Added section: {title}")

def update_section(title, content):
    readme = read_readme()
    pattern = rf"## {re.escape(title)}\n(.*?)(?=\n## |\Z)"
    new_content = f"## {title}\n{content}\n"
    
    if re.search(pattern, readme, re.DOTALL):
        updated_readme = re.sub(pattern, new_content, readme, flags=re.DOTALL)
        write_readme(updated_readme)
        print(f"Updated section: {title}")
    else:
        print(f"Section '{title}' not found. Adding it instead.")
        add_section(title, content)

def remove_section(title):
    readme = read_readme()
    pattern = rf"## {re.escape(title)}\n(.*?)(?=\n## |\Z)"
    
    if re.search(pattern, readme, re.DOTALL):
        updated_readme = re.sub(pattern, "", readme, flags=re.DOTALL)
        write_readme(updated_readme.strip() + "\n")
        print(f"Removed section: {title}")
    else:
        print(f"Section '{title}' not found.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Update AI_README.md context.")
    parser.add_value_group = parser.add_mutually_exclusive_group(required=True)
    parser.add_value_group.add_argument("--add", help="Add a new section title")
    parser.add_value_group.add_argument("--update", help="Update an existing section title")
    parser.add_value_group.add_argument("--remove", help="Remove a section title")
    parser.add_argument("--content", help="Content for the section (used with --add or --update)")

    args = parser.parse_args()

    if args.add:
        if not args.content:
            print("Error: --content is required for --add")
        else:
            add_section(args.add, args.content)
    elif args.update:
        if not args.content:
            print("Error: --content is required for --update")
        else:
            update_section(args.update, args.content)
    elif args.remove:
        remove_section(args.remove)
