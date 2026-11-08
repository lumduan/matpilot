#!/usr/bin/env python3
"""Takes the Docs' screenshots (public/docs/*.webp) and writes where their parts are
(src/components/docs/pictures.ts), so the numbered marks in the Docs follow the pictures.

A maintainer's tool, run on a computer with a browser; the site never runs it. Retake the
pictures after a change to a page the Docs show:

    docker compose run --rm dev pnpm build          # the site in out/
    python3 scripts/docs-pictures/serve.py out 3399 &   # serve it like a static host
    python3 scripts/docs-pictures/docs_pictures.py http://127.0.0.1:3399
    docker compose run --rm dev pnpm format          # tidy pictures.ts

Needs Python 3.10+, the `websocket-client` and `Pillow` packages, and Chromium or Chrome
(`--chrome`, or the CHROME environment variable). It starts its own headless browser with a
fresh profile, so it never touches anyone's programs. The 3D view needs WebGL; the software
renderer (SwiftShader) flags below give it one without a graphics card.

The two files beside this script are MatPilot's own: driving-base.mpd, an LDraw driving base
written by hand (ADR 0017's test model), and practice-mat.pdf, a plain practice mat.
"""

import argparse
import base64
import io
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request

import websocket
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
OUT_DIR = os.path.join(ROOT, "public", "docs")
INDEX = os.path.join(ROOT, "src", "components", "docs", "pictures.ts")
PORT = 9339
WIDTH, HEIGHT = 1280, 800

ROBOT = {
    "id": "r-docs", "name": "Rover", "notes": "", "body": {"widthMm": 160, "lengthMm": 200, "heightMm": 120, "axleFromBackMm": 70},
    "wheels": {"diameterMm": 56, "widthMm": 14, "trackMm": 112},
    "drive": {"left": "A", "right": "B", "mirrored": "left", "motor": "spike-medium"},
    "motors": [], "sensors": [{"type": "color", "port": "D", "xMm": 110, "yMm": 0, "facing": "down"}],
    "speed": {"mode": "auto"}, "massG": None, "drift": {"perMetreMm": None, "per90Deg": None},
}


def colour(value):
    return {"shadow": {"type": "mp_color", "fields": {"COLOR": value}}}


def statements(*blocks):
    out = None
    for block in reversed(blocks):
        out = {**block, "next": {"block": out}} if out else block
    return {"block": out}


SWITCH = {
    "type": "mp_switch", "id": "docs-switch", "extraState": {"cases": 3},
    "inputs": {
        "VALUE": {"block": {"type": "mp_sensor_color", "fields": {"PORT": "D"}}},
        "CASE0": colour("RED"), "CASE1": colour("BLUE"), "CASE2": colour("YELLOW"),
        "DO0": statements({"type": "mp_move_stop"}),
        "DO1": statements({"type": "mp_move_turn", "inputs": {"ANGLE": {"shadow": {"type": "mp_turn_angle", "fields": {"ANGLE": 90}}}}}),
        "DO2": statements({"type": "mp_light_button", "fields": {"COLOR": "YELLOW"}}),
        "ELSE": statements({"type": "mp_move_start", "fields": {"DIRECTION": "FORWARD"}}),
    },
}


def program(*blocks):
    return {"tabs": [{"id": "main", "name": "main", "workspace": {"blocks": {"languageVersion": 0, "blocks": [
        {"type": "mp_program", "x": 40, "y": 40, "next": statements(*blocks)}]}}}], "active": "main"}


SWITCH_PROGRAM = program({"type": "mp_forever", "inputs": {"DO": {"block": SWITCH}}})
PATH_PROGRAM = program(
    {"type": "mp_move", "fields": {"DIRECTION": "FORWARD", "UNIT": "MM"}, "inputs": {"AMOUNT": {"shadow": {"type": "math_number", "fields": {"NUM": 400}}}}},
    {"type": "mp_move_turn", "inputs": {"ANGLE": {"shadow": {"type": "mp_turn_angle", "fields": {"ANGLE": -90}}}}},
    {"type": "mp_move", "fields": {"DIRECTION": "FORWARD", "UNIT": "MM"}, "inputs": {"AMOUNT": {"shadow": {"type": "math_number", "fields": {"NUM": 250}}}}},
)

