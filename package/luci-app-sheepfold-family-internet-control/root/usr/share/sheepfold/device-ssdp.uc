'use strict';

import * as libubus from "ubus";
import * as socket from "socket";

const MAX_RESPONSES = 128;
const MAX_POLLS = 10;

function safe_field(value, limit) {
        let source = `${value ?? ""}`;
        let output = "";

        for (let offset = 0; offset < length(source) && length(output) < limit; offset++) {
                let code = ord(source, offset);
                if (code == 9 || code == 10 || code == 13) {
                        output += " ";
                        continue;
                }
                if (code < 32 || code == 127)
                        continue;
                output += substr(source, offset, 1);
        }

        return output;
}

function response_headers(payload) {
        let headers = {};
        let lines = split(replace(`${payload ?? ""}`, /\r\n/g, "\n"), "\n");

        if (index(uc(lines?.[0] ?? ""), "HTTP/1.1 200") != 0)
                return null;

        for (let line in lines) {
                let separator = index(line, ":");
                if (separator <= 0)
                        continue;

                let name = lc(safe_field(substr(line, 0, separator), 64));
                let value = safe_field(substr(line, separator + 1), 512);
                value = replace(value, /^[ ]+|[ ]+$/g, "");
                if (name == "st" || name == "usn" || name == "server" || name == "location")
                        headers[name] = value;
        }

        return headers;
}

let ubus = libubus.connect();
if (!ubus)
        exit(0);

let lan = {};
try {
        lan = ubus.call("network.interface.lan", "status") ?? {};
} catch (e) {
        exit(0);
}

let lan_device = safe_field(lan?.l3_device ?? lan?.device, 32);
if (!lan_device || !(lan_device =~ /^[A-Za-z0-9_.:-]+$/))
        exit(0);

let sock = socket.create(socket.AF_INET, socket.SOCK_DGRAM | socket.SOCK_NONBLOCK, socket.IPPROTO_UDP);
if (!sock)
        exit(0);

// Активный probe привязан к LAN: ответ с WAN не должен становиться частью
// идентичности домашнего устройства и тем более причиной доверия. §devident1
if (!sock.setopt(socket.SOL_SOCKET, socket.SO_BINDTODEVICE, lan_device)) {
        sock.close();
        exit(0);
}

if (!sock.bind("0.0.0.0:0")) {
        sock.close();
        exit(0);
}
let request =
        "M-SEARCH * HTTP/1.1\r\n" +
        "HOST: 239.255.255.250:1900\r\n" +
        "MAN: \"ssdp:discover\"\r\n" +
        "MX: 1\r\n" +
        "ST: ssdp:all\r\n\r\n";

if (sock.send(request, 0, "239.255.255.250:1900") == null) {
        sock.close();
        exit(0);
}

let seen = {};
let lines = [];
for (let poll_number = 0; poll_number < MAX_POLLS && length(lines) < MAX_RESPONSES; poll_number++) {
        let events = socket.poll(200, sock);
        if (!events || !length(events))
                continue;

        let peer = {};
        let payload = sock.recv(8192, 0, peer);
        if (!payload)
                continue;

        let address = safe_field(peer?.address, 64);
        let headers = response_headers(payload);
        if (!address || !headers)
                continue;

        let st = safe_field(headers.st, 256);
        let usn = safe_field(headers.usn, 512);
        let server = safe_field(headers.server, 256);
        let location = safe_field(headers.location, 512);
        let key = `${address}\t${st}\t${usn}`;
        if (seen[key])
                continue;

        seen[key] = true;
        push(lines, `${address}\t${st}\t${usn}\t${server}\t${location}\n`);
}

sock.close();
print(join(sort(lines), ""));
