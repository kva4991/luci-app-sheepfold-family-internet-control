package app.sheepfold.android.relay

import java.math.BigDecimal
import java.math.BigInteger
import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction

internal sealed interface RelayJsonValue {
    data class ObjectValue(val fields: Map<String, RelayJsonValue>) : RelayJsonValue
    data class ArrayValue(val items: List<RelayJsonValue>) : RelayJsonValue
    data class StringValue(val value: String) : RelayJsonValue
    data class IntegerValue(val value: Long) : RelayJsonValue
    data class BooleanValue(val value: Boolean) : RelayJsonValue
    data object NullValue : RelayJsonValue
}

internal object MessageRelayJson {
    private const val maximumDepth = 16
    private const val maximumObjectFields = 64
    private const val maximumArrayItems = 128
    private const val maximumSafeInteger = 9_007_199_254_740_991L
    private val numberPattern = Regex("-?(?:0|[1-9]\\d*)(?:\\.\\d+)?(?:[eE][+-]?\\d+)?")

    fun parse(bytes: ByteArray, maximumBytes: Int): RelayJsonValue {
        if (bytes.isEmpty() || bytes.size > maximumBytes) {
            throw MessageRelayProtocolException("messageMalformed", "JSON size is outside the allowed range")
        }
        val decoder = Charsets.UTF_8.newDecoder()
            .onMalformedInput(CodingErrorAction.REPORT)
            .onUnmappableCharacter(CodingErrorAction.REPORT)
        val text = runCatching { decoder.decode(ByteBuffer.wrap(bytes)).toString() }.getOrElse {
            throw MessageRelayProtocolException("messageMalformed", "JSON is not valid UTF-8")
        }
        if ('\u0000' in text) {
            throw MessageRelayProtocolException("messageMalformed", "NUL is forbidden")
        }
        return Parser(text).parse()
    }

    fun canonical(value: RelayJsonValue): String = when (value) {
        is RelayJsonValue.ObjectValue -> value.fields.keys.sorted().joinToString(",", "{", "}") { key ->
            "${canonicalString(key)}:${canonical(value.fields.getValue(key))}"
        }
        is RelayJsonValue.ArrayValue -> value.items.joinToString(",", "[", "]") { canonical(it) }
        is RelayJsonValue.StringValue -> canonicalString(value.value)
        is RelayJsonValue.IntegerValue -> {
            requireSafeInteger(value.value, "canonical JSON integer", Long.MIN_VALUE)
            value.value.toString()
        }
        is RelayJsonValue.BooleanValue -> value.value.toString()
        RelayJsonValue.NullValue -> "null"
    }

    fun canonicalBytes(value: RelayJsonValue): ByteArray = canonical(value).toByteArray(Charsets.UTF_8)

    fun objectValue(vararg fields: Pair<String, RelayJsonValue>): RelayJsonValue.ObjectValue =
        RelayJsonValue.ObjectValue(linkedMapOf(*fields))

    fun requireObject(value: RelayJsonValue, label: String): RelayJsonValue.ObjectValue =
        value as? RelayJsonValue.ObjectValue
            ?: throw MessageRelayProtocolException("messageMalformed", "$label must be an object")

    fun requireExactKeys(value: RelayJsonValue.ObjectValue, keys: Set<String>, label: String) {
        if (value.fields.keys != keys) {
            throw MessageRelayProtocolException("messageMalformed", "$label has unknown or missing fields")
        }
    }

    fun requireString(value: RelayJsonValue?, label: String): String =
        (value as? RelayJsonValue.StringValue)?.value
            ?: throw MessageRelayProtocolException("messageMalformed", "$label must be a string")

    fun requireInteger(value: RelayJsonValue?, label: String, minimum: Long = 0): Long {
        val integer = (value as? RelayJsonValue.IntegerValue)?.value
            ?: throw MessageRelayProtocolException("messageMalformed", "$label must be an integer")
        requireSafeInteger(integer, label, minimum)
        return integer
    }

    fun requireBoolean(value: RelayJsonValue?, label: String): Boolean =
        (value as? RelayJsonValue.BooleanValue)?.value
            ?: throw MessageRelayProtocolException("messageMalformed", "$label must be a boolean")

    fun requireSafeInteger(value: Long, label: String, minimum: Long = 0) {
        if (value < minimum || value > maximumSafeInteger || value < -maximumSafeInteger) {
            throw MessageRelayProtocolException(
                "messageMalformed",
                "$label is outside the interoperable JSON integer range"
            )
        }
    }

    private fun canonicalString(value: String): String {
        validateUnicodeString(value)
        val result = StringBuilder(value.length + 2).append('"')
        value.forEach { character ->
            when (character) {
                '"' -> result.append("\\\"")
                '\\' -> result.append("\\\\")
                '\b' -> result.append("\\b")
                '\u000C' -> result.append("\\f")
                '\n' -> result.append("\\n")
                '\r' -> result.append("\\r")
                '\t' -> result.append("\\t")
                else -> if (character < ' ') {
                    result.append("\\u").append(character.code.toString(16).padStart(4, '0'))
                } else {
                    result.append(character)
                }
            }
        }
        return result.append('"').toString()
    }

    private fun validateUnicodeString(value: String) {
        if ('\u0000' in value) {
            throw MessageRelayProtocolException("messageMalformed", "canonical JSON rejects NUL")
        }
        var index = 0
        while (index < value.length) {
            val character = value[index]
            if (character.isHighSurrogate()) {
                if (index + 1 >= value.length || !value[index + 1].isLowSurrogate()) {
                    throw MessageRelayProtocolException(
                        "messageMalformed",
                        "canonical JSON rejects unpaired unicode surrogates"
                    )
                }
                index += 2
                continue
            }
            if (character.isLowSurrogate()) {
                throw MessageRelayProtocolException(
                    "messageMalformed",
                    "canonical JSON rejects unpaired unicode surrogates"
                )
            }
            index += 1
        }
    }

