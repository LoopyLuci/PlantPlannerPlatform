package org.plantplanner.survey.update

/** A dotted version such as 0.1.0. Missing parts count as 0, so 0.1 equals 0.1.0. */
data class Version(val parts: List<Int>) : Comparable<Version> {

    override fun compareTo(other: Version): Int {
        val size = maxOf(parts.size, other.parts.size)
        for (i in 0 until size) {
            val c = parts.getOrElse(i) { 0 }.compareTo(other.parts.getOrElse(i) { 0 })
            if (c != 0) return c
        }
        return 0
    }

    override fun toString(): String = parts.joinToString(".")

    companion object {
        private val PATTERN = Regex("""^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?""")

        /** Parses "0.1.0", "v0.1.0" or "android-v0.1.0" style text. Returns null when no number is found. */
        fun parse(text: String): Version? {
            val trimmed = text.trim().removePrefix("android-")
            val match = PATTERN.find(trimmed) ?: return null
            val numbers = match.groupValues.drop(1).filter { it.isNotEmpty() }.map { it.toInt() }
            return Version(numbers)
        }
    }
}
