# WDVisual

## This is not a security write-up, but a personal project that I have been working on.

---

**WDVisual** is a local web app for exploring wireless network data collected while wardriving. It turns Kismet `.kismet` capture files into a clear, interactive overview of the networks and devices observed during a trip. 

WDVisual is intended solely for visualising data lawfully obtained through passive wireless scanning. It does not perform scanning or interact with wireless networks itself.

## Features

- View GPS-located networks and devices on interactive 2D and 3D maps.
- Explore Wi-Fi names, access points, connected devices, channels, security types, signal strength, and packet activity.
- Follow how networks, devices, and packets were discovered over time.
- Search, sort, and filter captured data to quickly find useful observations.
- Open several captures together for a combined view of multiple wardriving sessions.
- Inspect individual networks and see their observed access points and clients.

---

WDVisual runs locally and opens capture files in read-only mode, so the original wardriving data is left unchanged. A `.kismet` file can be created by recording a session with [Kismet](https://www.kismetwireless.net/) while moving through an area with a GPS-enabled device.

The project is open source and available on [GitHub](https://github.com/marv1nh/WDVisual).
