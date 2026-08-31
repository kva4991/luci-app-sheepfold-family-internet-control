#include "relay.h"
#include <math.h>
#include <openssl/crypto.h>
#include <openssl/evp.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

void relayFail(const char *code)
{
    /* Только фиксированный код: parser error может содержать ключ или plaintext */
    fprintf(stderr, "{\"error\":\"%s\"}\n", code);
    exit(1);
}

void relayFields(json_t *object, const char *const *fields, size_t count)
{
    if (!json_is_object(object) || json_object_size(object) != count)
        relayFail("messageMalformed");
    for (size_t index = 0; index < count; index++)
        if (!json_object_get(object, fields[index])) relayFail("messageMalformed");
}

const char *relayString(json_t *object, const char *field)
{
    json_t *value = json_object_get(object, field);
    if (!json_is_string(value)) relayFail("messageMalformed");
    return json_string_value(value);
}

int64_t relayInteger(json_t *object, const char *field, int64_t minimum)
{
    json_t *value = json_object_get(object, field);
    if (!json_is_integer(value)) relayFail("messageMalformed");
    int64_t number = json_integer_value(value);
    if (number < minimum || number > RELAY_SAFE_MAX) relayFail("messageMalformed");
    return number;
}

static json_t *normalizeNumber(json_t *value)
{
    if (!json_is_number(value)) return NULL;
    double number = json_number_value(value);
    if (!isfinite(number) || fabs(number) > (double)RELAY_SAFE_MAX ||
        trunc(number) != number || (number == 0 && signbit(number)))
        relayFail("messageMalformed");
    json_t *integer = json_integer((json_int_t)number);
    if (!integer) relayFail("resourceExhausted");
    return integer;
}

static void normalizeTree(json_t *value, unsigned depth)
{
    if (depth > 16) relayFail("messageMalformed");
    if (json_is_object(value)) {
        if (json_object_size(value) > 64) relayFail("messageMalformed");
        const char *key;
        json_t *child;
        json_object_foreach(value, key, child) {
            json_t *integer = normalizeNumber(child);
            if (integer) {
                if (json_object_set_new(value, key, integer)) relayFail("resourceExhausted");
            } else normalizeTree(child, depth + 1);
        }
    } else if (json_is_array(value)) {
        if (json_array_size(value) > 128) relayFail("messageMalformed");
        for (size_t index = 0; index < json_array_size(value); index++) {
            json_t *child = json_array_get(value, index);
            json_t *integer = normalizeNumber(child);
            if (integer) {
                if (json_array_set_new(value, index, integer)) relayFail("resourceExhausted");
            } else normalizeTree(child, depth + 1);
        }
    }
}

json_t *relayParse(const char *bytes, size_t length)
{
    if (!length || length > RELAY_INPUT_MAX || memchr(bytes, 0, length))
        relayFail("messageMalformed");
    /* Ограничение глубины до выделений Jansson; это не замена JSON parser */
    unsigned depth = 0;
    int inString = 0, escaped = 0;
    for (size_t index = 0; index < length; index++) {
        unsigned char value = (unsigned char)bytes[index];
        if (inString) {
            if (escaped) escaped = 0;
            else if (value == '\\') escaped = 1;
            else if (value == '"') inString = 0;
        } else if (value == '"') inString = 1;
        else if (value == '[' || value == '{') {
            if (++depth > 17) relayFail("messageMalformed");
        } else if (value == ']' || value == '}') {
            if (!depth) relayFail("messageMalformed");
            depth--;
        } else if (value == '-') {
            /* Jansson сохраняет -0 как integer 0; проверяем потерянный знак до parse */
            char token[RELAY_INPUT_MAX + 1];
            size_t count = 0;
            while (index + count < length && count < sizeof(token) - 1 &&
                   strchr("-+0123456789.eE", bytes[index + count])) {
                token[count] = bytes[index + count];
                count++;
            }
            token[count] = 0;
            char *end;
            double number = strtod(token, &end);
            if (end != token && *end == 0 && number == 0) relayFail("messageMalformed");
            /* Даже повреждённый длинный токен просматривается только один раз */
            if (count) index += count - 1;
        }
    }
    json_error_t error;
    json_t *result = json_loadb(bytes, length, JSON_REJECT_DUPLICATES, &error);
    if (!result) relayFail("messageMalformed");
    normalizeTree(result, 0);
    return result;
}

