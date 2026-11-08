"""Jupyter bridge for the vsc-editor notebook view.

  kernel.py serve <dir> <cwd>   start a kernel and serve requests (run in the background)
  kernel.py extract <dir>       read a notebook on stdin, write its PNG outputs to <dir>/img,
                                print {"cell/output": {"path", "w", "h"}} (stdlib only)

The editor talks to `serve` through files in <dir>:
  inbox/<n>.json   requests: {"op": "run", "id", "code"} | {"op": "interrupt" | "restart" | "shutdown"}
  out/<id>.json    a run's progress: {"state": "running" | "done", "count", "outputs": [nbformat outputs]}
  status.json      {"state": "starting" | "idle" | "busy" | "dead", "python", "error"?}
"""
import base64, hashlib, json, os, re, signal, struct, sys, time

ANSI = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")


def write_json(path, data):
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(data, f)
    os.replace(tmp, path)


def png_file(d, b64):
    raw = base64.b64decode(b64)
    name = hashlib.sha1(raw).hexdigest()[:16] + ".png"
    os.makedirs(os.path.join(d, "img"), exist_ok=True)
    path = os.path.join(d, "img", name)
    if not os.path.exists(path):
        with open(path, "wb") as f:
            f.write(raw)
    w, h = struct.unpack(">II", raw[16:24]) if raw[:8] == b"\x89PNG\r\n\x1a\n" else (0, 0)
    return {"path": path, "w": w, "h": h}


def extract(d):
    nb = json.load(sys.stdin)
    found = {}
    for ci, cell in enumerate(nb.get("cells", [])):
        for oi, out in enumerate(cell.get("outputs", []) or []):
            png = (out.get("data") or {}).get("image/png")
            if png:
                found[f"{ci}/{oi}"] = png_file(d, "".join(png) if isinstance(png, list) else png)
    print(json.dumps(found))


def serve(d, cwd):
    os.makedirs(os.path.join(d, "inbox"), exist_ok=True)
    os.makedirs(os.path.join(d, "out"), exist_ok=True)
    status = os.path.join(d, "status.json")
    with open(os.path.join(d, "pid"), "w") as f:
        f.write(str(os.getpid()))
    write_json(status, {"state": "starting", "python": sys.executable})
    try:
        from jupyter_client.manager import KernelManager
    except ImportError:
        write_json(status, {"state": "dead", "python": sys.executable,
                            "error": "ipykernel is not installed in this Python"})
        return
    # IPC sockets inside <dir> instead of localhost TCP ports: nothing else on the machine can connect.
    km = KernelManager(kernel_name="python3", transport="ipc", ip=os.path.join(d, "kernel"))
    km.start_kernel(cwd=cwd)
    kc = km.client()
    kc.start_channels()
    kc.wait_for_ready(timeout=60)
    write_json(status, {"state": "idle", "python": sys.executable})

    def stop(*_):
        write_json(status, {"state": "dead", "python": sys.executable})
        try:
            kc.stop_channels(); km.shutdown_kernel(now=True)
        finally:
            os._exit(0)
    signal.signal(signal.SIGTERM, stop)

    def requests():
        inbox = os.path.join(d, "inbox")
        for name in sorted(os.listdir(inbox)):
            if not name.endswith(".json"):
                continue
            path = os.path.join(inbox, name)
            try:
                with open(path) as f:
                    req = json.load(f)
            except Exception:
                continue
            os.remove(path)
            yield req

    def run(req):
        out_path = os.path.join(d, "out", req["id"] + ".json")
        result = {"state": "running", "count": None, "outputs": []}
        write_json(out_path, result)
        write_json(status, {"state": "busy", "python": sys.executable})
        msg_id = kc.execute(req["code"])
        while True:
            for other in requests():  # interrupts and restarts while a cell runs
                if other["op"] == "interrupt":
                    km.interrupt_kernel()
                elif other["op"] in ("restart", "shutdown"):
                    pending.append(other)
                    km.interrupt_kernel()
                elif other["op"] == "run":
                    pending.append(other)
            try:
                msg = kc.get_iopub_msg(timeout=0.2)
            except Exception:
                if not km.is_alive():
                    result["outputs"].append({"output_type": "error", "ename": "DeadKernel", "evalue": "The kernel died", "traceback": []})
                    break
                continue
            if msg["parent_header"].get("msg_id") != msg_id:
                continue
            t, c = msg["msg_type"], msg["content"]
            outs = result["outputs"]
            if t == "stream":
                if outs and outs[-1].get("output_type") == "stream" and outs[-1]["name"] == c["name"]:
                    outs[-1]["text"] += c["text"]
                else:
                    outs.append({"output_type": "stream", "name": c["name"], "text": c["text"]})
            elif t in ("execute_result", "display_data"):
                o = {"output_type": t, "data": c["data"], "metadata": c.get("metadata", {})}
                if t == "execute_result":
                    o["execution_count"] = c.get("execution_count")
                if "image/png" in c["data"]:
                    o["_img"] = png_file(d, c["data"]["image/png"])
                outs.append(o)
            elif t == "error":
                outs.append({"output_type": "error", "ename": c["ename"], "evalue": c["evalue"],
                             "traceback": [ANSI.sub("", l) for l in c["traceback"]]})
            elif t == "execute_input":
                result["count"] = c.get("execution_count")
            elif t == "clear_output":
                outs.clear()
            elif t == "status" and c["execution_state"] == "idle":
                break
            write_json(out_path, result)
        result["state"] = "done"
        write_json(out_path, result)
        write_json(status, {"state": "idle", "python": sys.executable})

    pending, last = [], time.time()
    while True:
        pending.extend(requests())
        if not pending:
            if time.time() - last > 4 * 3600:  # idle for 4 hours: stop
                stop()
            time.sleep(0.15)
            continue
        req, last = pending.pop(0), time.time()
        if req["op"] == "run":
            run(req)
        elif req["op"] == "restart":
            write_json(status, {"state": "starting", "python": sys.executable})
            km.restart_kernel(now=True)
            kc.wait_for_ready(timeout=60)
            write_json(status, {"state": "idle", "python": sys.executable})
        elif req["op"] == "shutdown":
            stop()


if __name__ == "__main__":
    if sys.argv[1] == "serve":
        serve(sys.argv[2], sys.argv[3])
    elif sys.argv[1] == "extract":
        extract(sys.argv[2])
