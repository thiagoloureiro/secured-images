#!/usr/bin/env python3
"""Replace OpenSearch JARs with patched copies downloaded to /tmp."""

import os
import shutil
import zipfile

ROOT = "/usr/share/opensearch"

# These modules are shaded together inside filtered-security-analytics-commons.
# netty-handler is the CVE-2026-75595 copy; the siblings stay on the same
# 4.1.138 line so the shaded classes keep calling matching Netty APIs.
SHADED_NETTY = (
    "netty-buffer",
    "netty-codec",
    "netty-codec-http",
    "netty-codec-http2",
    "netty-common",
    "netty-handler",
    "netty-resolver",
    "netty-transport",
    "netty-transport-classes-epoll",
    "netty-transport-native-unix-common",
)

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


def version_key(version: str):
    numbers = []
    for part in version.split("."):
        digits = ""
        for char in part:
            if char.isdigit():
                digits += char
            else:
                break
        if digits:
            numbers.append(int(digits))
    return tuple(numbers)


def merge_versions(existing: str, module_props: str, artifact: str) -> str:
    prefix = artifact + "."
    fresh = {}
    for line in module_props.splitlines():
        if line.startswith(prefix):
            fresh[line.split("=", 1)[0]] = line
    lines = []
    seen = set()
    for line in existing.splitlines():
        key = line.split("=", 1)[0]
        if key in fresh:
            lines.append(fresh[key])
            seen.add(key)
        else:
            lines.append(line)
    missing = [line for key, line in fresh.items() if key not in seen]
    if missing:
        if lines and lines[-1] != "":
            lines.append("")
        lines.extend(missing)
    text = "\n".join(lines)
    if not text.endswith("\n"):
        text += "\n"
    return text


def overlay_shaded_netty(fat_path: str, module_jars) -> None:
    with zipfile.ZipFile(fat_path) as fat:
        entries = {
            info.filename.replace("\\", "/"): fat.read(info)
            for info in fat.infolist()
            if not info.is_dir()
        }
    versions_name = "META-INF/io.netty.versions.properties"
    for module_jar in module_jars:
        with zipfile.ZipFile(module_jar) as module:
            module_entries = {
                info.filename.replace("\\", "/"): module.read(info)
                for info in module.infolist()
                if not info.is_dir()
            }
        props = module_entries["META-INF/maven/io.netty/" + os.path.basename(module_jar).split("-4.")[0] + "/pom.properties"]
        artifact = dict(
            line.split("=", 1)
            for line in props.decode().splitlines()
            if "=" in line and not line.startswith("#")
        )["artifactId"]
        class_dirs = {
            name.rsplit("/", 1)[0] + "/"
            for name in module_entries
            if name.startswith("io/netty/") and name.endswith(".class")
        }
        meta_prefix = f"META-INF/maven/io.netty/{artifact}/"
        native_prefix = f"META-INF/native-image/io.netty/{artifact}/"
        for name in list(entries):
            parent = name.rsplit("/", 1)[0] + "/"
            if name.startswith(meta_prefix) or name.startswith(native_prefix):
                del entries[name]
            elif name.startswith("io/netty/") and parent in class_dirs:
                del entries[name]
        for name, data in module_entries.items():
            if name.startswith("io/netty/") or name.startswith(meta_prefix) or name.startswith(native_prefix):
                entries[name] = data
        if versions_name in entries and versions_name in module_entries:
            entries[versions_name] = merge_versions(
                entries[versions_name].decode(),
                module_entries[versions_name].decode(),
                artifact,
            ).encode()
    tmp = fat_path + ".tmp"
    with zipfile.ZipFile(tmp, "w") as out:
        for name, data in entries.items():
            out.writestr(zipfile.ZipInfo(name), data, compress_type=zipfile.ZIP_DEFLATED)
    os.replace(tmp, fat_path)
    os.chown(fat_path, 1000, 1000)
    print(f"overlaid netty {os.environ['NETTY_HANDLER_VERSION']} inside {fat_path}", flush=True)


def shaded_netty_hosts():
    hosts = []
    marker = "META-INF/maven/io.netty/netty-handler/pom.properties"
    for dirpath, _, files in os.walk(ROOT):
        for filename in files:
            if not filename.endswith(".jar") or artifact_name(filename):
                continue
            path = os.path.join(dirpath, filename)
            try:
                with zipfile.ZipFile(path) as jar:
                    if marker in jar.namelist():
                        hosts.append(path)
            except zipfile.BadZipFile:
                continue
    return hosts


def assert_fixed() -> None:
    handler_version = os.environ["NETTY_HANDLER_VERSION"]
    bc_version = os.environ["BCPROV_VERSION"]
    problems = []
    for dirpath, _, files in os.walk(ROOT):
        for filename in files:
            path = os.path.join(dirpath, filename)
            if filename.startswith("bcprov-jdk15to18-") and version_key(
                filename[len("bcprov-jdk15to18-") : -len(".jar")]
            ) < (1, 84):
                problems.append(path)
            if filename.startswith("netty-handler-") and not filename.startswith("netty-handler-proxy-"):
                if handler_version not in filename:
                    problems.append(path)
            if not filename.endswith(".jar"):
                continue
            try:
                jar = zipfile.ZipFile(path)
            except zipfile.BadZipFile:
                continue
            for name in jar.namelist():
                if not name.endswith("pom.properties"):
                    continue
                text = jar.read(name).decode("utf-8", "replace")
                fields = dict(
                    line.split("=", 1)
                    for line in text.splitlines()
                    if "=" in line and not line.startswith("#")
                )
                artifact = fields.get("artifactId", "")
                version = fields.get("version", "")
                if artifact == "bcprov-jdk15to18" and version_key(version) < (1, 84):
                    problems.append(f"{path} :: {artifact} {version}")
                if artifact == "netty-handler" and version != handler_version:
                    problems.append(f"{path} :: {artifact} {version}")
            jar.close()
    if problems:
        raise SystemExit("unpatched jars remain:\n" + "\n".join(problems))
    print(f"verified bcprov-jdk15to18 >= 1.84 ({bc_version}) and netty-handler {handler_version}", flush=True)


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

    version = os.environ["NETTY_HANDLER_VERSION"]
    module_jars = [f"/tmp/{name}-{version}.jar" for name in SHADED_NETTY]
    hosts = shaded_netty_hosts()
    if not hosts:
        raise SystemExit("shaded netty-handler jar was not found")
    for host in hosts:
        overlay_shaded_netty(host, module_jars)
    assert_fixed()


if __name__ == "__main__":
    main()
