'use strict';

import * as libubus from "ubus";

function strip_local(name) {
        name = `${name ?? ""}`;
        return substr(name, -6) == ".local" ? substr(name, 0, length(name) - 6) : name;
}

function safe_field(value, limit) {
        let source = `${value ?? ""}`;
        let output = "";
        limit = limit ?? 160;

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

function append_txt_entries(result, value) {
        if (type(value) == "array") {
                for (let entry in value)
                        append_txt_entries(result, entry);
                return;
        }

        if (type(value) == "object") {
                for (let key, entry in value)
                        push(result, `${key}=${entry}`);
                return;
        }

        if (value != null)
                push(result, `${value}`);
}

function identity_txt(value) {
        let allowed = {
                "am": true,
                "device-id": true,
                "deviceid": true,
                "fn": true,
                "id": true,
                "manufacturer": true,
                "md": true,
                "model": true,
                "product": true,
                "serial": true,
                "serialnumber": true,
                "ty": true,
                "uuid": true
        };
        let entries = [];
        let selected = [];

        append_txt_entries(entries, value);
        for (let entry in entries) {
                let separator = index(entry, "=");
                if (separator <= 0)
                        continue;
                let key = lc(replace(safe_field(substr(entry, 0, separator)), /^[ ]+|[ ]+$/g, ""));
                let item = replace(safe_field(substr(entry, separator + 1)), /^[ ]+|[ ]+$/g, "");
                if (allowed[key] && item)
                        push(selected, `${key}=${item}`);
        }

        return substr(join(sort(selected), ","), 0, 480);
}

function append_addresses(result, value) {
        if (type(value) == "array") {
                for (let address in value)
                        append_addresses(result, address);
                return;
        }

        if (value && index(result, value) < 0)
                push(result, value);
}

function host_addresses(host_data, hosts) {
        let result = [];
        let host_name = lc(strip_local(host_data?.host));
        let host_record = hosts?.[host_name] ?? {};

        append_addresses(result, host_data?.ipv4);
        append_addresses(result, host_record?.ipv4);
        return result;
}

let ubus = libubus.connect();
if (!ubus)
        exit(0);

try {
        ubus.call("umdns", "update");
} catch (e) {
        // Текущий кеш browse всё равно может содержать полезные объявления.
}

let browse = {};
let raw_hosts = {};
try {
        browse = ubus.call("umdns", "browse", { array: true, address: true }) ?? {};
        raw_hosts = ubus.call("umdns", "hosts", { array: true }) ?? {};
} catch (e) {
        exit(0);
}

let hosts = {};
for (let name, data in raw_hosts)
        hosts[lc(strip_local(name))] = data;

let lines = [];
for (let service_name, service_data in browse) {
        service_name = strip_local(service_name);
        for (let instance_name, host_data in service_data) {
                if (!host_data?.host)
                        continue;

                let host_name = strip_local(host_data.host);
                for (let address in host_addresses(host_data, hosts)) {
                        if (length(lines) >= 512)
                                break;
                        push(lines, `${safe_field(address)}\t${safe_field(service_name)}\t${safe_field(host_name)}\t${safe_field(instance_name)}\t${safe_field(host_data?.port)}\t${safe_field(identity_txt(host_data?.txt), 480)}\n`);
                }
        }
}

print(join(sort(lines), ""));