char *relayEncode(const unsigned char *bytes, size_t length)
{
    if (length > RELAY_INPUT_MAX) relayFail("messageTooLarge");
    size_t capacity = 4 * ((length + 2) / 3) + 1;
    char *encoded = malloc(capacity);
    if (!encoded) relayFail("resourceExhausted");
    int size = EVP_EncodeBlock((unsigned char *)encoded, bytes, (int)length);
    if (size < 0) relayFail("cryptoFailed");
    for (int index = 0; index < size; index++) {
        if (encoded[index] == '+') encoded[index] = '-';
        else if (encoded[index] == '/') encoded[index] = '_';
        else if (encoded[index] == '=') { encoded[index] = 0; break; }
    }
    return encoded;
}

size_t relayDecode(const char *encoded, unsigned char *output, size_t capacity)
{
    size_t length = strlen(encoded);
    if (!length || length > RELAY_ENVELOPE_MAX || length % 4 == 1)
        relayFail("messageMalformed");
    char padded[RELAY_ENVELOPE_MAX + 4];
    for (size_t index = 0; index < length; index++) {
        unsigned char value = (unsigned char)encoded[index];
        if (!((value >= 'A' && value <= 'Z') || (value >= 'a' && value <= 'z') ||
              (value >= '0' && value <= '9') || value == '-' || value == '_'))
            relayFail("messageMalformed");
        padded[index] = value == '-' ? '+' : value == '_' ? '/' : (char)value;
    }
    size_t paddedSize = (length + 3) / 4 * 4;
    for (size_t index = length; index < paddedSize; index++) padded[index] = '=';
    if (paddedSize / 4 * 3 > capacity) relayFail("messageMalformed");
    int decoded = EVP_DecodeBlock(output, (const unsigned char *)padded, (int)paddedSize);
    if (decoded < 0) relayFail("messageMalformed");
    size_t size = (size_t)decoded - (paddedSize - length);
    char *canonical = relayEncode(output, size);
    int matches = strcmp(encoded, canonical) == 0;
    free(canonical);
    if (!matches) relayFail("messageMalformed");
    return size;
}

void relayId(const char *value)
{
    unsigned char bytes[18];
    if (strlen(value) != 22 || relayDecode(value, bytes, sizeof(bytes)) != 16)
        relayFail("messageMalformed");
}

static void actionHash(json_t *payload)
{
    json_t *actionBody = json_pack("{s:O,s:O}", "action", json_object_get(payload, "action"),
                                 "body", json_object_get(payload, "body"));
    if (!actionBody) relayFail("resourceExhausted");
    char *canonical = json_dumps(actionBody, JSON_SORT_KEYS | JSON_COMPACT);
    json_decref(actionBody);
    if (!canonical) relayFail("resourceExhausted");
    const char context[] = "SFMR1/actionHash";
    EVP_MD_CTX *digest = EVP_MD_CTX_new();
    unsigned char actual[32], expected[33];
    unsigned size = 0;
    if (!digest || EVP_DigestInit_ex(digest, EVP_sha256(), NULL) != 1 ||
        EVP_DigestUpdate(digest, context, sizeof(context)) != 1 ||
        EVP_DigestUpdate(digest, canonical, strlen(canonical)) != 1 ||
        EVP_DigestFinal_ex(digest, actual, &size) != 1 || size != 32)
        relayFail("cryptoFailed");
    EVP_MD_CTX_free(digest);
    free(canonical);
    if (relayDecode(relayString(payload, "actionHash"), expected, sizeof(expected)) != 32 ||
        CRYPTO_memcmp(actual, expected, 32)) relayFail("actionHashMismatch");
}

