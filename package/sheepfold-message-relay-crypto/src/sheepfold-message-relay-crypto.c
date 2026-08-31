#include "relay.h"
#include <openssl/crypto.h>
#include <openssl/evp.h>
#include <openssl/hmac.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/resource.h>

static void write64(unsigned char *output, int64_t value)
{
    for (int index = 7; index >= 0; index--) {
        output[index] = (unsigned char)(value & 255);
        value >>= 8;
    }
}

static void envelopeMetadata(json_t *envelope, int encrypt, int64_t now, unsigned char fixed[110])
{
    RELAY_FIELDS(envelope, "protocolVersion", "cryptoSuite", "direction", "messageClass", "routerId",
                 "phoneId", "streamId", "messageId", "sequence", "issuedAt", "expiresAt", "keyId", "ciphertext");
    if (relayInteger(envelope, "protocolVersion", 0) != 1 ||
        strcmp(relayString(envelope, "cryptoSuite"), "HMAC-SHA256+AES-256-GCM"))
        relayFail("protocolUnsupported");
    const char *type = relayString(envelope, "messageClass");
    int classCode = !strcmp(type, "command") ? 1 : !strcmp(type, "commandResult") ? 2 :
                    !strcmp(type, "notification") ? 3 : 0;
    if (!classCode || strcmp(relayString(envelope, "direction"), classCode == 1 ? "phoneToRouter" : "routerToPhone"))
        relayFail("messageMalformed");
    int64_t issuedAt = relayInteger(envelope, "issuedAt", 0);
    int64_t expiresAt = relayInteger(envelope, "expiresAt", 0);
    if (expiresAt <= issuedAt || expiresAt - issuedAt > (classCode == 1 ? 120 : 86400))
        relayFail("messageMalformed");
    if (issuedAt > now && issuedAt - now > 60) relayFail("messageNotYetValid");
    if (expiresAt <= now) relayFail("messageExpired");
    if (encrypt && strlen(relayString(envelope, "ciphertext"))) relayFail("messageMalformed");
    memset(fixed, 0, 110);
    fixed[3] = 1;
    fixed[4] = classCode == 1 ? 1 : 2;
    fixed[5] = (unsigned char)classCode;
    const char *ids[] = { "routerId", "phoneId", "streamId", "messageId", "keyId" };
    for (size_t index = 0; index < 5; index++) {
        const char *value = relayString(envelope, ids[index]);
        unsigned char bytes[18];
        relayId(value);
        relayDecode(value, bytes, sizeof(bytes));
        memcpy(fixed + 6 + index * 16, bytes, 16);
    }
    write64(fixed + 86, relayInteger(envelope, "sequence", 1));
    write64(fixed + 94, issuedAt);
    write64(fixed + 102, expiresAt);
}

static void messageKey(json_t *record, json_t *envelope, const unsigned char fixed[110], unsigned char key[32])
{
    RELAY_FIELDS(record, "keyId", "streamId", "direction", "keyBytes");
    const char *fields[] = { "keyId", "streamId", "direction" };
    for (size_t index = 0; index < 3; index++)
        if (strcmp(relayString(record, fields[index]), relayString(envelope, fields[index])))
            relayFail("keyInvalid");
    unsigned char master[33];
    if (relayDecode(relayString(record, "keyBytes"), master, sizeof(master)) != 32)
        relayFail("keyInvalid");
    const char context[] = "SheepfoldFamilyMessageRelay/subkey";
    unsigned char source[sizeof(context) + 110];
    memcpy(source, context, sizeof(context));
    memcpy(source + sizeof(context), fixed, 110);
    unsigned length = 0;
    if (!HMAC(EVP_sha256(), master, 32, source, sizeof(source), key, &length) || length != 32)
        relayFail("cryptoFailed");
    OPENSSL_cleanse(master, sizeof(master));
}