WS = "document.querySelector('[data-testid=blocks-workspace]')"
DROPDOWN_OPEN = ("(() => { const d = document.querySelector('.blocklyDropDownDiv'); return !!d && getComputedStyle(d).display !== 'none'"
                 " && d.querySelector('.mp-picker') !== null && getComputedStyle(d).opacity !== '0'; })()")


class Page:
    """A page in headless Chromium over the DevTools protocol."""

    def __init__(self, ws_url):
        self.ws = websocket.create_connection(ws_url, timeout=60, suppress_origin=True)
        self.next_id = 0
        self.events = []
        for domain in ("Page", "Runtime", "Network", "DOM"):
            self.send(f"{domain}.enable")
        self.send("Emulation.setDeviceMetricsOverride", {"width": WIDTH, "height": HEIGHT, "deviceScaleFactor": 1, "mobile": False})
        self.send("Emulation.setEmulatedMedia", {"features": [{"name": "prefers-color-scheme", "value": "light"}, {"name": "prefers-reduced-motion", "value": "reduce"}]})

    def send(self, method, params=None):
        self.next_id += 1
        ident = self.next_id
        self.ws.send(json.dumps({"id": ident, "method": method, "params": params or {}}))
        while True:
            message = json.loads(self.ws.recv())
            if message.get("id") == ident:
                if "error" in message:
                    raise RuntimeError(f"{method}: {message['error']}")
                return message.get("result", {})
            self.events.append(message)

    def wait(self, seconds):
        self.ws.settimeout(seconds)
        try:
            while True:
                self.events.append(json.loads(self.ws.recv()))
        except websocket.WebSocketTimeoutException:
            pass
        finally:
            self.ws.settimeout(60)

    def eval(self, expression):
        result = self.send("Runtime.evaluate", {"expression": expression, "awaitPromise": True, "returnByValue": True, "userGesture": True})
        if "exceptionDetails" in result:
            raise RuntimeError(f"{expression[:100]}: {result['exceptionDetails'].get('exception', {}).get('description')}")
        return result["result"].get("value")

    def until(self, expression, timeout=30):
        deadline = time.time() + timeout
        while time.time() < deadline:
            if self.eval(expression):
                return
            self.wait(0.1)
        raise TimeoutError(expression)

    def go(self, url):
        self.send("Page.navigate", {"url": url})
        self.until("document.readyState === 'complete'")
        self.wait(0.5)

    def rect(self, selector_js):
        """[x, y, width, height] of an element, or None."""
        return self.eval(f"(() => {{ const el = {selector_js}; if (!el) return null; const r = el.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; }})()")

    def click(self, selector_js):
        box = self.rect(selector_js)
        if not box:
            raise RuntimeError(f"nothing to click: {selector_js}")
        x, y = box[0] + box[2] / 2, box[1] + box[3] / 2
        for kind in ("mouseMoved", "mousePressed", "mouseReleased"):
            self.send("Input.dispatchMouseEvent", {"type": kind, "x": x, "y": y, "button": "left", "buttons": 1 if kind == "mousePressed" else 0, "clickCount": 1})
        self.wait(0.5)

    def set_file(self, testid, path):
        doc = self.send("DOM.getDocument", {"depth": -1})
        node = self.send("DOM.querySelector", {"nodeId": doc["root"]["nodeId"], "selector": f"[data-testid={testid}]"})
        self.send("DOM.setFileInputFiles", {"nodeId": node["nodeId"], "files": [path]})

    def set_value(self, testid, value, kind="HTMLInputElement", event="input"):
        self.eval(f"""(() => {{ const el = document.querySelector('[data-testid={testid}]');
          Object.getOwnPropertyDescriptor({kind}.prototype, 'value').set.call(el, {json.dumps(value)});
          el.dispatchEvent(new Event({json.dumps(event)}, {{ bubbles: true }})); }})()""")
        self.wait(0.3)

    def shot(self, clip=None):
        """A PNG of `clip` ([x, y, width, height] in the window, as rect() gives them)."""
        params = {"format": "png"}
        if clip:
            # The protocol's clip is in page coordinates: add how far the page is scrolled.
            sx, sy = self.eval("[window.scrollX, window.scrollY]")
            params["clip"] = {"x": clip[0] + sx, "y": clip[1] + sy, "width": clip[2], "height": clip[3], "scale": 1}
        return Image.open(io.BytesIO(base64.b64decode(self.send("Page.captureScreenshot", params)["data"])))

    def errors(self):
        out = []
        for event in self.events:
            method, params = event.get("method"), event.get("params", {})
            if method == "Runtime.exceptionThrown":
                out.append(params["exceptionDetails"].get("text", ""))
            elif method == "Runtime.consoleAPICalled" and params.get("type") == "error":
                out.append(" ".join(str(a.get("value", a.get("description", ""))) for a in params["args"]))
        return out