static void commandBody(json_t *body, const char *action, json_t *envelope, int64_t now)
{
    if (!strcmp(action, "globalInternetSet")) {
        RELAY_FIELDS(body, "internetEnabled");
        if (!json_is_boolean(json_object_get(body, "internetEnabled"))) relayFail("messageMalformed");
    } else {
        RELAY_FIELDS(body, "deviceMac", "grantUntil");
        const char *mac = relayString(body, "deviceMac");
        if (strlen(mac) != 17) relayFail("messageMalformed");
        for (size_t index = 0; index < 17; index++)
            if (index % 3 == 2 ? mac[index] != ':' : !strchr("0123456789ABCDEF", mac[index]))
                relayFail("messageMalformed");
        int64_t until = relayInteger(body, "grantUntil", 1);
        int64_t issuedAt = relayInteger(envelope, "issuedAt", 0);
        if (until <= issuedAt || until - issuedAt > 86400) relayFail("messageMalformed");
        if (until <= now) relayFail("messageExpired");
    }
}

static size_t utf16Length(const char *text)
{
    size_t length = 0;
    for (const unsigned char *part = (const unsigned char *)text; *part; part++) {
        if ((*part & 0xc0) != 0x80) length += *part >= 0xf0 ? 2 : 1;
    }
    return length;
}

void relayPayload(json_t *payload, json_t *envelope, int64_t now)
{
    RELAY_FIELDS(payload, "schemaVersion", "messageType", "action", "actionHash", "requestMessageId", "body");
    if (relayInteger(payload, "schemaVersion", 0) != 1) relayFail("protocolUnsupported");
    const char *type = relayString(payload, "messageType");
    if (strcmp(type, relayString(envelope, "messageClass"))) relayFail("messageMalformed");
    json_t *body = json_object_get(payload, "body");
    if (!strcmp(type, "notification")) {
        if (!json_is_null(json_object_get(payload, "action")) ||
            !json_is_null(json_object_get(payload, "actionHash")) ||
            !json_is_null(json_object_get(payload, "requestMessageId"))) relayFail("messageMalformed");
        RELAY_FIELDS(body, "notificationId", "category", "title", "message", "createdAt");
        relayId(relayString(body, "notificationId"));
        relayInteger(body, "createdAt", 0);
        const char *fields[] = { "category", "title", "message" };
        for (size_t index = 0; index < 3; index++) {
            size_t length = utf16Length(relayString(body, fields[index]));
            if (!length || length > (index == 2 ? 2048 : 128)) relayFail("messageMalformed");
        }
        return;
    }
    const char *action = relayString(payload, "action");
    if (strcmp(action, "globalInternetSet") && strcmp(action, "temporaryAccessGrant"))
        relayFail("actionUnsupported");
    if (!strcmp(type, "command")) {
        if (!json_is_null(json_object_get(payload, "requestMessageId"))) relayFail("messageMalformed");
        commandBody(body, action, envelope, now);
        actionHash(payload);
        return;
    }
    if (strcmp(type, "commandResult")) relayFail("protocolUnsupported");
    relayId(relayString(payload, "requestMessageId"));
    unsigned char hash[33];
    if (relayDecode(relayString(payload, "actionHash"), hash, sizeof(hash)) != 32)
        relayFail("messageMalformed");
    RELAY_FIELDS(body, "status", "errorCode", "completedAt");
    relayInteger(body, "completedAt", 0);
    const char *status = relayString(body, "status");
    if (!strcmp(status, "executed")) {
        if (!json_is_null(json_object_get(body, "errorCode"))) relayFail("messageMalformed");
        return;
    }
    const char *error = relayString(body, "errorCode");
    if (!strcmp(status, "expired") && !strcmp(error, "commandExpired")) return;
    if (!strcmp(status, "indeterminate") && !strcmp(error, "stateIndeterminate")) return;
    if (!strcmp(status, "rejected")) {
        const char *allowed[] = { "actionRejected", "administratorDeviceUnbound", "clockInvalid",
                                  "deviceBlocked", "deviceNotFound", "deviceQuarantined" };
        for (size_t index = 0; index < sizeof(allowed) / sizeof(allowed[0]); index++)
            if (!strcmp(error, allowed[index])) return;
    }
    relayFail("messageMalformed");
}
