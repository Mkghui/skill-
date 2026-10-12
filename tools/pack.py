#!/usr/bin/env python3
"""打包 skills/<name> 成 dist/<name>-<version>.zip。

为什么不用 `tar -a`：中文 Windows 上的 bsdtar 会用本地代码页（GBK）写条目名，
且不打 UTF-8 标记（flag 0x800）——在别的机器上解出来就是乱码。
zipfile 写 UTF-8 名并打标记，任何平台都能正确解压。

用法：
    python tools/pack.py comfyui-ziqwh3            # 版本号从 SKILL.md 的 metadata.version 读
    python tools/pack.py comfyui-ziqwh3 1.0.1      # 或直接指定
"""
import hashlib
import pathlib
import re
import sys
import zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
SKIP = {".DS_Store", "Thumbs.db", "desktop.ini", "__pycache__"}


def read_version(skill_dir: pathlib.Path) -> str:
    text = (skill_dir / "SKILL.md").read_text(encoding="utf-8")
    fm = re.match(r"^---\n(.*?)\n---\n", text, re.DOTALL)
    if fm:
        m = re.search(r'^\s+version:\s*"?([0-9][^"\n]*?)"?\s*$', fm.group(1), re.MULTILINE)
        if m:
            return m.group(1).strip()
    return "0.1.0"


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 1
    name = sys.argv[1]
    skill_dir = ROOT / "skills" / name
    if not (skill_dir / "SKILL.md").is_file():
        print(f"[ERROR] 找不到 skills/{name}/SKILL.md")
        return 1
    version = sys.argv[2] if len(sys.argv) > 2 else read_version(skill_dir)

    dist = ROOT / "dist"
    dist.mkdir(exist_ok=True)
    zip_path = dist / f"{name}-{version}.zip"

    files = sorted(p for p in skill_dir.rglob("*")
                   if p.is_file() and not any(part in SKIP for part in p.parts))
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for p in files:
            z.write(p, arcname=f"{name}/{p.relative_to(skill_dir).as_posix()}")

    digest = hashlib.sha256(zip_path.read_bytes()).hexdigest()
    (dist / f"{name}-{version}.zip.sha256").write_text(
        f"{digest}  {zip_path.name}\n", encoding="ascii")

    with zipfile.ZipFile(zip_path) as z:
        bad = [i.filename for i in z.infolist()
               if not i.filename.isascii() and not (i.flag_bits & 0x800)]
        entries = len(z.infolist())

    print(f"[OK] {zip_path}  ({zip_path.stat().st_size / 1024:.1f} KB, {entries} 个条目)")
    print(f"     sha256 {digest}")
    if bad:
        print(f"[ERROR] 有 {len(bad)} 个条目缺 UTF-8 标记，跨平台会乱码：{bad[:2]}")
        return 1
    print("     中文文件名已带 UTF-8 标记，跨平台可正确解压")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())