def by_testid(testid):
    return f"document.querySelector('[data-testid={testid}]')"


def by_text(selector, text):
    return f"[...document.querySelectorAll({json.dumps(selector)})].find(e => e.textContent.replace(/\\u00a0/g, ' ').trim() === {json.dumps(text)})"


class Pictures:
    def __init__(self, base):
        self.base = base
        self.index = {}

    def save(self, name, page, clip=None, marks=None):
        """Saves a screenshot (of `clip`, else the window) and its marks, as % of the picture."""
        clip = clip or [0, 0, WIDTH, HEIGHT]
        clip = [max(0, round(clip[0])), max(0, round(clip[1])), round(clip[2]), round(clip[3])]
        image = page.shot(clip).convert("RGB")
        image.save(os.path.join(OUT_DIR, f"{name}.webp"), "WEBP", quality=82, method=6)
        placed = {}
        for key, point in (marks or {}).items():
            if point is None:
                raise RuntimeError(f"{name}: no place for the mark {key}")
            x, y = point
            spot = [round((x - clip[0]) / clip[2] * 100, 1), round((y - clip[1]) / clip[3] * 100, 1)]
            if not all(0 <= value <= 100 for value in spot):
                raise RuntimeError(f"{name}: the mark {key} is outside the picture ({spot})")
            placed[key] = spot
        self.index[name] = {"file": f"{name}.webp", "width": image.width, "height": image.height, "marks": placed}
        print(f"{name}: {image.width}×{image.height}, marks {sorted(placed)}", flush=True)


def beside(page, selector_js, side, gap=22):
    """A spot just outside an element's text or box: "left", "right", "above" or "below"."""
    box = page.eval(f"""(() => {{ const el = {selector_js}; if (!el) return null;
      const range = document.createRange(); range.selectNodeContents(el);
      const text = range.getBoundingClientRect(), all = el.getBoundingClientRect();
      const r = text.width > 0 && el.children.length === 0 ? text : all;
      return [r.x, r.y, r.width, r.height]; }})()""")
    if not box:
        return None
    x, y, w, h = box
    return {"left": [x - gap, y + h / 2], "right": [x + w + gap, y + h / 2],
            "above": [x + w / 2, y - gap], "below": [x + w / 2, y + h + gap]}[side]


def centre(page, selector_js, dx=0.5, dy=0.5):
    box = page.rect(selector_js)
    return None if not box else [box[0] + box[2] * dx, box[1] + box[3] * dy]


def union(*boxes, pad=16):
    boxes = [b for b in boxes if b]
    x0 = min(b[0] for b in boxes) - pad
    y0 = min(b[1] for b in boxes) - pad
    x1 = max(b[0] + b[2] for b in boxes) + pad
    y1 = max(b[1] + b[3] for b in boxes) + pad
    x0, y0 = max(0, x0), max(0, y0)
    return [x0, y0, min(WIDTH, x1) - x0, y1 - y0]


def open_blocks(page, base, saved=None, python=True):
    page.go(f"{base}/blocks")
    page.eval("localStorage.clear()")
    if saved:
        page.eval(f"localStorage.setItem('matpilot.blocks.tabs.v2', {json.dumps(json.dumps(saved))})")
    page.eval(f"localStorage.setItem('matpilot.blocks.python-panel.v1', {json.dumps('open' if python else 'closed')})")
    page.go(f"{base}/blocks")
    page.until(f"{WS}?.dataset.status === 'ready'")
    page.wait(1.2)


