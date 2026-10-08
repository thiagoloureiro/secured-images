#!/usr/bin/env python3
"""Replace OpenSearch JARs with patched copies downloaded to /tmp."""

import os
import shutil

ROOT = "/usr/share/opensearch"

REPLACEMENTS = {
    "netty-handler-proxy": os.environ["NETTY_HANDLER_PROXY_VERSION"],
    "netty-handler": os.environ["NETTY_HANDLER_VERSION"],
    "bcprov-jdk15to18": os.environ["BCPROV_VERSION"],
    "bcprov-jdk18on": os.environ["BCPROV_VERSION"],
    "bcpkix-jdk15to18": os.environ["BCPROV_VERSION"],
    "bcpkix-jdk18on": os.environ["BCPROV_VERSION"],
    "bcutil-jdk15to18": os.environ["BCPROV_VERSION"],
    "bc-fips": os.environ["BC_FIPS_VERSION"],
    "jackson-databind": os.environ["JACKSON_DATABIND_VERSION"],
    "jackson-annotations": os.environ["JACKSON_ANNOTATIONS_VERSION"],
    "jackson-core": os.environ["JACKSON_CORE_VERSION"],
}


def artifact_name(filename: str):
    if not filename.endswith(".jar"):
        return None
    for name in sorted(REPLACEMENTS, key=len, reverse=True):
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