int main(int argc, char **argv)
{
    (void)argv;
    /* Секреты разрешены только через stdin; core dump не должен сохранить key bundle */
    struct rlimit coreLimit = { 0, 0 };
    if (argc != 1 || setrlimit(RLIMIT_CORE, &coreLimit)) relayFail("invocationInvalid");
    char input[RELAY_INPUT_MAX + 1];
    size_t length = fread(input, 1, sizeof(input), stdin);
    if (ferror(stdin) || length > RELAY_INPUT_MAX) relayFail("messageTooLarge");
    json_t *request = relayParse(input, length);
    OPENSSL_cleanse(input, sizeof(input));
    const char *operation = relayString(request, "operation");
    int encrypt = !strcmp(operation, "encrypt");
    if (encrypt) {
        RELAY_FIELDS(request, "operation", "envelope", "keyRecord", "now", "payload");
    } else {
        if (strcmp(operation, "decrypt")) relayFail("invocationInvalid");
        RELAY_FIELDS(request, "operation", "envelope", "keyRecord", "now");
    }
    int64_t now = relayInteger(request, "now", 0);
    json_t *envelope = json_object_get(request, "envelope");
    unsigned char fixed[110], key[32], iv[12] = { 0 };
    envelopeMetadata(envelope, encrypt, now, fixed);
    messageKey(json_object_get(request, "keyRecord"), envelope, fixed, key);
    write64(iv + 4, relayInteger(envelope, "sequence", 1));
    const char context[] = "SheepfoldFamilyMessageRelay";
    unsigned char aad[sizeof(context) + 110];
    memcpy(aad, context, sizeof(context));
    memcpy(aad + sizeof(context), fixed, 110);
    unsigned char plain[RELAY_PLAIN_MAX + 1], encrypted[RELAY_PLAIN_MAX + 18];
    size_t plainSize, encryptedSize = 0;
    json_t *payload;
    if (encrypt) {
        payload = json_object_get(request, "payload");
        relayPayload(payload, envelope, now);
        /* Все допустимые ключи payload ASCII: порядок Jansson совпадает с SFMR1 */
        char *canonical = json_dumps(payload, JSON_SORT_KEYS | JSON_COMPACT);
        if (!canonical) relayFail("resourceExhausted");
        plainSize = strlen(canonical);
        if (!plainSize || plainSize > RELAY_PLAIN_MAX) relayFail("messageTooLarge");
        memcpy(plain, canonical, plainSize);
        OPENSSL_cleanse(canonical, plainSize);
        free(canonical);
    } else {
        char *encoded = json_dumps(envelope, JSON_COMPACT);
        if (!encoded) relayFail("resourceExhausted");
        if (strlen(encoded) > RELAY_ENVELOPE_MAX) relayFail("messageTooLarge");
        free(encoded);
        encryptedSize = relayDecode(relayString(envelope, "ciphertext"), encrypted, sizeof(encrypted));
        if (encryptedSize < 17 || encryptedSize > RELAY_PLAIN_MAX + 16) relayFail("messageMalformed");
        plainSize = encryptedSize - 16;
    }
    EVP_CIPHER_CTX *cipher = EVP_CIPHER_CTX_new();
    int written = 0, finalSize = 0;
    if (!cipher || EVP_CipherInit_ex(cipher, EVP_aes_256_gcm(), NULL, key, iv, encrypt) != 1 ||
        EVP_CipherUpdate(cipher, NULL, &written, aad, sizeof(aad)) != 1)
        relayFail("cryptoFailed");
    if (!encrypt && EVP_CIPHER_CTX_ctrl(cipher, EVP_CTRL_GCM_SET_TAG, 16, encrypted + plainSize) != 1)
        relayFail("cryptoFailed");
    if (EVP_CipherUpdate(cipher, encrypt ? encrypted : plain, &written,
                         encrypt ? plain : encrypted, (int)plainSize) != 1)
        relayFail("cryptoFailed");
    if (written < 0 || (size_t)written > plainSize) relayFail("cryptoFailed");
    /* Ничего не выдаём до Final: неаутентифицированный plaintext нельзя использовать */
    if (EVP_CipherFinal_ex(cipher, (encrypt ? encrypted : plain) + written, &finalSize) != 1) {
        OPENSSL_cleanse(plain, sizeof(plain));
        OPENSSL_cleanse(key, sizeof(key));
        relayFail("authenticationFailed");
    }
    if ((size_t)(written + finalSize) != plainSize) relayFail("cryptoFailed");
    json_t *response;
    if (encrypt) {
        if (EVP_CIPHER_CTX_ctrl(cipher, EVP_CTRL_GCM_GET_TAG, 16, encrypted + plainSize) != 1)
            relayFail("cryptoFailed");
        char *encoded = relayEncode(encrypted, plainSize + 16);
        if (json_object_set_new(envelope, "ciphertext", json_string(encoded))) relayFail("resourceExhausted");
        free(encoded);
        response = json_incref(envelope);
    } else {
        response = relayParse((const char *)plain, plainSize);
        relayPayload(response, envelope, now);
    }
    EVP_CIPHER_CTX_free(cipher);
    OPENSSL_cleanse(plain, sizeof(plain));
    OPENSSL_cleanse(key, sizeof(key));
    char *output = json_dumps(response, JSON_COMPACT | JSON_SORT_KEYS);
    if (!output) relayFail("resourceExhausted");
    if (strlen(output) > (encrypt ? RELAY_ENVELOPE_MAX : RELAY_PLAIN_MAX)) relayFail("messageTooLarge");
    int failed = puts(output) == EOF || fflush(stdout) == EOF;
    OPENSSL_cleanse(output, strlen(output));
    free(output);
    json_decref(response);
    json_decref(request);
    return failed ? 1 : 0;
}