def blocks_pictures(page, pictures, base):
    # The Blocks page with its starter program and the Python beside it.
    open_blocks(page, base)
    start = by_text("svg.blocklySvg .blocklyBlockCanvas text", "when the program starts")
    # Each mark sits just beside what it points at, so it does not hide its words.
    pictures.save("blocks-page", page, marks={
        "categories": beside(page, "document.querySelector('.blocklyToolboxCategoryLabel')", "right"),
        "start": beside(page, start, "right"),
        "run": beside(page, by_testid("run"), "below"),
        "connect": beside(page, "document.querySelector('.button-connect')", "below"),
        "devices": beside(page, by_testid("device-bar") + ".querySelector('p') ?? " + by_testid("device-bar"), "right"),
        "view": beside(page, "document.querySelector('.segmented')", "below"),
        "python": centre(page, by_testid("python-code"), 0.6, 0.12),
        "undo": beside(page, by_testid("undo"), "below"),
        "save": beside(page, by_testid("save"), "below"),
        "tabs": beside(page, by_testid("tab-add"), "right"),
        "robot": beside(page, by_testid("robot-picker"), "left"),
        "panes": beside(page, by_testid("toggle-monitor"), "above"),
        "help": beside(page, by_testid("blocks-help"), "right"),
    })

    # The Conditions category open.
    page.click(by_text(".blocklyToolboxCategoryLabel", "Conditions"))
    page.wait(0.8)
    flyout = page.rect("[...document.querySelectorAll('svg.blocklyFlyout')].find(f => f.getBoundingClientRect().width > 0 && getComputedStyle(f).display !== 'none')")
    toolbox = page.rect("document.querySelector('.blocklyToolbox')")
    pictures.save("blocks-conditions", page, clip=[toolbox[0], toolbox[1], flyout[0] + flyout[2] - toolbox[0], min(HEIGHT - toolbox[1], 640)])

    # A switch on the colour sensor, its ⊕, and its Python: the whole program, and its Python from
    # the line that reads the colour.
    open_blocks(page, base, SWITCH_PROGRAM)
    line_js = f"[...{by_testid('python-code')}.querySelectorAll('*')].filter(e => e.children.length === 0 && e.textContent.includes('switch_value'))[0]?.parentElement"
    page.eval(f"{line_js}.scrollIntoView({{ block: 'start' }})")
    page.wait(0.4)
    program = page.rect(by_text("svg.blocklySvg .blocklyBlockCanvas text", "when the program starts") + ".closest('g.blocklyDraggable')")
    python = page.rect(by_testid("python-code"))
    plus = centre(page, "[...document.querySelectorAll('g[data-id=\"docs-switch\"] image')].find(i => (i.getAttribute('xlink:href') || i.getAttribute('href') || '').includes('M12%208v8'))")
    line = centre(page, line_js, 0.35, 0.5)
    clip = union(program, [python[0], program[1], python[2], program[3]], pad=12)
    pictures.save("blocks-switch", page, clip=clip, marks={"plus": plus, "python": line})

    # The port picker, on the colour sensor's port.
    page.click(by_text("svg.blocklySvg .blocklyBlockCanvas text", "D"))
    page.until(DROPDOWN_OPEN, timeout=5)
    page.wait(0.4)
    pictures.save("blocks-port", page, clip=union(page.rect("document.querySelector('.blocklyDropDownDiv')"), pad=0))
    page.send("Input.dispatchKeyEvent", {"type": "keyDown", "key": "Escape", "code": "Escape"})
    page.send("Input.dispatchKeyEvent", {"type": "keyUp", "key": "Escape", "code": "Escape"})
    page.wait(0.5)

    # The turn dial.
    page.click(by_text("svg.blocklySvg .blocklyBlockCanvas text", "right 90°"))
    page.until(DROPDOWN_OPEN, timeout=5)
    page.wait(0.4)
    pictures.save("blocks-turn", page, clip=union(page.rect("document.querySelector('.blocklyDropDownDiv')"), pad=0))
    page.send("Input.dispatchKeyEvent", {"type": "keyDown", "key": "Escape", "code": "Escape"})
    page.wait(0.3)


