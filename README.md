> If only i could copy this really long password to this really shady computer, we could achieve world peace. Alas! I'm going to type it manually......
>
>\- Someone defintely 

<h1 style="text-align: center; margin: 10;">
  <span style="display: inline-flex; align-items: center; gap: 10px;">
    <img src="https://www.toothpasteapp.com/ToothPaste.png" alt="drawing" width="70"/>
    <span style="display: flex; flex-direction: column; align-items: center; line-height: 1;">
      <span style="font-weight: bold; font-size: 1.5em; margin: 1 0 5 0; padding: 0; line-height: 1;">ToothPaste: </span>
      <span style="font-style: italic; font-size: 0.6em; margin: 1 0 0 0; padding: 0; line-height: 1;">A better copy-paste.</span>
    </span>
  </span>
</h1>

<div style="text-align: center; margin: 20px">
  <img src="https://img.shields.io/badge/-Arduino-00979D?style=for-the-badge&logo=Arduino&logoColor=white&logoSize=auto" alt="Arduino"/>
  <img src="https://img.shields.io/badge/react-%2320232a.svg?style=for-the-badge&logo=react&logoColor=%2361DAFB&logoSize=auto" alt="React"/>
  <img src="https://img.shields.io/badge/c++-%2300599C.svg?style=for-the-badge&logo=c%2B%2B&logoColor=white&logoSize=auto" alt="C++"/>
  <img src="https://img.shields.io/badge/espressif-E7352C.svg?style=for-the-badge&logo=espressif&logoColor=white&logoSize=auto" alt="Espressif"/>
  <img src="https://img.shields.io/badge/tailwindcss-%2338B2AC.svg?style=for-the-badge&logo=tailwind-css&logoColor=white&logoSize=auto" alt="TailwindCSS"/>
  <img src="https://img.shields.io/badge/javascript-%23323330.svg?style=for-the-badge&logo=javascript&logoColor=%23F7DF1E&logoSize=auto" alt="JavaScript"/>
  <img src="https://img.shields.io/badge/BLE-blue?style=for-the-badge&logo=bluetooth&logoColor=white&logoSize=auto" alt="BLE"/>
</div>



<p style="text-align: center; font-size: 1.2em;">
  <strong>ToothPaste</strong> allows a user to transmit keystrokes to any USB-compatible device over an encrypted channel without the need for specialized drivers or extensive set-up using Bluetooth LE and an ESP-32 based receiver.
</p>

<br/>


## The Problem ❓
The core idea was to eliminate the need for complicated and lengthy login flows for one-off cases where a keyboard would normally be required or is the **only device that is supported** (BIOS, air-gapped systems, shady back-alley computers where you don't want to install your password manager etc.). 

This means existing solutions like [KDE Connect](https://github.com/KDE/kdeconnect-kde) are non-starters since, at the very least, they require both devices to run a compatible operating system and allow installing third-party software.

The obvious answer then, is to use an interface system that is universally supported - USB. Specifically the USB **Human Interface Device (HID)** standard. Almost every USB-host compatible device supports using a keyboard as means of controlling it and, because this is presumed to be a direct extension of a user, it is implicitly trusted (*keyboards don't have passwords because how would you enter the password* 😐). 

The [USB Rubber Ducky by Hak5](https://hak5.org/products/usb-rubber-ducky?variant=39874478932081) used this exact idea to spark a security arms-race to exploit devices, but that doesn't have to be the only reason to use it (but you absolutely still can \**wink*\*).

## The Solution Pt. 1 ⭐
Sounds simple enough - all we need is a device that has some kind of wireless capability and the ability to show up as a USB device like the Rubber Ducky. A few options come to mind - 

- Arduino Pro Micro + Bluetooth Module 🔴 (clunky but proven)
- Nordic nrf52840 🟡 (really good but needs a lot of setup and lacks library support for advanced features)
- Espressif ESP32-S3 🟢 (the winner for multiple reasons)

BLE communicates over something called the GATT protocol which you can find out more about [here](https://www.bluetooth.com/wp-content/uploads/Files/Specification/HTML/Core-54/out/en/host/generic-attribute-profile--gatt-.html).

Once any of the above set ups is complete we move toward actually transmitting data from some source device (a transmitter) to the bluetooth device (the receiver). We could come up with a really custom setup and there is definitely a benefit to that but as a proof-of-concept we just want to transmit text, so how do we do this?

## The Solution Pt. 2 ⭐⭐
Bluetooth (specifically BLE) is an odd 'standard' where over time there have been many accepted ways of implementing it but there is no unified solution. Outside of creating a native application that taps into the OS Bluetooth hardware there's only one (AFAIK) semi cross-platform solution - **Web BLE**.

### What is Web BLE?
If you're familiar with projects like [WLED](https://kno.wled.ge/) or [VIA](https://usevia.app/) you've already interacted with the Web Device API, this is almost exclusively a chromium-only feature which is why **ToothPaste** itself doesn't work on non-chromium browsers like Firefox. 

Essentially Web BLE allows us to use a system's Bluetooth hardware inside a browser, eliminating the need for custom OS-specific APIs and custom apps to use them. 

### Using Web BLE 
So using Web BLE we can capture inputs on some kind of webpage and transmit it to the BLE device over the GATT protocol we set up above. The nrf52840 is what I had on hand at the time and that branch is a decent proof-of-concept for this ecosystem and more than functional if you just need something quick and dirty. 

**But I wanted to go futher**. 

[insert proof of concept device photo]

## The Special Sauce (Security) 🔑

Bluetooth by itself isn't a secure protocol, newer implementations have changed this and if we didn't want the extremely flexible cross-platform transmitter we could've delved into using the many security protocols that BLE supports. However, as of now Web BLE only support the "just works" authentication method, which means its practically an open line. Considering that a ToothPaste shows up as a keyboard, it is entirely possible to use it like a wireless [Rubber Ducky](https://hak5.org/products/usb-rubber-ducky?variant=39874478932081) and that itself presents a security flaw. 

**So we need to ensure that only authenticated devices are allowed to send data that is then typed out.**

Without delving into the complete reasoning for **not** choosing any of the other standards for cryptography (sersiously there's way too much information out there for the pros and cons of each) I decided to go with a **TLS (kinda)** encryption workflow combining **ECDH** and an partially Out of Band (OOB: *fancy way of saying the keys arent shared over BLE*) key exchange to derive an **AES-128** key.

Yes that's a lot of jargon. *Refuses to elaborate*.


### What this results in is an extremely secure system of communication where the transmitter(s) and device must first complete a pairing flow before sending potentially sensitive data.