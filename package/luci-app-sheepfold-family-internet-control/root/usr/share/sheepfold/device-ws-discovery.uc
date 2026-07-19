'use strict';

import * as libubus from "ubus";
import * as socket from "socket";

const GROUP_ADDRESS = "239.255.255.250";
const GROUP_PORT = 3702;
const MAX_MESSAGES = 96;
const MAX_POLLS = 10;
const ACTIVE_PROBE = getenv("SHEEPFOLD_WSD_ACTIVE_PROBE") == "1";

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

	return replace(output, /^[ ]+|[ ]+$/g, "");
}

function xml_values(payload, wanted_name, limit) {
	let source = `${payload ?? ""}`;
	let lower = lc(source);
	let values = [];
	let offset = 0;

	while (offset < length(source) && length(values) < limit) {
		let relative_start = index(substr(lower, offset), "<");
		if (relative_start < 0)
			break;
		let start = offset + relative_start;
		let relative_end = index(substr(lower, start), ">");
		if (relative_end < 0)
			break;
		let end = start + relative_end;
		let opening = safe_field(substr(source, start + 1, end - start - 1), 256);
		if (!opening || index("/?!", substr(opening, 0, 1)) >= 0) {
			offset = end + 1;
			continue;
		}

		let token = split(opening, /[ ]+/)?.[0] ?? "";
		let parts = split(token, ":");
		let local_name = lc(parts?.[length(parts) - 1] ?? "");
		if (local_name != wanted_name) {
			offset = end + 1;
			continue;
		}

		let closing = `</${lc(token)}>`;
		let relative_close = index(substr(lower, end + 1), closing);
		if (relative_close < 0) {
			offset = end + 1;
			continue;
		}
		let value = safe_field(substr(source, end + 1, relative_close), 1024);
		if (value && index(value, "<") < 0)
			push(values, value);
		offset = end + 1 + relative_close + length(closing);
	}

	return values;
}

function first_value(payload, name) {
	return xml_values(payload, name, 1)?.[0] ?? "";
}

function endpoint_uuid(payload) {
	for (let address in xml_values(payload, "address", 8)) {
		let normalized = lc(safe_field(address, 256));
		if (normalized =~ /^urn:uuid:[a-z0-9._:-]{8,}$/)
			return substr(normalized, 9);
	}
	return "";
}

function message_kind(payload) {
	let lower = lc(`${payload ?? ""}`);
	if (lower =~ /<[a-z0-9_-]+:hello[ >]|<hello[ >]/)
		return "hello";
	if (lower =~ /<[a-z0-9_-]+:probematches[ >]|<probematches[ >]/)
		return "probe_matches";
	return "other";
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
let lan_address = safe_field(lan?.["ipv4-address"]?.[0]?.address, 64);
if (!lan_device || !(lan_device =~ /^[A-Za-z0-9_.:-]+$/) ||
    !lan_address || !(lan_address =~ /^[0-9.]+$/))
	exit(0);

function open_socket(passive) {
	let sock = socket.create(socket.AF_INET, socket.SOCK_DGRAM | socket.SOCK_NONBLOCK, socket.IPPROTO_UDP);
	if (!sock)
		return null;
	if (!sock.setopt(socket.SOL_SOCKET, socket.SO_BINDTODEVICE, lan_device)) {
		sock.close();
		return null;
	}
	sock.setopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, true);
	sock.setopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 1);
	sock.setopt(socket.IPPROTO_IP, socket.IP_MULTICAST_LOOP, false);
	if (!sock.bind(passive ? "0.0.0.0:3702" : "0.0.0.0:0")) {
		sock.close();
		return null;
	}
	if (passive && !sock.setopt(socket.IPPROTO_IP, socket.IP_ADD_MEMBERSHIP, {
		multiaddr: GROUP_ADDRESS,
		address: lan_address,
		ifindex: 0
	})) {
		sock.close();
		return null;
	}
	return sock;
}

// Обычный контрольный проход только слушает объявления на LAN. Ephemeral-порт
// имеет смысл лишь для единственного Probe при событии нового устройства. §detload
let sock = open_socket(true);
if (!sock && ACTIVE_PROBE)
	sock = open_socket(false);
if (!sock)
	exit(0);

let probe_clock = clock() ?? [time(), 0];
let message_id = sprintf(
	"urn:uuid:3f0f41d4-5f9e-4a3d-9b2e-%08x%04x",
	probe_clock[0],
	probe_clock[1] % 65536
);
let probe =
	"<?xml version=\"1.0\" encoding=\"UTF-8\"?>" +
	"<s:Envelope xmlns:s=\"http://www.w3.org/2003/05/soap-envelope\" " +
	"xmlns:a=\"http://schemas.xmlsoap.org/ws/2004/08/addressing\" " +
	"xmlns:d=\"http://schemas.xmlsoap.org/ws/2005/04/discovery\">" +
	"<s:Header><a:Action>http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</a:Action>" +
	`<a:MessageID>${message_id}</a:MessageID>` +
	"<a:To>urn:schemas-xmlsoap-org:ws:2005:04:discovery</a:To></s:Header>" +
	"<s:Body><d:Probe/></s:Body></s:Envelope>";

if (ACTIVE_PROBE)
	sock.send(probe, 0, `${GROUP_ADDRESS}:${GROUP_PORT}`);

let seen = {};
let lines = [];
for (let poll_number = 0; poll_number < MAX_POLLS && length(lines) < MAX_MESSAGES; poll_number++) {
	let events = socket.poll(200, sock);
	if (!events || !length(events))
		continue;

	let peer = {};
	let payload = sock.recv(16384, 0, peer);
	if (!payload)
		continue;

	let address = safe_field(peer?.address, 64);
	if (!address || !(address =~ /^[0-9.]+$/))
		continue;
	let uuid = safe_field(endpoint_uuid(payload), 256);
	let types = safe_field(first_value(payload, "types"), 512);
	let scopes = safe_field(first_value(payload, "scopes"), 1024);
	let xaddrs = safe_field(first_value(payload, "xaddrs"), 1024);
	let kind = message_kind(payload);
	if (!uuid && !types && !scopes)
		continue;
	let key = `${address}\t${uuid}\t${types}\t${scopes}`;
	if (seen[key])
		continue;
	seen[key] = true;
	push(lines, `${address}\t${uuid}\t${types}\t${scopes}\t${xaddrs}\t${kind}\n`);
}

sock.close();
print(join(sort(lines), ""));
