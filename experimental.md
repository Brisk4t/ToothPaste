# THIS BRANCH IS BEYOND EXPERIMENTAL 
### Its so experimental the SCP Foundation is looking for it 

## Getting Started, not quick:

1. Run the electron app. ```npm run electron:dev```
2. Connect to a ToothPaste device.
3. Make sure vscode / whatever agent can use the mcp server defined in ```.vscode/mcp.json```
4. **Pray.**


## Troubleshooting:
### 1. firmware\managed_components\espressif__esp_tinyusb\include\tusb_config.h:

This file needs the following changes:

line 143: 
```// CDC FIFO size of TX and RX
#ifndef CFG_TUD_CDC_RX_BUFSIZE
    #define CFG_TUD_CDC_RX_BUFSIZE      CONFIG_TINYUSB_CDC_RX_BUFSIZE
#endif
#ifndef CFG_TUD_CDC_TX_BUFSIZE
    #define CFG_TUD_CDC_TX_BUFSIZE      CONFIG_TINYUSB_CDC_TX_BUFSIZE
#endif
```

line 170:
```// Enabled device class driver
#ifndef CFG_TUD_CDC
    #define CFG_TUD_CDC                 CONFIG_TINYUSB_CDC_COUNT
#endif
```

### 2. The electron app is very buggy, minor bugs but bugs nonetheless

### 3. Need a way to find the serial port by VID and PID consistently



# Notes: 

### Here's a quick prompt to get you started on your journey down this rabbit hole:

```
You are a debugging agent with access to a windows 11 machine running on a non-administrator machine. You have access to toothpaste-mcp a way for you to send and receive data over a pure text-only stream. Data is sent as a keyboard device and received over serial. As a test, get the list of documents on the connected computer's C: drive root and show me those here. Do not attempt to use the screenshot command it is not implemented yet.
```

