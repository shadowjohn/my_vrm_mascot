# Local VRMA Asset Setup

Third-party VRMA binaries are local-only and are not committed to git.

Recommended local path:

```text
D:\mytools\my_vrm_mascot\local_assets\vrma\
```

The local server also keeps backward-compatible scanning for:

```text
D:\mytools\my_vrm_mascot\examples\m6_7_vrma_samples\
```

`/api/vrma-samples` scans both locations. Prefer `local_assets\vrma\` for
restored or newly mined files, because that whole tree is ignored by git.

Required demo samples for the current Alicia Motion Mine flow:

```json
{
  "note": "Third-party VRMA binaries are local-only and not committed.",
  "required": [
    "Angry.vrma",
    "Blush.vrma",
    "Clapping.vrma",
    "Goodbye.vrma",
    "Jump.vrma",
    "LookAround.vrma",
    "Relax.vrma",
    "Sad.vrma",
    "Sleepy.vrma",
    "Surprised.vrma",
    "Thinking.vrma"
  ]
}
```

PowerShell setup:

```powershell
cd D:\mytools\my_vrm_mascot
New-Item -ItemType Directory -Force .\local_assets\vrma | Out-Null
```

After restoring files, run:

```powershell
python .\scratch\test_motion_profile_api.py
node .\scratch\test_motion_template_importer.mjs
```
