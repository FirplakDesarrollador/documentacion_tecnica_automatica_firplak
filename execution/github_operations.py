import os
import requests
import argparse
import json
import base64
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")
GITHUB_USER = os.getenv("GITHUB_USER", "").replace("@", "")

BASE_URL = "https://api.github.com"

def get_headers():
    return {
        "Authorization": f"token {GITHUB_TOKEN}",
        "Accept": "application/vnd.github.v3+json"
    }

def list_repos():
    """List public and private repositories for the authenticated user."""
    url = f"{BASE_URL}/user/repos"
    params = {"affiliation": "owner,organization_member", "sort": "updated"}
    response = requests.get(url, headers=get_headers(), params=params)
    
    if response.status_code == 200:
        repos = response.json()
        return [{"name": repo["name"], "full_name": repo["full_name"], "private": repo["private"]} for repo in repos]
    else:
        print(f"Error fetching repos: {response.status_code}")
        print(response.text)
        return []

def get_file_content(repo_full_name, file_path, branch=None):
    """Fetch the content of a file from a repository."""
    url = f"{BASE_URL}/repos/{repo_full_name}/contents/{file_path}"
    params = {}
    if branch:
        params["ref"] = branch
        
    response = requests.get(url, headers=get_headers(), params=params)
    
    if response.status_code == 200:
        data = response.json()
        content = base64.b64decode(data["content"]).decode("utf-8")
        return content
    else:
        print(f"Error fetching file: {response.status_code}")
        print(response.text)
        return None

def get_branch_sha(repo_full_name, branch="main"):
    """Get the SHA of the latest commit on a branch."""
    url = f"{BASE_URL}/repos/{repo_full_name}/git/ref/heads/{branch}"
    response = requests.get(url, headers=get_headers())
    if response.status_code == 200:
        return response.json()["object"]["sha"]
    return None

def create_branch(repo_full_name, new_branch, source_branch="main"):
    """Create a new branch from a source branch."""
    sha = get_branch_sha(repo_full_name, source_branch)
    if not sha:
        print(f"Could not find source branch '{source_branch}'")
        return False
        
    url = f"{BASE_URL}/repos/{repo_full_name}/git/refs"
    payload = {
        "ref": f"refs/heads/{new_branch}",
        "sha": sha
    }
    response = requests.post(url, headers=get_headers(), json=payload)
    if response.status_code == 201:
        print(f"Branch '{new_branch}' created successfully.")
        return True
    elif response.status_code == 422:
        print(f"Branch '{new_branch}' already exists.")
        return True
    else:
        print(f"Error creating branch: {response.status_code}")
        print(response.text)
        return False

def create_repo(name, private=True):
    """Create a new repository for the authenticated user."""
    url = f"{BASE_URL}/user/repos"
    payload = {
        "name": name,
        "private": private,
        "auto_init": False
    }
    response = requests.post(url, headers=get_headers(), json=payload)
    
    if response.status_code == 201:
        repo_data = response.json()
        return repo_data["full_name"]
    elif response.status_code == 422:
        print(f"Repository '{name}' already exists.")
        return f"{GITHUB_USER}/{name}"
    else:
        print(f"Error creating repo: {response.status_code}")
        print(response.text)
        return None

def update_repo_metadata(full_name, new_name=None, private=None):
    """Update repository metadata like name and visibility."""
    url = f"{BASE_URL}/repos/{full_name}"
    payload = {}
    if new_name:
        payload["name"] = new_name
    if private is not None:
        payload["private"] = private
        
    response = requests.patch(url, headers=get_headers(), json=payload)
    
    if response.status_code == 200:
        repo_data = response.json()
        return repo_data["full_name"]
    else:
        print(f"Error updating repo: {response.status_code}")
        print(response.text)
        return None

def upload_file(repo_full_name, local_path, repo_path, branch=None, message="Update from Antigravity"):
    """Upload a local file to the repository via GitHub API."""
    url = f"{BASE_URL}/repos/{repo_full_name}/contents/{repo_path}"
    
    with open(local_path, "rb") as f:
        content = base64.b64encode(f.read()).decode("utf-8")
        
    # Check if file exists to get SHA
    sha = None
    params = {}
    if branch:
        params["ref"] = branch
        
    check_response = requests.get(url, headers=get_headers(), params=params)
    if check_response.status_code == 200:
        sha = check_response.json()["sha"]
        
    payload = {
        "message": message,
        "content": content
    }
    if sha:
        payload["sha"] = sha
    if branch:
        payload["branch"] = branch
        
    response = requests.put(url, headers=get_headers(), json=payload)
    
    if response.status_code in [200, 201]:
        return True
    else:
        print(f"Error uploading {repo_path}: {response.status_code}")
        print(response.text)
        return False

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="GitHub Operations Script")
    parser.add_argument("--list-repos", action="store_true", help="List all repositories")
    parser.add_argument("--repo", type=str, help="Repository full name (owner/repo)")
    parser.add_argument("--file", type=str, help="File path in the repository")
    parser.add_argument("--create-repo", type=str, help="Create a new repository with given name")
    parser.add_argument("--update-repo", type=str, help="Old full name of the repository to update")
    parser.add_argument("--new-name", type=str, help="New name for the repository")
    parser.add_argument("--branch", type=str, help="Target branch name")
    parser.add_argument("--create-branch", type=str, help="New branch name to create")
    parser.add_argument("--source-branch", type=str, default="main", help="Source branch for new branch")
    parser.add_argument("--upload", nargs=2, metavar=('LOCAL', 'REMOTE'), help="Upload a file (local_path remote_path)")
    
    args = parser.parse_args()
    
    if args.list_repos:
        repos = list_repos()
        print(json.dumps(repos, indent=2))
    elif args.create_repo:
        full_name = create_repo(args.create_repo)
        if full_name:
            print(full_name)
    elif args.update_repo:
        private_val = None
        if args.private:
            private_val = args.private.lower() == "true"
            
        updated_full_name = update_repo_metadata(args.update_repo, args.new_name, private_val)
        if updated_full_name:
            print(updated_full_name)
            
    elif args.repo and args.create_branch:
        create_branch(args.repo, args.create_branch, args.source_branch)
    elif args.repo and args.upload:
        success = upload_file(args.repo, args.upload[0], args.upload[1], args.branch)
        if success:
            print(f"Successfully uploaded {args.upload[0]} to {args.upload[1]}")
    elif args.repo and args.file:
        content = get_file_content(args.repo, args.file, args.branch)
        if content:
            print(content)
    else:
        parser.print_help()
