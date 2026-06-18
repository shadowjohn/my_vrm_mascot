import argparse
import subprocess
import sys


def listening_pids_for_port(port):
    result = subprocess.run(
        ["netstat", "-ano"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError((result.stderr or result.stdout or "netstat failed").strip())

    pids = []
    suffix = f":{port}"
    for line in result.stdout.splitlines():
        parts = line.split()
        if len(parts) < 5 or parts[0].upper() != "TCP":
            continue
        local_address = parts[1]
        state = parts[-2].upper()
        pid = parts[-1]
        if state == "LISTENING" and local_address.endswith(suffix) and pid.isdigit():
            pids.append(pid)
    return sorted(set(pids), key=int)


def stop_pids(pids, dry_run=False):
    if dry_run:
        for pid in pids:
            print(f"Would stop PID {pid}")
        return 0

    exit_code = 0
    for pid in pids:
        print(f"Stopping PID {pid}")
        result = subprocess.run(["taskkill", "/PID", pid, "/F"], check=False)
        if result.returncode != 0:
            exit_code = result.returncode
    return exit_code


def main():
    parser = argparse.ArgumentParser(description="Stop the local My VRM Mascot server by listening port.")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    print(f"Stopping My VRM Mascot server on port {args.port}...")
    pids = listening_pids_for_port(args.port)
    if not pids:
        print(f"No listening process found on port {args.port}.")
        return 0
    return stop_pids(pids, args.dry_run)


if __name__ == "__main__":
    sys.exit(main())
