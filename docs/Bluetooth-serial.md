How to add bluetooth connectivity to linaro (would apply to RPI as well)




Start by adding the Serial Port Profile. Edit this file:

sudo nano /etc/systemd/system/dbus-org.bluez.service
Add a ' -C' compataibility flag at the end off the ExecStart= line, and add a new line to add the SP profile. The two lines should look like this:

```
ExecStart=/usr/lib/bluetooth/bluetoothd -C
ExecStartPost=/usr/bin/sdptool add --channel=1 SP
```


Add a service that listen for incoming serial connection and spawn a shell. Edit /etc/systemd/system/multi-user.target.wants/rfcomm.service
```
[Unit]
Description=RFCOMM service
After=bluetooth.service
Requires=bluetooth.service

[Service]
ExecStart=/usr/bin/rfcomm watch hci0 1 setsid getty rfcomm0 115200 linux -a linaro

[Install]
WantedBy=multi-user.target
```

Pair with mobile using bluetoothctl.

You can use "Serial Bluetooth Terminal" android app for connecting


