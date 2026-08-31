#ifndef SHEEPFOLD_RELAY_H
#define SHEEPFOLD_RELAY_H

#include <jansson.h>
#include <stdint.h>
#include <stddef.h>

#define RELAY_PLAIN_MAX 8192
#define RELAY_ENVELOPE_MAX 16384
#define RELAY_INPUT_MAX 32768
#define RELAY_SAFE_MAX INT64_C(9007199254740991)

void relayFail(const char *code);
json_t *relayParse(const char *bytes, size_t length);
void relayFields(json_t *object, const char *const *fields, size_t count);
const char *relayString(json_t *object, const char *field);
int64_t relayInteger(json_t *object, const char *field, int64_t minimum);
size_t relayDecode(const char *encoded, unsigned char *output, size_t capacity);
char *relayEncode(const unsigned char *bytes, size_t length);
void relayId(const char *value);
void relayPayload(json_t *payload, json_t *envelope, int64_t now);

#define RELAY_FIELDS(value, ...) do { \
    const char *const names[] = { __VA_ARGS__ }; \
    relayFields((value), names, sizeof(names) / sizeof(names[0])); \
} while (0)

#endif
