import fnmatch
import json
import os
import threading
import time
import urllib.parse
import urllib.request

from mitmproxy import ctx, http


INTERNAL_SECRET = os.environ.get("INTERNAL_SECRET", "tamelog-internal-2026")
API_BASE = os.environ.get("API_BASE", "http://127.0.0.1:3001")
CACHE_TTL = 2
NOTIFY_COOLDOWN = 300

_cache = {}
_notify_cache = {}


def fetch_blocked(vpn_ip: str):
  try:
    url = f"{API_BASE}/api/vpn/internal/active-blocks?vpn_ip={urllib.parse.quote(vpn_ip)}"
    req = urllib.request.Request(url, headers={"x-internal-secret": INTERNAL_SECRET})
    with urllib.request.urlopen(req, timeout=3) as response:
      data = json.loads(response.read())
      patterns = frozenset(domain.lower() for domain in data.get("blocked", []))
      user_id = data.get("userId", "")
      return patterns, user_id
  except Exception as exc:
    ctx.log.warn(f"[MITM] active-blocks error for {vpn_ip}: {exc}")
    return frozenset(), ""


def get_blocked(vpn_ip: str):
  now = time.time()
  cached = _cache.get(vpn_ip)
  if cached is None or now - cached[2] > CACHE_TTL:
    patterns, user_id = fetch_blocked(vpn_ip)
    _cache[vpn_ip] = (patterns, user_id, now)
    return patterns, user_id
  return cached[0], cached[1]


def match_domain(host: str, pattern: str):
  host = host.lower().rstrip(".")
  pattern = pattern.lower()
  if "*" not in pattern:
    return host == pattern or host.endswith("." + pattern)
  return fnmatch.fnmatch(host, pattern)


def should_notify(vpn_ip: str, host: str):
  key = (vpn_ip, host)
  now = time.time()
  last = _notify_cache.get(key, 0)
  if now - last < NOTIFY_COOLDOWN:
    return False
  _notify_cache[key] = now
  return True


def send_block_notify(vpn_ip: str, domain: str):
  try:
    payload = json.dumps({
      "vpn_ip": vpn_ip,
      "domain": domain,
      "category_code": "EC"
    }).encode()
    req = urllib.request.Request(
      f"{API_BASE}/api/vpn/internal/block-notify",
      data=payload,
      headers={
        "x-internal-secret": INTERNAL_SECRET,
        "Content-Type": "application/json"
      },
      method="POST"
    )
    with urllib.request.urlopen(req, timeout=5):
      return
  except Exception as exc:
    ctx.log.warn(f"[MITM] block-notify error for {vpn_ip}/{domain}: {exc}")


def build_block_html(host: str):
  safe_host = host.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
  return f"""<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>アクセスを制限しました</title>
    <style>
      body {{
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #f5f7f9;
        color: #111827;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }}
      main {{
        width: min(92vw, 520px);
        padding: 32px 24px;
        border-radius: 24px;
        background: #ffffff;
        box-shadow: 0 24px 60px rgba(17, 24, 39, 0.08);
      }}
      h1 {{ margin: 0 0 12px; font-size: 24px; }}
      p {{ margin: 0; line-height: 1.7; color: #4b5563; }}
      code {{
        display: inline-block;
        margin-top: 8px;
        padding: 4px 8px;
        border-radius: 10px;
        background: #eef2f7;
        color: #0f172a;
      }}
    </style>
  </head>
  <body>
    <main>
      <h1>このサイトは現在ブロックされています</h1>
      <p>VPN のフィルタリング設定によりアクセスを制限しました。</p>
      <code>{safe_host}</code>
    </main>
  </body>
</html>"""


class TameLogMitmFilter:
  def request(self, flow: http.HTTPFlow):
    peer = getattr(flow.client_conn, "peername", None)
    client_ip = peer[0] if peer else ""
    if not client_ip.startswith("10.10.10."):
      return

    host = flow.request.pretty_host.lower().rstrip(".")
    patterns, _user_id = get_blocked(client_ip)
    matched = next((pattern for pattern in patterns if match_domain(host, pattern)), None)
    if not matched:
      return

    if should_notify(client_ip, matched):
      threading.Thread(target=send_block_notify, args=(client_ip, host), daemon=True).start()

    flow.response = http.Response.make(
      451,
      build_block_html(host).encode("utf-8"),
      {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store"
      }
    )


addons = [TameLogMitmFilter()]
