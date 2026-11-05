"""Create a source and preview ZIP without local secrets or legacy SQLite code."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parents[1]
target = root.parent / "legalflora-vercel-production.zip"
files = [
    ".env.local.example", ".gitignore", "README.md", "SECURITY_AUDIT.md", "vercel.json",
    "package.json", "package-lock.json", "build.mjs", "index.html",
    "services.html", "funding.html", "incubation.html", "approach.html", "process.html", "contact.html",
    "admin.html", "privacy.html", "styles.css", "admin.css",
    "script.js", "admin.js", "chat.js", "logo.webp", "favicon.png",
]
directories = ["api", "lib", "supabase", "tests", "resources", "dist", "tools"]
with ZipFile(target, "w", ZIP_DEFLATED, compresslevel=9) as archive:
    for name in files:
        archive.write(root / name, name)
    for name in directories:
        for path in (root / name).rglob("*"):
            if path.is_file() and "__pycache__" not in path.parts and path.name != "mobile_audit.js":
                archive.write(path, path.relative_to(root).as_posix())
print(target)