def robots_pictures(page, pictures, base):
    page.go(f"{base}/robots")
    page.eval(f"localStorage.clear(); localStorage.setItem('matpilot.robots.v1', {json.dumps(json.dumps({'robots': [ROBOT], 'openId': 'r-docs'}))})")
    # A taller window, so the robot's sections fit without scrolling.
    page.send("Emulation.setDeviceMetricsOverride", {"width": WIDTH, "height": 1150, "deviceScaleFactor": 1, "mobile": False})
    page.go(f"{base}/robots")
    page.until(f"!!{by_testid('robot-model')}")
    page.wait(0.8)
    pictures.save("robots-page", page, clip=[0, 0, WIDTH, 1150], marks={
        "choice": beside(page, by_testid("robot-choice"), "left"),
        "name": centre(page, by_testid("robot-name"), 0.9, 0.5),
        "drawing": centre(page, by_testid("robot-drawing"), 0.5, 0.5),
        "model": beside(page, by_testid("robot-model"), "right"),
        "calibrate": beside(page, by_testid("robot-calibrate"), "right"),
        "save": beside(page, by_testid("robot-save"), "below"),
    })

    # The LEGO model, in a taller window so the whole dialog fits.
    page.send("Emulation.setDeviceMetricsOverride", {"width": WIDTH, "height": 1950, "deviceScaleFactor": 1, "mobile": False})
    page.click(by_testid("robot-model"))
    page.until("!!document.querySelector('dialog[open]')")
    page.set_file("model-file", os.path.join(HERE, "driving-base.mpd"))
    page.until(f"{by_testid('model-3d')}?.dataset.status === 'ready'", timeout=120)
    page.wait(1.0)
    dialog = page.rect("document.querySelector('dialog[open]')")
    bottom = page.rect(by_testid("model-apply"))
    clip = [dialog[0], dialog[1], dialog[2], min(dialog[3], bottom[1] + bottom[3] + 16 - dialog[1])]
    pictures.save("robots-model", page, clip=clip, marks={
        "file": centre(page, "document.querySelector('label.model-file')", 1.0, 0.5),
        "view3d": centre(page, by_testid("model-3d"), 0.85, 0.15),
        "front": centre(page, by_testid("model-front"), 0.0, 0.5),
        "ports": centre(page, "document.querySelector('dialog[open] select')", 0.0, 0.5),
        "apply": centre(page, by_testid("model-apply"), 1.0, 0.5),
    })
    page.send("Emulation.setDeviceMetricsOverride", {"width": WIDTH, "height": HEIGHT, "deviceScaleFactor": 1, "mobile": False})


def mats_pictures(page, pictures, base):
    page.send("Emulation.setDeviceMetricsOverride", {"width": WIDTH, "height": 900, "deviceScaleFactor": 1, "mobile": False})
    # The program the Blocks page hands over, and the robot.
    open_blocks(page, base, PATH_PROGRAM, python=False)
    page.eval(f"localStorage.setItem('matpilot.robots.v1', {json.dumps(json.dumps({'robots': [ROBOT], 'openId': 'r-docs'}))})")
    page.go(f"{base}/mats")
    page.until(f"!!{by_testid('mats-empty')}")
    page.set_file("mat-add-input", os.path.join(HERE, "practice-mat.pdf"))
    page.until("!!document.querySelector('[data-testid=add-mat][open]')")
    page.wait(0.4)
    page.click("document.querySelector('[data-testid=add-mat-save]')")
    page.until(f"!!{by_testid('mat-size')} && !document.querySelector('[data-testid=add-mat][open]')", timeout=60)
    page.wait(0.8)
    page.set_value("mat-robot-choice", "r-docs", kind="HTMLSelectElement", event="change")
    page.set_value("mat-pose-x", "400")
    page.set_value("mat-pose-y", "300")
    page.set_value("mat-pose-heading", "0")
    page.wait(0.6)
    pictures.save("mats-page", page, clip=[0, 0, WIDTH, 900], marks={
        "add": beside(page, by_testid("mat-add"), "below"),
        "robot": centre(page, "document.querySelector('.mat-robot-body')", 0.5, 0.5),
        "pose": centre(page, by_testid("mat-pose-x"), 0.75, -0.55),
        "tools": beside(page, "document.querySelector('[role=group][aria-label=Tool]')", "right"),
    })

    # Run it from the panel (a click from script: the button may be below the panel's fold).
    page.eval(f"{by_testid('run-start')}.click()")
    page.until(f"!!{by_testid('run-result')}", timeout=90)
    page.until(f"!!{by_testid('playback')}", timeout=10)
    page.wait(1.0)
    page.set_value("playback-time", "100000")
    page.wait(0.6)
    pictures.save("mats-run", page, clip=[0, 0, WIDTH, 900], marks={
        "path": centre(page, "document.querySelector('.mat-path-all')", 0.5, 0.0),
        "playback": centre(page, by_testid("playback"), 0.1, 0.5),
    })


