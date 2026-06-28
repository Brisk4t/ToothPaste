
> If only i could copy this really long password to this really shady computer, we could achieve world peace. Alas! I'm going to type it manually......
>
>\- Someone defintely 

<div align="center">
  <h1 style="text-align: center; margin: 10;">
    <span style="display: inline-flex; align-items: center; gap: 10px;">
      <img src="https://www.toothpasteapp.com/ToothPaste.png" alt="drawing" width="70"/>
      <span style="display: flex; flex-direction: column; align-items: center; line-height: 1;">
        <span style="font-weight: bold; font-size: 1.5em; margin: 1 0 5 0; padding: 0; line-height: 1;">ToothPaste V2: </span>
        <span style="font-style: italic; font-size: 0.6em; margin: 1 0 0 0; padding: 0; line-height: 1;">Hardware-Backed BLE Clipboard.</span>
      </span>
    </span>
  </h1>
</div>

<div align="center" style="text-align: center; margin: 20px">
  <img src="https://img.shields.io/badge/c++-%2300599C.svg?style=for-the-badge&logo=c%2B%2B&logoColor=white&logoSize=auto" alt="C++"/>
  <img src="https://img.shields.io/badge/espressif-E7352C.svg?style=for-the-badge&logo=espressif&logoColor=white&logoSize=auto" alt="Espressif"/>
  <img src="https://img.shields.io/badge/BLE-blue?style=for-the-badge&logo=bluetooth&logoColor=white&logoSize=auto" alt="BLE"/>
  <img src="https://img.shields.io/badge/javascript-%23323330.svg?style=for-the-badge&logo=javascript&logoColor=%23F7DF1E&logoSize=auto" alt="JavaScript"/>
  <img src="https://img.shields.io/badge/react-%2320232a.svg?style=for-the-badge&logo=react&logoColor=%2361DAFB&logoSize=auto" alt="React"/>
</div>



<p align="center" style="text-align: center; font-size: 1.2em;">
  <strong>ToothPaste</strong> allows a user to transmit <strong>AES-256</strong> encrypted keyboard and mouse commands to any USB-compatible device wirelessly, without the need for specialized drivers or extensive set-up using WEB-BLE, a Cryptographic IC and an ESP32-S3.
</p>

![ToothPaste Website About Page Thumbnail](/web/public/ToothPaste_Cover_V2.png)
<br/>

