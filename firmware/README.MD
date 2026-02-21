# ToothPaste

# What does it take to make one?

In the interest of keeping the concept simple, a ToothPaste Receiver (I'm thinking of a more fun name) is **just** an ESP32-S3. The custom pcb only reduces the form-factor to a more dongle-y shape for convenience. 

It has the bare minimum needed to get USB-C working in device mode and is probably not up to spec.

#### If you don't care about the aesthetics and want to be some kind of modern caveman, an ESP32-S3 DevKit C or [Seeed Studio XIAO S3](https://wiki.seeedstudio.com/xiao_esp32s3_getting_started/) will also do just fine. It'll just be hanging on for dear life at the end of a USB cable.


### Here's a no-nonsense BOM in case you were wondering what that chickenscratch handwriting actually says:


- ESP32-S3-WROOM-1 / 1U *x1* (The specs dont matter **too** much as long as you can fit the ~1MB firmware image in flash, the [datasheet](https://documentation.espressif.com/esp32-s3-wroom-1_wroom-1u_datasheet_en.pdf) goes over the version differences well) 
**If you get the 1U you will need a 50Ω antenna for the best performance.**
- Some kind of SMD button *x1*
- 3.3v linear voltage regulator *x1*
- Male USB-C Connector *x1* (These are incredibly hard to find compared to the rest of the stuff on this list) [LCSC Link](https://www.lcsc.com/product-detail/C3001295.html)
- 5.1k resistor *x1* (0805 size for this version of the PCB)
- 22uf capacitor *x1*
- 0.1uf capacitor *x1*
- 3D Printed ToothPaste Case
- A ToothPaste PCB (you could always hand wire one on a perfboard, although you'll need your own case)

Other than the frustration of hand-soldering SMD components while shaking like an alcoholic in withdrawal, assembling a ToothPaste is relatively straightforward.

### My desk is not this clean, for illustration purposes only...
![ToothPaste_Build](/firmware/images/ToothPaste_BOM.jpg)


### Voila! - A Completed ToothPaste (My Personal ToothPaste Actually)
![ToothPaste_Build](/firmware/images/ToothPaste_Finished.jpg)




# Generating nanopb packet files

For consistency and readability ToothPaste uses Protobuf packets. These are generated for embedded devices using [Nanopb](https://github.com/nanopb/nanopb).

The JS frontend files can be generated with the standard protobufJS package.

## Setup

1. Install Protoc 
2. Install nanopb 
3. Run ```"protoc -I. --nanopb_out=${workspaceFolder}/components/toothPacket toothpacket.proto```  [from the shared ```./shared``` folder](#note-on-the-generate-command)





#### Note on the generate command
It seems like the nanopb generation command cannot specify the location of the .options file that compiles into static sized arrays rather than iterators so the command must be run from within 
that folder.

I haven't had a chance to look into it and its just an aesthetic thing so idc too much but someday I'll figure that out.