def grown_up_pictures(page, pictures, base):
    page.send("Emulation.setDeviceMetricsOverride", {"width": WIDTH, "height": HEIGHT, "deviceScaleFactor": 1, "mobile": False})
    open_blocks(page, base, python=False)
    page.click(by_testid("save"))
    page.until("!!document.querySelector('dialog[open]')")
    page.eval("[...document.querySelectorAll('dialog[open] button')].find(b => /GitHub/.test(b.textContent) && !/Save to/.test(b.textContent)).click()")
    page.until(f"!!{by_testid('github-dialog')}?.open")
    page.wait(0.5)
    pictures.save("grown-ups-github", page, clip=union(page.rect(by_testid("github-dialog")), pad=0))
    page.eval(f"{by_testid('github-dialog')}.close()")
    page.wait(0.3)

    open_blocks(page, base, python=False)
    page.click(by_testid("toggle-ai"))
    page.until(f"!!{by_testid('ai-set-up')}")
    page.click(by_testid("ai-set-up"))
    page.until("!!document.querySelector('dialog[open]')")
    page.wait(0.5)
    pictures.save("grown-ups-ai", page, clip=union(page.rect("document.querySelector('dialog[open]')"), pad=0))


def write_index(index):
    lines = [
        "/**",
        " * The Docs' screenshots in public/docs/: size, and where the parts the Docs point at are, in % of",
        " * the picture. Written by scripts/docs-pictures/docs_pictures.py; do not edit by hand.",
        " */",
        "export const PICTURES = " + json.dumps(dict(sorted(index.items())), indent=2, ensure_ascii=False) + " as const;",
        "",
        "export type PictureName = keyof typeof PICTURES;",
        "",
    ]
    with open(INDEX, "w", encoding="utf-8") as handle:
        handle.write("\n".join(lines))


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("base", help="where the built site is served, e.g. http://127.0.0.1:3399")
    parser.add_argument("--chrome", default=os.environ.get("CHROME") or shutil.which("chromium") or shutil.which("google-chrome"))
    args = parser.parse_args()
    if not args.chrome:
        sys.exit("Chromium or Chrome is needed: pass --chrome or set CHROME.")
    os.makedirs(OUT_DIR, exist_ok=True)
    profile = tempfile.mkdtemp(prefix="matpilot-docs-")
    browser = subprocess.Popen([args.chrome, "--headless=new", f"--remote-debugging-port={PORT}", f"--user-data-dir={profile}",
                                "--no-first-run", "--no-sandbox", "--hide-scrollbars", "--use-angle=swiftshader",
                                "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "about:blank"],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    pictures = Pictures(args.base)
    try:
        for _ in range(100):
            try:
                urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/version", timeout=2)
                break
            except OSError:
                time.sleep(0.1)
        request = urllib.request.Request(f"http://127.0.0.1:{PORT}/json/new?about:blank", method="PUT")
        page = Page(json.loads(urllib.request.urlopen(request, timeout=10).read())["webSocketDebuggerUrl"])
        blocks_pictures(page, pictures, args.base)
        robots_pictures(page, pictures, args.base)
        mats_pictures(page, pictures, args.base)
        grown_up_pictures(page, pictures, args.base)
        errors = page.errors()
        if errors:
            print("Errors on the pages:", *errors, sep="\n  ", file=sys.stderr)
    finally:
        browser.terminate()
        browser.wait(timeout=10)
        shutil.rmtree(profile, ignore_errors=True)
    write_index(pictures.index)
    print(f"{len(pictures.index)} pictures in {OUT_DIR}; their index in {INDEX}")


if __name__ == "__main__":
    main()
