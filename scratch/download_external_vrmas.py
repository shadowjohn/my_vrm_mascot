import os
import sys
import json
import hashlib
import urllib.request
import urllib.error
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
EXTERNAL_MANIFEST_DIR = BASE_DIR / "examples" / "m6_7_vrma_samples" / "external"
LOCAL_ASSET_DIR = BASE_DIR / "local_assets" / "vrma" / "external"

def calculate_sha256(filepath):
    sha256 = hashlib.sha256()
    with open(filepath, 'rb') as f:
        while chunk := f.read(8192):
            sha256.update(chunk)
    return sha256.hexdigest()

def get_github_raw_base(source_url, commit):
    # E.g. "https://github.com/DavinciDreams/3dchat" -> "https://raw.githubusercontent.com/DavinciDreams/3dchat"
    parts = source_url.rstrip("/").split("/")
    if len(parts) >= 5 and "github.com" in parts[2]:
        owner = parts[3]
        repo = parts[4]
        return f"https://raw.githubusercontent.com/{owner}/{repo}/{commit}"
    raise ValueError(f"Unsupported source URL format: {source_url}")

def download_file(url, dest_path, expected_sha256):
    print(f"Downloading {url} ...")
    temp_path = dest_path.with_suffix(".tmp")
    
    # Simple download with urllib
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3'
        }
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req) as response, open(temp_path, 'wb') as out_file:
            out_file.write(response.read())
    except urllib.error.HTTPError as e:
        if temp_path.exists():
            temp_path.unlink()
        raise e
    except Exception as e:
        if temp_path.exists():
            temp_path.unlink()
        raise e

    # Verify SHA256
    actual_sha256 = calculate_sha256(temp_path)
    if actual_sha256 != expected_sha256:
        temp_path.unlink()
        raise ValueError(f"Checksum mismatch for downloaded file! Expected: {expected_sha256}, Got: {actual_sha256}")
    
    # Rename to target path
    if dest_path.exists():
        dest_path.unlink()
    temp_path.rename(dest_path)
    print(f"Successfully downloaded and verified: {dest_path.name}")

def main():
    if not EXTERNAL_MANIFEST_DIR.exists():
        print(f"Error: Manifest directory {EXTERNAL_MANIFEST_DIR} does not exist.")
        sys.exit(1)

    manifests = list(EXTERNAL_MANIFEST_DIR.glob("**/source_manifest.json"))
    if not manifests:
        print("No source_manifest.json files found.")
        sys.exit(0)

    print(f"Found {len(manifests)} manifests. Starting download process...\n")

    total_files = 0
    downloaded_count = 0
    skipped_count = 0
    failed_files = []

    for manifest_path in manifests:
        dir_name = manifest_path.parent.name
        print(f"==========================================")
        print(f"Processing manifest: {dir_name}/source_manifest.json")
        print(f"==========================================")
        
        try:
            with open(manifest_path, 'r', encoding='utf-8') as f:
                manifest = json.load(f)
        except Exception as e:
            print(f"Error reading manifest {manifest_path}: {e}")
            continue

        source_url = manifest.get("sourceUrl")
        commit = manifest.get("upstreamCommit")
        
        # Determine fallback commits if not specified
        commits_to_try = [commit] if commit else ["main", "master"]

        files = manifest.get("files", [])
        total_files += len(files)

        dest_dir = LOCAL_ASSET_DIR / dir_name
        dest_dir.mkdir(parents=True, exist_ok=True)

        for file_info in files:
            local_file = file_info.get("localFile")
            source_path = file_info.get("sourcePath")
            expected_sha256 = file_info.get("sha256")
            
            if not local_file or not source_path or not expected_sha256:
                print(f"Skipping malformed entry: {file_info}")
                continue

            target_path = dest_dir / local_file

            # Check if file already exists and is valid
            if target_path.exists():
                try:
                    actual_sha256 = calculate_sha256(target_path)
                    if actual_sha256 == expected_sha256:
                        print(f"File {local_file} already exists and is verified. Skipping.")
                        skipped_count += 1
                        continue
                    else:
                        print(f"File {local_file} exists but has checksum mismatch. Re-downloading.")
                except Exception as e:
                    print(f"Error checking existing file {local_file}: {e}")

            # Try to download using available commit branches
            download_ok = False
            last_err = None
            for c in commits_to_try:
                try:
                    raw_base = get_github_raw_base(source_url, c)
                    download_url = f"{raw_base}/{source_path}"
                    # GitHub raw URLs are URL-encoded for spaces
                    download_url = download_url.replace(" ", "%20")
                    download_file(download_url, target_path, expected_sha256)
                    download_ok = True
                    downloaded_count += 1
                    break
                except urllib.error.HTTPError as e:
                    last_err = e
                    if e.code == 404:
                        # Try next commit if available
                        continue
                    else:
                        break
                except Exception as e:
                    last_err = e
                    break
            
            if not download_ok:
                print(f"FAILED to download {local_file}. Error: {last_err}")
                failed_files.append((local_file, last_err))

    print(f"\n==========================================")
    print(f"Summary:")
    print(f"Total files in manifests: {total_files}")
    print(f"Downloaded: {downloaded_count}")
    print(f"Skipped (already exist & valid): {skipped_count}")
    print(f"Failed: {len(failed_files)}")
    print(f"==========================================")

    if failed_files:
        print("\nFailed files:")
        for name, err in failed_files:
            print(f" - {name}: {err}")
        sys.exit(1)
    else:
        print("\nAll files successfully downloaded and verified!")
        sys.exit(0)

if __name__ == "__main__":
    main()
