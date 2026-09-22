#!/usr/bin/env python3
"""Replace OpenSearch JARs with patched copies downloaded to /tmp."""

import os
import shutil

ROOT = "/usr/share/opensearch"

REPLACEMENTS = {
    "netty-handler": os.environ["NETTY_HANDLER_VERSION"],
    "bc-fips": os.environ["BC_FIPS_VERSION"],
    "jackson-databind": os.environ["JACKSON_DATABIND_VERSION"],
    "jackson-annotations": os.environ["JACKSON_ANNOTATIONS_VERSION"],
}

SKIP_PREFIXES = ("netty-handler-proxy-",)


def artifact_name(filename: str):
    if not filename.endswith(".jar"):
        return None
    for skip in SKIP_PREFIXES:
        if filename.startswith(skip):
            return None
    for name in REPLACEMENTS:
        if filename.startswith(name + "-"):
            return name
    return None


def main() -> None:
    for dirpath, _, files in os.walk(ROOT):
        for filename in files:
            name = artifact_name(filename)
            if name is None:
                continue
            version = REPLACEMENTS[name]
            src = f"/tmp/{name}-{version}.jar"
            dest = os.path.join(dirpath, f"{name}-{version}.jar")
            old = os.path.join(dirpath, filename)
            if old != dest:
                os.remove(old)
            shutil.copy2(src, dest)
            os.chown(dest, 1000, 1000)
            print(f"replaced {old} -> {dest}", flush=True)


if __name__ == "__main__":
    main()