## Table of Contents
- [The Problem ❓](#the-problem-)
- [Quick Start 📦](#quick-start-)
- [Full setup 🛠️](#full-setup-)
- [How it works Pt.1 ⭐](#how-it-works-pt1-)
- [How it works Pt. 2 ⭐⭐](#how-it-works-pt-2-)
- [The Hardware (Deus Ex PCBWay) 🔌](#the-hardware-deus-ex-pcbway-)
- [Security 🔑](#security-)
- [More Security 🔒](#more-security-)
- [Then there was AI 🤖](#then-there-was-ai-)
- [There's a lot more...](#theres-a-lot-more)

# The Problem ❓
> [!NOTE]
> The core idea was to eliminate the need for complicated and lengthy login flows for one-off cases where a keyboard would normally be required or is the **only device that is supported** (BIOS, air-gapped systems, shady back-alley computers where you don't want to install your password manager etc.). 

This means existing solutions like [KDE Connect](https://github.com/KDE/kdeconnect-kde) are non-starters since, at the very least, they require both devices to run a compatible operating system and allow installing third-party software.

The obvious answer then, is to use an interface system that is universally supported - USB. Specifically the USB **Human Interface Device (HID)** standard. Almost every USB-host compatible device supports using a keyboard as means of controlling it and, because this is presumed to be a direct extension of a user, it is implicitly trusted (*keyboards don't have passwords because how would you enter the password* 😐). 

The [USB Rubber Ducky by Hak5](https://hak5.org/products/usb-rubber-ducky?variant=39874478932081) used this exact idea to spark a security arms-race to exploit devices, but that doesn't have to be the only reason to use it (but you absolutely still can \**wink*\*).

![Pasting Between Devices](/web/public/ToothPasteBare.png)

### ToothPaste on a Desktop Browser, controlling an iPad
![ToothPasteDemo](/web/public/ToothPasteDemoGif.gif)

### ToothPaste on a Mobile Browser, controlling a remote Linux Machine
![ToothPasteDemoMobile](/web/public/ToothPasteDemoMobile.gif)

# Quick Start 📦

> [!TIP]
> The quickest way to get started is to go to [The ToothPaste Webapp](https://www.toothpasteapp.com) and click **Update**. This opens a WEB Serial selector and lets you select a connected ESP32-S3 device to flash the firmware.

> [!NOTE] 
> The ToothPaste webapp requires Web-API support which is only available on chromium based browsers like Brave, Edge and Chrome. If you're a non-chromium purist I suggest using the desktop app.

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

I wanted ToothPaste to be quick to use without much prior setup. While having a native app would make the experience of quickly switching between local and remote commands easy, that's a future-me problem. The quickest way to do this, while still letting it be semi cross-platform, was [**Web BLE**](https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API).

### What is Web BLE?
If you're familiar with projects like [WLED](https://kno.wled.ge/) or [VIA](https://usevia.app/) you've already interacted with the [Web API](https://developer.mozilla.org/en-US/docs/Web/API), this is almost exclusively a chromium-only feature which is why the **ToothPaste Webapp** itself doesn't work on non-chromium browsers like Firefox. 

Essentially Web BLE allows us to use a system's Bluetooth hardware inside a browser, eliminating the need for custom OS-specific APIs and custom apps to use them. 


# How it works Pt. 2 ⭐⭐

The other (and more fun) part of the ToothPaste solution is the hardware itself. Since the ESP32-S3 has both USB and BLE (along with a bunch of other things we don't care about) in one package, the hardware just ends up being the bare-minimum nedded to run the MCU. 

For most hobbyists, any development board will suffice. But considering that we're transferring some potentially sensitive information over a **very** open protocol, ToothPaste V2.0 uses a **Cryptographic Coprocessor** to store the credentials required to encrypt and decrypt data.  

### ToothPaste V1.0 vs V2.0
|  | ToothPaste V1.0 | ToothPaste V2.0 |
|----------|----------|----------|
| Cross-Platform | ✅ | ✅ |
| Security Stack | MBedTLS | MBedTLS + Cryptoauthlib |
| Credential Storage | Software-Bound 🟠  | Hardware-Bound 🟢 |
| Requires Extra Config | ❎ | ☑️ |

### I present...

![ToothPaste Completed](/web/public/ToothPasteIPad.png)


# The Hardware (Deus Ex PCBWay) 🔌

You know that feeling when you think you've finally turned all the ideas you had into a real product and THEN **another one strikes**? Yeah that's how the hardware security component of ToothPaste felt. 

### The problem... 
I realized that the most 🤌 *perfect* 🤌 security solution for ToothPaste would use a Crypto IC / Secure Element / TPM / \<insert cool word here\> which stores the ECDH Private keys in an isolated storage space, making it impossible to extract them even if you have physical access to the device. This is how hardware cryptocurrency wallets like [Trezor](https://trezor.io/) and hardware 2FA solutions like [YubiKey](https://www.yubico.com/) ensure that even if a nefarious actor gets their grubby paws on your physical device, they can never get to the information inside.

### [The saviour](https://www.pcbway.com/)...

The problem was I had already designed and ordered the ToothPaste V1 PCBs and with hardware development being an expensive hobby, I didn't want to break the bank simply for the love of the game.

That's when [PCBWay](https://www.pcbway.com/) contacted me saying they wanted to sponsor the prototype PCBs for a potential V2.....
**so I checked if it was a phishing email**. But turns out it wasn't because after a month of me scrambling to understand all the possible ways I could make this work, I reached out to them, uploaded my designs to their PCB Ordering Tool and waited ~~patiently~~ at my front door.

### And finally... 

![ToothPaste V2.0](/hardware/ToothPaste_V2_Cover_Annotated_PCBWay.png)

### **They were flawless! They were beautiful!**

Not having to solder that USB-C connector by hand almost brought a tear to my eye 🥲. PCBWay was also nice enough to let me order a USB-A version since I realized I had been reaching for a ToothPaste on older desktops without USB-C connectors too often for it to not be an option. I also may or may not have spent a lot of time deciding what to put on the silkscreen and decided on that *tiny* V2.0 logo which is still super detailed. 

**I didn't have to wonder if I'd kill another ESP32-S3 (RIP) by shorting the 5v and 3.3V rails because PCBWay had assembled and tested it for me.**

But the best part was probably not having to source the components myself. One of the major gripes I had with V1 was that I could only find **A SINGLE LISTING** for a male USB-C connector where the shipping would cost me more than the rest of the components combined. Idk how they did it, I didn't ask. But PCBWay just magically found a few. I think being in the PCB manufacturing business *might* have something to do with it.

The [Microchip ATECC608B](https://www.microchip.com/en-us/product/atecc608b) CryptoAuth chip on ToothPaste V2 patches the final security gap in the hardware, the private key is generated and stored directly on the chip, never being exposed to the ESP32's insecure flash memory at all.

Unfortunately dealing with programming the chip itself is an adventure I'll cover elsewhere once I make sure I won't be DMCAd for uttering the dark words of the NDA (which i never received btw, thanks Microchip).

### Look at this caveman \*scoffs\*
![ToothPaste Build](/firmware/images/ToothPaste_BOM.jpg)


# Security 🔑

Bluetooth by itself isn't a secure protocol, newer implementations have changed this and if we didn't want the extremely flexible cross-platform transmitter we could've delved into using the many security protocols that BLE supports. 

However, as of now Web BLE only supports the "just works" authentication method, which means its practically an open line. Considering that a ToothPaste shows up as a keyboard, and that my primary use-case for it is to paste passwords to devices, [**Man-In-The-Middle** attacks](https://en.wikipedia.org/wiki/Man-in-the-middle_attack) are a very real problem. 

**So we need to ensure that only authenticated devices are allowed to send data that is then typed out.**

> [!IMPORTANT]
> Without delving into the complete reasoning for **not** choosing any of the other standards for cryptography (sersiously there's way too much information out there for the pros and cons of each) I decided to go with a two-step encryption workflow combining [**ECDH Public Key Cryptography**](https://www.cloudflare.com/learning/ssl/how-does-public-key-encryption-work/) and a partially Out of Band (OOB: *fancy way of saying the keys arent shared over BLE*) key exchange to derive a symmetric **AES-256** key that is used to encrypt the ToothPaste packets (_or ToothPackets if you're cool_).

With the [ATECC608B CryptoAuth IC](https://www.microchip.com/en-us/product/atecc608b), **ToothPaste V2.0** also ensures that even if you physically took apart the ToothPaste and hooked up to the raw flash memory of the ESP32-WROOM module you wouldn't be able to find the security credentials anywhere. The ATECC generates and stores these credentials in its isolated flash and never exposes them to the rest of the ToothPaste firmware, the only information sent over its I2C bus is the session-specific AES-256 key which finally encrypts the data. Since this key is unique and a new one is generated every time you connect to a ToothPaste, someone getting their hands on it after a session disconnects doesn't affect us at all.

### What this results in is a secure system of communication where the transmitter(s) and device must first complete a pairing flow before sending potentially sensitive data.

![ToothPaste Pairing](/web/public/Pairing.png)

# More Security 🔒

### ☀️ ToothPaste is entirely local. There is no server, no agent, no SaaS cloud-native troll "guarding" your data.

> [!CAUTION]
> This means if someone can dump the indexdb data stored in your browser they can access your AES Key and impersonate the device from which the commands are sent. 
> _although if someone has gotten this far, the ToothPaste might be the least of your concerns 💀_

### 🤷 But Because I can 

ToothPaste allows encrypting this local data, along with saved Macros and Duckyscript scripts, using a Password + [Argon2](https://argon2-cffi.readthedocs.io/en/stable/argon2.html) derived encryption key.
This is identical to how password managers with browser extensions do it.

![ToothPasteArgon](/web/public/ToothPasteArgon.png)

# Then there was AI 🤖

Since I've scope-crept my way from weekend project to daily obsession, I realized that a lot of the most common interactions I have with ToothPaste on something like my Raspberry Pi are a lot more SSH-like. 

Sometimes you just want to "set up a basic webserver with a frontend for displaying the sensor value on GPIO3". You know what you need to do, its not rocket science, its barely coding. It might be something as simple as running a script, or a few.... 

The best option, if you have it is to SSH into the device, and let an LLM handle the rest until it asks if you want to run ```sudo rm -rf *``` where you politely decline and move on with your day.

### But if you can't

![ToothPasteDesktop Preview](/web/public/ToothPaste_Desktop_Preview.png)

[ToothPasteDesktop](https://github.com/Brisk4t/ToothPasteDesktop) implements a Rust-based **TUI & MCP server** that lets an AI agent control a ToothPaste and get a response from the remote system over a Serial port. This bi-directional bus does have some drawbacks, some fixable in software, others more hardware-based.

1. The ESP32-S3 has a limited number of USB Endpoints. Right now they are used by:
   - BOOT Keyboard Interface (For complete BIOS support)
   - BOOT Mouse (More BIOS support)
   - Generic HID Input (Full Keyboard + Mouse Support)
   - Control Descriptor (Required for all of the above)

This means (afaik) we need to sacrifice one of those to enable the USB CDC (Serial) Device endpoint that allows the ToothPaste to get data from the connected device.

Given more freedom in this area I would like to implement a full USB MSC (Mass Storage Device Class) to allow us to take screenshots and view them which would basically make ToothPaste a BLE based IP-KVM much like a [PiKVM](https://pikvm.org/) does over traditional HTTP. 

2. Generic models are finnicky without very specific instructions and some amount of fine-tuning.

Telling your favorite MCP-compatible agent to ```send keystrokes using ToothPaste``` works quite consistently, but without the explicit instructions to ```use the > operator to pipe data to the serial port device at COMx or /dev/ttyx and wait till data is available``` has a far less consistent success rate.

But I have to say there is a certain joy to saying ```Jarvis, open chrome and play jojo roundabout``` and it just working.

While I work in the shadows on ToothPasteDesktop, if you want to mess around with a less polished version, the MCPerhaps branches on this github have an electron app that does the same thing but... clunkier.
  
![To Be Continued](/web/public/tobecontinued.png)

# There's a lot more...

### As with any passion-project, sometimes I get sidetracked with cool features and forget to fix / test everything. 

#### Creating replayable ducky scripts in the ToothPaste WebApp.
![ToothPasteScripting](/web/public/ToothPasteScripting.png)


There are features on the WebApp that I'll slowly document here and ToothPaste web hasn't gotten much TLC since I became enamoured with ToothPasteDesktop's Rust. 

ToothPaste is still a work in progress but it is finally at a point where I use it daily, so I thought its as good a time as any to open-source it. 

If you find discrepancies or would like to contribute in any way, feel free to create issues but since I'm just a little guy, I might take a while to get to reviewing them. 
