
> If only i could copy this really long password to this really shady computer, we could achieve world peace. Alas! I'm going to type it manually......
>
>\- Someone defintely 

<div align="center">
  <h1 style="text-align: center; margin: 10;">
    <span style="display: inline-flex; align-items: center; gap: 10px;">
      <img src="https://www.toothpasteapp.com/ToothPaste.png" alt="drawing" width="70"/>
      <span style="display: flex; flex-direction: column; align-items: center; line-height: 1;">
        <span style="font-weight: bold; font-size: 1.5em; margin: 1 0 5 0; padding: 0; line-height: 1;">ToothPaste: </span>
        <span style="font-style: italic; font-size: 0.6em; margin: 1 0 0 0; padding: 0; line-height: 1;">A better copy-paste.</span>
      </span>
    </span>
  </h1>
</div>

<div align="center" style="text-align: center; margin: 20px">
  <img src="https://img.shields.io/badge/-Arduino-00979D?style=for-the-badge&logo=Arduino&logoColor=white&logoSize=auto" alt="Arduino"/>
  <img src="https://img.shields.io/badge/react-%2320232a.svg?style=for-the-badge&logo=react&logoColor=%2361DAFB&logoSize=auto" alt="React"/>
  <img src="https://img.shields.io/badge/c++-%2300599C.svg?style=for-the-badge&logo=c%2B%2B&logoColor=white&logoSize=auto" alt="C++"/>
  <img src="https://img.shields.io/badge/espressif-E7352C.svg?style=for-the-badge&logo=espressif&logoColor=white&logoSize=auto" alt="Espressif"/>
  <img src="https://img.shields.io/badge/tailwindcss-%2338B2AC.svg?style=for-the-badge&logo=tailwind-css&logoColor=white&logoSize=auto" alt="TailwindCSS"/>
  <img src="https://img.shields.io/badge/javascript-%23323330.svg?style=for-the-badge&logo=javascript&logoColor=%23F7DF1E&logoSize=auto" alt="JavaScript"/>
  <img src="https://img.shields.io/badge/BLE-blue?style=for-the-badge&logo=bluetooth&logoColor=white&logoSize=auto" alt="BLE"/>
</div>



<p align="center" style="text-align: center; font-size: 1.2em;">
  <strong>ToothPaste</strong> allows a user to transmit encrypted keyboard and mouse commands to any USB-compatible device wirelessly, without the need for specialized drivers or extensive set-up using WEB-BLE and an ESP32-S3 based receiver.
</p>

![ToothPaste Website About Page Thumbnail](/web/public/ToothPasteCoverBlocks.png)
<br/>


