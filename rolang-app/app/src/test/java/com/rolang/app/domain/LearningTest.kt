package com.rolang.app.domain

import org.junit.Assert.*
import org.junit.Test

class LearningTest {
    @Test fun `tokens keep offsets accents and compound words`() {
        val text = "Maya's di-inaasahang café, hati-hati!"
        val tokens = Words.tokens(text)
        assertEquals(listOf("Maya's", "di-inaasahang", "café", "hati-hati"), tokens.map { it.text })
        tokens.forEach { assertEquals(it.text, text.substring(it.start, it.end)) }
    }
    @Test fun `answers allow accent case punctuation and explicit synonyms but reject partial answers`() {
        assertTrue(Words.matches("  CAFÉ! ", "café; coffee shop"))
        assertTrue(Words.matches("coffee shop", "café; coffee shop"))
        assertFalse(Words.matches("", "café"))
        assertFalse(Words.matches("coffee", "coffee shop"))
    }
    @Test fun `correct reviews expand intervals and eventually reach mastery`() {
        val now = 1_000L
        var schedule = SpacedRepetition.next(Schedule(), Rating.GOOD, now)
        assertEquals(1, schedule.intervalDays)
        assertEquals(now + SpacedRepetition.DAY, schedule.dueAt)
        schedule = SpacedRepetition.next(schedule, Rating.GOOD, schedule.dueAt)
        assertEquals(6, schedule.intervalDays)
        repeat(3) { schedule = SpacedRepetition.next(schedule, Rating.GOOD, schedule.dueAt) }
        assertTrue(schedule.mastered)
        assertEquals(5, schedule.repetitions)
    }
    @Test fun `a forgotten mastered word returns in ten minutes with a reset streak`() {
        val next = SpacedRepetition.next(Schedule(8, 180, 1.3, 0, 2, true), Rating.AGAIN, 20)
        assertEquals(600_020, next.dueAt)
        assertEquals(0, next.repetitions)
        assertEquals(3, next.lapses)
        assertEquals(1.3, next.ease, 0.001)
        assertFalse(next.mastered)
    }
    @Test fun `easy grows faster than good and hard while intervals stay bounded`() {
        val schedule = Schedule(3, 15)
        val easy = SpacedRepetition.next(schedule, Rating.EASY, 0)
        val good = SpacedRepetition.next(schedule, Rating.GOOD, 0)
        val hard = SpacedRepetition.next(schedule, Rating.HARD, 0)
        assertTrue(easy.intervalDays > good.intervalDays)
        assertTrue(good.intervalDays > hard.intervalDays)
        assertEquals(365, SpacedRepetition.next(Schedule(20, 365, 3.0), Rating.EASY, 0).intervalDays)
    }
}