    private class Parser(private val text: String) {
        private var offset = 0

        fun parse(): RelayJsonValue {
            val value = readValue(0)
            skipWhitespace()
            if (offset != text.length) fail("trailing data")
            return value
        }

        private fun readValue(depth: Int): RelayJsonValue {
            if (depth > maximumDepth) fail("maximum nesting depth exceeded")
            skipWhitespace()
            return when (text.getOrNull(offset)) {
                '"' -> RelayJsonValue.StringValue(readString())
                '{' -> readObject(depth)
                '[' -> readArray(depth)
                't' -> readLiteral("true", RelayJsonValue.BooleanValue(true))
                'f' -> readLiteral("false", RelayJsonValue.BooleanValue(false))
                'n' -> readLiteral("null", RelayJsonValue.NullValue)
                '-', in '0'..'9' -> readNumber()
                else -> fail("value expected")
            }
        }

        private fun readObject(depth: Int): RelayJsonValue.ObjectValue {
            offset += 1
            skipWhitespace()
            val fields = linkedMapOf<String, RelayJsonValue>()
            if (text.getOrNull(offset) == '}') {
                offset += 1
                return RelayJsonValue.ObjectValue(fields)
            }
            while (offset < text.length) {
                skipWhitespace()
                val key = readString()
                if (fields.containsKey(key)) fail("duplicate key")
                if (fields.size >= maximumObjectFields) fail("too many object fields")
                skipWhitespace()
                if (text.getOrNull(offset) != ':') fail("colon expected")
                offset += 1
                fields[key] = readValue(depth + 1)
                skipWhitespace()
                when (text.getOrNull(offset)) {
                    '}' -> {
                        offset += 1
                        return RelayJsonValue.ObjectValue(fields)
                    }
                    ',' -> offset += 1
                    else -> fail("comma expected")
                }
            }
            fail("unterminated object")
        }

        private fun readArray(depth: Int): RelayJsonValue.ArrayValue {
            offset += 1
            skipWhitespace()
            val items = mutableListOf<RelayJsonValue>()
            if (text.getOrNull(offset) == ']') {
                offset += 1
                return RelayJsonValue.ArrayValue(items)
            }
            while (offset < text.length) {
                if (items.size >= maximumArrayItems) fail("too many array items")
                items += readValue(depth + 1)
                skipWhitespace()
                when (text.getOrNull(offset)) {
                    ']' -> {
                        offset += 1
                        return RelayJsonValue.ArrayValue(items)
                    }
                    ',' -> offset += 1
                    else -> fail("comma expected")
                }
            }
            fail("unterminated array")
        }

        private fun readString(): String {
            if (text.getOrNull(offset) != '"') fail("string expected")
            offset += 1
            val result = StringBuilder()
            while (offset < text.length) {
                val character = text[offset++]
                if (character == '"') {
                    return result.toString().also(::validateUnicodeString)
                }
                if (character < ' ') fail("unescaped control character")
                if (character != '\\') {
                    result.append(character)
                    continue
                }
                val escaped = text.getOrNull(offset++) ?: fail("invalid escape")
                when (escaped) {
                    '"', '/', '\\' -> result.append(escaped)
                    'b' -> result.append('\b')
                    'f' -> result.append('\u000C')
                    'n' -> result.append('\n')
                    'r' -> result.append('\r')
                    't' -> result.append('\t')
                    'u' -> {
                        if (offset + 4 > text.length) fail("invalid unicode escape")
                        val hex = text.substring(offset, offset + 4)
                        val code = hex.toIntOrNull(16) ?: fail("invalid unicode escape")
                        result.append(code.toChar())
                        offset += 4
                    }
                    else -> fail("invalid escape")
                }
            }
            fail("unterminated string")
        }

        private fun readNumber(): RelayJsonValue.IntegerValue {
            val match = numberPattern.find(text, offset)?.takeIf { it.range.first == offset }
                ?: fail("invalid number")
            offset = match.range.last + 1
            val decimal = runCatching { BigDecimal(match.value) }.getOrElse { fail("invalid number") }
            if (match.value.startsWith('-') && decimal.compareTo(BigDecimal.ZERO) == 0) {
                fail("negative zero is forbidden")
            }
            val integer = decimal.toBigIntegerExact()
            val lowerBound = BigInteger.valueOf(Long.MIN_VALUE)
            val upperBound = BigInteger.valueOf(Long.MAX_VALUE)
            if (integer < lowerBound || integer > upperBound) {
                fail("JSON numbers must be safe integers")
            }
            val asLong = integer.toLong()
            requireSafeInteger(asLong, "JSON number", Long.MIN_VALUE)
            return RelayJsonValue.IntegerValue(asLong)
        }

        private fun <T : RelayJsonValue> readLiteral(literal: String, value: T): T {
            if (!text.startsWith(literal, offset)) fail("value expected")
            offset += literal.length
            return value
        }

        private fun skipWhitespace() {
            while (text.getOrNull(offset) in setOf(' ', '\t', '\n', '\r')) offset += 1
        }

        private fun fail(detail: String): Nothing = throw MessageRelayProtocolException(
            "messageMalformed",
            "invalid JSON at $offset: $detail"
        )
    }
}