# The Problem ❓
The core idea was to eliminate the need for complicated and lengthy login flows for one-off cases where a keyboard would normally be required or is the **only device that is supported** (BIOS, air-gapped systems, shady back-alley computers where you don't want to install your password manager etc.). 

This means existing solutions like [KDE Connect](https://github.com/KDE/kdeconnect-kde) are non-starters since, at the very least, they require both devices to run a compatible operating system and allow installing third-party software.

The obvious answer then, is to use an interface system that is universally supported - USB. Specifically the USB **Human Interface Device (HID)** standard. Almost every USB-host compatible device supports using a keyboard as means of controlling it and, because this is presumed to be a direct extension of a user, it is implicitly trusted (*keyboards don't have passwords because how would you enter the password* 😐). 

The [USB Rubber Ducky by Hak5](https://hak5.org/products/usb-rubber-ducky?variant=39874478932081) used this exact idea to spark a security arms-race to exploit devices, but that doesn't have to be the only reason to use it (but you absolutely still can \**wink*\*).

![Pasting Between Devices](/web/public/ToothPasteBare.png)

### ToothPaste on a Desktop Browser, controlling a remote Linux Machine
![ToothPasteDemo](/web/public/ToothPasteDemo.gif)

### ToothPaste on a Mobile Browser, controlling a remote Linux Machine
![ToothPasteDemoMobile](/web/public/ToothPasteDemoMobile.gif)

# Quick Start 📦

The quickest way to get started is to go to [The ToothPaste Webapp](www.toothpasteapp.com) and click **Update**. This opens a WEB Serial selector and lets you select a connected ESP32-S3 device to flash the firmware. 

#### Alternatively, download the latest .bin firmware file from the releases section and flash it using [esptool](https://github.com/espressif/esptool) / [espwebtool](https://esptool.spacehuhn.com/) or a similar flasher utility.

![Update Prompt](/web/public/UpdatePrompt.png)

```The 'button' is GPIO0 (often labeled BOOT on ESP32 dev boards)```

# Full setup 🛠️

If for some reason the easy mode doesn't end up working (often because i messed up the deployment) you can build the entire project from source. 

Follow the [ESP-IDF (5.5.1^)](https://docs.espressif.com/projects/esp-idf/en/stable/esp32/get-started/index.html) install guide and build the contents of the **firmware/** folder. 

If you plan on making changes to or creating your own ProtoBuf packets, you will also need:
- [The Protoc Compiler](https://protobuf.dev/installation/) 
- [NanoPB](https://github.com/nanopb/nanopb) 
- [ProtoBuf JS](https://github.com/protobufjs/protobuf.js)

# How it works Pt.1 ⭐

I wanted ToothPaste to be quick to use without much prior setup. While having a native app would make the experience of quickly switching between local and remote commands easy, that's a future-me problem. The quickest way to do this for me, while still letting it be semi cross-platform was [**Web BLE**](https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API).

### What is Web BLE?
If you're familiar with projects like [WLED](https://kno.wled.ge/) or [VIA](https://usevia.app/) you've already interacted with the [Web API](https://developer.mozilla.org/en-US/docs/Web/API), this is almost exclusively a chromium-only feature which is why **ToothPaste** itself doesn't work on non-chromium browsers like Firefox. 

Essentially Web BLE allows us to use a system's Bluetooth hardware inside a browser, eliminating the need for custom OS-specific APIs and custom apps to use them. 


# How it works Pt. 2 - Hardware ⭐⭐

The other part of the ToothPaste solution is the hardware itself. Since the ESP32-S3 has both USB and BLE (along with a bunch of other things we don't care about) in one package, the hardware just ends up being the bare-minimum nedded to run the MCU. For most, any development board will suffice. 

### For the more discerning, I present...

![ToothPaste Completed](/web/public/ToothPasteIPad.png)


### I'm still sorting out the hardware part of this repo but this shot took way too long so here you go:

![ToothPaste Build](/firmware/images/ToothPaste_BOM.jpg)


# Security 🔑

Bluetooth by itself isn't a secure protocol, newer implementations have changed this and if we didn't want the extremely flexible cross-platform transmitter we could've delved into using the many security protocols that BLE supports. 

However, as of now Web BLE only support the "just works" authentication method, which means its practically an open line. Considering that a ToothPaste shows up as a keyboard, and that my primary use-case for it is to paste passwords to devices, [**Man-In-The-Middle** attacks](https://en.wikipedia.org/wiki/Man-in-the-middle_attack) are a very real problem. 

**So we need to ensure that only authenticated devices are allowed to send data that is then typed out.**

Without delving into the complete reasoning for **not** choosing any of the other standards for cryptography (sersiously there's way too much information out there for the pros and cons of each) I decided to go with a two-step encryption workflow combining [**ECDH Public Key Cryptography**](https://www.cloudflare.com/learning/ssl/how-does-public-key-encryption-work/) and a partially Out of Band (OOB: *fancy way of saying the keys arent shared over BLE*) key exchange to derive a symmetric **AES-128** key that is used to encrypt the ToothPaste packets (_or ToothPackets if you're cool_).


### What this results in is a secure system of communication where the transmitter(s) and device must first complete a pairing flow before sending potentially sensitive data.

![ToothPaste Pairing](/web/public/Pairing.png)

# More Security 🔒

### ☀️ ToothPaste is entirely local. There is no server, no agent, no SaaS cloud-native troll "guarding" your data.

This means if someone can dump the indexdb data stored in your browser they can access your AES Key and impersonate the device from which the commands are sent. 

_although if someone has gotten this far, the ToothPaste might be the least of your concerns 💀_

### 🤷 But Because I can 

ToothPaste allows encrypting this local data, along with saved Macros and Duckyscript scripts, using a Password + [Argon2](https://argon2-cffi.readthedocs.io/en/stable/argon2.html) derived encryption key.
This is identical to how password managers with browser extensions do it.

![ToothPasteArgon](/web/public/ToothPasteArgon.png)

# There's a lot more...

### As with any passion-project, sometimes I get sidetracked with cool features and forget to fix / test everything. 

#### Creating replayable ducky scripts in the ToothPaste WebApp.
![ToothPasteScripting](/web/public/ToothPasteScripting.png)



There are features on the WebApp that I'll slowly document here and there is cursed vibe-coded tailwind styling begging to be turned into recyclable classes. ToothPaste is still a work in progress but it is finally at a point where I use it daily, so I thought its as good a time as any to open-source it. 

If you find discrepancies or would like to contribute in any way, feel free to create issues but since I'm just a little guy, I might take a while to get to reviewing them. 